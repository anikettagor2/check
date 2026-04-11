import { storage, db } from "@/lib/firebase/config";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { doc, setDoc, collection } from "firebase/firestore";
import { VideoJob } from "@/types/schema";

export interface UploadProgress {
  percent: number;
  transferred: number;
  total: number;
  speedBps?: number;
  eta?: number;
  status: 'initial' | 'uploading' | 'processing' | 'complete' | 'error';
}

export interface UploadOptions {
  projectId: string;
  revisionId?: string;
  type: 'raw' | 'revision' | 'asset' | 'pm_file' | 'document';
  onProgress?: (progress: UploadProgress) => void;
  storagePath?: string; // Custom path for Firebase Storage
  onCancelRef?: (cancel: () => void) => void;
}

export class UploadService {
  /**
   * Main entry point for file uploads.
   * Routes to Mux for videos and Firebase Storage for others.
   * Supports both (file, options) and (file, projectId, onProgress, options) for compatibility.
   */
  static async uploadFileUnified(
    file: File,
    projectIdOrOptions: string | UploadOptions,
    onProgressLegacy?: (progress: number) => void,
    maybeOptions?: Partial<UploadOptions>
  ): Promise<string> {
    const isVideo = file.type.startsWith('video/') ||
      ['mp4', 'mov', 'avi', 'mkv', 'webm'].some(ext => file.name.toLowerCase().endsWith(ext));

    let options: UploadOptions;

    if (typeof projectIdOrOptions === 'string') {
      // Positional style: (file, projectId, onProgress, options)
      options = {
        projectId: projectIdOrOptions,
        type: maybeOptions?.type || 'asset',
        onProgress: (p) => {
          onProgressLegacy?.(p.percent);
          maybeOptions?.onProgress?.(p);
        },
        ...maybeOptions
      } as UploadOptions;
    } else {
      // Object style: (file, options)
      options = projectIdOrOptions;
    }

    if (isVideo) {
      return this.uploadToMux(file, options);
    } else {
      return this.uploadToFirebase(file, options);
    }
  }

  /**
   * Alias for uploadFileUnified for backward compatibility.
   */
  static async uploadFile(
    file: File,
    projectIdOrOptions: string | UploadOptions,
    onProgressLegacy?: (progress: number) => void,
    maybeOptions?: Partial<UploadOptions>
  ): Promise<string> {
    return this.uploadFileUnified(file, projectIdOrOptions, onProgressLegacy, maybeOptions);
  }

  /**
   * Upload video to Mux via our proxy API
   */
  private static async uploadToMux(file: File, options: UploadOptions): Promise<string> {
    const { projectId, revisionId, type, onProgress, onCancelRef } = options;
    const finalRevisionId = revisionId || doc(collection(db, 'upload_sessions')).id;

    // 1. Get signed upload URL from Mux
    const uploadRes = await fetch("/api/createUpload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        revisionId: finalRevisionId,
        type
      }),
    });

    if (!uploadRes.ok) {
      const error = await uploadRes.json();
      throw new Error(error.message || "Failed to initialize Mux upload");
    }

    const { uploadUrl, uploadId } = await uploadRes.json();

    // 2. Register a VideoJob for tracking
    const videoJob: VideoJob = {
      id: uploadId,
      projectId,
      revisionId: finalRevisionId,
      status: "pending",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await setDoc(doc(db, "video_jobs", uploadId), videoJob);

    // 3. Perform the XHR upload to Mux
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", uploadUrl);

      const startTime = Date.now();
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && onProgress) {
          const now = Date.now();
          const elapsed = (now - startTime) / 1000;
          const speedBps = elapsed > 0 ? event.loaded / elapsed : 0;
          const remainingBytes = event.total - event.loaded;
          const eta = speedBps > 0 ? remainingBytes / speedBps : 0;

          onProgress({
            percent: (event.loaded / event.total) * 100,
            transferred: event.loaded,
            total: event.total,
            speedBps,
            eta,
            status: 'uploading'
          });
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          if (onProgress) {
            onProgress({
              percent: 100,
              transferred: file.size,
              total: file.size,
              status: 'processing'
            });
          }
          // For Mux, the "URL" we store initially is a custom protocol
          // This tells our system to wait for the webhook to provide the playback ID
          resolve(`mux://${uploadId}`);
        } else {
          reject(new Error(`Mux upload fail: ${xhr.status}`));
        }
      };

      xhr.onerror = () => reject(new Error("Network error during Mux upload"));
      xhr.onabort = () => reject(new Error("Upload aborted"));

      if (onCancelRef) {
        onCancelRef(() => xhr.abort());
      }

      xhr.send(file);
    });
  }

  /**
   * Upload non-video files to Firebase Storage
   */
  private static async uploadToFirebase(file: File, options: UploadOptions): Promise<string> {
    const { projectId, type, onProgress, storagePath, onCancelRef } = options;
    
    let finalPath = storagePath;
    if (!finalPath) {
      const timestamp = Date.now();
      const fileName = `${timestamp}_${file.name.replace(/\s+/g, '_')}`;
      finalPath = `projects/${projectId}/${type}/${fileName}`;
    }
    
    const storageRef = ref(storage, finalPath);
    const uploadTask = uploadBytesResumable(storageRef, file);

    const startTime = Date.now();
    return new Promise((resolve, reject) => {
      uploadTask.on(
        "state_changed",
        (snapshot) => {
          if (onProgress) {
            const now = Date.now();
            const elapsed = (now - startTime) / 1000;
            const speedBps = elapsed > 0 ? snapshot.bytesTransferred / elapsed : 0;
            const remainingBytes = snapshot.totalBytes - snapshot.bytesTransferred;
            const eta = speedBps > 0 ? remainingBytes / speedBps : 0;

            onProgress({
              percent: (snapshot.bytesTransferred / snapshot.totalBytes) * 100,
              transferred: snapshot.bytesTransferred,
              total: snapshot.totalBytes,
              speedBps,
              eta,
              status: 'uploading'
            });
          }
        },
        (error) => reject(error),
        async () => {
          const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
          if (onProgress) {
            onProgress({
              percent: 100,
              transferred: file.size,
              total: file.size,
              status: 'complete'
            });
          }
          resolve(downloadUrl);
        }
      );

      if (onCancelRef) {
        onCancelRef(() => uploadTask.cancel());
      }
    });
  }

  /**
   * Formatting helpers
   */
  static formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  static formatSpeed(bps: number): string {
    return `${this.formatBytes(bps)}/s`;
  }

  static formatEta(seconds: number): string {
    if (!isFinite(seconds) || seconds <= 0) return "--";
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m}m ${s}s`;
  }
}
