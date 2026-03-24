/**
 * Chunked Resumable Upload Service
 *
 * - Splits files into adaptive chunks (4 MB / 8 MB / 16 MB)
 * - Uploads chunks in parallel (adaptive concurrency)
 * - Persists session state in Firestore for true resume
 * - Finalizes into one downloadable file via server-side compose
 */
import { storage, db } from "@/lib/firebase/config";
import { auth } from "@/lib/firebase/config";
import {
  ref,
  uploadBytesResumable,
} from "firebase/storage";
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
} from "firebase/firestore";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const MIN_CHUNK_SIZE = 4 * 1024 * 1024;   // 4 MB
const MID_CHUNK_SIZE = 8 * 1024 * 1024;   // 8 MB
const MAX_CHUNK_SIZE = 16 * 1024 * 1024;  // 16 MB
const DEFAULT_CONCURRENT = 4;
const MAX_CONCURRENT = 10;
const COMPOSE_BATCH_LIMIT = 32;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface ChunkedUploadProgress {
  overallPct: number;      // 0 – 100
  bytesUploaded: number;
  totalBytes: number;
  speedBps: number;        // bytes / second
  etaSeconds: number;
  chunksTotal: number;
  chunksComplete: number;
  status: "idle" | "uploading" | "assembling" | "done" | "error";
}

interface PersistedSession {
  sessionId: string;
  projectId: string;
  fileName: string;
  fileSize: number;
  chunkSize: number;
  totalChunks: number;
  completedChunks: number[];         // indices that have been confirmed
  chunkPaths: Record<number, string>; // index → storage path
  status: "uploading" | "done" | "error";
  finalUrl?: string;
  createdAt: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Deterministic session ID so the same file+project always maps to the same session. */
export function makeSessionId(projectId: string, file: File): string {
  const safeName = file.name.replace(/[^a-z0-9]/gi, "_").slice(0, 40);
  return `${projectId}_${safeName}_${file.size}`;
}

/** Split a File into an array of Blobs. */
function splitFile(file: File, chunkSize: number): Blob[] {
  const chunks: Blob[] = [];
  let start = 0;
  while (start < file.size) {
    chunks.push(file.slice(start, Math.min(start + chunkSize, file.size)));
    start += chunkSize;
  }
  return chunks;
}

function getUploadTuning(fileSize: number) {
  if (typeof window === "undefined") {
    return { chunkSize: MID_CHUNK_SIZE, concurrency: DEFAULT_CONCURRENT };
  }

  const connection = (navigator as any)?.connection;
  const downlink = Number(connection?.downlink || 0);
  const saveData = Boolean(connection?.saveData);
  const effectiveType = String(connection?.effectiveType || "").toLowerCase();

  if (saveData || effectiveType === "slow-2g" || effectiveType === "2g") {
    return { chunkSize: MIN_CHUNK_SIZE, concurrency: 2 };
  }

  if (downlink >= 25 && fileSize >= 200 * 1024 * 1024) {
    return { chunkSize: MAX_CHUNK_SIZE, concurrency: Math.min(MAX_CONCURRENT, 8) };
  }

  if (downlink >= 8) {
    return { chunkSize: MID_CHUNK_SIZE, concurrency: 6 };
  }

  if (downlink > 0 && downlink < 3) {
    return { chunkSize: MIN_CHUNK_SIZE, concurrency: 3 };
  }

  return { chunkSize: MID_CHUNK_SIZE, concurrency: DEFAULT_CONCURRENT };
}

async function composeUploadedChunks(payload: {
  projectId: string;
  sessionId: string;
  fileName: string;
  chunkPaths: string[];
  contentType: string;
}) {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) {
    throw new Error("Authentication is required to finalize upload.");
  }

  const response = await fetch("/api/uploads/compose", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${idToken}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.downloadURL) {
    throw new Error(data?.error || "Failed to finalize upload.");
  }

  return data.downloadURL as string;
}

/**
 * Upload a single chunk.
 * Returns the storage path once the upload is complete.
 */
async function uploadChunk(
  blob: Blob,
  path: string,
  onProgress: (bytes: number) => void,
  signal?: AbortSignal
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }

    const chunkRef = ref(storage, path);
    const task = uploadBytesResumable(chunkRef, blob);

    const handleAbort = () => task.cancel();
    signal?.addEventListener("abort", handleAbort);

    task.on(
      "state_changed",
      (snap) => onProgress(snap.bytesTransferred),
      (err) => {
        signal?.removeEventListener("abort", handleAbort);
        reject(err);
      },
      () => {
        signal?.removeEventListener("abort", handleAbort);
        resolve(path);
      }
    );
  });
}

/**
 * Bounded-concurrency worker pool.
 * Runs `fns` with at most `limit` promises active at once.
 */
async function withConcurrency<T>(
  fns: Array<() => Promise<T>>,
  limit: number,
  onEach?: (index: number, result: T) => void
): Promise<T[]> {
  const results = new Array<T>(fns.length);
  let cursor = 0;

  async function worker() {
    while (cursor < fns.length) {
      const idx = cursor++;
      const result = await fns[idx]();
      results[idx] = result;
      onEach?.(idx, result);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, fns.length) }, worker)
  );
  return results;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Start (or resume) a chunked upload.
 *
 * - Returns a Promise<string> that resolves to the Firebase Storage download URL.
 * - Calls `onProgress` frequently so the UI can update.
 * - Passing an AbortSignal lets callers cancel and clean up.
 */
