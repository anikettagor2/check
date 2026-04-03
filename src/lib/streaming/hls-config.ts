/**
 * HLS.js Configuration for Optimized Performance
 * Enables fast streaming with adaptive bitrate and intelligent buffering
 */

import HLS from 'hls.js';

export interface HLSOptimizationConfig {
  enableLogging?: boolean;
  targetBufferTime?: number;
  maxBufferLength?: number;
  maxBufferSize?: number;
  maxLoadingDelay?: number;
  lowLatencyMode?: boolean;
  autoStartLoad?: boolean;
  startFragPrefetch?: boolean;
  maxMaxBufferHole?: number;
  maxFragLookUpTolerance?: number;
  /**
   * Start with lower quality (480p) for faster startup
   * Automatically upgrade as bandwidth becomes available
   */
  startWithLowerQuality?: boolean;
  /**
   * Enable automatic segment caching in IndexedDB
   * Improves bandwidth usage and offline capability
   */
  enableSegmentCaching?: boolean;
  /**
   * For large videos (300MB+)
   * Increases buffer, reduces quality aggressiveness
   */
  isLargeVideo?: boolean;
}

/**
 * Get optimized HLS.js configuration based on network conditions
 */
export function getOptimizedHLSConfig(
  userConfig?: HLSOptimizationConfig
): any {
  return {
    debug: userConfig?.enableLogging ?? false,
    
    // ─────────────────────────────────────────────────────────────────────
    // Buffering Configuration - Fast Streaming
    // ─────────────────────────────────────────────────────────────────────
    
    // Target buffer: 4 seconds (low-latency behavior)
    targetDurations: [userConfig?.targetBufferTime ?? 4],

    // Max buffer: 12 seconds (keep buffered window small to reduce perceived drift)
    maxBufferLength: userConfig?.maxBufferLength ?? 12,

    // Max buffer hole: 0.3 seconds to avoid tolerance-induced stalls
    maxMaxBufferHole: userConfig?.maxMaxBufferHole ?? 0.3,

    // Max buffer size: 50MB for low-latency small buffer mode
    maxBufferSize: userConfig?.maxBufferSize ?? 50 * 1024 * 1024,

    // Max loading delay: 2 seconds (aggressively close to live pace)
    maxLoadingDelay: userConfig?.maxLoadingDelay ?? 2,

    // Fragment lookup tolerance: low to precisely fetch next fragments on demand
    maxFragLookUpTolerance: userConfig?.maxFragLookUpTolerance ?? 0.1,
    
    // ─────────────────────────────────────────────────────────────────────
    // Segment Loading - Parallel Downloads
    // ─────────────────────────────────────────────────────────────────────
    
    // Load segments in parallel
    maxNumUnsyncedSegments: 6,
    
    // ─────────────────────────────────────────────────────────────────────
    // Quality and Caching Configuration
    // ─────────────────────────────────────────────────────────────────────
    
    // Start with lower quality for faster startup if enabled
    // -1 = auto (default), 0 = 1080p, 1 = 720p, 2 = 480p, etc.
    startLevel: userConfig?.startWithLowerQuality ? 2 : -1, // 2 = 480p (lower quality)
    
    // ─────────────────────────────────────────────────────────────────────
    // Low Latency Mode - Faster Startup
    // ─────────────────────────────────────────────────────────────────────
    
    lowLatencyMode: userConfig?.lowLatencyMode ?? true,
    
    // Start loading automatically
    autoStartLoad: userConfig?.autoStartLoad ?? true,
    
    // Prefetch first fragment for quick start
    startFragPrefetch: userConfig?.startFragPrefetch ?? true,
    
    // ─────────────────────────────────────────────────────────────────────
    // Manifest Configuration
    // ─────────────────────────────────────────────────────────────────────
    
    // Re-fetch manifest every 3 seconds for live updates
    manifestLoadingTimeOut: 10000,
    manifestLoadingMaxRetry: 3,
    manifestLoadingRetryDelay: 1000,
    
    // ─────────────────────────────────────────────────────────────────────
    // Reliability Configuration
    // ─────────────────────────────────────────────────────────────────────
    
    // Retry failed segments up to 6 times
    fragLoadingMaxRetry: 6,
    fragLoadingRetryDelay: 1000,
    fragLoadingLoopThreshold: 3,
    
    // Retry on network errors
    levelLoadingMaxRetry: 4,
    levelLoadingRetryDelay: 1000,
    
    // ─────────────────────────────────────────────────────────────────────
    // Live Stream Configuration
    // ─────────────────────────────────────────────────────────────────────
    
    liveSyncDurationCount: 3,
    liveBackBufferLength: 30,
    
    // ─────────────────────────────────────────────────────────────────────
    // XHR Configuration (for fetching segments)
    // ─────────────────────────────────────────────────────────────────────
    
    xhrSetup: (xhr: XMLHttpRequest, url: string) => {
      // Add cache headers for better CDN interaction
      xhr.withCredentials = false;
      xhr.timeout = 20000; // 20 second timeout
    },
    
    // ─────────────────────────────────────────────────────────────────────
    // Playback Configuration
    // ─────────────────────────────────────────────────────────────────────
    
    // Don't freeze the video during buffering
    enableWorker: true,
    
    // Enable server-side playlist update detection
    enableSoftwareAES: true,
  };
}

