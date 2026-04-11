/**
 * useVideoLoader Hook
 * Manages video URL retrieval with intelligent caching
 * Handles loading states, errors, and optimization
 */

'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { getVideoUrl, getVideoUrlWithMetadata, refreshVideoUrl } from '@/lib/firebase/getVideoUrl';
import { getCachedVideoMetadata } from '@/lib/firebase/videoMetadataCache';

export interface VideoLoaderState {
  url: string | null;
  isLoading: boolean;
  isOptimized: boolean;
  wasCached: boolean;
  error: Error | null;
  metadata?: any;
}

export interface UseVideoLoaderOptions {
  videoId?: string;
  storagePath: string;
  preferOptimized?: boolean;
  cacheDurationHours?: number;
  useCache?: boolean;
  autoLoad?: boolean;
  preloadMetadata?: boolean;
  playbackId?: string;
}

/**
 * Hook for loading video URLs with caching
 * 
 * @example
 * const { url, isLoading, error, retry, refresh } = useVideoLoader({
 *   storagePath: 'videos/original/video123.mp4',
 *   preferOptimized: true,
 *   autoLoad: true
 * });
 *
 * if (isLoading) return <div>Loading...</div>;
 * if (error) return <div>Error: {error.message}</div>;
 * return <video src={url} />;
 */
export function useVideoLoader(options: UseVideoLoaderOptions) {
  const {
    videoId = `video_${Date.now()}`,
    storagePath,
    preferOptimized = true,
    cacheDurationHours = 1,
    useCache = true,
    autoLoad = true,
    preloadMetadata = false,
    playbackId,
  } = options;

  const [state, setState] = useState<VideoLoaderState>({
    url: null,
    isLoading: autoLoad,
    isOptimized: false,
    wasCached: false,
    error: null,
    metadata: undefined,
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const loadAttemptRef = useRef(0);

  /**
   * Load video URL
   */
  const load = useCallback(async () => {
    // Cancel previous request if still pending
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();
    loadAttemptRef.current++;

    setState(prev => ({
      ...prev,
      isLoading: true,
      error: null,
    }));

    try {
      let result;

      if (preloadMetadata) {
        const cached = await getCachedVideoMetadata(videoId);
        result = await getVideoUrlWithMetadata(
          videoId,
          storagePath,
          cached || undefined,
          {
            preferOptimized,
            cacheDurationHours,
            useCache,
            playbackId,
          }
        );
      } else {
        result = await getVideoUrl(videoId, storagePath, {
          preferOptimized,
          cacheDurationHours,
          useCache,
          playbackId,
        });
      }

      // Check if this request was cancelled
      if (abortControllerRef.current?.signal.aborted) {
        return;
      }

      setState({
        url: result.url,
        isLoading: false,
        isOptimized: result.isOptimized,
        wasCached: result.wasCached,
        error: null,
        metadata: result.metadata,
      });

      console.log('[useVideoLoader] Video loaded:', {
        videoId,
        isOptimized: result.isOptimized,
        wasCached: result.wasCached,
      });
    } catch (error) {
      // Ignore if this request was cancelled
      if (abortControllerRef.current?.signal.aborted) {
        return;
      }

      const errorObj = error instanceof Error ? error : new Error(String(error));
      setState({
        url: null,
        isLoading: false,
        isOptimized: false,
        wasCached: false,
        error: errorObj,
        metadata: undefined,
      });

      console.error('[useVideoLoader] Failed to load video:', {
        videoId,
        storagePath,
        error: errorObj.message,
        attempt: loadAttemptRef.current,
      });
    }
  }, [videoId, storagePath, playbackId, preferOptimized, cacheDurationHours, useCache, preloadMetadata]);

  /**
   * Retry loading with exponential backoff
   */
  const retry = useCallback(async () => {
    const backoffMs = Math.min(1000 * Math.pow(2, loadAttemptRef.current - 1), 10000);
    console.log(`[useVideoLoader] Retrying in ${backoffMs}ms (attempt ${loadAttemptRef.current})`);

    await new Promise(resolve => setTimeout(resolve, backoffMs));
    await load();
  }, [load]);

  /**
   * Refresh video URL (bypass cache)
   */
  const refresh = useCallback(async () => {
    setState(prev => ({
      ...prev,
      isLoading: true,
    }));

    try {
      const result = await refreshVideoUrl(videoId, storagePath, {
        preferOptimized,
        cacheDurationHours,
        useCache,
      });

      setState({
        url: result.url,
        isLoading: false,
        isOptimized: result.isOptimized,
        wasCached: false,
        error: null,
        metadata: undefined,
      });

      console.log('[useVideoLoader] Video refreshed:', videoId);
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error));
      setState({
        url: null,
        isLoading: false,
        isOptimized: false,
        wasCached: false,
        error: errorObj,
        metadata: undefined,
      });

      console.error('[useVideoLoader] Failed to refresh video:', errorObj.message);
    }
  }, [videoId, storagePath, preferOptimized, cacheDurationHours, useCache]);

  /**
   * Auto-load on mount or when path changes
   */
  useEffect(() => {
    if (autoLoad) {
      load();
    }

    return () => {
      // Cleanup: cancel pending request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [storagePath, autoLoad, load]);

  return {
    ...state,
    load,
    retry,
    refresh,
    isError: state.error !== null,
  };
}

/**
 * Hook for loading multiple videos efficiently
 */
export function useMultipleVideoLoaders(
  videos: Array<UseVideoLoaderOptions>
): Map<string, VideoLoaderState & { load: () => Promise<void>; retry: () => Promise<void>; refresh: () => Promise<void> }> {
  const loadersMap = useRef<Map<string, any>>(new Map());

  const loaders = videos.map(video => {
    const key = video.storagePath;
    if (!loadersMap.current.has(key)) {
      // Using hooks inside a loop - this is intentional for fixed lists
      // In practice, use with stable video list
      loadersMap.current.set(key, useVideoLoader(video));
    }
    return [key, loadersMap.current.get(key)] as const;
  });

  return new Map(loaders);
}

/**
 * Hook for conditional video loading (e.g., after user interaction)
 */
export function useLazyVideoLoader(options: UseVideoLoaderOptions) {
  const { autoLoad = false, ...rest } = options;

  return useVideoLoader({
    ...rest,
    autoLoad: false,
  });
}
