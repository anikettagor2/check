"use client";

import React, { useState } from "react";
import { 
  FileText, 
  FileImage, 
  FileVideo, 
  FileAudio, 
  File,
  Eye,
  X
} from "lucide-react";
import Image from "next/image";

interface FilePreviewProps {
  file: {
    url: string;
    name: string;
    size?: number;
  };
  index: number;
  onDownload?: (url: string, name: string) => void;
}

export function FilePreview({ file, index }: FilePreviewProps) {
  const [showPreview, setShowPreview] = useState(false);
  const [previewError, setPreviewError] = useState(false);

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

  const fileType = getFileType(file.name);
  const ext = getFileExtension(file.name);
  const fileSizeMB = file.size ? `${(file.size / (1024 * 1024)).toFixed(2)} MB` : null;

  return (
    <>
      <div className="group relative rounded-xl border border-border/50 bg-card overflow-hidden hover:border-primary/50 hover:shadow-lg transition-all duration-300">
        {/* Preview Thumbnail Container */}
        <div className="relative h-44 w-full bg-gradient-to-br from-muted/50 to-muted/20 flex items-center justify-center overflow-hidden">
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
              <video
                src={file.url}
                className="w-full h-full object-cover"
                onError={() => setPreviewError(true)}
              />
              <button
                onClick={() => setShowPreview(true)}
                className="absolute flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                title="Preview video"
              >
                <div className="h-12 w-12 rounded-full bg-primary/90 flex items-center justify-center shadow-lg hover:bg-primary">
                  <FileVideo className="h-6 w-6 text-white" />
                </div>
              </button>
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
          {fileSizeMB && (
            <p className="text-[11px] text-muted-foreground mt-1.5 font-medium">
              {fileSizeMB}
            </p>
          )}
          
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
                className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2 text-xs font-bold text-foreground bg-muted/60 hover:bg-primary/20 hover:text-primary rounded-lg transition-all duration-200 active:scale-95"
                title="Play video"
              >
                <Eye className="h-3.5 w-3.5" />
                Preview
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

      {/* Video Preview Modal */}
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
            <video
              src={file.url}
              controls
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
