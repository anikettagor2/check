/**
 * Optimized HLS Video Player Component
 * 
 * Features:
 * - Fast startup (1-2 seconds)
 * - Adaptive bitrate streaming
 * - Intelligent buffering
 * - Network-aware quality selection
 * - Preloading optimization
 */

'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import HLS from 'hls.js';
import { Play, Pause, Volume2, VolumeX, Maximize2, Loader2, AlertCircle, Zap } from 'lucide-react';
import {
  getOptimizedHLSConfig,
  detectNetworkSpeed,
  selectHLSPreset,
  isLargeVideoFile,
  getLargeVideoHLSConfig,
} from '@/lib/streaming/hls-config';
import {
  createCachingXhrSetup,
  cacheSegment,
  getCachedSegment,
  clearSegmentCache,
  getSegmentCacheStats,
} from '@/lib/streaming/segment-cache';

interface OptimizedHLSPlayerProps {
  hlsUrl?: string;
  videoUrl?: string;
  title?: string;
  projectName?: string;
  fileSize?: number; // In bytes, for large video optimization
  autoPlay?: boolean;
  preload?: 'none' | 'metadata' | 'auto';
  speedFirst?: boolean;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  onPlaying?: () => void;
  onPause?: () => void;
  onError?: (error: Error) => void;
  className?: string;
}

