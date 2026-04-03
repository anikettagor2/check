"use client";

import React, { useEffect, useState } from "react";
import {
  FileText,
  FileImage,
  FileVideo,
  FileAudio,
  File,
  Eye,
  X,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Cog,
} from "lucide-react";
import Image from "next/image";
import { warmVideoInMemory } from "@/lib/video-preload";
import { useIntersectionObserver } from "@/hooks/use-intersection-observer";
import { useVideoTranscodeStatus, TranscodeStatus } from "@/hooks/use-video-transcode-status";
import Hls from "hls.js";

interface FilePreviewProps {
  file: {
    url: string;
    name: string;
    size?: number;
    storagePath?: string;
    hlsUrl?: string; // Add HLS URL support
  };
  index: number;
  onDownload?: (url: string, name: string) => void;
}

export function FilePreview({ file, index }: FilePreviewProps) {
  const [showPreview, setShowPreview] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const hlsRef = React.useRef<Hls | null>(null);

  // Monitor transcoding status for .mov files
  const transcodeState = useVideoTranscodeStatus(file.storagePath, file.name);

  // Determine the best URL to use for video playback
  const effectiveVideoUrl = transcodeState.status === "ready" && transcodeState.videoUrl
    ? transcodeState.videoUrl
    : file.url;

  // Whether this file is a .mov that's currently being transcoded
  const isTranscoding = transcodeState.status === "processing" || transcodeState.status === "pending";
  const hasTranscodeError = transcodeState.status === "error";
  const isTranscodeReady = transcodeState.status === "ready";

  // Intersection observer for lazy loading
  const { ref: observerRef, isIntersecting } = useIntersectionObserver({
    threshold: 0.1,
    rootMargin: "50px",
  });

  // Extract file type from name or URL
  const getFileExtension = (filename: string): string => {
    return filename.split('.').pop()?.toLowerCase() || '';
  };

  const getFileType = (filename: string): string => {
    const ext = getFileExtension(filename);
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'];
    const videoExts = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'flv'];
    const audioExts = ['mp3', 'wav', 'aac', 'flac', 'm4a'];
    const docExts = ['pdf', 'doc', 'docx', 'txt', 'xls', 'xlsx', 'ppt', 'pptx'];

    if (imageExts.includes(ext)) return 'image';
    if (videoExts.includes(ext)) return 'video';
    if (audioExts.includes(ext)) return 'audio';
    if (docExts.includes(ext)) return 'document';
    return 'file';
  };

  const getFileIcon = (fileType: string) => {
    switch (fileType) {
      case 'image': return <FileImage className="h-6 w-6" />;
      case 'video': return <FileVideo className="h-6 w-6" />;
      case 'audio': return <FileAudio className="h-6 w-6" />;
      case 'document': return <FileText className="h-6 w-6" />;
      default: return <File className="h-6 w-6" />;
    }
  };

  // Initialize HLS streaming for videos
  useEffect(() => {
    if (getFileType(file.name) === 'video' && file.hlsUrl && videoRef.current && isIntersecting) {
      const video = videoRef.current;

      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          backBufferLength: 90,
        });

        hlsRef.current = hls;
        hls.loadSource(file.hlsUrl);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          setIsVideoLoaded(true);
          // Warm up video in memory for instant playback
          warmVideoInMemory(file.hlsUrl!);
        });

        hls.on(Hls.Events.ERROR, (event, data) => {
          console.error('HLS Error:', data);
          setPreviewError(true);
        });

        return () => {
          hls.destroy();
        };
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Native HLS support (Safari)
        video.src = file.hlsUrl!;
        setIsVideoLoaded(true);
      }
    }
  }, [file.hlsUrl, file.name, isIntersecting]);

  // Cleanup HLS on unmount
  useEffect(() => {
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }
    };
  }, []);

  const fileType = getFileType(file.name);
  const ext = getFileExtension(file.name);
  const fileSizeMB = file.size ? `${(file.size / (1024 * 1024)).toFixed(2)} MB` : null;

  // Transcode status badge component
  const TranscodeBadge = () => {
    if (!file.name.toLowerCase().endsWith('.mov') || transcodeState.status === null) return null;

    if (isTranscoding) {
      return (
        <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/90 text-white text-[10px] font-bold uppercase tracking-wider shadow-lg backdrop-blur-sm animate-pulse">
          <Cog className="h-3 w-3 animate-spin" />
          Optimizing...
        </div>
      );
    }

    if (isTranscodeReady) {
      return (
        <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/90 text-white text-[10px] font-bold uppercase tracking-wider shadow-lg backdrop-blur-sm">
          <CheckCircle2 className="h-3 w-3" />
          Optimized MP4
        </div>
      );
    }

    if (hasTranscodeError) {
      return (
        <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/90 text-white text-[10px] font-bold uppercase tracking-wider shadow-lg backdrop-blur-sm">
          <AlertCircle className="h-3 w-3" />
          Error
        </div>
      );
    }

    return null;
  };

  return (
    <>
      <div ref={observerRef as any} className="group relative rounded-xl border border-border/50 bg-card overflow-hidden hover:border-primary/50 hover:shadow-lg transition-all duration-300">
        {/* Preview Thumbnail Container */}
        <div className="relative h-44 w-full bg-gradient-to-br from-muted/50 to-muted/20 flex items-center justify-center overflow-hidden">
          {/* Transcode Status Badge */}
          <TranscodeBadge />

          {fileType === 'image' && !previewError ? (
            <>
              <Image
                src={file.url}
                alt={file.name}
                fill
                className="object-cover group-hover:scale-110 transition-transform duration-300"
                onError={() => setPreviewError(true)}
                sizes="(max-width: 768px) 100vw, 300px"
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-300" />
              <button
                onClick={() => setShowPreview(true)}
                className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                title="Preview image"
              >
                <div className="h-10 w-10 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
                  <Eye className="h-5 w-5 text-primary" />
                </div>
              </button>
            </>
          ) : fileType === 'video' ? (
            <div className="relative w-full h-full flex items-center justify-center bg-gradient-to-br from-black/20 to-black/40">
              {/* Show processing overlay for transcoding videos */}
              {isTranscoding ? (
                <div className="flex flex-col items-center justify-center gap-3 text-white/80">
                  <div className="relative">
                    <div className="h-16 w-16 rounded-full border-2 border-amber-500/30 flex items-center justify-center">
                      <Loader2 className="h-8 w-8 animate-spin text-amber-400" />
                    </div>
                    <div className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-amber-500 flex items-center justify-center">
                      <Cog className="h-3.5 w-3.5 text-white animate-spin" style={{ animationDirection: 'reverse', animationDuration: '3s' }} />
                    </div>
                  </div>
                  <div className="text-center">
                    <p className="text-xs font-bold text-amber-400">Converting to MP4</p>
                    <p className="text-[10px] text-white/50 mt-0.5">Optimizing for web playback...</p>
                  </div>
                </div>
              ) : (
                <>
                  <video
                    ref={videoRef}
                    poster={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
                      <svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180">
                        <rect width="320" height="180" fill="#1a1a1a"/>
                        <circle cx="160" cy="90" r="25" fill="rgba(255,255,255,0.1)"/>
                        <polygon points="145,75 145,105 175,90" fill="rgba(255,255,255,0.8)"/>
                      </svg>
                    `)}`}
                    preload="metadata"
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                    onError={() => setPreviewError(true)}
                  />
                  <button
                    onClick={() => setShowPreview(true)}
                    className="absolute flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                    title="Play video"
                  >
                    <div className="h-12 w-12 rounded-full bg-primary/90 flex items-center justify-center shadow-lg hover:bg-primary">
                      <FileVideo className="h-6 w-6 text-white" />
                    </div>
                  </button>
                </>
              )}

              {/* Quality indicator */}
              {isVideoLoaded && (
                <div className="absolute top-2 right-2 bg-black/50 text-white text-xs px-2 py-1 rounded">
                  HD
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-muted-foreground gap-2">
              <div className="p-3 rounded-lg bg-muted/50">
                {getFileIcon(fileType)}
              </div>
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{ext}</span>
            </div>
          )}
        </div>

        {/* File Info Section */}
        <div className="p-3.5 bg-card border-t border-border/30">
          <p className="text-xs font-semibold text-foreground truncate line-clamp-2" title={file.name}>
            {file.name}
          </p>
          <div className="flex items-center gap-2 mt-1.5">
            {fileSizeMB && (
              <p className="text-[11px] text-muted-foreground font-medium">
                {fileSizeMB}
              </p>
            )}
            {/* Inline transcode status text */}
            {isTranscoding && (
              <span className="text-[10px] font-bold text-amber-500 flex items-center gap-1">
                <Loader2 className="h-2.5 w-2.5 animate-spin" />
                Processing
              </span>
            )}
            {isTranscodeReady && (
              <span className="text-[10px] font-bold text-emerald-500 flex items-center gap-1">
                <CheckCircle2 className="h-2.5 w-2.5" />
                Ready
              </span>
            )}
            {hasTranscodeError && (
              <span className="text-[10px] font-bold text-red-500 flex items-center gap-1">
                <AlertCircle className="h-2.5 w-2.5" />
                Failed
              </span>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 mt-3">
            {fileType === 'image' && (
              <button
                onClick={() => setShowPreview(true)}
                className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2 text-xs font-bold text-foreground bg-muted/60 hover:bg-primary/20 hover:text-primary rounded-lg transition-all duration-200 active:scale-95"
                title="View image"
              >
                <Eye className="h-3.5 w-3.5" />
                View
              </button>
            )}
            {fileType === 'video' && (
              <button
                onClick={() => setShowPreview(true)}
                disabled={isTranscoding}
                className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2 text-xs font-bold text-foreground bg-muted/60 hover:bg-primary/20 hover:text-primary rounded-lg transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                title={isTranscoding ? "Video is being optimized..." : "Play video"}
              >
                {isTranscoding ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Optimizing...
                  </>
                ) : (
                  <>
                    <Eye className="h-3.5 w-3.5" />
                    Preview
                  </>
                )}
              </button>
            )}
            {(fileType !== 'image' && fileType !== 'video') && (
              <button
                onClick={() => setShowPreview(true)}
                className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2 text-xs font-bold text-foreground bg-muted/60 hover:bg-primary/20 hover:text-primary rounded-lg transition-all duration-200 active:scale-95"
                title="View file"
              >
                <Eye className="h-3.5 w-3.5" />
                View
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Image Preview Modal */}
      {showPreview && fileType === 'image' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4"
          onClick={() => setShowPreview(false)}
        >
          <div className="relative max-w-3xl max-h-[90vh] w-full flex items-center justify-center">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowPreview(false);
              }}
              className="absolute -top-10 right-0 p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors z-10"
              title="Close preview"
            >
              <X className="h-6 w-6" />
            </button>
            <Image
              src={file.url}
              alt={file.name}
              width={1200}
              height={800}
              className="object-contain max-w-full max-h-full rounded-lg shadow-2xl"
              priority
            />
          </div>
        </div>
      )}

      {/* Video Preview Modal - Uses transcoded URL when ready */}
      {showPreview && fileType === 'video' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4"
          onClick={() => setShowPreview(false)}
        >
          <div className="relative max-w-4xl max-h-[90vh] w-full flex items-center justify-center">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowPreview(false);
              }}
              className="absolute -top-10 right-0 p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors z-10"
              title="Close preview"
            >
              <X className="h-6 w-6" />
            </button>

            {/* Show optimized badge in the preview modal */}
            {isTranscodeReady && (
              <div className="absolute top-2 left-2 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/90 text-white text-xs font-bold shadow-lg backdrop-blur-sm">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Playing Optimized MP4
              </div>
            )}

            <video
              src={effectiveVideoUrl}
              controls
              preload="auto"
              playsInline
              autoPlay
              className="w-full max-h-[80vh] rounded-lg shadow-2xl"
              onError={() => setPreviewError(true)}
            />
          </div>
        </div>
      )}
    </>
  );
}
