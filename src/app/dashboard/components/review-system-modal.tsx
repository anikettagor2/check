"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { db } from "@/lib/firebase/config";
import { useAuth } from "@/lib/context/auth-context";
import { addDoc, collection, doc, getDocs, onSnapshot, query, updateDoc, where, deleteDoc, limit } from "firebase/firestore";
import { Loader2, MessageSquare, Upload, Share2, Copy, Download, Star, X, Send, Image as ImageIcon, Clock, Users, Play } from "lucide-react";
import { toast } from "sonner";
import { registerDownload, submitEditorRating } from "@/app/actions/project-actions";
import { handleNewComment } from "@/app/actions/notification-actions";
import { PaymentButton } from "@/components/payment-button";
import { uploadCommentImage } from "@/lib/firebase/storage-utils";
import { DashboardVideo } from "@/components/dashboard-video-optimizer";
import { warmVideoInMemory } from "@/lib/video-preload";
import { VideoPlayer } from "@/components/video-player";
import { safeJsonParse } from "@/lib/utils";


type ReviewProject = {
    id: string;
    name?: string;
    clientName?: string;
    totalCost?: number;
    amountPaid?: number;
    paymentStatus?: string;
    editorRating?: number;
    editorReview?: string;
    ownerId?: string;
    clientId?: string;
    assignedEditorId?: string;
    assignedPMId?: string;
};

type RevisionDoc = {
    id: string;
    projectId: string;
    version?: number;
    videoUrl?: string; // Legacy
    playbackId?: string; // New: Mux Playback ID
    hlsUrl?: string;
    fileSize?: number;
    description?: string;
    createdAt?: number;
};

type ReplyDoc = {
    id: string;
    userId: string;
    userName?: string;
    userRole?: string;
    content: string;
    imageUrl?: string;
    createdAt: number;
};

type CommentDoc = {
    id: string;
    projectId: string;
    revisionId: string;
    timestamp: number;
    content: string;
    imageUrl?: string;
    userName?: string;
    userRole?: string;
    userId: string;
    createdAt?: number;
    replies?: ReplyDoc[];
    isDirectConnection?: boolean;
};

type PendingComment = {
    id: string;
    content: string;
    timestamp: number;
    isDirectConnection: boolean;
    imageFile?: File;
    imagePreview?: string;
};

interface ReviewSystemModalProps {
    isOpen: boolean;
    onClose: () => void;
    project: ReviewProject | null;
    allowUploadDraft?: boolean;
    guestPreview?: boolean;
    guestName?: string;
    defaultRevisionId?: string;
}

function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
}

function formatDate(timestamp: number): string {
    const date = new Date(timestamp);
    const today = new Date();
    const isToday = date.toDateString() === today.toDateString();
    
    if (isToday) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}


import { VideoManagerProvider } from "@/components/video-manager";

export function ReviewSystemModal({ isOpen, onClose, project, allowUploadDraft = false, guestPreview = false, guestName, defaultRevisionId }: ReviewSystemModalProps) {
    const { user } = useAuth();
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const videoSeekRef = useRef<HTMLVideoElement>(null);
    const isClient = user?.role === "client";
    const isAdmin = user?.role === "admin";
    const isStaff = ["manager", "sales_executive", "project_manager"].includes(user?.role || "") || isAdmin;
    const isEditor = user?.role === "editor";

    // Tab state
    const [activeTab, setActiveTab] = useState<'timeline' | 'direct'>('timeline');

    // Revision state
    const [loadingRevisions, setLoadingRevisions] = useState(false);
    const [revisions, setRevisions] = useState<RevisionDoc[]>([]);
    const [selectedRevisionId, setSelectedRevisionId] = useState<string>("");

    // Comment state
    const [comments, setComments] = useState<CommentDoc[]>([]);
    const [directConnections, setDirectConnections] = useState<CommentDoc[]>([]);
    const [newComment, setNewComment] = useState("");
    const [newReply, setNewReply] = useState<{ [commentId: string]: string }>({});
    const [selectedImage, setSelectedImage] = useState<File | null>(null);
    const [selectedImagePreview, setSelectedImagePreview] = useState<string>("");
    const [imageOverlayText, setImageOverlayText] = useState<string>("");
    const [annotatedImagePreview, setAnnotatedImagePreview] = useState<string>("");
    const [pendingComments, setPendingComments] = useState<PendingComment[]>([]);
    const [uploadingImage, setUploadingImage] = useState(false);
    const [savingComment, setSavingComment] = useState(false);
    const [expandedReplies, setExpandedReplies] = useState<{ [commentId: string]: boolean }>({});
    const [replyingTo, setReplyingTo] = useState<string | null>(null);
    const pendingCommentsRef = useRef<PendingComment[]>([]);
    const selectedImagePreviewRef = useRef<string>("");

    // Video state
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);

    // Payment & Download state
    const [isDownloading, setIsDownloading] = useState(false);
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
    const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
    const [pendingDownloadAfterFlow, setPendingDownloadAfterFlow] = useState(false);
    const [editorRating, setEditorRating] = useState(0);
    const [editorReview, setEditorReview] = useState("");
    
    // Live state from Firestore
    const [liveTotalCost, setLiveTotalCost] = useState(project?.totalCost || 0);
    const [liveAmountPaid, setLiveAmountPaid] = useState(project?.amountPaid || 0);
    const [livePaymentStatus, setLivePaymentStatus] = useState(project?.paymentStatus || "");
    const [liveEditorRating, setLiveEditorRating] = useState(project?.editorRating || 0);
    const [liveEditorReview, setLiveEditorReview] = useState(project?.editorReview || "");

    const remainingAmount = Math.max(0, (liveTotalCost - liveAmountPaid) * 1.18);
    const remainingBaseAmount = Math.max(0, liveTotalCost - liveAmountPaid);
    const paidSoFarInclusive = liveAmountPaid * 1.18;
    const isPaymentComplete = livePaymentStatus === "full_paid" || liveAmountPaid >= liveTotalCost;
    const hasFeedback = liveEditorRating > 0;

    const selectedRevision = useMemo(
        () => revisions.find((r) => r.id === selectedRevisionId) || null,
        [revisions, selectedRevisionId]
    );

    // Image upload handler
    const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setSelectedImage(file);
        const preview = URL.createObjectURL(file);
        setSelectedImagePreview(preview);
        setAnnotatedImagePreview("");
        setImageOverlayText("");
    };

    const clearImageSelection = () => {
        if (selectedImagePreview) {
            URL.revokeObjectURL(selectedImagePreview);
        }
        setSelectedImage(null);
        setSelectedImagePreview("");
        setAnnotatedImagePreview("");
        setImageOverlayText("");
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    const drawTextOnImage = (imageSrc: string, text: string): Promise<string> => {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d')!;
                canvas.width = img.width;
                canvas.height = img.height;

                // Draw the image
                ctx.drawImage(img, 0, 0);

                // Draw the text overlay
                if (text.trim()) {
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
                    ctx.fillRect(0, canvas.height - 60, canvas.width, 60);

                    ctx.fillStyle = 'white';
                    ctx.font = '16px Arial';
                    ctx.textAlign = 'center';
                    ctx.fillText(text, canvas.width / 2, canvas.height - 25);
                }

                resolve(canvas.toDataURL('image/jpeg', 0.9));
            };
            img.src = imageSrc;
        });
    };

    useEffect(() => {
        if (selectedImagePreview && imageOverlayText.trim()) {
            drawTextOnImage(selectedImagePreview, imageOverlayText).then((annotatedUrl) => {
                setAnnotatedImagePreview(annotatedUrl);
            });
        } else {
            setAnnotatedImagePreview("");
        }
    }, [selectedImagePreview, imageOverlayText]);

    useEffect(() => {
        selectedImagePreviewRef.current = selectedImagePreview;
    }, [selectedImagePreview]);

    useEffect(() => {
        return () => {
            if (selectedImagePreviewRef.current) {
                URL.revokeObjectURL(selectedImagePreviewRef.current);
            }
            pendingCommentsRef.current.forEach((comment) => {
                if (comment.imagePreview) {
                    URL.revokeObjectURL(comment.imagePreview);
                }
            });
        };
    }, []);

   // added cloudinary download as well