export function OptimizedHLSPlayer({
  hlsUrl,
  videoUrl,
  title,
  projectName,
  fileSize,
  autoPlay = false,
  preload = 'metadata',
  speedFirst = false,
  onTimeUpdate,
  onPlaying,
  onPause,
  onError,
  className = '',
}: OptimizedHLSPlayerProps) {
  // Use HLS if available, otherwise use direct video URL
  const videoSrc = hlsUrl || videoUrl;
  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<HLS | null>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // State
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isBuffering, setIsBuffering] = useState(false);
  const [showControls, setShowControls] = useState(!autoPlay);
  const [error, setError] = useState<string | null>(null);
  const [currentQuality, setCurrentQuality] = useState<string>('auto');
  const [isLoading, setIsLoading] = useState(true);
  const [cacheSize, setCacheSize] = useState<string>('0MB');
  const [qualityProgression, setQualityProgression] = useState<string>('480p (startup)');
  const [isLargeVideo, setIsLargeVideo] = useState(isLargeVideoFile(fileSize));

  // ─────────────────────────────────────────────────────────────────────
  // HLS Initialization and Optimization
  // ─────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoSrc) return;

    // For HLS streams
    if (hlsUrl && HLS.isSupported()) {
      // Don't reinitialize if already loading the same URL
      if (hlsRef.current?.media === video && hlsRef.current !== null) {
        return;
      }

      // Detect if this is a large video (300MB+)
      const largeVideo = isLargeVideoFile(fileSize);
      setIsLargeVideo(largeVideo);

      if (largeVideo) {
        console.log('[OptimizedHLSPlayer] 🎬 Large video detected (300MB+) - applying optimized settings');
        console.log('[OptimizedHLSPlayer] Expected load time: 30-60 seconds for full buffer (this is normal)');
      }

      // Detect network speed and select appropriate preset
      const networkProfile = detectNetworkSpeed();
      const hlsPreset = selectHLSPreset(networkProfile, largeVideo);

      // Get optimized HLS configuration
      let config = getOptimizedHLSConfig({
        enableLogging: process.env.NODE_ENV === 'development',
        ...hlsPreset,
      }) as any;

      // Speed-first mode: reduce buffer target/length and get earliest fragments (aggressive low-latency)
      if (speedFirst) {
        config = {
          ...config,
          targetBufferTime: 3,
          maxBufferLength: 10,
          maxBufferSize: 30 * 1024 * 1024,
          lowLatencyMode: true,
          startFragPrefetch: true,
          capLevelToPlayerSize: true,
          maxLoadingDelay: 1.5,
        };
      }

      // For large videos, apply additional aggressive settings
      if (largeVideo) {
        const largeVideoConfig = getLargeVideoHLSConfig();
        config = { ...config, ...largeVideoConfig };
      }

    // Add segment caching to XHR setup
    const defaultXhrSetup = config.xhrSetup;
    config.xhrSetup = createCachingXhrSetup(defaultXhrSetup);

    // Create HLS instance with optimized config
    const hls = new HLS(config);
    hlsRef.current = hls;

    // Update cache size display
    getSegmentCacheStats().then(stats => {
      setCacheSize(stats.cacheSizeMB);
      console.log(`[OptimizedHLSPlayer] Segment cache: ${stats.cacheSizeMB}MB (${stats.cacheCount} segments)`);
    });

    // ─────────────────────────────────────────────────────────────────────
    // Event Handlers
    // ─────────────────────────────────────────────────────────────────────

    const handleManifestParsed = () => {
      console.log('[OptimizedHLSPlayer] Manifest parsed, levels available:', hls.levels.length);
      
      if (largeVideo) {
        console.log('[OptimizedHLSPlayer] 🎬 Large video - Starting quality: 360p (extra-low for stability)');
        setQualityProgression('360p (large video mode)');
      } else {
        console.log('[OptimizedHLSPlayer] Starting quality: 480p (progressive upgrade enabled)');
      }
      
      // Log available qualities
      hls.levels.forEach((level, idx) => {
        console.log(
          `  Level ${idx}: ${level.width}x${level.height} @ ${level.bitrate / 1000}kbps`
        );
      });

      setIsLoading(false);
    };

    const handleLevelSwitched = (_event: any, data: { level: number }) => {
      const level = hls.levels[data.level];
      if (level) {
        const qualityLabel = `${level.width}x${level.height} (${Math.round(level.bitrate / 1000)}kbps)`;
        console.log(`[OptimizedHLSPlayer] Quality upgraded to: ${qualityLabel}`);
        setCurrentQuality(qualityLabel);
        
        // Update quality progression display
        if (level.width >= 1920) {
          setQualityProgression('4K (maximum)');
        } else if (level.width >= 1280) {
          setQualityProgression('720p (upgraded)');
        } else if (level.width >= 854) {
          setQualityProgression('480p (stable)');
        } else {
          setQualityProgression('360p (low bandwidth)');
        }
      }
    };

    const handleBuffering = () => {
      setIsBuffering(true);

      if (!video) return;
      const buffered = video.buffered;
      if (!buffered || buffered.length === 0) {
        return;
      }

      const end = buffered.end(buffered.length - 1);
      const remaining = Math.max(0, end - video.currentTime);

      // If we are in very low remaining buffer (< 3s), force immediate load of next fragments.
      if (remaining < 3) {
        console.log('[OptimizedHLSPlayer] Low buffer margin (<3s), forcing hls.startLoad()');
        hls.startLoad();
      }

      // If we have enough buffer, resume normal no-blocking mode
      if (remaining > 8) {
        setIsBuffering(false);
      }
    };

    const handleBufferAppended = () => {
      setIsBuffering(false);
      if (!video) return;

      const buffered = video.buffered;
      if (!buffered || buffered.length === 0) return;

      const end = buffered.end(buffered.length - 1);
      const remaining = Math.max(0, end - video.currentTime);

      // Keep small but consistent buffer; pre-load some fragments if needed.
      if (remaining < 6) {
        console.log('[OptimizedHLSPlayer] Buffer appended. Remaining', remaining, 's. Preloading next fragments.');
        hls.startLoad();
      }
    };

    const handleProgramDateTimeParsed = () => {
      // Live stream handling
      console.log('[OptimizedHLSPlayer] Program date time parsed (live stream)');
    };

    const handleError = (_event: any, data: any) => {
      console.error('[OptimizedHLSPlayer] HLS Error:', {
        type: data?.type,
        details: data?.details,
        fatal: data?.fatal,
      });

      if (data?.fatal) {
        switch (data.type) {
          case HLS.ErrorTypes?.NETWORK_ERROR:
            console.warn('Network error - attempting recovery...');
            // Retry manifests
            setTimeout(() => {
              hls.startLoad();
            }, 1000);
            setError('Network error - retrying...');
            break;

          case HLS.ErrorTypes.MEDIA_ERROR:
            console.warn('Media error - attempting recovery...');
            hls.recoverMediaError();
            setError('Media error - retrying...');
            break;

          default:
            // Cannot recover - fatal error
            const errorMsg = `Fatal HLS Error: ${data.type} - ${data.details}`;
            setError(errorMsg);
            onError?.(new Error(errorMsg));
            break;
        }
      }
    };

    hls.on(HLS.Events.MANIFEST_PARSED, handleManifestParsed);
    hls.on(HLS.Events.LEVEL_SWITCHED, handleLevelSwitched);
    hls.on(HLS.Events.BUFFER_APPENDING, handleBuffering);
    hls.on(HLS.Events.BUFFER_APPENDED, handleBufferAppended);
    hls.on(HLS.Events.ERROR, handleError);

    // Load the HLS stream
    try {
      hls.loadSource(hlsUrl);
      hls.attachMedia(video);
      
      if (autoPlay) {
        video.play().catch(err => {
          console.warn('[OptimizedHLSPlayer] Autoplay prevented:', err);
        });
      }
    } catch (err) {
      console.error('[OptimizedHLSPlayer] Failed to load HLS stream:', err);
      setError('Failed to load video');
      onError?.(err as Error);
    }

    // Cleanup
    return () => {
      hls.off(HLS.Events.MANIFEST_PARSED, handleManifestParsed);
      hls.off(HLS.Events.LEVEL_SWITCHED, handleLevelSwitched);
      hls.off(HLS.Events.BUFFER_APPENDING, handleBuffering);
      hls.off(HLS.Events.BUFFER_APPENDED, handleBufferAppended);
      hls.off(HLS.Events.ERROR, handleError);
      hls.destroy();
      hlsRef.current = null;
    };
  } else if (videoUrl) {
    // For direct video URLs (MP4), just set the src
    video.src = videoUrl;
    video.load();
    setIsLoading(false);
  }

  }, [videoSrc, hlsUrl, videoUrl, fileSize, autoPlay, onError]);

  // ─────────────────────────────────────────────────────────────────────
  // Video Event Handlers
  // ─────────────────────────────────────────────────────────────────────

  const handlePlay = useCallback(() => {
    setIsPlaying(true);
    setShowControls(true);
    onPlaying?.();
  }, [onPlaying]);

  const handlePause = useCallback(() => {
    setIsPlaying(false);
    onPause?.();
  }, [onPause]);

  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      const current = videoRef.current.currentTime;
      setCurrentTime(current);
      onTimeUpdate?.(current, duration);
    }
  }, [duration, onTimeUpdate]);

  const handleDurationChange = useCallback(() => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  }, []);

  const handleWaiting = useCallback(() => {
    setIsBuffering(true);
  }, []);

  const handleCanPlay = useCallback(() => {
    setIsBuffering(false);
  }, []);

  // ─────────────────────────────────────────────────────────────────────
  // Control Handlers
  // ─────────────────────────────────────────────────────────────────────

  const togglePlay = useCallback(() => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play().catch(err => {
          console.error('[OptimizedHLSPlayer] Play error:', err);
        });
      }
    }
  }, [isPlaying]);

  const toggleMute = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  }, [isMuted]);

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const vol = parseFloat(e.target.value);
    setVolume(vol);
    if (videoRef.current) {
      videoRef.current.volume = vol;
    }
  }, []);

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
    }
  }, []);

  const handleMouseMove = useCallback(() => {
    setShowControls(true);
    clearTimeout(controlsTimeoutRef.current!);
    if (isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    }
  }, [isPlaying]);

  const toggleFullscreen = useCallback(() => {
    if (containerRef.current) {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      } else {
        containerRef.current.requestFullscreen().catch(() => {});
      }
    }
  }, []);

  // ─────────────────────────────────────────────────────────────────────
  // Utility Functions
  // ─────────────────────────────────────────────────────────────────────

  const formatTime = (seconds: number): string => {
    if (!isFinite(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // ─────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────

  return (
    <div
      ref={containerRef}
      className={`relative w-full bg-black aspect-video rounded-lg overflow-hidden group shadow-lg ${className}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => isPlaying && setShowControls(false)}
    >
      {/* Video Element */}
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        preload={preload}
        onPlay={handlePlay}
        onPause={handlePause}
        onTimeUpdate={handleTimeUpdate}
        onDurationChange={handleDurationChange}
        onWaiting={handleWaiting}
        onCanPlay={handleCanPlay}
      />

      {/* Loading Indicator */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-white" />
            <p className="text-sm text-white/70">Loading video...</p>
          </div>
        </div>
      )}

      {/* Buffering Indicator */}
      {isBuffering && (
        <div className="absolute bottom-4 left-4 flex items-center gap-2 px-3 py-2 bg-black/60 rounded-full">
          <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
          <span className="text-xs text-white/70">Buffering...</span>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
          <div className="flex flex-col items-center gap-3 px-6 text-center">
            <AlertCircle className="h-8 w-8 text-red-500" />
            <p className="text-sm text-white">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Play Button Overlay */}
      {!isPlaying && !isLoading && !error && (
        <button
          onClick={togglePlay}
          className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/40 transition-colors"
        >
          <div className="bg-white/20 hover:bg-white/30 rounded-full p-6 transition-colors">
            <Play className="h-12 w-12 text-white fill-white" />
          </div>
        </button>
      )}

      {/* Controls Bar */}
      <div
        className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/70 to-transparent p-4 transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {/* Quality Progression and Cache Status */}
        <div className="flex items-center justify-between mb-3 text-xs text-white/60 px-2">
          <div className="flex items-center gap-2">
            <Zap className="h-3 w-3 text-amber-400" />
            <span>{qualityProgression}</span>
          </div>
          <span>Cache: {cacheSize}</span>
        </div>

        {/* Progress Bar */}
        <input
          type="range"
          min="0"
          max={duration || 0}
          value={currentTime}
          onChange={handleSeek}
          className="w-full h-1 bg-gray-700 rounded cursor-pointer mb-3"
          style={{
            background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${
              duration ? (currentTime / duration) * 100 : 0
            }%, rgb(55, 65, 81) ${duration ? (currentTime / duration) * 100 : 0}%, rgb(55, 65, 81) 100%)`,
          }}
          title={`${formatTime(currentTime)} / ${formatTime(duration)}`}
        />

        {/* Bottom Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Play/Pause */}
            <button
              onClick={togglePlay}
              className="text-white hover:text-blue-400 transition-colors p-1"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <Pause className="h-5 w-5" />
              ) : (
                <Play className="h-5 w-5 fill-current" />
              )}
            </button>

            {/* Volume */}
            <div className="flex items-center gap-2">
              <button
                onClick={toggleMute}
                className="text-white hover:text-blue-400 transition-colors p-1"
                title={isMuted || volume === 0 ? 'Unmute' : 'Mute'}
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="h-5 w-5" />
                ) : (
                  <Volume2 className="h-5 w-5" />
                )}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-16 h-1 bg-gray-600 rounded cursor-pointer"
                title="Volume"
              />
            </div>

            {/* Time Display */}
            <span className="text-xs text-white/70 font-mono min-w-[60px]">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>

            {/* Quality Display */}
            <span className="text-xs text-white/50 font-mono">
              {currentQuality}
            </span>
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-2">
            {/* Fullscreen */}
            <button
              onClick={toggleFullscreen}
              className="text-white hover:text-blue-400 transition-colors p-1"
              title="Toggle fullscreen"
            >
              <Maximize2 className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
