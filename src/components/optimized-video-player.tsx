'use client';

import { useState, useRef, useEffect } from 'react';
import { useVideoManager } from '@/components/video-manager';
import { Play, Pause, Volume2, VolumeX, Loader2, AlertCircle } from 'lucide-react';

interface OptimizedVideoPlayerProps {
  videoPath: string; // Firebase Storage path
  thumbnailUrl?: string;
  title?: string;
  className?: string;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  onPlaying?: () => void;
  onPause?: () => void;
  onError?: (error: Error) => void;
}

export function OptimizedVideoPlayer({
  videoPath,
  thumbnailUrl,
  title,
  className = '',
  onTimeUpdate,
  onPlaying,
  onPause,
  onError,
}: OptimizedVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const observerRef = useRef<HTMLDivElement>(null);
  const { register, unregister, pauseAndUnloadAllExcept } = useVideoManager?.() || {};
  const [isIntersecting, setIsIntersecting] = useState(false);
  // Quality selection (prefer 360p for review)
  function selectQualityUrl(path: string): string {
    const connection = (navigator as any).connection;
    if (connection?.downlink && path.includes('/720p/')) {
      return path.replace('/720p/', '/360p/');
    }
    return path;
  }
  const streamUrl = selectQualityUrl(videoPath);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isBuffering, setIsBuffering] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  // (removed duplicate streamUrl declaration)
  const handlePlay = async () => {
    if (!hasStarted) {
      setIsLoading(true);
      setHasStarted(true);
    }
    if (pauseAndUnloadAllExcept && videoRef.current) {
      pauseAndUnloadAllExcept(videoRef.current);
    }
    try {
      await videoRef.current?.play();
      setIsPlaying(true);
      onPlaying?.();
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        setIsLoading(false);
        return;
      }
      console.error('Play failed:', err?.message || err);
      setError('Failed to play video');
      onError?.(err as Error);
    } finally {
      setIsLoading(false);
    }
  };
  // Intersection Observer for lazy loading/unloading
  useEffect(() => {
    const node = observerRef.current;
    if (!node) return;
    const observer = new window.IntersectionObserver(([entry]) => {
      setIsIntersecting(entry.isIntersecting);
      if (!entry.isIntersecting && videoRef.current) {
        videoRef.current.pause();
        videoRef.current.removeAttribute('src');
        videoRef.current.preload = 'none';
        videoRef.current.load();
      }
    }, { threshold: 0.25 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Register/unregister with VideoManager
  useEffect(() => {
    if (register && unregister && videoRef.current) {
      register(videoRef.current);
      return () => unregister(videoRef.current!);
    }
  }, [register, unregister]);

  // Lazy load video src
  useEffect(() => {
    if (videoRef.current) {
      if (isIntersecting) {
        videoRef.current.src = streamUrl;
        videoRef.current.preload = 'metadata';
      } else {
        videoRef.current.removeAttribute('src');
        videoRef.current.preload = 'none';
        videoRef.current.load();
      }
    }
  }, [isIntersecting, streamUrl]);

  const handlePause = () => {
    videoRef.current?.pause();
    setIsPlaying(false);
    onPause?.();
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const current = videoRef.current.currentTime;
      const total = videoRef.current.duration;
      setCurrentTime(current);
      setDuration(total);
      onTimeUpdate?.(current, total);
    }
  };

  const handleWaiting = () => {
    setIsBuffering(true);
  };

  const handleCanPlay = () => {
    setIsBuffering(false);
    setIsLoading(false);
  };

  const handleError = (e: any) => {
    console.error('Video error:', e);
    setError('Video failed to load');
    setIsLoading(false);
    onError?.(new Error('Video failed to load'));
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div
      ref={observerRef}
      className={`relative w-full aspect-video bg-black rounded-lg overflow-hidden ${className}`}
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(false)}
    >
      {/* Thumbnail / Poster */}
      {!hasStarted && thumbnailUrl && (
        <div className="absolute inset-0 bg-black">
          <img
            src={thumbnailUrl}
            alt={title || 'Video thumbnail'}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
            <button
              onClick={handlePlay}
              className="w-16 h-16 bg-white/90 rounded-full flex items-center justify-center hover:bg-white transition-colors"
            >
              <Play className="w-8 h-8 text-black ml-1" />
            </button>
          </div>
        </div>
      )}

      {/* Video Element */}
      <video
        ref={videoRef}
        poster={thumbnailUrl}
        preload="none"
        className="w-full h-full"
        onTimeUpdate={handleTimeUpdate}
        onWaiting={handleWaiting}
        onCanPlay={handleCanPlay}
        onError={handleError}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
      />

      {/* Loading Spinner */}
      {isLoading && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-white animate-spin" />
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center">
          <div className="text-center text-white">
            <AlertCircle className="w-12 h-12 mx-auto mb-2" />
            <p>{error}</p>
          </div>
        </div>
      )}

      {/* Controls */}
      {showControls && hasStarted && (
        <div className="absolute bottom-0 left-0 right-0 bg-linear-to-t from-black/80 to-transparent p-4">
          <div className="flex items-center space-x-2">
            <button
              onClick={isPlaying ? handlePause : handlePlay}
              className="text-white hover:text-gray-300"
            >
              {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
            </button>

            <div className="flex-1 text-white text-sm">
              {formatTime(currentTime)} / {formatTime(duration)}
            </div>

            <button
              onClick={() => {
                if (videoRef.current) {
                  videoRef.current.muted = !videoRef.current.muted;
                  setIsMuted(videoRef.current.muted);
                }
              }}
              className="text-white hover:text-gray-300"
            >
              {isMuted ? <VolumeX className="w-6 h-6" /> : <Volume2 className="w-6 h-6" />}
            </button>
          </div>

          {/* Progress Bar */}
          <div className="mt-2">
            <div className="w-full bg-gray-600 rounded-full h-1">
              <div
                className="bg-white h-1 rounded-full"
                style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Buffering Indicator */}
      {isBuffering && (
        <div className="absolute top-4 right-4">
          <Loader2 className="w-6 h-6 text-white animate-spin" />
        </div>
      )}
    </div>
  );
}