const startDownload = async () => {
    if (!project?.id || !selectedRevisionId || !selectedRevision) return;

    setIsDownloading(true);
    try {
        const res = await registerDownload(project.id, selectedRevisionId);
        
        if (res.success && res.downloadUrl) {
            let finalUrl = res.downloadUrl;

            // 1. CLOUDINARY: Convert HLS to MP4 + Force Download Header
            if (finalUrl.includes('cloudinary.com')) {
                finalUrl = finalUrl
                    .replace(/\.m3u8$/, '.mp4')
                    .replace(/\/sp_[^\/]+\//, '/')
                    // 'fl_attachment' tells Cloudinary to send the "Save As" header
                    .replace('/upload/', '/upload/fl_attachment/');
            } 
            
            // 2. FIREBASE: Add the 'download' parameter
            // Note: Firebase usually requires the "Content-Disposition" 
            // to be set in metadata during upload to force download perfectly.
            else if (finalUrl.includes('firebasestorage.googleapis.com')) {
                if (!finalUrl.includes('alt=media')) {
                    finalUrl += (finalUrl.includes('?') ? '&' : '?') + 'alt=media';
                }
            }

            // 3. THE "INSTANT" TRIGGER
            // We use a hidden iframe or a direct location assignment. 
            // This starts the browser's native download manager immediately.
            const link = document.createElement("a");
            link.href = finalUrl;
            
            // We give it a friendly name (though headers usually override this)
            const fileName = `${project.name || 'video'}_v${selectedRevision.version || 1}.mp4`;
            link.setAttribute("download", fileName);
            
            // DO NOT USE target="_blank" (this is what caused the new tab issue)
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            toast.success("Download started in your browser.");
        } else {
            toast.error(res.error || "Failed to start download.");
        }
    } catch (error) {
        console.error("Download error:", error);
        toast.error("An error occurred.");
    } finally {
        setIsDownloading(false);
    }
};
   // old version for only firebase
    // const startDownload = async () => {
    //     if (!project?.id || !selectedRevisionId || !selectedRevision) return;

    //     setIsDownloading(true);
    //     try {
    //         const res = await registerDownload(project.id, selectedRevisionId);
    //         if (res.success && res.downloadUrl) {
    //             const link = document.createElement("a");
    //             link.href = res.downloadUrl;
    //             link.download = `${project.name || 'video'}_v${selectedRevision.version || 1}.mp4`;
    //             link.target = "_blank";
    //             document.body.appendChild(link);
    //             link.click();
    //             link.remove();
    //             toast.success("Download initiated.");
    //         } else {
    //             toast.error(res.error || "Failed to start download.");
    //         }
    //     } catch (error) {
    //         console.error("Download error:", error);
    //         toast.error("An error occurred during download.");
    //     } finally {
    //         setIsDownloading(false);
    //     }
    // };

    const handleDownloadClick = async () => {
        if (!project?.id || !selectedRevisionId) return;

        if (isClient) {
            // 1. Payment Check (MANDATORY for download, unless Pay Later is enabled)
            if (!isPaymentComplete && !user?.payLater) {
                setPendingDownloadAfterFlow(true);
                setIsPaymentModalOpen(true);
                return;
            }

            // 2. Feedback Check
            if (!hasFeedback) {
                setPendingDownloadAfterFlow(true);
                setIsFeedbackModalOpen(true);
                return;
            }
        }

        await startDownload();
    };

    const handleSubmitFeedback = async () => {
        if (!project?.id) return;
        if (editorRating === 0) {
            toast.error("Please select a rating.");
            return;
        }

        setIsSubmittingFeedback(true);
        try {
            const res = await submitEditorRating(project.id, editorRating, editorReview.trim() || "No review provided.");
            if (!res.success) {
                toast.error(res.error || "Failed to submit feedback.");
                return;
            }

            await updateDoc(doc(db, "projects", project.id), {
                editorRating,
                editorReview: editorReview.trim(),
                updatedAt: Date.now(),
            });

            setLiveEditorRating(editorRating);
            setLiveEditorReview(editorReview.trim());

            toast.success("Feedback submitted.");
            setIsFeedbackModalOpen(false);

            if (pendingDownloadAfterFlow) {
                setPendingDownloadAfterFlow(false);
                await startDownload();
            }
        } catch (error) {
            console.error("Feedback submit error:", error);
            toast.error("Failed to submit feedback.");
        } finally {
            setIsSubmittingFeedback(false);
        }
    };

    const buildDraftComment = async (): Promise<PendingComment | null> => {
        const content = newComment.trim();
        if (!content && !selectedImage) {
            return null;
        }

        let finalImageFile = selectedImage;
        let finalImagePreview = selectedImagePreview;

        // Apply text overlay if there's text and an image
        if (selectedImage && imageOverlayText.trim() && selectedImagePreview) {
            try {
                const annotatedDataUrl = await drawTextOnImage(selectedImagePreview, imageOverlayText);
                // Convert data URL back to File
                const response = await fetch(annotatedDataUrl);
                const blob = await response.blob();
                finalImageFile = new File([blob], selectedImage.name, { type: 'image/jpeg' });
                finalImagePreview = annotatedDataUrl;
            } catch (error) {
                console.error('Failed to apply text overlay:', error);
                // Fall back to original image
            }
        }

        return {
            id: `queued-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            content,
            timestamp: activeTab === 'timeline' ? currentTime : 0,
            isDirectConnection: activeTab === 'direct',
            imageFile: finalImageFile || undefined,
            imagePreview: finalImagePreview || undefined,
        };
    };

    const removeQueuedComment = (queuedId: string) => {
        setPendingComments((prev) => {
            const target = prev.find((item) => item.id === queuedId);
            if (target?.imagePreview) {
                URL.revokeObjectURL(target.imagePreview);
            }
            return prev.filter((item) => item.id !== queuedId);
        });
    };

    const handleQueueComment = async () => {
        if (!project?.id || !selectedRevisionId) return;
        const draft = await buildDraftComment();
        if (!draft) {
            toast.error("Write a comment or upload an image.");
            return;
        }

        setPendingComments((prev) => [...prev, draft]);
        setNewComment("");
        setSelectedImage(null);
        setSelectedImagePreview("");
        setImageOverlayText("");
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }

        const timeLabel = draft.isDirectConnection ? " (Direct Connection)" : ` at ${formatTime(draft.timestamp)}`;
        toast.success(`Comment queued${timeLabel}`);
    };

    const handleSendQueuedComments = async () => {
        if (!project?.id || !selectedRevisionId) return;

        const draft = await buildDraftComment();
        const commentsToSend = [...pendingComments, ...(draft ? [draft] : [])];

        if (commentsToSend.length === 0) {
            toast.error("Add at least one comment to send.");
            return;
        }

        setSavingComment(true);
        try {
            const failedQueue: PendingComment[] = [];
            let sentCount = 0;

            for (const queued of commentsToSend) {
                let imageUrl = "";

                if (queued.imageFile) {
                    setUploadingImage(true);
                    imageUrl = await uploadCommentImage(queued.imageFile, project.id, selectedRevisionId);
                    setUploadingImage(false);
                }

                try {
                    await addDoc(collection(db, "comments"), {
                        projectId: project.id,
                        revisionId: selectedRevisionId,
                        userId: user?.uid || "guest",
                        userName: user?.displayName || "User",
                        userRole: (user as any)?.role || "guest",
                        content: queued.content,
                        imageUrl: imageUrl || null,
                        timestamp: queued.timestamp,
                        createdAt: Date.now(),
                        status: "open",
                        replies: [],
                        isDirectConnection: queued.isDirectConnection,
                    });

                    const notifyResult = await handleNewComment(
                        project.id,
                        user?.uid || "guest",
                        user?.displayName || "User",
                        (user as any)?.role || "guest",
                        queued.content,
                        selectedRevisionId
                    );

                    if (!notifyResult.success) {
                        console.error("[WhatsApp] Comment notification failed:", notifyResult.error);
                    }

                    if (queued.imagePreview) {
                        URL.revokeObjectURL(queued.imagePreview);
                    }
                    sentCount += 1;
                } catch (commentError) {
                    console.error("[Review] Failed to send queued comment", commentError);
                    failedQueue.push(queued);
                }
            }

            setNewComment("");
            clearImageSelection();
            setPendingComments(failedQueue);

            if (sentCount > 0) {
                toast.success(`${sentCount} comment${sentCount > 1 ? 's' : ''} sent.`);
            }
            if (failedQueue.length > 0) {
                toast.error(`${failedQueue.length} comment${failedQueue.length > 1 ? 's' : ''} failed. Kept in queue.`);
            }
        } catch (error) {
            console.error("Add comment failed:", error);
            toast.error("Failed to send queued comments.");
        } finally {
            setUploadingImage(false);
            setSavingComment(false);
        }
    };

    // Reply handler
    const handleAddReply = async (commentId: string) => {
        if (!newReply[commentId]?.trim()) {
            toast.error("Write a reply.");
            return;
        }

        try {
            const commentDocRef = doc(db, "comments", commentId);
            const commentSnap = await getDocs(query(collection(db, "comments"), where("__name__", "==", commentId)));
            
            if (!commentSnap.empty) {
                const comment = commentSnap.docs[0].data();
                const replies = comment.replies || [];
                replies.push({
                    id: `reply_${Date.now()}`,
                    userId: user?.uid || "guest",
                    userName: user?.displayName || "User",
                    userRole: (user as any)?.role || "guest",
                    content: newReply[commentId].trim(),
                    imageUrl: null,
                    createdAt: Date.now(),
                });

                await updateDoc(commentDocRef, { replies });
                setNewReply({ ...newReply, [commentId]: "" });
                setReplyingTo(null);
                toast.success("Reply added.");
            }
        } catch (error) {
            console.error("Add reply failed:", error);
            toast.error("Failed to add reply.");
        }
    };

    const handleDeleteComment = async (commentId: string) => {
        if (!window.confirm("Delete this comment?")) return;

        try {
            const res = await fetch("/api/comments/delete", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ commentId }),
            });

            const payload = await safeJsonParse(res);
            if (!res.ok || !payload?.success) {
                const errorMessage = payload?.message || "Failed to delete comment.";
                throw new Error(errorMessage);
            }

            setComments((prev) => prev.filter((comment) => comment.id !== commentId));
            setDirectConnections((prev) => prev.filter((comment) => comment.id !== commentId));
            toast.success("Comment deleted.");
        } catch (error: any) {
            console.error("Delete failed:", error);
            const message = error?.message || "Failed to delete comment.";
            toast.error(message);
        }
    };

    // Load revisions on modal open
    useEffect(() => {
        if (!isOpen || !project?.id) return;

        setLoadingRevisions(true);
        setRevisions([]);
        setSelectedRevisionId("");

        const q = query(collection(db, "revisions"), where("projectId", "==", project.id));
        const unsubRevisions = onSnapshot(
            q,
            (snap) => {
                const next = snap.docs
                    .map((doc) => ({ id: doc.id, ...(doc.data() as any) } as RevisionDoc))
                    .sort((a, b) => (b.version || 0) - (a.version || 0));

                console.log('[ReviewSystemModal] Fetched live revisions:', next);
                setRevisions(next);
                
                // Preheat all parsed videos for instant playback with blob caching
                next.forEach(r => {
                    const videoSrc = r.playbackId ? `https://stream.mux.com/${r.playbackId}.m3u8` : (r.hlsUrl || r.videoUrl);
                    if (videoSrc) warmVideoInMemory(videoSrc);
                });

                if (next.length > 0) {
                    setSelectedRevisionId(currentSelected => {
                        if (currentSelected && next.find(r => r.id === currentSelected)) {
                            return currentSelected;
                        }
                        const defaultRev = defaultRevisionId && next.find(r => r.id === defaultRevisionId) ? defaultRevisionId : next[0].id;
                        console.log('[ReviewSystemModal] Setting revision as selected:', defaultRev);
                        return defaultRev;
                    });
                } else {
                    setSelectedRevisionId("");
                }
                setLoadingRevisions(false);
            },
            (error) => {
                console.error("Failed syncing revisions:", error);
                toast.error("Unable to sync revisions.");
                setLoadingRevisions(false);
            }
        );

        return () => unsubRevisions();
    }, [isOpen, project?.id, defaultRevisionId]);

    // Manual sync for Mux when webhooks fail (e.g. localhost)
    // Only run for authenticated users — video_jobs requires auth. Guests cannot upload so no need.
    useEffect(() => {
        if (!isOpen || !selectedRevisionId || !user) return;

        const rev = revisions.find(r => r.id === selectedRevisionId);
        if (!rev || rev.playbackId || rev.hlsUrl || rev.videoUrl) return;

        let isPolling = true;

        const checkMuxStatus = async () => {
            if (!isPolling) return;
            try {
                // Find uploadId from video_jobs. UploadDraftModal creates a duplicate job with doc.id = revisionId,
                // while UploadService creates one with doc.id = mux uploadId.
                const q = query(collection(db, "video_jobs"), where("revisionId", "==", selectedRevisionId));
                const snap = await getDocs(q);
                if (snap.empty) return;
                
                // Firebase IDs are precisely 20 characters long. Mux IDs are usually differently length or pattern.
                // We also know UploadDraftModal uses revisionId as doc.id, so we filter that out.
                const muxJobDoc = snap.docs.find(doc => doc.id !== selectedRevisionId && doc.id.length !== 20);
                if (!muxJobDoc) {
                    // Try to safely fall back to checking if there's any other doc
                    const fallbackDoc = snap.docs.find(doc => doc.id !== selectedRevisionId);
                    if (!fallbackDoc) {
                        console.log("[ReviewSystemModal] Waiting for Mux video_job to be created...");
                        if (isPolling) setTimeout(checkMuxStatus, 3000);
                        return;
                    }
                }
                
                const uploadId = muxJobDoc ? muxJobDoc.id : snap.docs.find(doc => doc.id !== selectedRevisionId)?.id;
                if (!uploadId) return;

                
                const res = await fetch("/api/syncMuxVideo", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ uploadId, revisionId: selectedRevisionId })
                });
                
                const data = await safeJsonParse(res);
                if (data.success && data.playbackId) {
                    // Update successfully handled by the backend, onSnapshot will pick it up
                    isPolling = false;
                }
            } catch (err) {
                console.error("[ReviewSystemModal] Polling sync error:", err);
            }

            if (isPolling) {
                setTimeout(checkMuxStatus, 5000); // Poll every 5 seconds
            }
        };

        checkMuxStatus();

        return () => { isPolling = false; };
    }, [isOpen, selectedRevisionId, revisions]);

    // Sync live payment/feedback state
    useEffect(() => {
        if (!isOpen || !project?.id) return;

        setLiveTotalCost(project?.totalCost || 0);
        setLiveAmountPaid(project?.amountPaid || 0);
        setLivePaymentStatus(project?.paymentStatus || "");
        setLiveEditorRating(project?.editorRating || 0);
        setLiveEditorReview(project?.editorReview || "");

        const unsubProject = onSnapshot(doc(db, "projects", project.id), (snap) => {
            if (!snap.exists()) return;
            const p = snap.data() as any;
            setLiveTotalCost(p.totalCost || 0);
            setLiveAmountPaid(p.amountPaid || 0);
            setLivePaymentStatus(p.paymentStatus || "");
            setLiveEditorRating(p.editorRating || 0);
            setLiveEditorReview(p.editorReview || "");
        });

        return () => unsubProject();
    }, [isOpen, project?.id, project?.totalCost, project?.amountPaid, project?.paymentStatus, project?.editorRating, project?.editorReview]);

    // Load comments - separated by timeline and direct connections
    useEffect(() => {
        if (!isOpen || !selectedRevisionId) {
            setComments([]);
            setDirectConnections([]);
            return;
        }

        const q = query(collection(db, "comments"), where("revisionId", "==", selectedRevisionId));
        const unsub = onSnapshot(
            q,
            (snap) => {
                const allComments = snap.docs
                    .map((doc) => ({ id: doc.id, ...doc.data() } as CommentDoc))
                    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
                
                const timelineComments = allComments.filter((c) => !c.isDirectConnection);
                const directConnectionComments = allComments.filter((c) => c.isDirectConnection);
                
                setComments(timelineComments);
                setDirectConnections(directConnectionComments);
            },
            (error) => {
                console.error("Comments sync failed:", error);
            }
        );

        return () => unsub();
    }, [isOpen, selectedRevisionId]);

    const seekTo = (time: number) => {
        setCurrentTime(time);
        // Note: Advanced seeking is now handled by the player's built-in timeline controls
    };

    return (
        <VideoManagerProvider>
            {guestPreview ? (
                <div className="min-h-screen bg-background">
                    <div className="container mx-auto px-4 py-6 max-w-7xl">
                        <div className="mb-6">
                            <h1 className="text-2xl font-bold text-foreground">
                                Review: {project?.name || "Project"}
                                {guestName && <span className="text-muted-foreground ml-2">({guestName})</span>}
                            </h1>
                            <p className="text-sm text-muted-foreground mt-1">
                                Guest preview - you can watch and comment on this video
                            </p>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                            <div className="lg:col-span-8 space-y-4">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="text-sm text-muted-foreground font-bold uppercase tracking-widest">Draft Versions</div>
                                </div>

                                <div className="flex flex-wrap gap-2">
                                    {revisions.map((rev) => (
                                        <button
                                            key={rev.id}
                                            onClick={() => setSelectedRevisionId(rev.id)}
                                            className={`px-3 py-2 rounded-lg text-sm font-bold border transition-colors ${
                                                selectedRevisionId === rev.id
                                                    ? "bg-primary/15 border-primary/40 text-primary"
                                                    : "bg-muted/40 border-border text-muted-foreground hover:text-foreground"
                                            }`}
                                        >
                                            v{rev.version || "?"}
                                        </button>
                                    ))}
                                </div>

                                <div className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/5">
                                    <div className="flex flex-col gap-1">
                                        <span className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Shareable Review Link</span>
                                        <span className="text-sm text-muted-foreground italic">Anyone with this link can watch and comment</span>
                                    </div>
                                    <button
                                        onClick={() => {
                                            if (!selectedRevisionId) {
                                                toast.error("No revision selected to share yet.");
                                                return;
                                            }
                                            const shortBaseUrl = (process.env.NEXT_PUBLIC_SHORT_LINK_BASE_URL || "https://previewvideo.online").replace(/\/+$/, "");
                                            const url = `${shortBaseUrl}/r/${selectedRevisionId}`;
                                            navigator.clipboard.writeText(url);
                                            toast.success("Review link copied to clipboard!");
                                        }}
                                        disabled={!selectedRevisionId}
                                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 border border-primary/20 text-primary text-sm font-bold uppercase tracking-widest hover:bg-primary/20 transition-all shrink-0 active:scale-95"
                                    >
                                        <Share2 className="h-4 w-4" />
                                        Copy Link
                                    </button>
                                </div>

                                <div 
                                    className="rounded-xl border border-border bg-black overflow-hidden aspect-video relative"
                                    data-watermark-name={project?.clientName || project?.name || "Client Review"}
                                >
                                    {loadingRevisions ? (
                                        <div className="h-full w-full flex items-center justify-center text-muted-foreground gap-2">
                                            <Loader2 className="h-5 w-5 animate-spin" />
                                            Loading drafts...
                                        </div>
                                    ) : revisions.length === 0 ? (
                                        <div className="h-full w-full flex flex-col items-center justify-center text-muted-foreground gap-2">
                                            <Upload className="h-8 w-8 opacity-20" />
                                            <span className="text-sm">No uploaded draft available for this project.</span>
                                        </div>
                                    ) : selectedRevision?.playbackId || selectedRevision?.hlsUrl || selectedRevision?.videoUrl ? (
                                        <VideoPlayer
                                            playbackId={selectedRevision.playbackId}
                                            videoPath={selectedRevision.hlsUrl || selectedRevision.videoUrl || ""}
                                            title={project?.name + " - V" + (selectedRevision.version || "Draft")}
                                            metadata={{
                                                video_id: selectedRevision.id,
                                                video_title: project?.name + " - V" + (selectedRevision.version || "Draft"),
                                                viewer_user_id: user?.uid || guestName || "guest",
                                            }}
                                            onTimeUpdate={(currentTime, duration) => {
                                                setCurrentTime(currentTime);
                                                if (duration && !isNaN(duration)) setDuration(duration);
                                            }}
                                            onLoadedMetadata={(duration) => {
                                                if (duration && !isNaN(duration)) setDuration(duration);
                                            }}
                                            primaryColor="#6366f1"
                                            className="w-full h-full"
                                        />
                                    ) : (
                                        <div className="h-full w-full flex flex-col items-center justify-center text-muted-foreground gap-3 bg-muted/10">
                                            <Loader2 className="h-6 w-6 animate-spin text-primary" />
                                            <div className="text-sm font-bold uppercase tracking-widest text-primary">Processing Video on Mux</div>
                                            <div className="text-[10px] uppercase tracking-widest opacity-70">Securing high-quality playback format...</div>
                                        </div>
                                    )}
                                </div>

                                {duration > 0 && (
                                    <div className="space-y-3">
                                        <div className="text-sm text-muted-foreground font-bold uppercase tracking-widest">
                                            Timeline Comments
                                        </div>
                                        <div
                                            className="relative w-full h-6 cursor-pointer"
                                            onClick={(e) => {
                                                const rect = e.currentTarget.getBoundingClientRect();
                                                const x = e.clientX - rect.left;
                                                const p = Math.max(0, Math.min(1, x / rect.width));
                                                seekTo(p * duration);
                                            }}
                                        >
                                            <div className="absolute top-1/2 -translate-y-1/2 w-full h-1.5 bg-muted rounded-full" />
                                            {comments.map((c) => {
                                                const left = duration > 0 ? (c.timestamp / duration) * 100 : 0;
                                                return (
                                                    <button
                                                        key={c.id}
                                                        type="button"
                                                        title={`${formatTime(c.timestamp)} - ${c.userName || "User"}`}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            seekTo(c.timestamp);
                                                        }}
                                                        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-3 w-3 rounded-full bg-primary border border-background"
                                                        style={{ left: `${left}%` }}
                                                    />
                                                );
                                            })}
                                            <div
                                                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-4 w-1.5 rounded bg-emerald-500"
                                                style={{ left: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="lg:col-span-4 border border-border rounded-xl p-4 bg-muted/20 flex flex-col min-h-[600px] max-h-[80vh]">
                                {/* Tab Navigation */}
                                <div className="flex gap-2 mb-4">
                                    <button
                                        onClick={() => setActiveTab('timeline')}
                                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold uppercase tracking-widest transition-colors ${
                                            activeTab === 'timeline'
                                                ? 'bg-primary text-primary-foreground'
                                                : 'bg-muted/40 text-muted-foreground hover:bg-muted/60'
                                        }`}
                                    >
                                        <Clock className="h-4 w-4" />
                                        Timeline
                                    </button>
                                    <button
                                        onClick={() => setActiveTab('direct')}
                                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold uppercase tracking-widest transition-colors ${
                                            activeTab === 'direct'
                                                ? 'bg-primary text-primary-foreground'
                                                : 'bg-muted/40 text-muted-foreground hover:bg-muted/60'
                                        }`}
                                    >
                                        <Users className="h-4 w-4" />
                                        Direct Connect
                                    </button>
                                </div>

                                <div className="text-sm text-muted-foreground font-bold uppercase tracking-widest mb-4">
                                    {activeTab === 'timeline' ? `Timeline Comments (${comments.length})` : `Connections (${directConnections.length})`}
                                </div>

                                {/* Comment Input Section */}
                                <div className="space-y-3 mb-4">
                                    <textarea
                                        value={newComment}
                                        onChange={(e) => setNewComment(e.target.value)}
                                        placeholder={activeTab === 'timeline' ? `Add comment at ${formatTime(currentTime)}...` : "Send a message..."}
                                        className="w-full h-24 resize-none rounded-lg border border-border bg-background p-3 text-sm"
                                    />

                                    {/* Image Preview */}
                                    {selectedImagePreview && (
                                        <div className="space-y-2">
                                            <div className="relative w-full h-32 rounded-lg border border-border bg-background/50 overflow-hidden">
                                                <img
                                                    src={annotatedImagePreview || selectedImagePreview}
                                                    alt="preview"
                                                    className="w-full h-full object-cover"
                                                />
                                                <button
                                                    onClick={clearImageSelection}
                                                    className="absolute top-2 right-2 p-1.5 rounded-lg bg-destructive/80 hover:bg-destructive text-destructive-foreground"
                                                >
                                                    <X className="h-4 w-4" />
                                                </button>
                                            </div>
                                            {/* Text Overlay Input */}
                                            <input
                                                type="text"
                                                value={imageOverlayText}
                                                onChange={(e) => setImageOverlayText(e.target.value)}
                                                placeholder="Add text overlay (like WhatsApp)..."
                                                className="w-full px-3 py-2 text-sm rounded border border-border bg-background"
                                            />
                                        </div>
                                    )}

                                    {/* Image Upload Input */}
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/*"
                                        onChange={handleImageSelect}
                                        className="hidden"
                                    />

                                    {/* Action Buttons */}
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => fileInputRef.current?.click()}
                                            disabled={uploadingImage}
                                            className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-border bg-muted/40 text-muted-foreground text-sm font-bold uppercase tracking-widest hover:bg-muted/60 disabled:opacity-50"
                                        >
                                            <ImageIcon className="h-4 w-4" />
                                            Image
                                        </button>
                                        <button
                                            onClick={handleQueueComment}
                                            disabled={savingComment || uploadingImage || (!newComment.trim() && !selectedImage) || !selectedRevisionId}
                                            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-border bg-muted/40 text-muted-foreground text-sm font-bold uppercase tracking-widest disabled:opacity-50 hover:bg-muted/60"
                                        >
                                            Add
                                        </button>
                                        <button
                                            onClick={handleSendQueuedComments}
                                            disabled={savingComment || uploadingImage || (pendingComments.length === 0 && !newComment.trim() && !selectedImage) || !selectedRevisionId}
                                            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-bold uppercase tracking-widest disabled:opacity-50 hover:bg-primary/90"
                                        >
                                            {savingComment || uploadingImage ? (
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                            ) : (
                                                <Send className="h-4 w-4" />
                                            )}
                                            {pendingComments.length > 0 ? `Send (${pendingComments.length + ((newComment.trim() || selectedImage) ? 1 : 0)})` : "Send"}
                                        </button>
                                    </div>

                                    {pendingComments.length > 0 && (
                                        <div className="space-y-2 rounded-lg border border-border bg-background/70 p-3">
                                            <div className="flex items-center justify-between">
                                                <p className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Queued Comments ({pendingComments.length})</p>
                                                <button
                                                    onClick={() => {
                                                        pendingComments.forEach((item) => {
                                                            if (item.imagePreview) URL.revokeObjectURL(item.imagePreview);
                                                        });
                                                        setPendingComments([]);
                                                    }}
                                                    className="text-sm font-bold uppercase tracking-widest text-destructive/70 hover:text-destructive"
                                                >
                                                    Clear
                                                </button>
                                            </div>
                                            <div className="space-y-2 max-h-32 overflow-y-auto pr-1">
                                                {pendingComments.map((queued) => (
                                                    <div key={queued.id} className="flex items-start justify-between gap-2 rounded-md border border-border/80 bg-muted/30 px-3 py-2">
                                                        <div className="min-w-0">
                                                            <p className="text-sm font-bold text-primary">
                                                                {queued.isDirectConnection ? 'Direct' : `@${formatTime(queued.timestamp)}`}
                                                            </p>
                                                            <p className="text-sm text-foreground whitespace-pre-wrap wrap-break-word">
                                                                {queued.content || 'Image comment'}
                                                            </p>
                                                        </div>
                                                        <button
                                                            onClick={() => removeQueuedComment(queued.id)}
                                                            className="text-sm font-bold uppercase tracking-widest text-muted-foreground hover:text-destructive"
                                                        >
                                                            Remove
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Comments Display */}
                                <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                                    {activeTab === 'timeline' ? (
                                        comments.length === 0 ? (
                                            <div className="text-sm text-muted-foreground text-center py-8">No timeline comments yet.</div>
                                        ) : (
                                            comments.map((c) => (
                                                <div key={c.id} className="p-3 rounded-lg border border-border bg-background/80 space-y-2">
                                                    {/* Comment Header */}
                                                    <div className="flex items-center justify-between gap-2">
                                                        <div className="flex items-center gap-2">
                                                            <button
                                                                onClick={() => seekTo(c.timestamp)}
                                                                className="text-sm font-bold text-primary inline-flex items-center gap-1 hover:underline"
                                                            >
                                                                <Play className="h-3.5 w-3.5" />
                                                                {formatTime(c.timestamp)}
                                                            </button>
                                                            <span className="text-sm text-muted-foreground">•</span>
                                                            <span className="text-sm text-muted-foreground">{c.userName || "User"}</span>
                                                        </div>
                                                        {(user?.uid === c.userId || isAdmin || isStaff || isEditor || project?.assignedEditorId === user?.uid || project?.assignedPMId === user?.uid || project?.clientId === user?.uid || project?.ownerId === user?.uid) && (
                                                            <button
                                                                onClick={() => handleDeleteComment(c.id)}
                                                                className="text-sm text-destructive/60 hover:text-destructive font-bold"
                                                            >
                                                                Delete
                                                            </button>
                                                        )}
                                                    </div>

                                                    {/* Comment Content */}
                                                    {c.content && (
                                                        <p className="text-sm text-foreground whitespace-pre-wrap">{c.content}</p>
                                                    )}

                                                    {/* Comment Image */}
                                                    {c.imageUrl && (
                                                        <div className="rounded-lg border border-border overflow-hidden max-h-40">
                                                            <img
                                                                src={c.imageUrl}
                                                                alt="comment"
                                                                className="w-full h-full object-cover"
                                                            />
                                                        </div>
                                                    )}

                                                    {/* Replies Section */}
                                                    {(c.replies && c.replies.length > 0) || replyingTo === c.id ? (
                                                        <div className="space-y-2 mt-3 pt-2 border-t border-border">
                                                            {/* Existing Replies */}
                                                            {c.replies?.map((reply) => (
                                                                <div key={reply.id} className="text-xs pl-3 py-1.5">
                                                                    <div className="flex items-center gap-1.5 mb-1">
                                                                        <span className="font-bold text-primary">{reply.userName}</span>
                                                                        <span className="text-muted-foreground">({reply.userRole})</span>
                                                                    </div>
                                                                    <p className="text-foreground whitespace-pre-wrap ml-3">{reply.content}</p>
                                                                    {reply.imageUrl && (
                                                                        <div className="rounded-lg border border-border overflow-hidden max-h-20 max-w-24 mt-1 ml-3">
                                                                            <img
                                                                                src={reply.imageUrl}
                                                                                alt="reply"
                                                                                className="w-full h-full object-cover"
                                                                            />
                                                                        </div>
                                                                    )}
                                                                    <span className="text-xs text-muted-foreground ml-3">
                                                                        {formatDate(reply.createdAt || 0)}
                                                                    </span>
                                                                </div>
                                                            ))}

                                                            {/* Reply Input */}
                                                            {replyingTo === c.id && (
                                                                <div className="space-y-2 ml-3">
                                                                    <input
                                                                        type="text"
                                                                        value={newReply[c.id] || ""}
                                                                        onChange={(e) => setNewReply({ ...newReply, [c.id]: e.target.value })}
                                                                        placeholder="Write a reply..."
                                                                        className="w-full text-sm rounded-lg border border-border bg-background p-2"
                                                                    />
                                                                    <div className="flex gap-2">
                                                                        <button
                                                                            onClick={() => handleAddReply(c.id)}
                                                                            className="flex-1 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-bold uppercase hover:bg-primary/90"
                                                                        >
                                                                            Reply
                                                                        </button>
                                                                        <button
                                                                            onClick={() => setReplyingTo(null)}
                                                                            className="px-3 py-1.5 rounded-lg border border-border text-sm font-bold hover:bg-muted/40"
                                                                        >
                                                                            Cancel
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    ) : null}

                                                    {/* Reply Button */}
                                                    {replyingTo !== c.id && (
                                                        <button
                                                            onClick={() => setReplyingTo(c.id)}
                                                            className="text-sm text-primary/60 hover:text-primary font-bold mt-2"
                                                        >
                                                            Reply
                                                        </button>
                                                    )}
                                                </div>
                                            ))
                                        )
                                    ) : (
                                        /* Direct Connections Tab */
                                        directConnections.length === 0 ? (
                                            <div className="text-sm text-muted-foreground text-center py-8">No direct connections yet.</div>
                                        ) : (
                                            directConnections.map((c) => (
                                                <div key={c.id} className="p-3 rounded-lg border border-border bg-background/80 space-y-2">
                                                    {/* Connection Header */}
                                                    <div className="flex items-center justify-between gap-2">
                                                        <div>
                                                            <div className="text-sm font-bold text-primary">{c.userName || "User"}</div>
                                                            <div className="text-xs text-muted-foreground">{formatDate(c.createdAt || 0)}</div>
                                                        </div>
                                                        {(user?.uid === c.userId || isAdmin || isStaff || isEditor || project?.assignedEditorId === user?.uid || project?.assignedPMId === user?.uid || project?.clientId === user?.uid || project?.ownerId === user?.uid) && (
                                                            <button
                                                                onClick={() => handleDeleteComment(c.id)}
                                                                className="text-sm text-destructive/60 hover:text-destructive font-bold"
                                                            >
                                                                Delete
                                                            </button>
                                                        )}
                                                    </div>

                                                    {/* Connection Message */}
                                                    {c.content && (
                                                        <p className="text-sm text-foreground whitespace-pre-wrap">{c.content}</p>
                                                    )}

                                                    {/* Connection Image */}
                                                    {c.imageUrl && (
                                                        <div className="rounded-lg border border-border overflow-hidden max-h-40">
                                                            <img
                                                                src={c.imageUrl}
                                                                alt="connection"
                                                                className="w-full h-full object-cover"
                                                            />
                                                        </div>
                                                    )}

                                                    {/* Direct Replies */}
                                                    {(c.replies && c.replies.length > 0) || replyingTo === c.id ? (
                                                        <div className="space-y-2 mt-3 pt-2 border-t border-border">
                                                            {c.replies?.map((reply) => (
                                                                <div key={reply.id} className="text-xs pl-3 py-1.5">
                                                                    <div className="flex items-center gap-1.5 mb-1">
                                                                        <span className="font-bold text-primary">{reply.userName}</span>
                                                                    </div>
                                                                    <p className="text-foreground whitespace-pre-wrap ml-3">{reply.content}</p>
                                                                    <span className="text-xs text-muted-foreground ml-3">
                                                                        {formatDate(reply.createdAt || 0)}
                                                                    </span>
                                                                </div>
                                                            ))}

                                                            {replyingTo === c.id && (
                                                                <div className="space-y-2 ml-3">
                                                                    <input
                                                                        type="text"
                                                                        value={newReply[c.id] || ""}
                                                                        onChange={(e) => setNewReply({ ...newReply, [c.id]: e.target.value })}
                                                                        placeholder="Write a reply..."
                                                                        className="w-full text-sm rounded-lg border border-border bg-background p-2"
                                                                    />
                                                                    <div className="flex gap-2">
                                                                        <button
                                                                            onClick={() => handleAddReply(c.id)}
                                                                            className="flex-1 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-bold uppercase hover:bg-primary/90"
                                                                        >
                                                                            Reply
                                                                        </button>
                                                                        <button
                                                                            onClick={() => setReplyingTo(null)}
                                                                            className="px-3 py-1.5 rounded-lg border border-border text-sm font-bold hover:bg-muted/40"
                                                                        >
                                                                            Cancel
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    ) : null}

                                                    {replyingTo !== c.id && (
                                                        <button
                                                            onClick={() => setReplyingTo(c.id)}
                                                            className="text-sm text-primary/60 hover:text-primary font-bold mt-2"
                                                        >
                                                            Reply
                                                        </button>
                                                    )}
                                                </div>
                                            ))
                                        )
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <Modal
                    isOpen={isOpen}
                    onClose={onClose}
                    title={`Review System${project?.name ? ` // ${project.name}` : ""}`}
                    maxWidth="max-w-6xl"
                >
                    <div className="mt-4 grid grid-cols-1 lg:grid-cols-12 gap-4 max-h-[80vh] overflow-hidden">
                        <div className="lg:col-span-8 space-y-3">
                            <div className="flex items-center justify-between gap-3">
                                <div className="text-xs text-muted-foreground font-bold uppercase tracking-widest">Draft Versions</div>
                                {allowUploadDraft && !guestPreview && project?.id && (
                                    <a
                                        href={`/dashboard/projects/${project.id}/upload`}
                                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-500 text-xs font-bold uppercase tracking-widest hover:bg-amber-500/20"
                                    >
                                        <Upload className="h-3.5 w-3.5" />
                                        Upload New Draft
                                    </a>
                                )}
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap gap-2">
                                {revisions.map((rev) => (
                                    <button
                                        key={rev.id}
                                        onClick={() => setSelectedRevisionId(rev.id)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                                            selectedRevisionId === rev.id
                                                ? "bg-primary/15 border-primary/40 text-primary"
                                                : "bg-muted/40 border-border text-muted-foreground hover:text-foreground"
                                        }`}
                                    >
                                        v{rev.version || "?"}
                                    </button>
                                ))}
                            </div>

                            {selectedRevision && isClient && !guestPreview && (() => {
                                const isPayLaterClient = (user as any)?.payLater === true;
                                return (
                                    <div className="flex flex-col items-end gap-1.5">
                                        {isPayLaterClient && !isPaymentComplete && (
                                            <div className="text-[10px] px-2 py-1 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-600 font-bold">
                                                ✓ Pay Later - Payment Required for Download
                                            </div>
                                        )}
                                        {isPaymentComplete && (
                                            <div className="text-[10px] px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 font-bold">
                                                ✓ Payment Completed
                                            </div>
                                        )}
                                        <button
                                            onClick={handleDownloadClick}
                                            disabled={isDownloading}
                                            className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-widest hover:bg-zinc-200 transition-all active:scale-[0.98] flex items-center gap-2 shadow-md shadow-primary/10 disabled:opacity-50"
                                            title={isPaymentComplete ? "Download version" : "Complete payment and feedback to download"}
                                        >
                                            {isDownloading ? (
                                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                            ) : (
                                                <Download className="h-3.5 w-3.5" />
                                            )}
                                            Download
                                        </button>
                                    </div>
                                );
                            })()}

                        </div>

                        <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5">
                            <div className="flex flex-col gap-0.5">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Shareable Review Link</span>
                                <span className="text-[10px] text-muted-foreground italic">Anyone with this link can watch and comment</span>
                            </div>
                            <button
                                onClick={() => {
                                    if (!selectedRevisionId) {
                                        toast.error("No revision selected to share yet.");
                                        return;
                                    }
                                    const shortBaseUrl = (process.env.NEXT_PUBLIC_SHORT_LINK_BASE_URL || "https://previewvideo.online").replace(/\/+$/, "");
                                    const url = `${shortBaseUrl}/r/${selectedRevisionId}`;
                                    navigator.clipboard.writeText(url);
                                    toast.success("Review link copied to clipboard!");
                                }}
                                disabled={!selectedRevisionId}
                                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-primary text-[10px] font-bold uppercase tracking-widest hover:bg-primary/20 transition-all shrink-0 active:scale-95"
                            >
                                <Share2 className="h-3 w-3" />
                                Copy Link
                            </button>
                        </div>

                        <div 
                            className="rounded-xl border border-border bg-black overflow-hidden aspect-video relative"
                            data-watermark-name={project?.clientName || project?.name || "Client Review"}
                        >
                            {loadingRevisions ? (
                                <div className="h-full w-full flex items-center justify-center text-muted-foreground gap-2">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Loading drafts...
                                </div>
                            ) : revisions.length === 0 ? (
                                <div className="h-full w-full flex flex-col items-center justify-center text-muted-foreground gap-2">
                                    <Upload className="h-6 w-6 opacity-20" />
                                    <span className="text-xs">No uploaded draft available for this project.</span>
                                </div>
                            ) : selectedRevision?.playbackId || selectedRevision?.hlsUrl || selectedRevision?.videoUrl ? (
                                <VideoPlayer
                                    playbackId={selectedRevision.playbackId}
                                    videoPath={selectedRevision.hlsUrl || selectedRevision.videoUrl || ""}
                                    title={project?.name + " - V" + (selectedRevision.version || "Draft")}
                                    metadata={{
                                        video_id: selectedRevision.id,
                                        video_title: project?.name + " - V" + (selectedRevision.version || "Draft"),
                                        viewer_user_id: user?.uid || guestName || "guest",
                                    }}
                                    onTimeUpdate={(currentTime, duration) => {
                                        setCurrentTime(currentTime);
                                        if (duration && !isNaN(duration)) setDuration(duration);
                                    }}
                                    onLoadedMetadata={(duration) => {
                                        if (duration && !isNaN(duration)) setDuration(duration);
                                    }}
                                    primaryColor="#6366f1"
                                    className="w-full h-full"
                                />
                            ) : (
                                <div className="h-full w-full flex flex-col items-center justify-center text-muted-foreground gap-3 bg-muted/10">
                                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                                    <div className="text-xs font-bold uppercase tracking-widest text-primary">Processing Video on Mux</div>
                                    <div className="text-[9px] uppercase tracking-widest opacity-70">Securing high-quality playback format...</div>
                                </div>
                            )}
                        </div>


                        {duration > 0 && (
                            <div className="space-y-2">
                                <div className="text-[11px] text-muted-foreground font-bold uppercase tracking-widest">
                                    Timeline Comments
                                </div>
                                <div
                                    className="relative w-full h-4 cursor-pointer"
                                    onClick={(e) => {
                                        const rect = e.currentTarget.getBoundingClientRect();
                                        const x = e.clientX - rect.left;
                                        const p = Math.max(0, Math.min(1, x / rect.width));
                                        seekTo(p * duration);
                                    }}
                                >
                                    <div className="absolute top-1/2 -translate-y-1/2 w-full h-1 bg-muted rounded-full" />
                                    {comments.map((c) => {
                                        const left = duration > 0 ? (c.timestamp / duration) * 100 : 0;
                                        return (
                                            <button
                                                key={c.id}
                                                type="button"
                                                title={`${formatTime(c.timestamp)} - ${c.userName || "User"}`}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    seekTo(c.timestamp);
                                                }}
                                                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-2.5 w-2.5 rounded-full bg-primary border border-background"
                                                style={{ left: `${left}%` }}
                                            />
                                        );
                                    })}
                                    <div
                                        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-3 w-1 rounded bg-emerald-500"
                                        style={{ left: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="lg:col-span-4 border border-border rounded-xl p-3 bg-muted/20 flex flex-col min-h-105 max-h-[70vh]">
                        {/* Tab Navigation */}
                        <div className="flex gap-2 mb-3">
                            <button
                                onClick={() => setActiveTab('timeline')}
                                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-colors ${
                                    activeTab === 'timeline'
                                        ? 'bg-primary text-primary-foreground'
                                        : 'bg-muted/40 text-muted-foreground hover:bg-muted/60'
                                }`}
                            >
                                <Clock className="h-3.5 w-3.5" />
                                Timeline
                            </button>
                            <button
                                onClick={() => setActiveTab('direct')}
                                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-colors ${
                                    activeTab === 'direct'
                                        ? 'bg-primary text-primary-foreground'
                                        : 'bg-muted/40 text-muted-foreground hover:bg-muted/60'
                                }`}
                            >
                                <Users className="h-3.5 w-3.5" />
                                Direct Connect
                            </button>
                        </div>

                        <div className="text-xs text-muted-foreground font-bold uppercase tracking-widest mb-3">
                            {activeTab === 'timeline' ? `Timeline Comments (${comments.length})` : `Connections (${directConnections.length})`}
                        </div>

                        {/* Comment Input Section */}
                        <div className="space-y-2 mb-3">
                            <textarea
                                value={newComment}
                                onChange={(e) => setNewComment(e.target.value)}
                                placeholder={activeTab === 'timeline' ? `Add comment at ${formatTime(currentTime)}...` : "Send a message..."}
                                className="w-full h-20 resize-none rounded-lg border border-border bg-background p-2 text-sm"
                            />

                            {/* Image Preview */}
                            {selectedImagePreview && (
                                <div className="space-y-2">
                                    <div className="relative w-full h-24 rounded-lg border border-border bg-background/50 overflow-hidden">
                                        <img
                                            src={annotatedImagePreview || selectedImagePreview}
                                            alt="preview"
                                            className="w-full h-full object-cover"
                                        />
                                        <button
                                            onClick={clearImageSelection}
                                            className="absolute top-1 right-1 p-1 rounded-lg bg-destructive/80 hover:bg-destructive text-destructive-foreground"
                                        >
                                            <X className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                    {/* Text Overlay Input */}
                                    <input
                                        type="text"
                                        value={imageOverlayText}
                                        onChange={(e) => setImageOverlayText(e.target.value)}
                                        placeholder="Add text overlay (like WhatsApp)..."
                                        className="w-full px-2 py-1 text-sm rounded border border-border bg-background"
                                    />
                                </div>
                            )}

                            {/* Image Upload Input */}
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                onChange={handleImageSelect}
                                className="hidden"
                            />

                            {/* Action Buttons */}
                            <div className="flex gap-2">
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={uploadingImage}
                                    className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-muted/40 text-muted-foreground text-xs font-bold uppercase tracking-widest hover:bg-muted/60 disabled:opacity-50"
                                >
                                    <ImageIcon className="h-3.5 w-3.5" />
                                    Image
                                </button>
                                <button
                                    onClick={handleQueueComment}
                                    disabled={savingComment || uploadingImage || (!newComment.trim() && !selectedImage) || !selectedRevisionId}
                                    className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-border bg-muted/40 text-muted-foreground text-xs font-bold uppercase tracking-widest disabled:opacity-50 hover:bg-muted/60"
                                >
                                    Add
                                </button>
                                <button
                                    onClick={handleSendQueuedComments}
                                    disabled={savingComment || uploadingImage || (pendingComments.length === 0 && !newComment.trim() && !selectedImage) || !selectedRevisionId}
                                    className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold uppercase tracking-widest disabled:opacity-50 hover:bg-primary/90"
                                >
                                    {savingComment || uploadingImage ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                        <Send className="h-3.5 w-3.5" />
                                    )}
                                    {pendingComments.length > 0 ? `Send (${pendingComments.length + ((newComment.trim() || selectedImage) ? 1 : 0)})` : "Send"}
                                </button>
                            </div>

                            {pendingComments.length > 0 && (
                                <div className="space-y-2 rounded-lg border border-border bg-background/70 p-2.5">
                                    <div className="flex items-center justify-between">
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Queued Comments ({pendingComments.length})</p>
                                        <button
                                            onClick={() => {
                                                pendingComments.forEach((item) => {
                                                    if (item.imagePreview) URL.revokeObjectURL(item.imagePreview);
                                                });
                                                setPendingComments([]);
                                            }}
                                            className="text-[10px] font-bold uppercase tracking-widest text-destructive/70 hover:text-destructive"
                                        >
                                            Clear
                                        </button>
                                    </div>
                                    <div className="space-y-1.5 max-h-28 overflow-y-auto pr-1">
                                        {pendingComments.map((queued) => (
                                            <div key={queued.id} className="flex items-start justify-between gap-2 rounded-md border border-border/80 bg-muted/30 px-2 py-1.5">
                                                <div className="min-w-0">
                                                    <p className="text-[10px] font-bold text-primary">
                                                        {queued.isDirectConnection ? 'Direct' : `@${formatTime(queued.timestamp)}`}
                                                    </p>
                                                    <p className="text-[11px] text-foreground whitespace-pre-wrap wrap-break-word">
                                                        {queued.content || 'Image comment'}
                                                    </p>
                                                </div>
                                                <button
                                                    onClick={() => removeQueuedComment(queued.id)}
                                                    className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-destructive"
                                                >
                                                    Remove
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Comments Display */}
                        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                            {activeTab === 'timeline' ? (
                                comments.length === 0 ? (
                                    <div className="text-xs text-muted-foreground text-center py-8">No timeline comments yet.</div>
                                ) : (
                                    comments.map((c) => (
                                        <div key={c.id} className="p-2.5 rounded-lg border border-border bg-background/80 space-y-1.5">
                                            {/* Comment Header */}
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="flex items-center gap-1.5">
                                                    <button
                                                        onClick={() => seekTo(c.timestamp)}
                                                        className="text-[11px] font-bold text-primary inline-flex items-center gap-1 hover:underline"
                                                    >
                                                        <Play className="h-3 w-3" />
                                                        {formatTime(c.timestamp)}
                                                    </button>
                                                    <span className="text-[10px] text-muted-foreground">—</span>
                                                    <span className="text-[10px] text-muted-foreground">{c.userName || "User"}</span>
                                                </div>
                                                {(user?.uid === c.userId || isAdmin || isStaff || isEditor || project?.assignedEditorId === user?.uid || project?.assignedPMId === user?.uid || project?.clientId === user?.uid || project?.ownerId === user?.uid) && (
                                                    <button
                                                        onClick={() => handleDeleteComment(c.id)}
                                                        className="text-[10px] text-destructive/60 hover:text-destructive font-bold"
                                                    >
                                                        Delete
                                                    </button>
                                                )}
                                            </div>

                                            {/* Comment Content */}
                                            {c.content && (
                                                <p className="text-xs text-foreground whitespace-pre-wrap">{c.content}</p>
                                            )}

                                            {/* Comment Image */}
                                            {c.imageUrl && (
                                                <div className="rounded-lg border border-border overflow-hidden max-h-32">
                                                    <img
                                                        src={c.imageUrl}
                                                        alt="comment"
                                                        className="w-full h-full object-cover"
                                                    />
                                                </div>
                                            )}

                                            {/* Replies Section */}
                                            {(c.replies && c.replies.length > 0) || replyingTo === c.id ? (
                                                <div className="space-y-1.5 mt-2 pt-1.5 border-t border-border">
                                                    {/* Existing Replies */}
                                                    {c.replies?.map((reply) => (
                                                        <div key={reply.id} className="text-[10px] pl-2 py-1">
                                                            <div className="flex items-center gap-1 mb-0.5">
                                                                <span className="font-bold text-primary">{reply.userName}</span>
                                                                <span className="text-muted-foreground">({reply.userRole})</span>
                                                            </div>
                                                            <p className="text-foreground whitespace-pre-wrap ml-2">{reply.content}</p>
                                                            {reply.imageUrl && (
                                                                <div className="rounded-lg border border-border overflow-hidden max-h-16 max-w-20 mt-1">
                                                                    <img
                                                                        src={reply.imageUrl}
                                                                        alt="reply"
                                                                        className="w-full h-full object-cover"
                                                                    />
                                                                </div>
                                                            )}
                                                            <span className="text-[9px] text-muted-foreground ml-2">
                                                                {formatDate(reply.createdAt || 0)}
                                                            </span>
                                                        </div>
                                                    ))}

                                                    {/* Reply Input */}
                                                    {replyingTo === c.id && (
                                                        <div className="space-y-1">
                                                            <input
                                                                type="text"
                                                                value={newReply[c.id] || ""}
                                                                onChange={(e) => setNewReply({ ...newReply, [c.id]: e.target.value })}
                                                                placeholder="Write a reply..."
                                                                className="w-full text-[10px] rounded-lg border border-border bg-background p-1.5"
                                                            />
                                                            <div className="flex gap-1">
                                                                <button
                                                                    onClick={() => handleAddReply(c.id)}
                                                                    className="flex-1 px-2 py-1 rounded-lg bg-primary text-primary-foreground text-[9px] font-bold uppercase hover:bg-primary/90"
                                                                >
                                                                    Reply
                                                                </button>
                                                                <button
                                                                    onClick={() => setReplyingTo(null)}
                                                                    className="px-2 py-1 rounded-lg border border-border text-[9px] font-bold hover:bg-muted/40"
                                                                >
                                                                    Cancel
                                                                </button>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            ) : null}

                                            {/* Reply Button */}
                                            {replyingTo !== c.id && (
                                                <button
                                                    onClick={() => setReplyingTo(c.id)}
                                                    className="text-[10px] text-primary/60 hover:text-primary font-bold mt-1"
                                                >
                                                    Reply
                                                </button>
                                            )}
                                        </div>
                                    ))
                                )
                            ) : (
                                /* Direct Connections Tab */
                                directConnections.length === 0 ? (
                                    <div className="text-xs text-muted-foreground text-center py-8">No direct connections yet.</div>
                                ) : (
                                    directConnections.map((c) => (
                                        <div key={c.id} className="p-2.5 rounded-lg border border-border bg-background/80 space-y-1.5">
                                            {/* Connection Header */}
                                            <div className="flex items-center justify-between gap-2">
                                                <div>
                                                    <div className="text-[11px] font-bold text-primary">{c.userName || "User"}</div>
                                                    <div className="text-[9px] text-muted-foreground">{formatDate(c.createdAt || 0)}</div>
                                                </div>
                                                {(user?.uid === c.userId || isAdmin || isStaff || isEditor || project?.assignedEditorId === user?.uid || project?.assignedPMId === user?.uid || project?.clientId === user?.uid || project?.ownerId === user?.uid) && (
                                                    <button
                                                        onClick={() => handleDeleteComment(c.id)}
                                                        className="text-[10px] text-destructive/60 hover:text-destructive font-bold"
                                                    >
                                                        Delete
                                                    </button>
                                                )}
                                            </div>

                                            {/* Connection Message */}
                                            {c.content && (
                                                <p className="text-xs text-foreground whitespace-pre-wrap">{c.content}</p>
                                            )}

                                            {/* Connection Image */}
                                            {c.imageUrl && (
                                                <div className="rounded-lg border border-border overflow-hidden max-h-32">
                                                    <img
                                                        src={c.imageUrl}
                                                        alt="connection"
                                                        className="w-full h-full object-cover"
                                                    />
                                                </div>
                                            )}

                                            {/* Direct Replies */}
                                            {(c.replies && c.replies.length > 0) || replyingTo === c.id ? (
                                                <div className="space-y-1.5 mt-2 pt-1.5 border-t border-border">
                                                    {c.replies?.map((reply) => (
                                                        <div key={reply.id} className="text-[10px] pl-2 py-1">
                                                            <div className="flex items-center gap-1 mb-0.5">
                                                                <span className="font-bold text-primary">{reply.userName}</span>
                                                            </div>
                                                            <p className="text-foreground whitespace-pre-wrap ml-2">{reply.content}</p>
                                                            <span className="text-[9px] text-muted-foreground ml-2">
                                                                {formatDate(reply.createdAt || 0)}
                                                            </span>
                                                        </div>
                                                    ))}

                                                    {replyingTo === c.id && (
                                                        <div className="space-y-1">
                                                            <input
                                                                type="text"
                                                                value={newReply[c.id] || ""}
                                                                onChange={(e) => setNewReply({ ...newReply, [c.id]: e.target.value })}
                                                                placeholder="Write a reply..."
                                                                className="w-full text-[10px] rounded-lg border border-border bg-background p-1.5"
                                                            />
                                                            <div className="flex gap-1">
                                                                <button
                                                                    onClick={() => handleAddReply(c.id)}
                                                                    className="flex-1 px-2 py-1 rounded-lg bg-primary text-primary-foreground text-[9px] font-bold uppercase hover:bg-primary/90"
                                                                >
                                                                    Reply
                                                                </button>
                                                                <button
                                                                    onClick={() => setReplyingTo(null)}
                                                                    className="px-2 py-1 rounded-lg border border-border text-[9px] font-bold hover:bg-muted/40"
                                                                >
                                                                    Cancel
                                                                </button>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            ) : null}

                                            {replyingTo !== c.id && (
                                                <button
                                                    onClick={() => setReplyingTo(c.id)}
                                                    className="text-[10px] text-primary/60 hover:text-primary font-bold mt-1"
                                                >
                                                    Reply
                                                </button>
                                            )}
                                        </div>
                                    ))
                                )
                            )}
                        </div>
                    </div>
                </div>
            </Modal>
            )}

            <Modal
                isOpen={isPaymentModalOpen && isClient}
                onClose={() => setIsPaymentModalOpen(false)}
                title="Complete Final Payment"
                maxWidth="max-w-lg"
            >
                <div className="space-y-5 mt-4">
                    <div className="p-4 rounded-xl border border-border bg-muted/20 space-y-2">
                        <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Total Value (Incl. GST)</span>
                            <span className="font-bold text-foreground">₹{(liveTotalCost * 1.18).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Paid So Far (Incl. GST)</span>
                            <span className="font-bold text-emerald-500">₹{paidSoFarInclusive.toLocaleString()}</span>
                        </div>
                        <div className="h-px bg-border my-2" />
                        <div className="flex justify-between">
                            <span className="text-xs font-bold uppercase tracking-widest text-primary">Remaining (50% + GST)</span>
                            <span className="text-lg font-black text-primary">₹{remainingAmount.toLocaleString()}</span>
                        </div>
                    </div>

                    <PaymentButton
                        projectId={project?.id || ""}
                        user={user}
                        amount={remainingAmount}
                        accountingAmount={remainingBaseAmount}
                        description={`Final Payment: ${project?.name || "Project"}`}
                        prefill={{
                            name: user?.displayName || "",
                            email: user?.email || "",
                        }}
                        allowPayLaterBypass={false}
                        onSuccess={async () => {
                            if (!project?.id) return;

                            await updateDoc(doc(db, "projects", project.id), {
                                paymentStatus: "full_paid",
                                amountPaid: liveTotalCost,
                                updatedAt: Date.now(),
                            });

                            setLivePaymentStatus("full_paid");
                            setLiveAmountPaid(liveTotalCost);

                            setIsPaymentModalOpen(false);
                            setTimeout(() => setIsFeedbackModalOpen(true), 400);
                            toast.success("Payment successful. Please submit editor feedback.");
                        }}
                    />
                </div>
            </Modal>

            <Modal
                isOpen={isFeedbackModalOpen && isClient}
                onClose={() => setIsFeedbackModalOpen(false)}
                title="Editor Feedback"
                maxWidth="max-w-lg"
            >
                <div className="space-y-5 mt-4">
                    <p className="text-sm text-muted-foreground">Rate your editor and leave feedback to start the download.</p>

                    <div className="flex justify-center gap-2">
                        {[1, 2, 3, 4, 5].map((star) => (
                            <button
                                key={star}
                                onClick={() => setEditorRating(star)}
                                className={editorRating >= star ? "p-2 rounded-xl text-yellow-400 bg-yellow-400/10" : "p-2 rounded-xl text-muted-foreground hover:text-yellow-400/70 hover:bg-muted"}
                            >
                                <Star className={editorRating >= star ? "h-8 w-8 fill-yellow-400" : "h-8 w-8"} />
                            </button>
                        ))}
                    </div>

                    <textarea
                        value={editorReview}
                        onChange={(e) => setEditorReview(e.target.value)}
                        placeholder="Write feedback for your editor..."
                        className="w-full h-28 resize-none rounded-xl border border-border bg-background p-3 text-sm"
                    />

                    <button
                        onClick={handleSubmitFeedback}
                        disabled={isSubmittingFeedback || editorRating === 0}
                        className="w-full h-11 rounded-lg bg-primary text-primary-foreground text-[11px] font-bold uppercase tracking-widest hover:bg-primary/90 disabled:opacity-50"
                    >
                        {isSubmittingFeedback ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : "Submit Feedback & Download"}
                    </button>
                </div>
            </Modal>
        </VideoManagerProvider>
    );
}
