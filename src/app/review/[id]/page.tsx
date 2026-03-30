"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { db } from "@/lib/firebase/config";
import { 
    doc, 
    getDoc, 
    collection, 
    query, 
    where, 
    onSnapshot, 
    addDoc, 
    getDocs 
} from "firebase/firestore";
import { 
    Loader2, 
    Play, 
    Pause,
    MessageSquare, 
    ShieldAlert, 
    User as UserIcon,
    Clock,
    Lock
} from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { handleNewComment } from "@/app/actions/notification-actions";

type RevisionDoc = {
    id: string;
    projectId: string;
    version?: number;
    videoUrl?: string;
    hlsUrl?: string;
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

function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
}

export default function GuestReviewPage() {
    const params = useParams();
    const router = useRouter();
    const revisionId = params.id as string;

    const [revision, setRevision] = useState<RevisionDoc | null>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [project, setProject] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    
    // Guest info state
    const [guestName, setGuestName] = useState("");
    const [isIdentified, setIsIdentified] = useState(false);

    // Review system state
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const [comments, setComments] = useState<CommentDoc[]>([]);
    const [newComment, setNewComment] = useState("");
    const [savingComment, setSavingComment] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isBuffering, setIsBuffering] = useState(false);
    const [networkTier] = useState<"low" | "medium" | "high">("high");
    const [streamMode, setStreamMode] = useState<"hls" | "direct">("direct");
    const [videoReady, setVideoReady] = useState(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hlsInstanceRef = useRef<any>(null);

    useEffect(() => {
        if (!revisionId) return;

        // Use onSnapshot so we auto-upgrade from MP4→HLS the moment
        // the Cloud Function finishes transcoding and writes `hlsUrl`.
        const unsub = onSnapshot(
            doc(db, "revisions", revisionId),
            async (revSnap) => {
                if (!revSnap.exists()) {
                    toast.error("Review link is invalid or expired.");
                    setLoading(false);
                    return;
                }
                const revData = { id: revSnap.id, ...revSnap.data() } as RevisionDoc;
                setRevision(revData);

                // Load project once (only needed on first snapshot)
                if (!project) {
                    try {
                        const projSnap = await getDoc(doc(db, "projects", revData.projectId));
                        if (projSnap.exists()) {
                            setProject({ id: projSnap.id, ...projSnap.data() });
                        }
                    } catch { /* non-critical */ }
                }

                setLoading(false);
            },
            (error) => {
                console.error("Failed to load review data:", error);
                toast.error("Error loading review system.");
                setLoading(false);
            }
        );

        return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [revisionId]);

    // ── Watermark: push client name to <body> the moment project loads ──
    useEffect(() => {
        const name = project?.clientName || project?.name;
        if (!name) return;
        document.body.dataset.watermarkName = name;
        return () => { delete document.body.dataset.watermarkName; };
    }, [project]);

    useEffect(() => {
        if (!revisionId || !isIdentified) return;

        const q = query(collection(db, "comments"), where("revisionId", "==", revisionId));
        const unsub = onSnapshot(q, (snap) => {
            const next = snap.docs
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .map((doc) => ({ id: doc.id, ...(doc.data() as any) } as CommentDoc))
                .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
            setComments(next);
        });

        return () => unsub();
    }, [revisionId, isIdentified]);

    const handleIdentify = (e: React.FormEvent) => {
        e.preventDefault();
        if (!guestName.trim()) {
            toast.error("Please enter your name to continue.");
            return;
        }
        setIsIdentified(true);
    };

    useEffect(() => {
        if (!isIdentified || !videoRef.current || !revision?.videoUrl) return;

        const videoElement = videoRef.current;
        const hlsSource = revision.hlsUrl || (revision.videoUrl.includes(".m3u8") ? revision.videoUrl : null);
        let disposed = false;

        setVideoReady(false);
        setIsBuffering(false);

        const cleanupHls = () => {
            if (hlsInstanceRef.current) {
                hlsInstanceRef.current.destroy();
                hlsInstanceRef.current = null;
            }
        };

        const initPlayback = async () => {
            cleanupHls();

            if (!hlsSource) {
                // Direct MP4 — set src directly, same as review-system-modal
                videoElement.src = revision.videoUrl || "";
                videoElement.load();
                setStreamMode("direct");
                return;
            }

            const { default: Hls } = await import("hls.js");
            if (disposed) return;

            if (Hls.isSupported()) {
                const hls = new Hls({
                    enableWorker: true,
                    lowLatencyMode: true,
                    startFragPrefetch: true,
                    maxBufferLength: 20,
                    maxMaxBufferLength: 40,
                    backBufferLength: 15,
                    capLevelToPlayerSize: true,
                    startLevel: -1,
                    fragLoadingRetryDelay: 500,
                    manifestLoadingRetryDelay: 500,
                });

                hls.loadSource(hlsSource);
                hls.attachMedia(videoElement);
                hlsInstanceRef.current = hls;
                setStreamMode("hls");
                return;
            }

            // Safari native HLS
            if (videoElement.canPlayType("application/vnd.apple.mpegurl")) {
                videoElement.src = hlsSource;
                setStreamMode("hls");
                return;
            }

            // Final fallback — direct MP4
            videoElement.src = revision.videoUrl || "";
            videoElement.load();
            setStreamMode("direct");
        };

        initPlayback().catch(() => {
            videoElement.src = revision.videoUrl || "";
            setStreamMode("direct");
        });

        return () => {
            disposed = true;
            cleanupHls();
        };
    }, [isIdentified, revision?.id, revision?.videoUrl, revision?.hlsUrl]);

    const handleAddComment = async () => {
        if (!revision || !guestName) return;
        if (!newComment.trim()) {
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

            const notifyResult = await handleNewComment(
                revision.projectId,
                "guest",
                `${guestName} (Guest)`,
                "client",
                newComment.trim(),
                revision.id
            );

            if (!notifyResult.success) {
                console.error("[WhatsApp] Guest comment notification failed:", notifyResult.error);
            }

            setNewComment("");
            toast.success(`Comment added at ${formatTime(currentTime)}`);
        } catch (error) {
            console.error("Add comment failed:", error);
            toast.error("Failed to add comment.");
        } finally {
            setSavingComment(false);
        }
    };

    const seekTo = (time: number) => {
        if (!videoRef.current) return;
        videoRef.current.currentTime = time;
        setCurrentTime(time);
    };

    const togglePlayback = async () => {
        if (!videoRef.current) return;
        // Don't try to play if video hasn't loaded yet
        if (!videoReady || !duration) {
            toast.error("Video is still loading, please wait.");
            return;
        }
        try {
            if (videoRef.current.paused) {
                await videoRef.current.play();
                setIsPlaying(true);
            } else {
                videoRef.current.pause();
                setIsPlaying(false);
            }
        } catch (error) {
            console.error("Playback toggle failed:", error);
            // Don't show toast — the video controls handle this naturally
        }
    };

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

    if (!revision) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center p-6 text-center">
                <div className="max-w-md space-y-4">
                    <div className="h-16 w-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto border border-red-500/20">
                        <ShieldAlert className="h-8 w-8 text-red-500" />
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight text-white">Review Link Expired</h1>
                    <p className="text-muted-foreground text-sm leading-relaxed">
                        This review link is no longer valid. Please contact the project administrator for a new shareable link.
                    </p>
                </div>
            </div>
        );
    }

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
                        <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">{project?.name || "Video Project"}</p>
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
                                className="w-full h-11 bg-black/40 border border-white/10 rounded-lg px-4 text-sm focus:outline-none focus:border-primary/50 transition-all"
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

    return (
        <div className="min-h-screen bg-[#050505] text-white flex flex-col">
            {/* Header */}
            <header className="h-16 border-b border-white/5 px-6 flex items-center justify-between backdrop-blur-md bg-black/40 sticky top-0 z-50">
                <div className="flex items-center gap-4">
                    <div className="flex flex-col">
                        <h1 className="text-sm font-bold tracking-tight">{project?.name || "Project Review"}</h1>
                        <span className="text-[10px] font-bold text-primary uppercase tracking-[0.2em]">Revision v{revision.version || 1}</span>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10">
                        <UserIcon className="h-3 w-3 text-muted-foreground" />
                        <span className="text-[11px] font-semibold text-muted-foreground">{guestName}</span>
                    </div>
                </div>
            </header>

            <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden h-[calc(100vh-64px)]">
                {/* Video Player Section */}
                <div className="lg:col-span-8 flex flex-col p-6 bg-black/20">
                    <div className="flex-1 flex flex-col min-h-0">
                        <div 
                            className="relative rounded-2xl overflow-hidden bg-black aspect-video group shadow-2xl border border-white/5"
                            data-watermark-name={project?.clientName || project?.name || "Client Review"}
                        >
                            {/* Loading skeleton — shown until video metadata is ready */}
                            {!videoReady && (
                                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black gap-3">
                                    <div className="relative w-12 h-12">
                                        <div className="absolute inset-0 border-2 border-white/10 rounded-full" />
                                        <div className="absolute inset-0 border-2 border-primary rounded-full border-t-transparent animate-spin" />
                                    </div>
                                    <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Loading video...</span>
                                </div>
                            )}
                            {/* HLS processing banner — shown when video is playable but HLS is still being generated */}
                            {videoReady && !revision?.hlsUrl && streamMode === "direct" && (
                                <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/70 border border-yellow-500/30 backdrop-blur-sm">
                                    <div className="h-1.5 w-1.5 rounded-full bg-yellow-400 animate-pulse" />
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-yellow-400">Optimizing for smooth playback…</span>
                                </div>
                            )}
                            {/* HLS active badge */}
                            {videoReady && streamMode === "hls" && (
                                <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/70 border border-emerald-500/30 backdrop-blur-sm">
                                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">HD Stream</span>
                                </div>
                            )}
                            <video
                                ref={videoRef}
                                data-watermark-name={project?.clientName || project?.name}
                                className="h-full w-full outline-none"
                                controls
                                preload="metadata"
                                playsInline
                                onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                                onLoadedMetadata={(e) => {
                                    setDuration(e.currentTarget.duration);
                                    setVideoReady(true);
                                    setIsBuffering(false);
                                }}
                                onPlaying={() => {
                                    setIsPlaying(true);
                                    setIsBuffering(false);
                                }}
                                onPause={() => setIsPlaying(false)}
                                onWaiting={() => { if (videoReady) setIsBuffering(true); }}
                                onCanPlay={() => setIsBuffering(false)}
                                onCanPlayThrough={() => setIsBuffering(false)}
                                onStalled={() => { if (videoReady) setIsBuffering(true); }}
                                onError={() => {
                                    setIsBuffering(false);
                                    setVideoReady(false);
                                }}
                                controlsList="nodownload"
                                onContextMenu={(e) => e.preventDefault()}
                            />

                            {/* Custom Overlay for better UI */}

                            <div className="absolute top-4 left-4 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
                                <span className="px-2 py-1 bg-black/60 backdrop-blur-sm rounded text-[10px] font-bold border border-white/10 uppercase tracking-widest">
                                    Guest Review Mode
                                </span>
                            </div>
                        </div>

                        {/* Controls/Timeline */}
                        <div className="mt-6 space-y-4">
                            <div className="flex items-center justify-between gap-3">
                                <button
                                    onClick={togglePlayback}
                                    className="h-9 px-4 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10 text-[10px] font-bold uppercase tracking-widest transition-all flex items-center gap-2"
                                >
                                    {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                                    {isPlaying ? "Pause" : "Play"}
                                </button>
                                {isBuffering && (
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400">
                                        Buffering...
                                    </span>
                                )}
                            </div>

                            <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-widest text-muted-foreground px-1">
                                <div className="flex gap-4">
                                    <span className="text-primary">{formatTime(currentTime)}</span>
                                    <span>{formatTime(duration)}</span>
                                </div>
                                <span className="opacity-60">{streamMode === "hls" ? `Adaptive ${networkTier}` : "Click on timeline to seek"}</span>
                            </div>

                            <div
                                className="relative h-1.5 bg-white/5 rounded-full cursor-pointer overflow-hidden border border-white/5"
                                onClick={(e) => {
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    const x = e.clientX - rect.left;
                                    const progress = Math.max(0, Math.min(1, x / rect.width));
                                    seekTo(progress * (duration || 0));
                                }}
                            >
                                <div
                                    className="absolute inset-y-0 left-0 bg-primary transition-all duration-100"
                                    style={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
                                />
                                {comments.map((c) => (
                                    <div
                                        key={c.id}
                                        className="absolute top-0 w-1.5 h-full bg-yellow-400/60 blur-[1px] hover:bg-yellow-400 transition-all cursor-help"
                                        style={{ left: `${(c.timestamp / (duration || 1)) * 100}%` }}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            seekTo(c.timestamp);
                                        }}
                                        title={`Comment at ${formatTime(c.timestamp)}`}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Sidebar - Comments */}
                <div className="lg:col-span-4 border-l border-white/5 flex flex-col bg-black/40 backdrop-blur-sm min-h-0">
                    <div className="p-4 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                        <div className="flex items-center gap-2">
                            <MessageSquare className="h-4 w-4 text-primary" />
                            <h2 className="text-xs font-bold uppercase tracking-widest">Feedback Panel</h2>
                        </div>
                        <span className="px-2 py-0.5 bg-white/10 rounded-full text-[10px] font-bold">{comments.length}</span>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
                        {comments.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-48 text-center px-8 opacity-40">
                                <MessageSquare className="h-8 w-8 mb-3" />
                                <p className="text-[11px] font-medium leading-relaxed">No comments yet. Go to a specific time in the video and add your feedback below.</p>
                            </div>
                        ) : (
                            comments.map((comment) => (
                                <div
                                    key={comment.id}
                                    className="p-3 bg-white/5 rounded-xl border border-white/5 hover:border-white/10 transition-all cursor-pointer group"
                                    onClick={() => seekTo(comment.timestamp)}
                                >
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-bold text-white leading-none mb-0.5">{comment.userName}</span>
                                            <span className="text-[10px] text-muted-foreground flex items-center gap-1 font-medium">
                                                <Clock className="h-2.5 w-2.5" />
                                                {formatTime(comment.timestamp)}
                                            </span>
                                        </div>
                                    </div>
                                    <p className="text-xs text-muted-foreground leading-relaxed group-hover:text-white transition-colors">
                                        {comment.content}
                                    </p>
                                </div>
                            ))
                        )}
                    </div>

                    <div className="p-4 bg-white/[0.02] border-t border-white/5">
                        <div className="space-y-3">
                            <div className="flex items-center justify-between px-1">
                                <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Add Feedback</span>
                                <span className="text-[10px] font-bold text-primary">At {formatTime(currentTime)}</span>
                            </div>
                            <textarea
                                value={newComment}
                                onChange={(e) => setNewComment(e.target.value)}
                                placeholder="Type your revision request..."
                                className="w-full min-h-[80px] bg-black border border-white/10 rounded-xl p-3 text-xs focus:outline-none focus:border-primary/50 transition-all resize-none"
                            />
                            <button
                                onClick={handleAddComment}
                                disabled={savingComment || !newComment.trim()}
                                className="w-full h-10 bg-primary text-primary-foreground rounded-lg text-[11px] font-bold uppercase tracking-widest disabled:opacity-50 hover:brightness-110 transition-all flex items-center justify-center gap-2"
                            >
                                {savingComment ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                    "Post Comment"
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