export async function startChunkedUpload(
  projectId: string,
  file: File,
  onProgress: (p: ChunkedUploadProgress) => void,
  signal?: AbortSignal
): Promise<string> {
  const sessionId = makeSessionId(projectId, file);
  const sessionRef = doc(db, "upload_sessions", sessionId);
  const { chunkSize, concurrency } = getUploadTuning(file.size);
  const chunks = splitFile(file, chunkSize);
  const totalChunks = chunks.length;
  const chunkPaths = chunks.map(
    (_chunk, index) => `projects/${projectId}/revisions/${sessionId}/chunks/${String(index).padStart(6, "0")}.part`
  );

  let canPersistSession = true;
  let completedSet = new Set<number>();

  try {
    const existingSnap = await getDoc(sessionRef);
    if (existingSnap.exists()) {
      const existing = existingSnap.data() as PersistedSession;
      const sameUpload =
        existing.projectId === projectId &&
        existing.fileName === file.name &&
        existing.fileSize === file.size &&
        existing.totalChunks === totalChunks;

      if (sameUpload) {
        completedSet = new Set(
          (existing.completedChunks || []).filter((idx) => Number.isInteger(idx) && idx >= 0 && idx < totalChunks)
        );
      }
    }
  } catch {
    // Resume state is best-effort only.
  }

  try {
    await setDoc(sessionRef, {
      sessionId,
      projectId,
      fileName: file.name,
      fileSize: file.size,
      chunkSize,
      totalChunks,
      completedChunks: Array.from(completedSet),
      chunkPaths: chunkPaths.reduce<Record<number, string>>((acc, path, index) => {
        acc[index] = path;
        return acc;
      }, {}),
      status: "uploading",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    } as PersistedSession);
  } catch (err) {
    canPersistSession = false;
    console.warn("upload_sessions persistence unavailable; continuing upload without resume state", err);
  }

  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  const chunkSizes = chunks.map((chunk) => chunk.size);
  const chunkTransferred = new Map<number, number>();
  const pendingIndices = Array.from({ length: totalChunks }, (_v, index) => index).filter(
    (index) => !completedSet.has(index)
  );

  const bytesFromCompleted = () =>
    Array.from(completedSet).reduce((sum, index) => sum + (chunkSizes[index] || 0), 0);

  const bytesFromLive = () =>
    Array.from(chunkTransferred.values()).reduce((sum, value) => sum + value, 0);

  let sampleBytes = bytesFromCompleted();
  let sampleTime = Date.now();
  let speedBps = 0;

  const emitProgress = (status: ChunkedUploadProgress["status"]) => {
    const uploaded = Math.min(file.size, bytesFromCompleted() + bytesFromLive());
    const now = Date.now();
    const dt = (now - sampleTime) / 1000;
    if (dt >= 0.3) {
      speedBps = Math.max(0, (uploaded - sampleBytes) / dt);
      sampleBytes = uploaded;
      sampleTime = now;
    }

    const remaining = Math.max(0, file.size - uploaded);
    onProgress({
      overallPct: file.size > 0 ? Math.min(100, (uploaded / file.size) * 100) : 0,
      bytesUploaded: uploaded,
      totalBytes: file.size,
      speedBps,
      etaSeconds: speedBps > 0 ? remaining / speedBps : Infinity,
      chunksTotal: totalChunks,
      chunksComplete: completedSet.size,
      status,
    });
  };

  emitProgress("uploading");

  try {
    const uploadFns = pendingIndices.map((index) => () =>
      uploadChunk(
        chunks[index],
        chunkPaths[index],
        (bytes) => {
          chunkTransferred.set(index, bytes);
          emitProgress("uploading");
        },
        signal
      )
    );

    await withConcurrency(uploadFns, Math.min(MAX_CONCURRENT, Math.max(2, concurrency)), async (localIndex) => {
      const chunkIndex = pendingIndices[localIndex];
      completedSet.add(chunkIndex);
      chunkTransferred.delete(chunkIndex);
      emitProgress("uploading");

      if (canPersistSession) {
        try {
          await updateDoc(sessionRef, {
            completedChunks: Array.from(completedSet).sort((a, b) => a - b),
            updatedAt: Date.now(),
          });
        } catch {
          // best-effort persistence only
        }
      }
    });

    emitProgress("assembling");

    const downloadURL = await composeUploadedChunks({
      projectId,
      sessionId,
      fileName: file.name,
      chunkPaths,
      contentType: file.type || "video/mp4",
    });

    if (canPersistSession) {
      try {
        await updateDoc(sessionRef, {
          status: "done",
          completedChunks: Array.from(completedSet).sort((a, b) => a - b),
          finalUrl: downloadURL,
          updatedAt: Date.now(),
        });
      } catch {
        // best-effort persistence only
      }
    }

    onProgress({
      overallPct: 100,
      bytesUploaded: file.size,
      totalBytes: file.size,
      speedBps: 0,
      etaSeconds: 0,
      chunksTotal: totalChunks,
      chunksComplete: totalChunks,
      status: "done",
    });

    return downloadURL;
  } catch (err) {
    if (canPersistSession) {
      try {
        await updateDoc(sessionRef, { status: "error", updatedAt: Date.now() });
      } catch {
        // best-effort persistence only
      }
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Formatting helpers (used in UI)
// ---------------------------------------------------------------------------

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatSpeed(bps: number): string {
  return `${formatBytes(bps)}/s`;
}

export function formatEta(seconds: number): string {
  if (!isFinite(seconds) || seconds <= 0) return "--";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s}s`;
}