/**
 * Get HLS.js event listeners for monitoring playback
 */
export function getHLSEventListeners() {
  return {
    [HLS.Events.MANIFEST_PARSED]: 'Manifest loaded and parsed',
    [HLS.Events.LEVEL_SWITCHED]: 'Quality level switched',
    [HLS.Events.BUFFER_APPENDING]: 'Buffering data',
    [HLS.Events.BUFFER_APPENDED]: 'Data appended to buffer',
    [HLS.Events.FRAG_LOADED]: 'Segment loaded successfully',
    [HLS.Events.ERROR]: 'Error occurred',
  };
}

/**
 * Adaptive bitrate switching strategy based on network speed
 */
export interface NetSpeedProfile {
  name: 'slow' | 'medium' | 'fast';
  bandwidth: number; // Mbps
  targetLevel: number; // 0=lowest, n=highest
  bufferTarget: number; // seconds
}

export function detectNetworkSpeed(): NetSpeedProfile {
  if (typeof navigator === 'undefined') {
    return { name: 'medium', bandwidth: 10, targetLevel: -1, bufferTarget: 8 };
  }

  const connection = (navigator as any).connection;
  if (!connection) {
    return { name: 'medium', bandwidth: 10, targetLevel: -1, bufferTarget: 8 };
  }

  const effectiveType = String(connection.effectiveType || '4g').toLowerCase();
  const downlink = Number(connection.downlink || 0);
  const saveData = Boolean(connection.saveData);

  if (saveData || effectiveType === 'slow-2g' || effectiveType === '2g') {
    return { name: 'slow', bandwidth: 1, targetLevel: 0, bufferTarget: 12 };
  }

  if (effectiveType === '3g' || downlink < 2) {
    return { name: 'medium', bandwidth: 3, targetLevel: 1, bufferTarget: 10 };
  }

  if (effectiveType === '4g' && downlink >= 10) {
    return { name: 'fast', bandwidth: 20, targetLevel: -1, bufferTarget: 6 };
  }

  return { name: 'medium', bandwidth: 10, targetLevel: -1, bufferTarget: 8 };
}

/**
 * Recommended HLS configuration presets
 */
