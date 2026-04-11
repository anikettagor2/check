"use client";

import Hls from "hls.js";
import React, { useState, useRef, useEffect } from "react";
import { Play, Loader2, AlertCircle, Pause, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";
import MuxPlayer from "@mux/mux-player-react";

interface VideoPlayerProps {
  videoPath: string; // The URL or path to the video
  thumbnailUrl?: string;
  title?: string;
  className?: string;
  playbackId?: string;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  onPlaying?: () => void;
  onPause?: () => void;
  onError?: (error: Error) => void;
}

export function VideoPlayer({
  videoPath,
  thumbnailUrl,
  title,
  className,
  onTimeUpdate,
  onPlaying,
  onPause,
  onError,
  playbackId,
}: VideoPlayerProps) {
  if (playbackId) {
    return (
      <div className={cn("w-full aspect-video rounded-lg overflow-hidden bg-black", className)}>
        <MuxPlayer
          playbackId={playbackId}
          metadata={{ video_title: title }}
          poster={thumbnailUrl}
          streamType="on-demand"
          style={{ width: '100%', height: '100%' }}
          onPlay={onPlaying}
          onPause={onPause}
        />
      </div>
    );
  }

  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [showControls, setShowControls] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  // Determine initial stream URL
  const isProcessing = videoPath?.startsWith('mux://');
  const streamUrl = isProcessing ? "" : (playbackId ? `https://stream.mux.com/${playbackId}.m3u8` : videoPath);

  // Initialize HLS or direct src
  useEffect(() => {
    if (!videoRef.current || !streamUrl) return;

    // Clean up previous HLS instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const isHls = streamUrl.includes(".m3u8") || streamUrl.includes("stream.mux.com");

    if (isHls && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
      });
      hls.loadSource(streamUrl);
      hls.attachMedia(videoRef.current);
      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          console.error("Fatal HLS error:", data);
          setError("Failed to load HLS stream");
        }
      });
      hlsRef.current = hls;
    } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl') && isHls) {
      // Native HLS support (Safari)
      videoRef.current.src = streamUrl;
    } else {
      // Direct file (MP4/WebM)
      videoRef.current.src = streamUrl;
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [streamUrl]);

  const handlePlayClick = async () => {
    if (!hasStarted) {
      setHasStarted(true);
      setIsLoading(true);
    }
    
    try {
      if (videoRef.current) {
        await videoRef.current.play();
        setIsPlaying(true);
        onPlaying?.();
      }
    } catch (err: any) {
      // Suppress AbortError - expected when play is interrupted by pause()
      if (err?.name === 'AbortError') {
        setIsLoading(false);
        return;
      }
      
      console.error("Video play error:", err?.message || err);
      setError("Failed to play video");
      onError?.(err as Error);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePause = () => {
    if (videoRef.current) {
      videoRef.current.pause();
      setIsPlaying(false);
      onPause?.();
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const current = videoRef.current.currentTime;
      const total = videoRef.current.duration;
      setCurrentTime(current);
      if (total && !isNaN(total)) setDuration(total);
      if (total && !isNaN(total)) onTimeUpdate?.(current, total);
    }
  };

  const formatTime = (time: number) => {
    if (isNaN(time)) return "0:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setIsMuted(videoRef.current.muted);
    }
  };

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle events if we're hovered or focused inside
      if (!showControls) return;
      
      switch(e.key) {
        case " ":
        case "k":
          e.preventDefault();
          isPlaying ? handlePause() : handlePlayClick();
          break;
        case "m":
          e.preventDefault();
          toggleMute();
          break;
        case "ArrowRight":
          if (videoRef.current) videoRef.current.currentTime += 5;
          break;
        case "ArrowLeft":
          if (videoRef.current) videoRef.current.currentTime -= 5;
          break;
      }
    };
    
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPlaying, showControls]);

  return (
    <div 
      className={cn("group relative w-full aspect-video bg-black rounded-lg overflow-hidden flex items-center justify-center", className)}
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(false)}
    >
      {/* Processing State */}
      {isProcessing && (
        <div className="absolute inset-0 z-50 bg-zinc-900 flex flex-col items-center justify-center gap-4 text-center p-6">
          <div className="relative">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <div className="absolute inset-0 blur-xl bg-primary/20 animate-pulse" />
          </div>
          <div className="space-y-1">
            <p className="font-bold text-sm text-foreground">Video Processing</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-black">Mux is preparing your stream</p>
          </div>
        </div>
      )}

      {/* Thumbnail State (Lazy Load) */}
      {!hasStarted && (
        <div 
          className="absolute inset-0 cursor-pointer flex items-center justify-center group-hover:bg-black/20 transition-all z-10"
          onClick={handlePlayClick}
        >
          {thumbnailUrl && (
            <img 
              src={thumbnailUrl} 
              alt={title || "Video thumbnail"} 
              className="absolute inset-0 w-full h-full object-cover opacity-80"
              loading="lazy"
            />
          )}
          <div className="absolute inset-0 bg-black/40" />
          
          <button className="relative z-10 w-20 h-20 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center transform group-hover:scale-110 group-hover:bg-white/30 transition-all border border-white/20">
            <Play className="w-10 h-10 text-white ml-2 text-opacity-90" fill="currentColor" />
          </button>
        </div>
      )}

      {/* Actual Video Element */}
      <div className={hasStarted ? "w-full h-full" : "w-0 h-0 opacity-0 overflow-hidden"}>
        <video
          ref={videoRef}
          preload="metadata"
          className="w-full h-full object-contain"
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={() => setIsLoading(false)}
          onWaiting={() => setIsBuffering(true)}
          onCanPlay={() => {
            setIsBuffering(false);
            setIsLoading(false);
          }}
          onPlaying={() => {
             setIsBuffering(false);
             setIsPlaying(true);
          }}
          onPause={() => setIsPlaying(false)}
          onError={(e) => {
            console.error("Video error:", e);
            setError("Failed to load video stream");
            setIsLoading(false);
          }}
          onClick={isPlaying ? handlePause : handlePlayClick}
        />
      </div>

      {/* Loading & Buffering State */}
      {(isLoading || isBuffering) && hasStarted && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 pointer-events-none z-10 backdrop-blur-sm">
          <Loader2 className="w-12 h-12 text-white/80 animate-spin" />
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-900 border border-red-900/50 z-20">
          <AlertCircle className="w-12 h-12 text-red-500 mb-3" />
          <p className="text-white text-sm font-medium">{error}</p>
          <button 
            onClick={() => { setError(null); handlePlayClick(); }}
            className="mt-4 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-md text-white text-sm font-medium transition-colors"
          >
            Try Again
          </button>
        </div>
      )}

      {/* Custom Controls UI */}
      {showControls && hasStarted && !error && (
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-4 pt-16 z-20 transition-opacity duration-300">
          
          {/* Progress Bar (Interactive) */}
          <div 
            className="absolute top-0 left-0 right-0 h-1.5 bg-white/20 cursor-pointer group/progress mx-4 rounded-full overflow-hidden"
            onClick={(e) => {
              if (!videoRef.current || !duration) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const pos = (e.clientX - rect.left) / rect.width;
              videoRef.current.currentTime = pos * duration;
            }}
          >
            <div 
              className="h-full bg-blue-500 relative group-hover/progress:bg-blue-400"
              style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}
            >
               <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full scale-0 group-hover/progress:scale-100 transition-transform shadow-lg" />
            </div>
          </div>

          <div className="flex items-center justify-between mt-3 text-white">
            <div className="flex items-center space-x-4">
              <button 
                onClick={isPlaying ? handlePause : handlePlayClick}
                className="hover:text-blue-400 transition-colors focus:outline-none"
              >
                {isPlaying ? <Pause className="w-6 h-6" fill="currentColor" /> : <Play className="w-6 h-6" fill="currentColor" />}
              </button>
              
              <button 
                onClick={toggleMute}
                className="hover:text-blue-400 transition-colors focus:outline-none"
              >
                {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </button>

              <div className="text-xs font-medium tracking-wide text-white/80 select-none">
                {formatTime(currentTime)} <span className="text-white/40 mx-1">/</span> {formatTime(duration)}
              </div>
            </div>

            {title && (
              <div className="text-sm font-medium text-white/80 truncate max-w-[200px] select-none">
                {title}
              </div>
            )}
            
            {/* Fullscreen Button Placeholder if needed */}
            <button 
               onClick={() => {
                 if (videoRef.current) {
                   if (videoRef.current.requestFullscreen) {
                     videoRef.current.requestFullscreen();
                   }
                 }
               }}
               className="text-white/80 hover:text-white text-xs font-semibold px-2 py-1 rounded bg-white/10 hover:bg-white/20 transition"
            >
              Fullscreen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
