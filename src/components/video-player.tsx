"use client";

import React, { useState, useRef, useEffect } from "react";
import { Play, Loader2, AlertCircle, Pause, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";
import MuxPlayer from "@mux/mux-player-react";

interface VideoPlayerProps {
  videoPath?: string; // The URL or path to the video
  thumbnailUrl?: string;
  title?: string;
  className?: string;
  playbackId?: string;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  onPlaying?: () => void;
  onPause?: () => void;
  onError?: (error: Error) => void;
  metadata?: any;
  primaryColor?: string;
  playbackRates?: number[];
  forwardSeekOffset?: number;
  backwardSeekOffset?: number;
  onLoadedMetadata?: (duration: number) => void;
  watermark?: string; // Client/project name to display as watermark
}

function extractMuxPlaybackId(videoPath?: string): string | undefined {
  if (!videoPath) return undefined;
  const match = videoPath.match(/https?:\/\/stream\.mux\.com\/([^./?]+)(?:\.[^/?]+)?/i);
  return match?.[1];
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
  metadata,
  primaryColor = "#ffffff",
  playbackRates = [0.5, 0.75, 1, 1.25, 1.5, 2],
  forwardSeekOffset = 10,
  backwardSeekOffset = 10,
  onLoadedMetadata,
  watermark,
}: VideoPlayerProps) {
  const [error, setError] = useState<string | null>(null);
  const resolvedPlaybackId = playbackId || extractMuxPlaybackId(videoPath);
  
  // Determine if we're in a processing state
  const isProcessing = videoPath?.startsWith('mux://');
  
  // Handle regular source if no playbackId
  const effectiveSrc = !resolvedPlaybackId && videoPath && !isProcessing ? videoPath : undefined;

  return (
    <div className={cn("group relative w-full aspect-video bg-black rounded-lg overflow-hidden flex items-center justify-center", className)}>
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

      {/* Using MuxPlayer for all sources for consistent UI */}
      {!isProcessing && (
        <MuxPlayer
          playbackId={resolvedPlaybackId}
          src={effectiveSrc || (videoPath?.startsWith('blob:') ? videoPath : undefined)}
          metadata={{ 
            video_title: title, 
            ...metadata 
          }}
          poster={thumbnailUrl}
          streamType="on-demand"
          style={{ width: '100%', height: '100%', aspectRatio: "16/9" }}
          autoPlay={false}
          playsInline
          minResolution="480p"
          onPlay={onPlaying}
          onPause={onPause}
          onTimeUpdate={(e) => {
            const video = e.target as HTMLVideoElement;
            if (video) {
              onTimeUpdate?.(video.currentTime, video.duration);
            }
          }}
          onLoadedMetadata={(e) => {
            const video = e.target as HTMLVideoElement;
            if (video) {
              onLoadedMetadata?.(video.duration);
            }
          }}
          onError={(e) => {
             console.error("VideoPlayer Error:", e);
             setError("Failed to load video");
             onError?.(new Error("Video playback error"));
          }}
          primaryColor={primaryColor}
          accentColor={primaryColor}
          playbackRates={playbackRates}
          forwardSeekOffset={forwardSeekOffset}
          backwardSeekOffset={backwardSeekOffset}
          className="w-full h-full"
        />
      )}

      {/* Simple Error Overlay if MuxPlayer fails fatally */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-900 z-40">
          <AlertCircle className="w-10 h-10 text-red-500 mb-2" />
          <p className="text-white text-sm font-medium">{error}</p>
          <button 
            onClick={() => setError(null)}
            className="mt-4 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-md text-white text-xs transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Watermark Overlay - Center (Visible in fullscreen) */}
      {watermark && !isProcessing && (
        <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none" style={{position: 'fixed'}}>
          <div className="text-center space-y-2">
            <span className="text-3xl font-bold text-white/60 uppercase tracking-widest drop-shadow-lg">
              Client Preview
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
