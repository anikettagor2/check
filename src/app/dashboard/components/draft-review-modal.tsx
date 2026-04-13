"use client";

import { useState } from "react";
import { useAuth } from "@/lib/context/auth-context";
import { Modal } from "@/components/ui/modal";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { VideoPlayer } from "@/components/video-player";

interface DraftReviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    project: any;
    revision: any;
    onDownload?: (fileName: string) => void;
    userRole?: 'client' | 'manager' | 'editor';
}

export function DraftReviewModal({
    isOpen,
    onClose,
    project,
    revision,
    onDownload,
    userRole = 'client',
}: DraftReviewModalProps) {
    const { user } = useAuth();
    const [isDownloading, setIsDownloading] = useState(false);

    const handleDownloadClick = async () => {
        if (!revision?.videoUrl) {
            toast.error("Video URL not available");
            return;
        }

        setIsDownloading(true);
        try {
            const link = document.createElement('a');
            link.href = revision.videoUrl;
            link.download = `${project?.name}_draft_v${revision?.version}.mp4`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            toast.success("Download started!");
            setTimeout(() => onClose(), 500);
        } catch (error) {
            console.error('Download error:', error);
            toast.error("Failed to start download");
        } finally {
            setIsDownloading(false);
        }
    };

    return (
            <Modal
                isOpen={isOpen}
                onClose={onClose}
                title="Download Video"
                maxWidth="max-w-2xl"
            >
                {!revision || !project ? (
                    <div className="mt-4 py-12 text-center">
                        <div className="inline-flex items-center gap-3 text-muted-foreground mb-4">
                            <div className="h-5 w-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                            <span className="text-sm">Loading draft video...</span>
                        </div>
                    </div>
                ) : (
                    <div className="mt-4 space-y-5">
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest">
                                    Version {revision.version}
                                </p>
                                {revision.fileSize && (
                                    <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded">
                                        {(revision.fileSize / (1024 * 1024)).toFixed(1)} MB
                                    </span>
                                )}
                            </div>

                            <div className="rounded-xl overflow-hidden border border-border bg-black shadow-2xl">
                                <VideoPlayer
                                    videoPath={revision.videoUrl}
                                    playbackId={revision.playbackId}
                                    title={`Draft v${revision.version}`}
                                    className="w-full"
                                />
                            </div>
                            
                            {revision.description && (
                                <div className="p-4 rounded-lg bg-muted/30 border border-border">
                                    <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest mb-2">
                                        Notes from Editor
                                    </p>
                                    <p className="text-sm text-foreground">{revision.description}</p>
                                </div>
                            )}
                        </div>

                        {/* Download Button */}
                        <div className="flex gap-3 pt-2">
                            <button
                                onClick={onClose}
                                className="flex-1 px-6 py-3 rounded-lg border border-border bg-muted/30 text-foreground text-sm font-bold uppercase tracking-widest hover:bg-muted/50 transition-colors disabled:opacity-50"
                                disabled={isDownloading}
                            >
                                Close
                            </button>
                            <button
                                onClick={handleDownloadClick}
                                disabled={isDownloading}
                                className="flex-1 px-6 py-3 rounded-lg bg-primary text-primary-foreground text-sm font-bold uppercase tracking-widest hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 shadow-md"
                            >
                                <Download className="h-4 w-4" />
                                {isDownloading ? "Downloading..." : "Download"}
                            </button>
                        </div>
                    </div>
                )}
            </Modal>
    );
}
