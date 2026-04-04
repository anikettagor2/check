"use client";

import { OptimizedHLSPlayer } from "@/components/optimized-hls-player";
import { OptimizedVideoPlayer } from "@/components/optimized-video-player";
import { useVideoPreload } from "@/lib/streaming/video-preload";

interface OptimizedHLSPlayerViewProps {
  hlsUrl?: string;
  videoUrl?: string;
  projectName: string;
  fileSize?: number;
  onTimeUpdate: (currentTime: number, duration: number) => void;
  onError?: (error: Error) => void;
}

export function OptimizedHLSPlayerView({
  hlsUrl,
  videoUrl,
  projectName,
  fileSize,
  onTimeUpdate,
  onError,
}: OptimizedHLSPlayerViewProps) {
  const isLargeVideo = fileSize && fileSize > 50 * 1024 * 1024;
  const shouldUseStreaming = !hlsUrl && videoUrl && isLargeVideo;
  const { isPreloading } = useVideoPreload(hlsUrl || videoUrl || "", true);

  if (shouldUseStreaming && videoUrl) {
    const firebasePath = videoUrl.includes("firebasestorage.googleapis.com")
      ? videoUrl.split("/o/")[1]?.split("?")[0]
      : videoUrl;

    if (firebasePath) {
      return (
        <OptimizedVideoPlayer
          videoPath={decodeURIComponent(firebasePath)}
          title={projectName}
          onTimeUpdate={onTimeUpdate}
          className="w-full h-full"
          onError={onError}
        />
      );
    }
  }

  return (
    <OptimizedHLSPlayer
      hlsUrl={hlsUrl || undefined}
      videoUrl={videoUrl}
      projectName={projectName}
      fileSize={fileSize}
      autoPlay={false}
      speedFirst={true} // Prioritize speed above all else
      preload="auto" // More aggressive preloading
      onTimeUpdate={onTimeUpdate}
      onError={onError}
      className="w-full h-full"
    />
  );
}
