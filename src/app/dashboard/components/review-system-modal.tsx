"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { db } from "@/lib/firebase/config";
import { useAuth } from "@/lib/context/auth-context";
import { addDoc, collection, doc, getDocs, onSnapshot, query, updateDoc, where, deleteDoc, limit, orderBy } from "firebase/firestore";
import { Loader2, MessageSquare, Share2, Copy, Download, Star, X, Send, Image as ImageIcon, Clock, Users, Play, Film } from "lucide-react";
import { toast } from "sonner";
import { registerDownload, submitEditorRating } from "@/app/actions/project-actions";
import { handleNewComment } from "@/app/actions/notification-actions";
import { PaymentButton } from "@/components/payment-button";
import { uploadCommentImage } from "@/lib/firebase/storage-utils";
import { warmVideoInMemory } from "@/lib/video-preload";
import { VideoPlayer } from "@/components/video-player";
import { safeJsonParse, cn } from "@/lib/utils";

// Mux Architecture Cutoff Date: April 12, 2026
const MUX_CUTOFF_DATE = 1775952000000;

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
    createdAt?: number;
};

type RevisionDoc = {
    id: string;
    projectId: string;
    version?: number;
    videoUrl?: string; // Firebase Storage
    playbackId?: string; // Mux Playback ID
    hlsUrl?: string; // Mux HLS URL
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

function getMuxPlaybackSource(revision: RevisionDoc | null | undefined): string {
    if (!revision) return "";
    if (revision.playbackId) return `https://stream.mux.com/${revision.playbackId}.m3u8`;
    return revision.hlsUrl || "";
}

export function ReviewSystemModal({ isOpen, onClose, project, guestPreview = false, guestName, defaultRevisionId }: ReviewSystemModalProps) {
    const { user } = useAuth();
    const fileInputRef = useRef<HTMLInputElement | null>(null);
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
    const [replyingTo, setReplyingTo] = useState<string | null>(null);

    // Video state
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);

    // Payment & Feedback state
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
    const selectedMuxSource = useMemo(
        () => getMuxPlaybackSource(selectedRevision),
        [selectedRevision]
    );

    // Mux-First Architecture Detection
    const isModern = useMemo(() => {
        if (!project?.createdAt) return false;
        return project.createdAt >= MUX_CUTOFF_DATE;
    }, [project?.createdAt]);

    const videoSource = useMemo(() => {
        if (!selectedRevision) return "";
        const muxSrc = getMuxPlaybackSource(selectedRevision);
        if (muxSrc) return muxSrc;
        
        // If it's a modern project and we have no muxSrc yet, it might be processing
        if (isModern && !selectedRevision.playbackId) {
            return "mux://processing";
        }
        
        return selectedRevision.videoUrl || "";
    }, [selectedRevision, isModern]);

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
        if (selectedImagePreview) URL.revokeObjectURL(selectedImagePreview);
        setSelectedImage(null);
        setSelectedImagePreview("");
        setAnnotatedImagePreview("");
        setImageOverlayText("");
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const drawTextOnImage = (imageSrc: string, text: string): Promise<string> => {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d')!;
                canvas.width = img.width;
                canvas.height = img.height;
                ctx.drawImage(img, 0, 0);
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
            drawTextOnImage(selectedImagePreview, imageOverlayText).then(setAnnotatedImagePreview);
        } else {
            setAnnotatedImagePreview("");
        }
    }, [selectedImagePreview, imageOverlayText]);

    const startDownload = async () => {
        if (!project?.id || !selectedRevisionId || !selectedRevision) return;
        setIsDownloading(true);
        try {
            // First, register the download and get the URL
            const res = await registerDownload(project.id, selectedRevisionId);
            if (!res.success || !res.downloadUrl) {
                toast.error(res.error || "Failed to start download.");
                setIsDownloading(false);
                return;
            }

            // Now stream the file through /api/download endpoint
            const downloadResponse = await fetch('/api/download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: res.downloadUrl,
                    fileName: `${project.name || 'video'}_v${selectedRevision.version || 1}.mp4`
                })
            });

            if (!downloadResponse.ok) {
                const errorData = await downloadResponse.json().catch(() => ({}));
                toast.error(errorData.error || "Failed to download video.");
                setIsDownloading(false);
                return;
            }

            // Get the blob and create download link
            const blob = await downloadResponse.blob();
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `${project.name || 'video'}_v${selectedRevision.version || 1}.mp4`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
            
            toast.success("Download started in your browser.");
        } catch (error) {
            console.error("Download error:", error);
            toast.error("An error occurred while downloading.");
        } finally {
            setIsDownloading(false);
        }
    };

    const handleDownloadClick = async () => {
        if (!project?.id || !selectedRevisionId) return;
        if (isClient) {
            if (!isPaymentComplete && !user?.payLater) {
                setPendingDownloadAfterFlow(true);
                setIsPaymentModalOpen(true);
                return;
            }
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
        if (!content && !selectedImage) return null;
        let finalImageFile = selectedImage;
        let finalImagePreview = selectedImagePreview;
        if (selectedImage && imageOverlayText.trim() && selectedImagePreview) {
            try {
                const annotatedDataUrl = await drawTextOnImage(selectedImagePreview, imageOverlayText);
                const response = await fetch(annotatedDataUrl);
                const blob = await response.blob();
                finalImageFile = new File([blob], selectedImage.name, { type: 'image/jpeg' });
                finalImagePreview = annotatedDataUrl;
            } catch (error) {
                console.error('Failed to apply text overlay:', error);
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

    const handleQueueComment = async () => {
        if (!project?.id || !selectedRevisionId) return;
        const draft = await buildDraftComment();
        if (!draft) {
            toast.error("Write a comment or upload an image.");
            return;
        }
        setPendingComments((prev) => [...prev, draft]);
        setNewComment("");
        clearImageSelection();
        toast.success(`Comment queued${draft.isDirectConnection ? " (Direct)" : ` at ${formatTime(draft.timestamp)}`}`);
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
                        userName: user?.displayName || guestName || "User",
                        userRole: (user as any)?.role || "guest",
                        content: queued.content,
                        imageUrl: imageUrl || null,
                        timestamp: queued.timestamp,
                        createdAt: Date.now(),
                        status: "open",
                        replies: [],
                        isDirectConnection: queued.isDirectConnection,
                    });
                    await handleNewComment(project.id, user?.uid || "guest", user?.displayName || guestName || "User", (user as any)?.role || "guest", queued.content, selectedRevisionId);
                    if (queued.imagePreview) URL.revokeObjectURL(queued.imagePreview);
                    sentCount += 1;
                } catch (commentError) {
                    failedQueue.push(queued);
                }
            }
            setNewComment("");
            clearImageSelection();
            setPendingComments(failedQueue);
            if (sentCount > 0) toast.success(`${sentCount} sent.`);
        } finally {
            setUploadingImage(false);
            setSavingComment(false);
        }
    };

    const handleAddReply = async (commentId: string) => {
        if (!newReply[commentId]?.trim()) return;
        try {
            const commentDocRef = doc(db, "comments", commentId);
            const res = await getDocs(query(collection(db, "comments"), where("__name__", "==", commentId)));
            if (!res.empty) {
                const comment = res.docs[0].data();
                const replies = comment.replies || [];
                replies.push({
                    id: `reply_${Date.now()}`,
                    userId: user?.uid || "guest",
                    userName: user?.displayName || guestName || "User",
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
            toast.error("Failed to add reply.");
        }
    };

    const handleDeleteComment = async (commentId: string) => {
        if (!window.confirm("Delete this comment?")) return;
        try {
            const res = await fetch("/api/comments/delete", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ commentId }),
            });
            const payload = await safeJsonParse(res);
            if (!res.ok || !payload?.success) throw new Error(payload?.message || "Failed");
            setComments(p => p.filter(c => c.id !== commentId));
            setDirectConnections(p => p.filter(c => c.id !== commentId));
            toast.success("Deleted.");
        } catch (error) {
            toast.error("Failed to delete.");
        }
    };

    // Revision Polling & Subscriptions
    useEffect(() => {
        if (!isOpen || !project?.id) return;
        setLoadingRevisions(true);
        const q = query(collection(db, "revisions"), where("projectId", "==", project.id));
        const unsub = onSnapshot(q, (snap) => {
            const next = snap.docs.map(d => ({ id: d.id, ...d.data() } as RevisionDoc)).sort((a,b) => (b.version || 0) - (a.version || 0));
            setRevisions(next);
            next.forEach(r => {
                const src = getMuxPlaybackSource(r);
                if (src) warmVideoInMemory(src);
            });
            if (next.length > 0) {
                setSelectedRevisionId(curr => {
                    if (curr && next.find(r => r.id === curr)) return curr;
                    return defaultRevisionId && next.find(r => r.id === defaultRevisionId) ? defaultRevisionId : next[0].id;
                });
            }
            setLoadingRevisions(false);
        });
        return () => unsub();
    }, [isOpen, project?.id, defaultRevisionId]);

    // Mux Sync Polling (Fall-through for localized builds)
    useEffect(() => {
        if (!isOpen || !selectedRevisionId || !user) return;
        const rev = revisions.find(r => r.id === selectedRevisionId);
        if (!rev || rev.playbackId || rev.hlsUrl) return;

        let active = true;
        const check = async () => {
            if (!active) return;
            try {
                const q = query(collection(db, "video_jobs"), where("revisionId", "==", selectedRevisionId));
                const snap = await getDocs(q);
                if (snap.empty) {
                    if (active) setTimeout(check, 10000);
                    return;
                }
                const jobDoc = snap.docs.find(d => d.id !== selectedRevisionId && d.id.length !== 20) || snap.docs.find(d => d.id !== selectedRevisionId);
                if (jobDoc?.id) {
                    const res = await fetch("/api/syncMuxVideo", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ uploadId: jobDoc.id, revisionId: selectedRevisionId })
                    });
                    const data = await safeJsonParse(res);
                    if (data.success && data.playbackId) active = false;
                }
            } catch (e) {}
            if (active) setTimeout(check, 5000);
        };
        check();
        return () => { active = false; };
    }, [isOpen, selectedRevisionId, revisions, user]);

    // Firestore project sync
    useEffect(() => {
        if (!isOpen || !project?.id) return;
        const unsub = onSnapshot(doc(db, "projects", project.id), (snap) => {
            if (!snap.exists()) return;
            const p = snap.data();
            setLiveTotalCost(p.totalCost || 0);
            setLiveAmountPaid(p.amountPaid || 0);
            setLivePaymentStatus(p.paymentStatus || "");
            setLiveEditorRating(p.editorRating || 0);
            setLiveEditorReview(p.editorReview || "");
        });
        return () => unsub();
    }, [isOpen, project?.id]);

    // Comments sync
    useEffect(() => {
        if (!isOpen || !selectedRevisionId) return;
        const q = query(collection(db, "comments"), where("revisionId", "==", selectedRevisionId));
        const unsub = onSnapshot(q, (snap) => {
            const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as CommentDoc)).sort((a,b) => (a.createdAt || 0) - (b.createdAt || 0));
            setComments(all.filter(c => !c.isDirectConnection));
            setDirectConnections(all.filter(c => c.isDirectConnection));
        });
        return () => unsub();
    }, [isOpen, selectedRevisionId]);

    const uiContent = (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full min-h-0">
            {/* Left Column: Video and Versions */}
            <div className="lg:col-span-8 flex flex-col gap-4 overflow-y-auto pr-2 pb-6">
                <div className="flex items-center justify-between">
                    <div className="flex gap-2 bg-muted/30 p-1 rounded-xl border border-border/50">
                        {revisions.map((rev) => (
                            <button
                                key={rev.id}
                                onClick={() => setSelectedRevisionId(rev.id)}
                                className={cn(
                                    "px-4 py-1.5 rounded-lg text-xs font-bold transition-all",
                                    selectedRevisionId === rev.id 
                                        ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" 
                                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                                )}
                            >
                                v{rev.version || "?"}
                            </button>
                        ))}
                    </div>

                    <div className="flex items-center gap-2">
                        {isClient && !isPaymentComplete && user?.payLater && (
                            <div className="hidden sm:block text-[10px] px-3 py-1.5 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-600 font-bold uppercase tracking-wider">
                                Pay Later Active
                            </div>
                        )}
                        <button
                            onClick={handleDownloadClick}
                            disabled={isDownloading || !selectedRevisionId}
                            className="inline-flex items-center gap-2 h-9 px-5 rounded-xl bg-primary text-primary-foreground text-[11px] font-bold uppercase tracking-widest hover:brightness-110 active:scale-95 transition-all shadow-xl shadow-primary/10 disabled:opacity-50"
                        >
                            {isDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                            Download
                        </button>
                    </div>
                </div>

                <div className="relative rounded-2xl border border-border/50 bg-black overflow-hidden shadow-2xl aspect-video">
                    <VideoPlayer
                        videoPath={videoSource}
                        playbackId={selectedRevision?.playbackId}
                        title={`Revision v${selectedRevision?.version}`}
                        watermark={project?.clientName || project?.name}
                        onTimeUpdate={setCurrentTime}
                        onLoadedMetadata={setDuration}
                        className="w-full h-full"
                    />
                </div>

                <div className="p-4 rounded-2xl bg-muted/20 border border-border/50 flex items-center justify-between">
                    <div className="space-y-1">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                            <Share2 className="h-3 w-3" /> External Review Link
                        </div>
                        <div className="text-[10px] text-muted-foreground/70">Clients can review and comment without logging in.</div>
                    </div>
                    <button
                        onClick={() => {
                            const url = `${(process.env.NEXT_PUBLIC_SHORT_LINK_BASE_URL || "https://previewvideo.online").replace(/\/+$/, "")}/r/${selectedRevisionId}`;
                            navigator.clipboard.writeText(url);
                            toast.success("Link copied!");
                        }}
                        className="h-8 px-4 rounded-lg bg-background border border-border text-[10px] font-bold uppercase tracking-wider hover:bg-muted transition-colors active:scale-95"
                    >
                        Copy Link
                    </button>
                </div>
            </div>

            {/* Right Column: Comments */}
            <div className="lg:col-span-4 flex flex-col gap-4 h-[70vh] lg:h-auto min-h-0">
                <div className="flex gap-1 p-1 bg-muted/40 rounded-xl border border-border/50">
                    <button
                        onClick={() => setActiveTab('timeline')}
                        className={cn(
                            "flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all",
                            activeTab === 'timeline' ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        <Clock className="h-3.5 w-3.5" /> Timeline
                    </button>
                    <button
                        onClick={() => setActiveTab('direct')}
                        className={cn(
                            "flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all",
                            activeTab === 'direct' ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        <MessageSquare className="h-3.5 w-3.5" /> Direct
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto space-y-4 pr-1 scrollbar-thin min-h-0">
                    {(activeTab === 'timeline' ? comments : directConnections).length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                            <div className="h-12 w-12 rounded-full bg-muted/30 flex items-center justify-center mb-4">
                                <MessageSquare className="h-6 w-6 text-muted-foreground/50" />
                            </div>
                            <p className="text-sm text-muted-foreground font-medium">No comments yet.</p>
                            <p className="text-[10px] text-muted-foreground/60 uppercase mt-1">Be the first to leave feedback</p>
                        </div>
                    ) : (
                        (activeTab === 'timeline' ? comments : directConnections).map((c) => (
                            <div key={c.id} className="group p-4 rounded-2xl bg-muted/20 border border-border/50 hover:border-primary/20 transition-all space-y-3 relative">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-center gap-2.5">
                                        <div className="h-8 w-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-[10px] font-black text-primary uppercase">
                                            {c.userName?.charAt(0) || "U"}
                                        </div>
                                        <div>
                                            <div className="text-xs font-black text-foreground flex items-center gap-1.5">
                                                {c.userName}
                                                {c.userRole && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-bold uppercase">{c.userRole}</span>}
                                            </div>
                                            <div className="text-[10px] text-muted-foreground flex items-center gap-2">
                                                {formatDate(c.createdAt || 0)}
                                                {c.timestamp > 0 && <span className="text-primary font-black">@{formatTime(c.timestamp)}</span>}
                                            </div>
                                        </div>
                                    </div>
                                    {(user?.uid === c.userId || isAdmin || isStaff) && (
                                        <button onClick={() => handleDeleteComment(c.id)} className="opacity-0 group-hover:opacity-100 p-1.5 text-muted-foreground hover:text-destructive transition-all">
                                            <X className="h-4 w-4" />
                                        </button>
                                    )}
                                </div>
                                
                                <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed pl-1">
                                    {c.content}
                                </div>

                                {c.imageUrl && (
                                    <div className="relative rounded-xl border border-border/50 overflow-hidden bg-black/5 flex justify-center">
                                        <img src={c.imageUrl} className="max-h-60 object-contain w-full" alt="Comment attachment" />
                                        <a href={c.imageUrl} target="_blank" rel="noreferrer" className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 text-white hover:bg-black transition-all">
                                            <Download className="h-3.5 w-3.5" />
                                        </a>
                                    </div>
                                )}

                                {c.replies && c.replies.length > 0 && (
                                    <div className="mt-3 pl-4 border-l-2 border-border/30 space-y-3">
                                        {c.replies.map((reply) => (
                                            <div key={reply.id} className="space-y-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] font-black text-foreground">{reply.userName}</span>
                                                    <span className="text-[9px] text-muted-foreground uppercase">{formatDate(reply.createdAt)}</span>
                                                </div>
                                                <p className="text-xs text-muted-foreground">{reply.content}</p>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))
                    )}

                    {/* Pending comments being queued */}
                    {pendingComments.filter(p => p.isDirectConnection === (activeTab === 'direct')).map((pc) => (
                        <div key={pc.id} className="p-4 rounded-2xl bg-primary/5 border border-primary/20 space-y-3 opacity-70">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-black text-primary uppercase">Q</div>
                                    <div className="text-[10px] font-bold text-primary uppercase tracking-wider">Queued Comment {pc.timestamp > 0 && `@ ${formatTime(pc.timestamp)}`}</div>
                                </div>
                                <button onClick={() => setPendingComments(p => p.filter(x => x.id !== pc.id))} className="text-muted-foreground hover:text-destructive"><X className="h-3.5 w-3.5" /></button>
                            </div>
                            {pc.content && <p className="text-xs text-foreground/80">{pc.content}</p>}
                            {pc.imagePreview && <img src={pc.imagePreview} className="max-h-24 rounded-lg" />}
                        </div>
                    ))}
                </div>

                {/* Comment Input Area */}
                <div className="space-y-3 pt-3 border-t border-border/50">
                    <div className="p-4 rounded-2xl bg-muted/30 border border-border/50 space-y-3">
                        <div className="relative">
                            <textarea
                                value={newComment}
                                onChange={(e) => setNewComment(e.target.value)}
                                placeholder={activeTab === 'timeline' ? "Type a comment at this timestamp..." : "Message editor directly..."}
                                className="w-full text-sm bg-transparent border-none resize-none focus:outline-none min-h-[60px]"
                            />
                            {activeTab === 'timeline' && (
                                <div className="absolute right-0 bottom-0 text-[10px] font-black text-primary bg-primary/10 px-2 py-1 rounded-md mb-2 mr-2">
                                    {formatTime(currentTime)}
                                </div>
                            )}
                        </div>

                        {selectedImagePreview && (
                            <div className="relative rounded-xl border border-border/50 overflow-hidden bg-black/20 p-2">
                                <img src={annotatedImagePreview || selectedImagePreview} className="max-h-32 rounded-lg mx-auto" />
                                <button onClick={clearImageSelection} className="absolute top-3 right-3 p-1 rounded-full bg-black/60 text-white hover:bg-black"><X className="h-3 w-3" /></button>
                                <input 
                                    type="text"
                                    value={imageOverlayText}
                                    onChange={(e) => setImageOverlayText(e.target.value)}
                                    placeholder="Add text overlay..."
                                    className="w-full mt-2 text-[10px] bg-background/50 border border-border/30 rounded-lg p-2 focus:outline-none"
                                />
                            </div>
                        )}

                        <div className="flex items-center justify-between border-t border-border/30 pt-3">
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className="p-2 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
                                    title="Attach screenshot"
                                >
                                    <ImageIcon className="h-4 w-4" />
                                </button>
                                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageSelect} />
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handleQueueComment}
                                    className="h-8 px-4 rounded-lg text-[10px] font-black uppercase tracking-wider text-muted-foreground hover:bg-muted transition-colors"
                                >
                                    Queue
                                </button>
                                <button
                                    onClick={handleSendQueuedComments}
                                    disabled={savingComment || (!newComment.trim() && !selectedImage && pendingComments.length === 0)}
                                    className="h-8 px-5 rounded-lg bg-primary text-primary-foreground text-[10px] font-black uppercase tracking-widest hover:brightness-110 active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50"
                                >
                                    {savingComment ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                                    Send {pendingComments.length > 0 ? `(${pendingComments.length + (newComment.trim() || selectedImage ? 1 : 0)})` : ""}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );

    if (guestPreview) {
        return (
            <div className="min-h-screen bg-background p-6 md:p-8">
                <div className="max-w-[1600px] mx-auto space-y-8">
                    <div className="flex items-center justify-between">
                        <div className="space-y-1">
                            <h1 className="text-3xl font-black text-foreground flex items-center gap-3">
                                {project?.name || "Project Review"}
                                <span className="text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 uppercase tracking-widest font-black">Guest Access</span>
                            </h1>
                            <p className="text-sm text-muted-foreground">Welcome, <span className="text-foreground font-bold">{guestName || "Guest"}</span>. Leave your feedback below.</p>
                        </div>
                    </div>
                    {uiContent}
                </div>
            </div>
        );
    }

    return (
        <>
            <Modal
                isOpen={isOpen}
                onClose={onClose}
                title={`Review // ${project?.name || "System"}`}
                maxWidth="max-w-7xl"
            >
                <div className="mt-6">
                    {uiContent}
                </div>
            </Modal>

            {/* Payment Modal */}
            <Modal
                isOpen={isPaymentModalOpen && isClient}
                onClose={() => setIsPaymentModalOpen(false)}
                title="Complete Final Payment"
                maxWidth="max-w-lg"
            >
                <div className="space-y-6 mt-4">
                    <div className="p-5 rounded-2xl border border-border bg-muted/20 space-y-3">
                        <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Project Total (Incl. GST)</span>
                            <span className="font-bold text-foreground">₹{(liveTotalCost * 1.18).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Paid Amount</span>
                            <span className="font-bold text-emerald-500">₹{paidSoFarInclusive.toLocaleString()}</span>
                        </div>
                        <div className="h-px bg-border my-2" />
                        <div className="flex justify-between items-end">
                            <span className="text-xs font-black uppercase tracking-widest text-primary">Final Balance</span>
                            <span className="text-2xl font-black text-primary">₹{remainingAmount.toLocaleString()}</span>
                        </div>
                    </div>

                    <PaymentButton
                        projectId={project?.id || ""}
                        user={user}
                        amount={remainingAmount}
                        accountingAmount={remainingBaseAmount}
                        description={`Final Balance: ${project?.name || "Project"}`}
                        prefill={{ name: user?.displayName || "", email: user?.email || "" }}
                        onSuccess={async () => {
                            if (!project?.id) return;
                            await updateDoc(doc(db, "projects", project.id), { paymentStatus: "full_paid", amountPaid: liveTotalCost, updatedAt: Date.now() });
                            setLivePaymentStatus("full_paid");
                            setLiveAmountPaid(liveTotalCost);
                            setIsPaymentModalOpen(false);
                            setTimeout(() => setIsFeedbackModalOpen(true), 400);
                            toast.success("Payment confirmed!");
                        }}
                    />
                </div>
            </Modal>

            {/* Feedback Modal */}
            <Modal
                isOpen={isFeedbackModalOpen && isClient}
                onClose={() => setIsFeedbackModalOpen(false)}
                title="Editor Rating & Review"
                maxWidth="max-w-md"
            >
                <div className="space-y-6 mt-4 text-center">
                    <p className="text-sm text-muted-foreground leading-relaxed">How was your experience with the editor? Your rating helps us maintain quality.</p>

                    <div className="flex justify-center gap-2">
                        {[1, 2, 3, 4, 5].map((star) => (
                            <button
                                key={star}
                                onClick={() => setEditorRating(star)}
                                className={cn(
                                    "p-3 rounded-2xl transition-all duration-300",
                                    editorRating >= star ? "text-yellow-400 bg-yellow-400/10 scale-110" : "text-muted-foreground hover:text-yellow-400/50 bg-muted/20"
                                )}
                            >
                                <Star className={cn("h-8 w-8", editorRating >= star && "fill-yellow-400")} />
                            </button>
                        ))}
                    </div>

                    <textarea
                        value={editorReview}
                        onChange={(e) => setEditorReview(e.target.value)}
                        placeholder="Write a short review..."
                        className="w-full h-32 resize-none rounded-2xl border border-border bg-background p-4 text-sm focus:ring-2 focus:ring-primary/20 transition-all outline-none"
                    />

                    <button
                        onClick={handleSubmitFeedback}
                        disabled={isSubmittingFeedback || editorRating === 0}
                        className="w-full h-12 rounded-xl bg-primary text-primary-foreground text-[12px] font-black uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50 shadow-xl shadow-primary/20"
                    >
                        {isSubmittingFeedback ? <Loader2 className="h-5 w-5 animate-spin mx-auto" /> : "Submit & Start Download"}
                    </button>
                </div>
            </Modal>
        </>
    );
}
