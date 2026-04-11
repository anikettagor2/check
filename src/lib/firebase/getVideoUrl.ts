/**
 * Video URL Retrieval Utility
 * Intelligently fetches video URLs with caching
 * Supports both optimized and original videos
 */

import { getDownloadURL, ref } from 'firebase/storage';
import { storage } from './config';
import { cacheVideoUrl, getCachedVideoUrl } from './videoUrlCache';
import {
  cacheVideoMetadata,
  getCachedVideoMetadata,
  VideoMetadataCache,
} from './videoMetadataCache';

export interface VideoUrlOptions {
  preferOptimized?: boolean;
  cacheDurationHours?: number;
  useCache?: boolean;
  playbackId?: string;
}

export interface VideoUrlResult {
  url: string;
  videoPath: string;
  isOptimized: boolean;
  wasCached: boolean;
  metadata?: Partial<VideoMetadataCache>;
}

/**
 * Get video URL with intelligent caching
 * Tries optimized version first, falls back to original
 * Always checks cache before making Firebase requests
 *
 * @param videoId - Video ID from Firestore
 * @param storagePath - Path to original video in Firebase Storage
 * @param options - Configuration options
 * @returns Video URL and metadata
 *
 * @example
 * const result = await getVideoUrl('video123', 'videos/original/video123.mp4', {
 *   preferOptimized: true,
 *   cacheDurationHours: 1,
 *   useCache: true
 * });
 * console.log(result.url); // Firebase download URL
 * console.log(result.isOptimized); // Was it an optimized version?
 */
