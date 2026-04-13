import { storage, db } from "@/lib/firebase/config";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { doc, setDoc, collection, getDoc } from "firebase/firestore";
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
   */
  static async uploadFileUnified(
    file: File,
    projectIdOrOptions: string | UploadOptions,
    onProgressLegacy?: (progress: number) => void,
    maybeOptions?: Partial<UploadOptions>
  ): Promise<string> {
    const videoExtensions = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v', '3gp', 'qt', 'flv', 'wmv'];
    const isVideo = file.type.startsWith('video/') ||
      videoExtensions.some(ext => file.name.toLowerCase().endsWith('.' + ext));

    let options: UploadOptions;

    if (typeof projectIdOrOptions === 'string') {
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
      options = projectIdOrOptions;
    }

    // ROUTING LOGIC:
    // 1. Revisions/Drafts (uploaded by editor) -> ALWAYS Mux (high-performance streaming)
    // 2. Raw videos (uploaded by client) -> ALWAYS Firebase Storage (default for raw asset storage)
    // 3. Other assets (new projects) -> Mux if appropriate, else Firebase
    console.log(`[UploadService] Unified Upload Start: ${file.name} (${file.size} bytes), Type: ${options.type}, isVideo: ${isVideo}`);

    if (options.type === 'revision' && isVideo) {
      console.log(`[UploadService] Routing Draft/Revision upload to MUX for project ${options.projectId}`);
      return this.uploadToMux(file, options);
    } 
    
    // Raw videos from clients ALWAYS go to Firebase Storage (optimized for speed)
    if (options.type === 'raw' && isVideo) {
      console.log(`[UploadService] Routing raw client video to Firebase Storage (optimized for fast uploads)`);
      return this.uploadToFirebase(file, options);
    }
    
    // For other asset types, check project date
    const useMux = await this.shouldProjectUseMux(options.projectId);
    if (useMux && isVideo && options.type === 'asset') {
      console.log(`[UploadService] Routing asset video to Mux (New Project)`);
      return this.uploadToMux(file, options);
    }

    console.log(`[UploadService] Routing to Firebase (${options.type}${isVideo ? ' Video' : ''})`);
    return this.uploadToFirebase(file, options);
  }

  /**
   * Internal helper to determine if a project should use Mux based on its creation date.
   * Cutoff: 12/04/2026 (April 12, 2026)
   */
  private static async shouldProjectUseMux(projectId: string): Promise<boolean> {
    // 1. If it's a temporary ID from NewProjectPage (starts with req_), it's a new project.
    if (!projectId) return true;
    if (projectId.startsWith('req_')) return true;

    try {
      // 2. Fetch project metadata
      const projectDoc = await getDoc(doc(db, "projects", projectId));
      if (!projectDoc.exists()) {
        console.warn(`[UploadService] Project ${projectId} not found in Firestore. Defaulting to Mux.`);
        return true;
      }

      const projectData = projectDoc.data();
      const rawCreatedAt = projectData.createdAt;
      
      // Robust normalization of createdAt
      let createdAt = 0;
      if (typeof rawCreatedAt === 'number') {
        createdAt = rawCreatedAt;
      } else if (rawCreatedAt && typeof rawCreatedAt.toMillis === 'function') {
        createdAt = rawCreatedAt.toMillis();
      } else if (rawCreatedAt instanceof Date) {
        createdAt = rawCreatedAt.getTime();
      } else if (typeof rawCreatedAt === 'string') {
        createdAt = new Date(rawCreatedAt).getTime();
      }

      // Cutoff is April 12, 2026
      // 12/04/2026 formatted as timestamp: 1775952000000
      const MUX_CUTOFF = 1775952000000; 
      
      // If no date found, it's safer to treat it as a new project (Mux)
      if (!createdAt) {
          console.warn(`[UploadService] Project ${projectId} has no valid createdAt. Defaulting to Mux.`);
          return true;
      }

      const isLegacy = createdAt < MUX_CUTOFF;
      console.log(`[UploadService] Routing Decision:`, {
          projectId,
          createdAt,
          cutoff: MUX_CUTOFF,
          isLegacy,
          action: isLegacy ? 'FIREBASE' : 'MUX'
      });

      return !isLegacy;
    } catch (error) {
      console.error("[UploadService] Error checking project date:", error);
      // Fail safe: use Mux for new uploads if we can't determine the date
      return true;
    }
  }

  static async uploadFile(
    file: File,
    projectIdOrOptions: string | UploadOptions,
    onProgressLegacy?: (progress: number) => void,
    maybeOptions?: Partial<UploadOptions>
  ): Promise<string> {
    return this.uploadFileUnified(file, projectIdOrOptions, onProgressLegacy, maybeOptions);
  }

  /**
   * Direct upload to Mux using the signed upload URL.
   * Mux's browser docs support a plain PUT upload to the direct upload URL.
   * This avoids the tus HEAD preflight that is currently failing CORS in-browser.
   * 
   * OPTIMIZATIONS FOR LIGHTNING SPEED:
   * - Progress throttling (200ms) to reduce callback overhead
   * - Aggressive timeout configuration (30s)
   * - Retry logic with exponential backoff for transient failures
   * - Minimal header overhead
   */
  private static async uploadToMux(file: File, options: UploadOptions): Promise<string> {
    const { projectId, revisionId, onProgress, onCancelRef } = options;
    const finalRevisionId = revisionId || doc(collection(db, 'upload_sessions')).id;
    const MAX_RETRIES = 3;
    const INITIAL_RETRY_DELAY = 1000; // 1 second
    const MUX_UPLOAD_TIMEOUT = 30000; // 30 seconds for connection timeout

    let lastAttemptError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        // 1. Get Direct Upload URL from Mux via our API
        let uploadUrl: string;
        let uploadId: string;
        
        try {
          const response = await fetch("/api/mux-upload-url", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ projectId, revisionId: finalRevisionId, type: options.type }),
            signal: AbortSignal.timeout(10000) // 10s timeout for API call
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error("[UploadService] API Error:", {
              status: response.status,
              statusText: response.statusText,
              attempt,
              bodySnippet: errorText.substring(0, 500)
            });
            
            if (errorText.includes('<!DOCTYPE html>')) {
              throw new Error(`Server returned HTML instead of JSON. Check if /api/mux-upload-url exists and is working. (Status: ${response.status})`);
            }
            
            let errorData;
            try {
              errorData = JSON.parse(errorText);
            } catch {
              throw new Error(`Failed to create upload: ${response.status} ${response.statusText}`);
            }
            throw new Error(errorData.error || `Failed to create upload: ${response.status} ${response.statusText}`);
          }

          const data = await response.json();
          uploadUrl = data.uploadUrl;
          uploadId = data.uploadId;
        } catch (err) {
          // Retry on API errors (network issues, timeouts, etc)
          if (attempt < MAX_RETRIES) {
            const delay = INITIAL_RETRY_DELAY * Math.pow(2, attempt);
            console.warn(`[UploadService] API call failed, retrying in ${delay}ms...`, err);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
          throw err;
        }

        console.log(`[UploadService] Mux Upload session created:`, {
            uploadId,
            targetHost: new URL(uploadUrl).host,
            attempt: attempt + 1
        });

        // 2. Track the job in Firestore
        const videoJob: VideoJob = {
          id: uploadId,
          projectId,
          revisionId: finalRevisionId,
          status: "pending",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        await setDoc(doc(db, "video_jobs", uploadId), videoJob);

        // 3. Upload to MUX (for streaming) AND Firebase (for downloads) in parallel for faster processing
        // Split progress: 50% to MUX, 50% to Firebase download copy
        const splitProgress = (stage: 'mux' | 'firebase', stagePercent: number) => {
          if (!onProgress) return;
          
          const muxWeight = 0.5;
          const firebaseWeight = 0.5;
          
          const muxContribution = stage === 'mux' ? (stagePercent * muxWeight) : 100 * muxWeight;
          const firebaseContribution = stage === 'firebase' ? (stagePercent * firebaseWeight) : 0;
          
          const totalPercent = muxContribution + firebaseContribution;
          
          onProgress({
            percent: totalPercent,
            transferred: Math.round((totalPercent / 100) * file.size),
            total: file.size,
            status: stage === 'mux' ? 'uploading' : 'uploading',
          });
        };

        // Upload to MUX
        const muxUploadPromise = this.performMuxUpload(
          file, 
          uploadUrl, 
          uploadId, 
          (progress) => splitProgress('mux', progress.percent),
          onCancelRef, 
          MUX_UPLOAD_TIMEOUT
        );

        // Also upload to Firebase for downloads (backup/download version)
        const firebaseBackupPromise = (async () => {
          try {
            const firebasePath = `projects/${projectId}/revisions/${finalRevisionId}_backup_${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
            const storageRef = ref(storage, firebasePath);
            const uploadTask = uploadBytesResumable(storageRef, file);

            return new Promise<string>((resolve, reject) => {
              uploadTask.on(
                "state_changed",
                (snapshot) => {
                  const percent = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                  splitProgress('firebase', percent);
                },
                (error) => {
                  console.error(`[UploadService] Firebase backup upload failed:`, error);
                  reject(error);
                },
                async () => {
                  try {
                    const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
                    console.log(`[UploadService] Firebase backup created for revision ${finalRevisionId}`);
                    resolve(downloadUrl);
                  } catch (err) {
                    console.error(`[UploadService] Error getting Firebase download URL:`, err);
                    reject(err);
                  }
                }
              );
            });
          } catch (err) {
            console.error(`[UploadService] Firebase backup setup failed:`, err);
            // Don't fail the whole upload if Firebase backup fails - MUX is primary
            return null;
          }
        })();

        try {
          // Wait for both uploads to complete
          const [muxResult, firebaseUrl] = await Promise.allSettled([muxUploadPromise, firebaseBackupPromise]).then(results => [
            results[0].status === 'fulfilled' ? results[0].value : null,
            results[1].status === 'fulfilled' ? results[1].value : null,
          ]);

          if (!muxResult) {
            throw new Error('MUX upload failed');
          }

          // Update revision with both URLs for complete functionality
          if (firebaseUrl) {
            console.log(`[UploadService] Updating revision with Firebase backup URL for downloads`);
            await setDoc(doc(db, "revisions", finalRevisionId), {
              videoUrl: firebaseUrl,
              updatedAt: Date.now()
            }, { merge: true });
          }

          return muxResult;
        } catch (err) {
          console.error(`[UploadService] Dual upload error:`, err);
          throw err;
        }

      } catch (err: any) {
        lastAttemptError = err;
        
        // Check if error is retryable
        const isRetryable = err.message?.includes('Network error') || 
                           err.message?.includes('timeout') ||
                           err.message?.includes('ECONNRESET');
        
        if (isRetryable && attempt < MAX_RETRIES) {
          const delay = INITIAL_RETRY_DELAY * Math.pow(2, attempt);
          console.warn(`[UploadService] Retryable error on attempt ${attempt + 1}, retrying in ${delay}ms:`, err.message);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        // Non-retryable error or max retries exceeded
        console.error(`[UploadService] Mux upload failed after ${attempt + 1} attempt(s):`, err);
        throw err;
      }
    }

    throw lastAttemptError || new Error('Mux upload failed after maximum retries');
  }

  /**
   * Perform the actual file upload to Mux with progress tracking and timeout handling
   */
  private static performMuxUpload(
    file: File,
    uploadUrl: string,
    uploadId: string,
    onProgress: ((progress: UploadProgress) => void) | undefined,
    onCancelRef: ((cancel: () => void) => void) | undefined,
    timeout: number
  ): Promise<string> {
    const startTime = Date.now();
    let lastProgressUpdate = 0;
    const PROGRESS_THROTTLE_MS = 200; // Throttle to reduce callback overhead and improve network performance
    let timeoutHandle: NodeJS.Timeout | null = null;

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      // Set up timeout handler
      const handleTimeout = () => {
        console.error("[MuxUpload] Upload timeout after", timeout, "ms");
        xhr.abort();
        reject(new Error(`Mux upload timeout after ${timeout}ms`));
      };
      
      timeoutHandle = setTimeout(handleTimeout, timeout);

      xhr.open("PUT", uploadUrl, true);
      
      // Optimized headers for speed
      xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
      
      // Performance headers
      xhr.setRequestHeader("Connection", "keep-alive");

      xhr.upload.onprogress = (event) => {
        if (!onProgress || !event.lengthComputable) return;

        // Throttle progress updates to reduce overhead
        const now = Date.now();
        if (now - lastProgressUpdate < PROGRESS_THROTTLE_MS && event.loaded < event.total) {
          return;
        }
        lastProgressUpdate = now;

        const elapsed = (now - startTime) / 1000;
        const bytesSent = event.loaded;
        const bytesTotal = event.total;
        const speedBps = elapsed > 0 ? bytesSent / elapsed : 0;
        const remainingBytes = bytesTotal - bytesSent;
        const eta = speedBps > 0 ? remainingBytes / speedBps : 0;

        onProgress({
          percent: (bytesSent / bytesTotal) * 100,
          transferred: bytesSent,
          total: bytesTotal,
          speedBps,
          eta,
          status: 'uploading'
        });
      };

      xhr.onreadystatechange = () => {
        // Reset timeout on any state change
        if (timeoutHandle) clearTimeout(timeoutHandle);
        if (xhr.readyState === XMLHttpRequest.LOADING) {
          timeoutHandle = setTimeout(handleTimeout, timeout);
        }
      };

      xhr.onload = () => {
        if (timeoutHandle) clearTimeout(timeoutHandle);

        if (xhr.status >= 200 && xhr.status < 300) {
          console.log(`[MuxUpload] Upload successful for ${uploadId}, finalizing...`);
          
          if (onProgress) {
            onProgress({
              percent: 100,
              transferred: file.size,
              total: file.size,
              status: 'processing'
            });
          }
          resolve(uploadId);
          return;
        }

        console.error("[MuxUpload] PUT failed:", {
          status: xhr.status,
          statusText: xhr.statusText,
          uploadId,
          responseText: xhr.responseText?.slice(0, 500)
        });
        reject(new Error(`Mux upload failed with status ${xhr.status} ${xhr.statusText}`));
      };

      xhr.onerror = () => {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        console.error("[MuxUpload] Network error during direct upload", uploadId);
        reject(new Error("Mux upload failed due to a network or CORS error."));
      };

      xhr.onabort = () => {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        console.log("[MuxUpload] Upload cancelled:", uploadId);
        reject(new Error("Upload cancelled"));
      };

      if (onCancelRef) {
        onCancelRef(() => {
          if (timeoutHandle) clearTimeout(timeoutHandle);
          console.log("[MuxUpload] Cancel requested:", uploadId);
          xhr.abort();
        });
      }

      // Send file with minimal overhead
      console.log(`[MuxUpload] Starting PUT upload: ${file.name} (${this.formatBytes(file.size)}) to Mux`);
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
    let lastProgressUpdate = 0;
    const PROGRESS_THROTTLE_MS = 200; // Throttle progress updates to reduce callback overhead
    
    return new Promise((resolve, reject) => {
      uploadTask.on(
        "state_changed",
        (snapshot) => {
          if (!onProgress) return;
          
          // Throttle progress callbacks to avoid reducing upload speed
          const now = Date.now();
          if (now - lastProgressUpdate < PROGRESS_THROTTLE_MS && snapshot.bytesTransferred < snapshot.totalBytes) {
            return;
          }
          lastProgressUpdate = now;

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
        },
        (error) => {
          console.error(`[UploadService] Firebase upload error for ${file.name}:`, error);
          reject(error);
        },
        async () => {
          try {
            const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
            
            // If this is a revision upload to Firebase, we must update the document
            // because there's no backend webhook for direct Firebase uploads.
            if (options.type === 'revision' && options.revisionId) {
                console.log(`[UploadService] Finalizing Firebase Revision: ${options.revisionId}`);
                
                // Update Revision document with the direct URL
                await setDoc(doc(db, "revisions", options.revisionId), {
                    videoUrl: downloadUrl,
                    status: 'active',
                    updatedAt: Date.now()
                }, { merge: true });

                // Update VideoJob to complete
                await setDoc(doc(db, "video_jobs", options.revisionId), {
                    status: 'complete',
                    updatedAt: Date.now(),
                    completedAt: Date.now()
                }, { merge: true });
            }

            if (onProgress) {
              onProgress({
                percent: 100,
                transferred: file.size,
                total: file.size,
                status: 'complete'
              });
            }
            console.log(`[UploadService] Firebase upload complete: ${file.name} (${this.formatBytes(file.size)})`);
            resolve(downloadUrl);
          } catch (err) {
            console.error(`[UploadService] Error finalizing upload for ${file.name}:`, err);
            reject(err);
          }
        }
      );

      if (onCancelRef) {
        onCancelRef(() => {
          console.log(`[UploadService] Upload cancelled: ${file.name}`);
          uploadTask.cancel();
        });
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