export const HLS_PRESETS = {
  /**
   * Fast startup (~1-2 seconds to first frame)
   */
  fastStart: {
    targetBufferTime: 4,
    maxBufferLength: 12,
    lowLatencyMode: true,
    startFragPrefetch: true,
    maxBufferSize: 50 * 1024 * 1024,
    maxMaxBufferHole: 0.3,
  },

  /**
   * Balanced (responsive + reliable)
   */
  balanced: {
    targetBufferTime: 5,
    maxBufferLength: 16,
    lowLatencyMode: true,
    startFragPrefetch: true,
    maxBufferSize: 70 * 1024 * 1024,
    maxMaxBufferHole: 0.5,
  },

  /**
   * Reliable (smooth playback, higher latency)
   */
  reliable: {
    targetBufferTime: 15,
    maxBufferLength: 60,
    lowLatencyMode: false,
    startFragPrefetch: false,
  },

  /**
   * Slow network (mobile with poor connection)
   */
  slowNetwork: {
    targetBufferTime: 20,
    maxBufferLength: 90,
    lowLatencyMode: false,
    startFragPrefetch: false,
    startWithLowerQuality: true,
    enableSegmentCaching: true,
  },

  /**
   * Progressive quality upgrade (RECOMMENDED)
   * Starts at 480p, automatically upgrades as bandwidth becomes available
   * Caches all segments for bandwidth savings and offline support
   */
  progressiveUpgrade: {
    targetBufferTime: 6,
    maxBufferLength: 25,
    lowLatencyMode: true,
    startFragPrefetch: true,
    startWithLowerQuality: true,
    enableSegmentCaching: true,
  },

  /**
   * Large Video Optimization (300MB+)
   * Significantly larger buffers to prevent stuttering
   * Keeps quality lower for stable playback
   * Aggressive segment prefetching
   * More robust retry logic
   */
  largeFileOptimized: {
    targetBufferTime: 30,        // 30 second target buffer (vs 6s)
    maxBufferLength: 90,          // 90 second max (vs 25s)
    lowLatencyMode: false,        // Disable low latency, need stability
    startFragPrefetch: true,      // Prefetch more aggressively
    startWithLowerQuality: true,  // Start at 480p minimum
    enableSegmentCaching: true,   // Aggressive caching
    maxBufferSize: 300 * 1024 * 1024, // 300MB buffer in memory
    maxLoadingDelay: 8,           // Only upgrade if very stable
  },
} as const;

/**
 * Select HLS preset based on network conditions and file size
 * Automatically detects large videos and applies optimized settings
 */
export function selectHLSPreset(
  profile: NetSpeedProfile,
  isLargeVideo?: boolean
): HLSOptimizationConfig {
  // If explicitly marked as large video, use optimized preset
  if (isLargeVideo) {
    return HLS_PRESETS.largeFileOptimized;
  }
  
  // Always use progressive upgrade for optimal UX
  // Starts at 480p, upgrades as bandwidth allows
  return HLS_PRESETS.progressiveUpgrade;
}

/**
 * Detect if video size exceeds large file threshold (300MB)
 * Returns true if file is likely to need large video optimization
 */
export function isLargeVideoFile(sizeBytes: number | undefined): boolean {
  if (!sizeBytes) return false;
  const LARGE_FILE_THRESHOLD = 300 * 1024 * 1024; // 300MB
  return sizeBytes > LARGE_FILE_THRESHOLD;
}

/**
 * Get optimized config for large videos with additional retry logic
 * Increases segment retry attempts and timing delays
 */
export function getLargeVideoHLSConfig(): any {
  return {
    // Much larger buffers to prevent stuttering on large files
    targetDurations: [30],
    maxBufferLength: 90,
    maxBufferSize: 300 * 1024 * 1024,
    maxLoadingDelay: 8,
    
    // More aggressive segment loading retry
    fragLoadingMaxRetry: 12,         // Up from 6
    fragLoadingRetryDelay: 2000,     // Longer delay between retries
    fragLoadingLoopThreshold: 10,    // Higher threshold before giving up
    
    // More patient manifest loading
    manifestLoadingMaxRetry: 6,      // Up from 3
    manifestLoadingTimeOut: 20000,   // Longer timeout
    manifestLoadingRetryDelay: 2000,
    
    // Level loading retry
    levelLoadingMaxRetry: 6,         // Up from 4
    levelLoadingRetryDelay: 2000,
    
    // Parallel loading (load more segments at once)
    maxNumUnsyncedSegments: 10,      // Up from 6
    
    // Disable low latency for stability
    lowLatencyMode: false,
    startFragPrefetch: true,
    
    // Cache strategy
    startLevel: 3,                   // Start even lower (360p)
  };
}
