"use client";

import React, { useState } from "react";
import { 
  FileText, 
  FileImage, 
  FileVideo, 
  FileAudio, 
  File,
  Download,
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
  onDownload: (url: string, name: string) => void;
}

export function FilePreview({ file, index, onDownload }: FilePreviewProps) {
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
      case 'image': return <FileImage className="h-5 w-5" />;
      case 'video': return <FileVideo className="h-5 w-5" />;
      case 'audio': return <FileAudio className="h-5 w-5" />;
      case 'document': return <FileText className="h-5 w-5" />;
      default: return <File className="h-5 w-5" />;
    }
  };

  const fileType = getFileType(file.name);
  const ext = getFileExtension(file.name);
  const fileSizeMB = file.size ? `${(file.size / (1024 * 1024)).toFixed(2)} MB` : null;

  return (
    <>
      <div className="group rounded-lg border border-border bg-card hover:border-primary/40 transition-all overflow-hidden">
        {/* Preview Thumbnail */}
        <div className="relative h-40 w-full bg-muted flex items-center justify-center overflow-hidden">
          {fileType === 'image' && !previewError ? (
            <Image
              src={file.url}
              alt={file.name}
              fill
              className="object-cover hover:scale-105 transition-transform duration-300"
              onError={() => setPreviewError(true)}
              sizes="(max-width: 768px) 100vw, 300px"
            />
          ) : fileType === 'video' ? (
            <div className="relative w-full h-full flex items-center justify-center bg-black/30">
              <video
                src={file.url}
                className="w-full h-full object-cover"
                onError={() => setPreviewError(true)}
              />
              <button
                onClick={() => setShowPreview(true)}
                className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity"
                title="Preview video"
              >
                <Eye className="h-8 w-8 text-white" />
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-muted-foreground">
              {getFileIcon(fileType)}
              <span className="text-xs mt-2 font-medium uppercase">{ext}</span>
            </div>
          )}
        </div>

        {/* File Info */}
        <div className="p-3 bg-card border-t border-border">
          <p className="text-xs font-medium text-foreground truncate" title={file.name}>
            {file.name}
          </p>
          {fileSizeMB && (
            <p className="text-[10px] text-muted-foreground mt-1">
              {fileSizeMB}
            </p>
          )}
          
          {/* Actions */}
          <div className="flex gap-2 mt-3">
            {fileType === 'image' && (
              <button
                onClick={() => setShowPreview(true)}
                className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-semibold bg-primary/10 text-primary hover:bg-primary/20 rounded transition-colors"
                title="View image"
              >
                <Eye className="h-3.5 w-3.5" />
                View
              </button>
            )}
            <button
              onClick={() => onDownload(file.url, file.name)}
              className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-semibold bg-muted text-foreground hover:bg-primary/20 hover:text-primary rounded transition-colors"
              title="Download file"
            >
              <Download className="h-3.5 w-3.5" />
              Download
            </button>
          </div>
        </div>
      </div>

      {/* Image Preview Modal */}
      {showPreview && fileType === 'image' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setShowPreview(false)}
        >
          <div className="relative max-w-2xl max-h-[90vh] w-full h-full flex items-center justify-center p-4">
            <button
              onClick={() => setShowPreview(false)}
              className="absolute top-4 right-4 p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors z-10"
              title="Close preview"
            >
              <X className="h-5 w-5" />
            </button>
            <Image
              src={file.url}
              alt={file.name}
              width={800}
              height={600}
              className="object-contain max-w-full max-h-full"
              priority
            />
          </div>
        </div>
      )}

      {/* Video Preview Modal */}
      {showPreview && fileType === 'video' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setShowPreview(false)}
        >
          <div className="relative max-w-3xl max-h-[90vh] w-full flex items-center justify-center p-4">
            <button
              onClick={() => setShowPreview(false)}
              className="absolute top-4 right-4 p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors z-10"
              title="Close preview"
            >
              <X className="h-5 w-5" />
            </button>
            <video
              src={file.url}
              controls
              autoPlay
              className="w-full max-h-[80vh] rounded-lg"
              onError={() => setPreviewError(true)}
            />
          </div>
        </div>
      )}
    </>
  );
}
