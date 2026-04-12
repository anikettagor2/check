"use client";

import { useEffect, useState, useRef } from "react";
import { db } from "@/lib/firebase/config";
import {
    doc,
    getDoc,
    collection,
    query,
    where,
    onSnapshot,
    addDoc,
} from "firebase/firestore";
import {
    Loader2,
    ShieldAlert,
    Lock,
    Clock,
    Send,
    Image as ImageIcon,
    MessageCircle,
} from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { handleNewComment } from "@/app/actions/notification-actions";
import { VideoPlayer } from "@/components/video-player";

// ── Types ─────────────────────────────────────────────────────────────────────
type RevisionData = {
    id: string;
    projectId: string;
    version?: number;
    playbackId?: string;
    hlsUrl?: string;
    videoUrl?: string;
    description?: string;
    createdAt?: number;
};

type CommentDoc = {
    id: string;
    timestamp: number;
    content: string;
    userName?: string;
    userRole?: string;
    createdAt?: number;
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface GuestReviewPageClientProps {
    revisionId: string;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function GuestReviewPageClient({ revisionId }: GuestReviewPageClientProps) {
    // Data state
    const [revision, setRevision] = useState<RevisionData | null>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [project, setProject] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [revisionValid, setRevisionValid] = useState(true);

    // Guest gate
    const [guestName, setGuestName] = useState("");
    const [isIdentified, setIsIdentified] = useState(false);

    // Player state
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);

    // Comments
    const [comments, setComments] = useState<CommentDoc[]>([]);
    const [newComment, setNewComment] = useState("");
    const [savingComment, setSavingComment] = useState(false);
    const [activeTab, setActiveTab] = useState<"timeline" | "direct">("timeline");

    const commentsEndRef = useRef<HTMLDivElement>(null);

    // ── Load revision by ID directly ───────────────────────────────────────────
    useEffect(() => {
        if (!revisionId) return;

        const unsub = onSnapshot(
            doc(db, "revisions", revisionId),
            async (revSnap) => {
                if (!revSnap.exists()) {
                    toast.error("Review link is invalid or expired.");
                    setRevisionValid(false);
                    setLoading(false);
                    return;
                }

                const data = { id: revSnap.id, ...revSnap.data() } as RevisionData;
                setRevision(data);

                // Load project info for display
                if (!project && data.projectId) {
                    try {
                        const projSnap = await getDoc(doc(db, "projects", data.projectId));
                        if (projSnap.exists()) {
                            setProject({ id: projSnap.id, ...projSnap.data() });
                        }
                    } catch { /* non-critical */ }
                }

                setLoading(false);
            },
            (err) => {
                console.error("Failed to load review data:", err);
                toast.error("Error loading review.");
                setLoading(false);
            }
        );

        return () => unsub();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [revisionId]);

    // ── Watermark ──────────────────────────────────────────────────────────────
    useEffect(() => {
        const name = project?.clientName || project?.name;
        if (!name) return;
        document.body.dataset.watermarkName = name;
        return () => { delete document.body.dataset.watermarkName; };
    }, [project]);

    // ── Load comments (after guest is identified) ──────────────────────────────
    useEffect(() => {
        if (!revisionId || !isIdentified) return;

        const q = query(collection(db, "comments"), where("revisionId", "==", revisionId));
        const unsub = onSnapshot(q, (snap) => {
            const next = snap.docs
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .map((d) => ({ id: d.id, ...(d.data() as any) } as CommentDoc))
                .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
            setComments(next);
        });

        return () => unsub();
    }, [revisionId, isIdentified]);

    // Auto-scroll comments
    useEffect(() => {
        commentsEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [comments]);

    // ── Handlers ──────────────────────────────────────────────────────────────
    const handleIdentify = (e: React.FormEvent) => {
        e.preventDefault();
        if (!guestName.trim()) {
            toast.error("Please enter your name to continue.");
            return;
        }
        setIsIdentified(true);
    };

    const handleAddComment = async () => {
        if (!revision || !guestName || !newComment.trim()) {
            toast.error("Write a comment first.");
            return;
        }

        setSavingComment(true);
        try {
            await addDoc(collection(db, "comments"), {
                projectId: revision.projectId,
                revisionId: revision.id,
                userId: "guest",
                userName: `${guestName} (Guest)`,
                userRole: "guest",
                content: newComment.trim(),
                timestamp: currentTime,
                createdAt: Date.now(),
                status: "open",
            });

            await handleNewComment(
                revision.projectId,
                "guest",
                `${guestName} (Guest)`,
                "client",
                newComment.trim(),
                revision.id
            );

            setNewComment("");
            toast.success(`Comment added at ${formatTime(currentTime)}`);
        } catch (err) {
            console.error("Add comment failed:", err);
            toast.error("Failed to add comment.");
        } finally {
            setSavingComment(false);
        }
    };

    // ── Loading ───────────────────────────────────────────────────────────────
    if (loading) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-muted-foreground text-sm font-medium">Initializing Secure Review Link...</p>
                </div>
            </div>
        );
    }

    // ── Invalid link ──────────────────────────────────────────────────────────
    if (!revisionValid || !revision) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center p-6 text-center">
                <div className="max-w-md space-y-4">
                    <div className="h-16 w-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto border border-red-500/20">
                        <ShieldAlert className="h-8 w-8 text-red-500" />
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight text-white">Review Link Expired</h1>
                    <p className="text-muted-foreground text-sm leading-relaxed">
                        This review link is no longer valid. Please contact the project administrator for a new link.
                    </p>
                </div>
            </div>
        );
    }

    // ── Name gate ─────────────────────────────────────────────────────────────
    if (!isIdentified) {
        return (
            <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-6">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="w-full max-w-sm"
                >
                    <div className="text-center space-y-2 mb-8">
                        <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mx-auto border border-primary/20 mb-4">
                            <Lock className="h-6 w-6 text-primary" />
                        </div>
                        <h2 className="text-xl font-bold text-white tracking-tight">Access Shared Review</h2>
                        <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">
                            {project?.name || "Video Project"}
                        </p>
                    </div>

                    <form onSubmit={handleIdentify} className="space-y-4 bg-muted/20 p-8 rounded-2xl border border-white/5 backdrop-blur-sm">
                        <div className="space-y-2">
                            <label className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Your Name</label>
                            <input
                                autoFocus
                                type="text"
                                value={guestName}
                                onChange={(e) => setGuestName(e.target.value)}
                                placeholder="Enter your full name"
                                className="w-full h-11 bg-black/40 border border-white/10 rounded-lg px-4 text-sm focus:outline-none focus:border-primary/50 transition-all text-white"
                            />
                        </div>
                        <button
                            type="submit"
                            className="w-full h-11 bg-primary text-primary-foreground rounded-lg text-sm font-bold uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-all"
                        >
                            Start Reviewing
                        </button>
                    </form>
                </motion.div>
            </div>
        );
    }

    // ── Main review view ──────────────────────────────────────────────────────
    const videoTitle = `${project?.name || "Project"} · V${revision.version || "Draft"}`;
    // Only use Mux sources for streaming — ignore raw Firebase Storage videoUrl
    const isFirebaseUrl = !!(revision.videoUrl && revision.videoUrl.includes('firebasestorage'));
    const hasMuxSource = !!(revision.playbackId || revision.hlsUrl);
    const hasVideo = hasMuxSource || (!!revision.videoUrl && !isFirebaseUrl);
    // Show processing state if: video is a mux:// placeholder OR it's a Firebase URL with no playbackId (migration needed)
    const isProcessing = (revision.videoUrl?.startsWith("mux://") && !revision.playbackId) || (isFirebaseUrl && !hasMuxSource);

    return (
        <div className="min-h-screen bg-[#0a0a0a] text-foreground">
            <div className="container mx-auto px-4 py-6 max-w-7xl">
                {/* Header */}
                <div className="mb-6">
                    <h1 className="text-2xl font-bold tracking-tight">
                        Review:{" "}
                        <span className="text-foreground">{project?.name || "Video Review"}</span>
                        {project?.clientName && (
                            <span className="ml-3 text-base font-normal text-muted-foreground">({project.clientName})</span>
                        )}
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Guest preview · you can watch and comment on this video
                    </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {/* Left: Video + timeline */}
                    <div className="lg:col-span-8 space-y-4">
                        {/* Version pill */}
                        <div className="flex items-center gap-3">
                            <span className="text-sm text-muted-foreground font-bold uppercase tracking-widest">Draft Versions</span>
                            <span className="px-3 py-1 rounded-lg text-sm font-bold border bg-primary/15 border-primary/40 text-primary">
                                v{revision.version || "1"}
                            </span>
                        </div>

                        {/* Video player */}
                        <div
                            className="rounded-xl border border-border bg-black overflow-hidden aspect-video relative"
                            data-watermark-name={project?.clientName || project?.name || "Guest"}
                        >
                            {isProcessing ? (
                                <div className="h-full w-full flex flex-col items-center justify-center text-muted-foreground gap-3 bg-muted/10">
                                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                                    <div className="text-sm font-bold uppercase tracking-widest text-primary">Processing Video</div>
                                    <div className="text-[10px] uppercase tracking-widest opacity-70">Securing high-quality playback format…</div>
                                </div>
                            ) : hasVideo ? (
                                <VideoPlayer
                                    playbackId={revision.playbackId}
                                    videoPath={revision.hlsUrl || ""}
                                    title={videoTitle}
                                    metadata={{
                                        video_id: revision.id,
                                        video_title: videoTitle,
                                        viewer_user_id: guestName || "guest",
                                    }}
                                    onTimeUpdate={(time, dur) => {
                                        setCurrentTime(time);
                                        if (dur && !isNaN(dur)) setDuration(dur);
                                    }}
                                    onLoadedMetadata={(dur) => {
                                        if (dur && !isNaN(dur)) setDuration(dur);
                                    }}
                                    primaryColor="#ffffff"
                                    className="w-full h-full"
                                />
                            ) : (
                                <div className="h-full w-full flex flex-col items-center justify-center text-muted-foreground gap-3 bg-muted/10">
                                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                                    <div className="text-sm font-bold uppercase tracking-widest text-primary">Preparing Video…</div>
                                    <div className="text-[10px] uppercase tracking-widest opacity-70">This may take a moment</div>
                                </div>
                            )}
                        </div>

                        {/* Timeline scrubber (shown after video loads) */}
                        {duration > 0 && (
                            <div className="space-y-2">
                                <div className="text-sm text-muted-foreground font-bold uppercase tracking-widest flex items-center gap-2">
                                    <Clock className="h-4 w-4" />
                                    Timeline · {formatTime(currentTime)} / {formatTime(duration)}
                                </div>
                                <div className="relative w-full h-6">
                                    <div className="absolute top-1/2 -translate-y-1/2 w-full h-1.5 bg-muted rounded-full" />
                                    {/* Comment markers */}
                                    {comments.map((c) => {
                                        const left = duration > 0 ? (c.timestamp / duration) * 100 : 0;
                                        return (
                                            <button
                                                key={c.id}
                                                title={`${formatTime(c.timestamp)} — ${c.userName || "User"}`}
                                                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-3 w-3 rounded-full bg-primary border border-background"
                                                style={{ left: `${left}%` }}
                                            />
                                        );
                                    })}
                                    {/* Playhead */}
                                    <div
                                        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-4 w-1.5 rounded bg-emerald-500"
                                        style={{ left: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Right: Comments sidebar */}
                    <div className="lg:col-span-4 border border-border rounded-xl bg-muted/20 flex flex-col min-h-[480px] max-h-[80vh]">
                        {/* Tabs */}
                        <div className="flex gap-2 p-4 pb-0">
                            <button
                                onClick={() => setActiveTab("timeline")}
                                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-colors ${
                                    activeTab === "timeline"
                                        ? "bg-primary text-primary-foreground"
                                        : "bg-muted/40 text-muted-foreground hover:bg-muted/60"
                                }`}
                            >
                                <Clock className="h-3.5 w-3.5" />
                                Timeline
                            </button>
                            <button
                                onClick={() => setActiveTab("direct")}
                                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-colors ${
                                    activeTab === "direct"
                                        ? "bg-primary text-primary-foreground"
                                        : "bg-muted/40 text-muted-foreground hover:bg-muted/60"
                                }`}
                            >
                                <MessageCircle className="h-3.5 w-3.5" />
                                Direct
                            </button>
                        </div>

                        {/* Comment count */}
                        <div className="px-4 pt-3 pb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                            {activeTab === "timeline" ? "Timeline" : "Direct"} Comments ({comments.length})
                        </div>

                        {/* Comment input: At timestamp */}
                        <div className="px-4 pb-3">
                            <textarea
                                placeholder={`Add comment at ${formatTime(currentTime)}…`}
                                value={newComment}
                                onChange={(e) => setNewComment(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && !e.shiftKey) {
                                        e.preventDefault();
                                        handleAddComment();
                                    }
                                }}
                                rows={2}
                                className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-primary/50 transition-all text-white placeholder:text-muted-foreground"
                            />
                            <div className="flex gap-2 mt-2">
                                <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted/40 text-muted-foreground text-xs font-bold uppercase tracking-widest hover:bg-muted/60 transition-all">
                                    <ImageIcon className="h-3.5 w-3.5" /> Image
                                </button>
                                <button
                                    onClick={handleAddComment}
                                    disabled={savingComment || !newComment.trim()}
                                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold uppercase tracking-widest hover:brightness-110 transition-all disabled:opacity-50"
                                >
                                    {savingComment ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                        <Send className="h-3.5 w-3.5" />
                                    )}
                                    Send
                                </button>
                            </div>
                        </div>

                        {/* Comments list */}
                        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3">
                            {comments.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground py-8">
                                    <MessageCircle className="h-6 w-6 opacity-20" />
                                    <p className="text-xs">No {activeTab === "timeline" ? "timeline" : "direct"} comments yet.</p>
                                </div>
                            ) : (
                                comments.map((c) => (
                                    <div key={c.id} className="rounded-lg bg-black/30 border border-white/5 p-3 space-y-1">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-bold text-primary">{c.userName || "Guest"}</span>
                                            <span className="text-[10px] text-muted-foreground font-mono">{formatTime(c.timestamp)}</span>
                                        </div>
                                        <p className="text-sm text-foreground leading-relaxed">{c.content}</p>
                                    </div>
                                ))
                            )}
                            <div ref={commentsEndRef} />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