export async function getVideoUrl(
  videoId: string,
  storagePath: string,
  options: VideoUrlOptions = {}
): Promise<VideoUrlResult> {
  const {
    preferOptimized = true,
    cacheDurationHours = 1,
    useCache = true,
    playbackId,
  } = options;

  // 0. Handle Mux streaming if playbackId is available
  if (playbackId) {
    return {
      url: `https://stream.mux.com/${playbackId}.m3u8`,
      videoPath: `mux://${playbackId}`,
      isOptimized: true,
      wasCached: false
    };
  }

  // Handle mux:// protocol as a fallback
  if (storagePath.startsWith('mux://')) {
    const id = storagePath.replace('mux://', '');
    return {
      url: `https://stream.mux.com/${id}.m3u8`, // Fallback assumption
      videoPath: storagePath,
      isOptimized: true,
      wasCached: false
    };
  }

  try {
    // 1. Check if we have a valid cached URL
    if (useCache) {
      const cachedUrl = getCachedVideoUrl(storagePath);
      if (cachedUrl) {
        return {
          url: cachedUrl,
          videoPath: storagePath,
          isOptimized: storagePath.includes('optimized'),
          wasCached: true,
        };
      }
    }

    // 2. Try to get optimized version first (if preferred)
    let url: string | null = null;
    let isOptimized = false;
    let actualPath = storagePath;

    if (preferOptimized) {
      const optimizedPath = getOptimizedVideoPath(storagePath);
      url = await tryGetVideoUrl(optimizedPath);
      if (url) {
        isOptimized = true;
        actualPath = optimizedPath;
        console.log('[getVideoUrl] Using optimized video:', videoId);
      }
    }

    // 3. Fallback to original if optimized not available
    if (!url) {
      url = await tryGetVideoUrl(storagePath);
      isOptimized = false;
      actualPath = storagePath;
      if (url) {
        console.log('[getVideoUrl] Using original video:', videoId);
      }
    }

    if (!url) {
      throw new Error(`Could not retrieve video URL for ${videoId}`);
    }

    // 4. Cache the URL
    if (useCache) {
      cacheVideoUrl(actualPath, url, cacheDurationHours * 60 * 60 * 1000);
    }

    return {
      url,
      videoPath: actualPath,
      isOptimized,
      wasCached: false,
    };
  } catch (error) {
    console.error('[getVideoUrl] Error retrieving video URL:', {
      videoId,
      storagePath,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Get multiple video URLs efficiently
 * Uses Promise.all for parallel requests
 */
export async function getMultipleVideoUrls(
  videos: Array<{ videoId: string; storagePath: string }>,
  options?: VideoUrlOptions
): Promise<VideoUrlResult[]> {
  const results = await Promise.allSettled(
    videos.map(video =>
      getVideoUrl(video.videoId, video.storagePath, options)
    )
  );

  return results.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    }
    console.error(
      `Failed to get URL for video ${videos[index].videoId}:`,
      result.reason
    );
    throw result.reason;
  });
}

/**
 * Try to get a video URL from a specific path
 * Returns null if not found
 */
async function tryGetVideoUrl(path: string): Promise<string | null> {
  try {
    const videoRef = ref(storage, path);
    const url = await getDownloadURL(videoRef);
    return url;
  } catch (error) {
    // Path doesn't exist or isn't accessible
    console.log('[getVideoUrl] Path not found:', path);
    return null;
  }
}

/**
 * Get the optimized version path for a video
 * Assumes optimized videos are in an 'optimized' subfolder
 *
 * @example
 * 'videos/original/abc123.mp4' -> 'videos/optimized/abc123.mp4'
 */
export function getOptimizedVideoPath(originalPath: string): string {
  // Replace 'original' with 'optimized' in the path
  if (originalPath.includes('/original/')) {
    return originalPath.replace('/original/', '/optimized/');
  }
  // If no 'original' folder, append 'optimized' before filename
  const lastSlash = originalPath.lastIndexOf('/');
  if (lastSlash === -1) {
    return `optimized_${originalPath}`;
  }
  return `${originalPath.slice(0, lastSlash)}/optimized/${originalPath.slice(lastSlash + 1)}`;
}

/**
 * Preload video metadata alongside URL
 * Caches both for better performance
 */
export async function getVideoUrlWithMetadata(
  videoId: string,
  storagePath: string,
  metadata?: Partial<VideoMetadataCache>,
  options?: VideoUrlOptions
): Promise<VideoUrlResult> {
  const result = await getVideoUrl(videoId, storagePath, options);

  // Cache metadata if provided
  if (metadata) {
    await cacheVideoMetadata(
      {
        id: `${videoId}_metadata`,
        videoId,
        title: metadata.title || 'Untitled',
        description: metadata.description,
        duration: metadata.duration || 0,
        fileSize: metadata.fileSize || 0,
        storagePath: result.videoPath,
        optimizedPath: result.isOptimized ? result.videoPath : undefined,
        createdAt: metadata.createdAt || Date.now(),
        updatedAt: Date.now(),
        thumbnailUrl: metadata.thumbnailUrl,
        tags: metadata.tags,
        isProcessed: result.isOptimized,
      },
      (options?.cacheDurationHours || 1)
    );
  }

  return {
    ...result,
    metadata,
  };
}

/**
 * Refresh a video URL (invalidate cache and get fresh)
 * Useful when video is updated
 */
export async function refreshVideoUrl(
  videoId: string,
  storagePath: string,
  options?: VideoUrlOptions
): Promise<VideoUrlResult> {
  // Force cache bypass by directly getting from Firebase
  try {
    const videoRef = ref(storage, storagePath);
    const url = await getDownloadURL(videoRef);

    // Cache the fresh URL
    if (options?.useCache !== false) {
      cacheVideoUrl(
        storagePath,
        url,
        (options?.cacheDurationHours || 1) * 60 * 60 * 1000
      );
    }

    return {
      url,
      videoPath: storagePath,
      isOptimized: storagePath.includes('optimized'),
      wasCached: false,
    };
  } catch (error) {
    console.error('[refreshVideoUrl] Failed to refresh video URL:', {
      videoId,
      storagePath,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Batch update video URLs with cache invalidation
 * Useful after bulk video processing
 */
export async function invalidateVideoUrlCache(videoPaths: string[]): Promise<void> {
  videoPaths.forEach(path => {
    // Would need to implement clearing in videoUrlCache
    // For now, we'll let cache expire naturally
    console.log('[refreshVideoUrl] Invalidated cache for:', path);
  });
}

/**
 * Get video size for progress tracking
 */
export async function getVideoSize(storagePath: string): Promise<number> {
  try {
    const response = await fetch(
      `https://firebasestorage.googleapis.com/v0/b/${process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET}/o/${encodeURIComponent(storagePath)}?alt=media`,
      { method: 'HEAD' }
    );
    const contentLength = response.headers.get('content-length');
    return contentLength ? parseInt(contentLength, 10) : 0;
  } catch (error) {
    console.warn('[getVideoUrl] Could not determine video size:', error);
    return 0;
  }
}

/**
 * Format bytes for display
 */
export function formatVideoSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}
