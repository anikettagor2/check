"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/context/auth-context";
import { db } from "@/lib/firebase/config";
import { doc, collection, query, where, orderBy, updateDoc, arrayUnion, onSnapshot, increment, getDoc } from "firebase/firestore";
import { Project, Revision, Invoice } from "@/types/schema";
import { 
    Loader2, 
    ArrowLeft, 
    Upload, 
    FileVideo, 
    Download, 
    IndianRupee, 
    Calendar, 
    Clock, 
    CheckCircle2, 
    Play, 
    MoreVertical,
    Share2,
    Link as LinkIcon,
    ExternalLink,
    Briefcase,
    ShieldCheck,
    Zap,
    Activity,
    Lock,
    Unlock,
    X,
    ChevronRight,
    MessageSquare,
    Eye,
    Star,
    FileText,
    Image as ImageIcon,
    Copy,
    AlertCircle,
    Archive
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { assignEditor, getAllUsers, respondToAssignment } from "@/app/actions/admin-actions";
import { unlockProjectDownloads, requestDownloadUnlock, registerDownload, submitEditorRating, getSignedDownloadUrl } from "@/app/actions/project-actions";
import { handleProjectCompleted, handleEditorRatingSubmitted } from "@/app/actions/notification-actions";
import { User, ProjectAssignmentStatus } from "@/types/schema";
import { Modal } from "@/components/ui/modal";
import { PaymentButton } from "@/components/payment-button";
import { ProjectChat } from "@/components/project-chat";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { MAX_FILE_SIZE_BYTES, MAX_FILE_SIZE_GB } from "@/lib/constants";
import { UploadService } from "@/lib/services/upload-service";
import { preloadVideosIntoMemory } from "@/lib/video-preload";
import { VideoPlayer } from "@/components/video-player";

interface ExtendedProject extends Project {
    brand?: string;
    duration?: number;
    deadline?: string;
    totalCost?: number;
    amountPaid?: number;
    footageLink?: string;
    assignmentStatus?: ProjectAssignmentStatus;
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatEta(seconds: number): string {
    if (!isFinite(seconds) || seconds <= 0) return "--";
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}m ${secs}s`;
}

function isVideoFile(file: any) {
    const type = file?.type || "";
    const name = file?.name || "";
    return type.startsWith("video/") || /\.(mp4|webm|mov|avi|mkv)$/i.test(name);
}

export default function ProjectDetailsPage() {
    const { id } = useParams();
    const router = useRouter();
    const { user, loading: authLoading } = useAuth();
    const [project, setProject] = useState<ExtendedProject | null>(null);
    const [revisions, setRevisions] = useState<Revision[]>([]);
    const [loading, setLoading] = useState(true);
    
    // Admin Assignment State
    const [editors, setEditors] = useState<User[]>([]);
    const [assigning, setAssigning] = useState(false);
    
    // Asset Upload State
    const [isUploadingAsset, setIsUploadingAsset] = useState(false);
    const [uploadAssetProgress, setUploadAssetProgress] = useState(0);
    const [uploadAssetSpeedBps, setUploadAssetSpeedBps] = useState(0);
    const [uploadAssetEtaSeconds, setUploadAssetEtaSeconds] = useState(0);
    const [isDownloading, setIsDownloading] = useState(false);
    const [assignedPM, setAssignedPM] = useState<User | null>(null);
    const [assignedEditor, setAssignedEditor] = useState<User | null>(null);
    const [assignedSE, setAssignedSE] = useState<User | null>(null);
    const [invoices, setInvoices] = useState<Invoice[]>([]);

    const handleAssetUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !id) return;

        try {
            setIsUploadingAsset(true);
            setUploadAssetProgress(0);

            const result = await UploadService.uploadFileUnified(file, {
                projectId: id as string,
                type: 'raw',
                onProgress: (p) => {
                    setUploadAssetProgress(p.percent);
                    // Minimal stats since chunks are handled differently by Mux
                    if (p.speedBps) setUploadAssetSpeedBps(p.speedBps);
                    if (p.eta) setUploadAssetEtaSeconds(p.eta);
                }
            });

            console.log("Upload registered:", result);

            toast.success("Upload started! Processing will continue in background.");
            
            // Re-fetch project to see the new asset in pending state
            const docRef = doc(db, "projects", id as string);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                setProject(docSnap.data() as Project);
            }

        } catch (error: any) {
            console.error("Asset upload error:", error);
            toast.error(error.message || "Failed to upload asset");
        } finally {
            setIsUploadingAsset(false);
            setUploadAssetProgress(0);
            setUploadAssetSpeedBps(0);
            setUploadAssetEtaSeconds(0);
        }
    };

    const handleDirectDownload = async (url: string, fileName?: string) => {
        setIsDownloading(true);
        try {
            // Always use the API for Firebase Storage files
            if (url.includes("firebasestorage.googleapis.com")) {
                const response = await fetch("/api/download", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ url, fileName }),
                });
                if (response.ok) {
                    const blob = await response.blob();
                    const blobUrl = URL.createObjectURL(blob);
                    const link = document.createElement("a");
                    link.href = blobUrl;
                    link.download = fileName || "download";
                    document.body.appendChild(link);
                    link.click();
                    link.remove();
                    URL.revokeObjectURL(blobUrl);
                    setIsDownloading(false);
                    return;
                } else {
                    // Show error if API fails
                    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
                    throw new Error(errorData.error || `HTTP ${response.status}`);
                }
            } else {
                // For non-Firebase files, fallback to direct download
                const link = document.createElement("a");
                link.href = url;
                link.download = fileName || "download";
                document.body.appendChild(link);
                link.click();
                link.remove();
                setIsDownloading(false);
                return;
            }
        } catch (error) {
            setIsDownloading(false);
            const message = error instanceof Error ? error.message : String(error);
            alert("Download failed: " + message);
        }
    };

    useEffect(() => {
        if (!id || typeof id !== 'string' || authLoading) return;

        setLoading(true);

        // 1. Listen to Project Document
        const unsubProject = onSnapshot(doc(db, "projects", id), (snap) => {
            if (snap.exists()) {
                setProject({ id: snap.id, ...snap.data() } as ExtendedProject);
            }
            setLoading(false);
        }, (err) => {
            console.error("Error listening to project:", err);
            setLoading(false);
        });

        // 2. Listen to Revisions
        const q = query(
            collection(db, "revisions"),
            where("projectId", "==", id),
            orderBy("version", "desc")
        );
        const unsubRevisions = onSnapshot(q, (snap) => {
            const revs: Revision[] = [];
            snap.forEach(doc => revs.push({ id: doc.id, ...doc.data() } as Revision));
            setRevisions(revs);
        }, (err) => {
            console.error("Error listening to revisions:", err);
        });

        return () => {
            unsubProject();
            unsubRevisions();
        };
    }, [id, authLoading]);

    // Personnel Data Fetching
    useEffect(() => {
        if (!project || !user) return;
        
        const shouldFetch = user.role === 'admin' || 
                          user.role === 'project_manager' || 
                          user.role === 'editor' || 
                          (user.role === 'client' && (project.assignedPMId || project.assignedEditorId || project.assignedSEId || user?.managedBy));

        if (shouldFetch) {
            getAllUsers().then(res => {
                if (res.success && res.data) {
                    const allUsers = res.data as User[];
                    
                    // Filter for assignment dropdowns (Admin/PM only)
                    if (user.role === 'admin' || user.role === 'project_manager') {
                        setEditors(allUsers.filter(u => u.role === 'editor'));
                    }

                    // Resolve Assigned PM
                    if (project.assignedPMId) {
                        const pm = allUsers.find(u => u.uid === project.assignedPMId);
                        if (pm) setAssignedPM(pm);
                    }

                    // Resolve Assigned Editor
                    if (project.assignedEditorId) {
                        const ed = allUsers.find(u => u.uid === project.assignedEditorId);
                        if (ed) setAssignedEditor(ed);
                    }
                }
            });
        }
    }, [user, project?.assignedPMId, project?.assignedEditorId, project?.assignedSEId, user?.managedBy]);

    useEffect(() => {
        if (!project) return;

        const raw = (project.rawFiles || []).filter(isVideoFile).map((file: any) => file?.url);
        const delivered = (project.deliveredFiles || []).filter(isVideoFile).map((file: any) => file?.url);
        const pmFiles = ((((project as any).pmFiles || []) as any[]).filter(isVideoFile).map((file) => file?.url));
        preloadVideosIntoMemory([...raw, ...delivered, ...pmFiles], 30);
    }, [project]);

    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
    const [selectedEditorId, setSelectedEditorId] = useState<string | null>(null);
    const [editorRevenueShare, setEditorRevenueShare] = useState<string>("");
    const [previewFile, setPreviewFile] = useState<{ url: string; type: string; name: string; playbackId?: string } | null>(null);
    const [isRatingModalOpen, setIsRatingModalOpen] = useState(false);
    const [editorRating, setEditorRating] = useState(0);
    const [editorReview, setEditorReview] = useState('');
    const [isSubmittingRating, setIsSubmittingRating] = useState(false);
    const [pendingDownloadId, setPendingDownloadId] = useState<string | null>(null);
    const [isDownloadingState, setIsDownloadingState] = useState(false);
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [isTimelineModalOpen, setIsTimelineModalOpen] = useState(false);
    const [assignmentTimeRemaining, setAssignmentTimeRemaining] = useState<number | null>(null);
    const [isAssignmentExpired, setIsAssignmentExpired] = useState(false);

    // Countdown timer for editor assignment acceptance
    useEffect(() => {
        if (!project) return;
        
        const expiresAt = (project as any).assignmentExpiresAt;
        const isPendingAssignment = project.assignmentStatus === 'pending';
        const isAssignedToMe = user?.role === 'editor' && project.assignedEditorId === user?.uid;
        
        if (!isPendingAssignment || !isAssignedToMe || !expiresAt) {
            setAssignmentTimeRemaining(null);
            return;
        }
        
        const calculateTimeRemaining = () => {
            const now = Date.now();
            const remaining = expiresAt - now;
            
            if (remaining <= 0) {
                setAssignmentTimeRemaining(0);
                setIsAssignmentExpired(true);
                return 0;
            }
            
            setAssignmentTimeRemaining(remaining);
            setIsAssignmentExpired(false);
            return remaining;
        };
        
        // Initial calculation
        calculateTimeRemaining();
        
        // Update every second
        const interval = setInterval(() => {
            const remaining = calculateTimeRemaining();
            if (remaining <= 0) {
                clearInterval(interval);
            }
        }, 1000);
        
        return () => clearInterval(interval);
    }, [project, user]);

    // Format time remaining as MM:SS
    const formatTimeRemaining = (ms: number) => {
        const totalSeconds = Math.floor(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };

    /**
     * Directly executes the download — no validation.
     * Only call this after ALL gates (payment + rating) have been confirmed.
     */
    const executeDownload = async (revisionId: string) => {
        setIsDownloadingState(true);
        try {
            const res = await registerDownload(id as string, revisionId);
            if (res.success && res.downloadUrl) {
                await handleDirectDownload(
                    res.downloadUrl,
                    `${project?.name || 'video'}_v${revisions.find(r => r.id === revisionId)?.version || 1}.mp4`
                );
                toast.success('Download initiated.');
                await updateDoc(doc(db, 'projects', id as string), {
                    clientHasDownloaded: true,
                    downloadUnlockedAt: Date.now(),
                    status: 'completed',
                });
                setProject(prev => prev ? ({ ...prev, clientHasDownloaded: true, status: 'completed' }) : null);
            } else {
                toast.error(res.error || 'Download error.');
            }
        } catch (e: any) {
            toast.error(e.message || 'Download failed.');
        } finally {
            setIsDownloadingState(false);
        }
    };

    /**
     * Gate 1 → Payment (payLater users can download if PM unlocked OR fully paid; regular users must be fully paid).
     * Gate 2 → Rating (mandatory star, comment optional, first-time only).
     * Gate 3 → executeDownload.
     */
    const initiateDownload = async (revisionId: string) => {
        // GATE 1: If any payment is made for this project, treat as pay now (ignore pay later for this project)
        const isFullyPaid = project?.paymentStatus === 'full_paid';
        const hasAnyPayment = (project?.amountPaid || 0) > 0 || !!project?.paymentStatus;
        const isDownloadUnlockedByPM = project?.downloadsUnlocked;
        const requireRating = !project?.editorRating;

        if (hasAnyPayment) {
            // After any payment, require full payment and rating for download
            if (!isFullyPaid) {
                toast.error('Please make the full payment to download the file.');
                setPendingDownloadId(revisionId);
                setIsPaymentModalOpen(true);
                return;
            }
            if (requireRating) {
                setPendingDownloadId(revisionId);
                setIsRatingModalOpen(true);
                return;
            }
            await executeDownload(revisionId);
            return;
        }
        // Only if no payment at all, allow pay later download unlock
        if (user?.payLater || (project as any)?.isPayLaterRequest) {
            if (isDownloadUnlockedByPM) {
                if (requireRating) {
                    setPendingDownloadId(revisionId);
                    setIsRatingModalOpen(true);
                    return;
                }
                await executeDownload(revisionId);
                return;
            }
        }
        // Not eligible for download
        toast.error('You are not eligible to download this file yet.');
        return;
    };

    const handleRatingSubmit = async () => {
        if (editorRating === 0) {
            toast.error('Please select a star rating.');
            return;
        }
        setIsSubmittingRating(true);
        try {
            const res = await submitEditorRating(id as string, editorRating, editorReview);
            if (res.success) {
                toast.success('Thank you for your feedback!');
                setProject(prev => prev ? ({ ...prev, editorRating, editorReview }) : null);
                setIsRatingModalOpen(false);

                // Notify editor (fire-and-forget)
                handleEditorRatingSubmitted(id as string, editorRating).catch(console.error);

                // Call executeDownload DIRECTLY — not initiateDownload — to avoid stale
                // closure where project.editorRating is still undefined after setProject.
                if (pendingDownloadId) {
                    const rid = pendingDownloadId;
                    setPendingDownloadId(null);
                    await executeDownload(rid);
                }
            } else {
                toast.error(res.error);
            }
        } catch (e: any) {
            toast.error('Failed to submit rating.');
        } finally {
            setIsSubmittingRating(false);
        }
    };


    const handleFinalPayment = () => {
        if (user?.payLater) return;
        setIsPaymentModalOpen(true);
    };

    const handleAssignmentResponse = async (response: 'accepted' | 'rejected') => {
        if (!id || typeof id !== 'string') return;
        
        // Check if assignment has expired
        if (isAssignmentExpired) {
            toast.error("This assignment has expired. The 5-minute acceptance window has passed.");
            router.push('/dashboard');
            return;
        }
        
        let reason: string | undefined;
        if (response === 'rejected') {
            const promptReason = window.prompt("Why are you declining this project? (Required)");
            if (!promptReason) {
                toast.error("Declination cancelled: A reason is required.");
                return;
            }
            reason = promptReason;
        }
        try {
            const result = await respondToAssignment(id, response, reason);
            
            if (!result.success) {
                // Handle server-side expiration check
                toast.error(result.error || "Failed to process response");
                if (result.error?.includes('expired')) {
                    setIsAssignmentExpired(true);
                    setTimeout(() => router.push('/dashboard'), 2000);
                }
                return;
            }
            
            setProject(prev => prev ? ({ 
                ...prev, 
                assignmentStatus: response,
                status: response === 'accepted' ? 'active' : 'pending_assignment',
                editorDeclineReason: reason
            }) : null);
            toast.success(`Assignment ${response}`);
        } catch (error) {
            toast.error("Failed to update status");
        }
    };

    if (loading || authLoading) {
        return (
            <div className="flex h-screen items-center justify-center bg-background">
                <div className="relative">
                    <Loader2 className="h-10 w-10 animate-spin text-primary" />
                    <div className="absolute inset-0 blur-xl bg-primary/20 animate-pulse" />
                </div>
            </div>
        );
    }

    if (!project) return null;

    const latestRevision = revisions[0];
    const isClient = user?.role === 'client' || project.ownerId === user?.uid;
    const isAdmin = user?.role === 'admin';
    const isPM = user?.role === 'project_manager';
    const canManage = isAdmin || isPM;
    const canAssignEditor = isPM;
    const isEditor = user?.role === 'editor';
    const isAssignedEditor = isEditor && project.assignedEditorId === user?.uid;
    const isPaymentLocked = isClient && project.paymentStatus !== 'full_paid';
    const projectPmFiles = ((((project as any).pmFiles || []) as any[]).length > 0
        ? (((project as any).pmFiles || []) as any[])
        : (project.referenceFiles || []).filter((file: any) => Boolean(file?.uploadedBy)));
    const projectStyleReferenceFiles = (project.referenceFiles || []).filter((file: any) => !file?.uploadedBy);

    const showFeedbackTool = canManage ? (project.assignmentStatus === 'accepted') : true;

    // EDITOR OFFER VIEW
    if (isAssignedEditor && project.assignmentStatus === 'pending') {
        // Check if expired
        if (isAssignmentExpired) {
            return (
                <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6 mesh-grid">
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="max-w-md w-full enterprise-card bg-card p-10 space-y-6 shadow-2xl relative overflow-hidden text-center"
                    >
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500 via-red-400 to-red-500/40" />
                        
                        <div className="mx-auto h-20 w-20 bg-red-500/10 rounded-2xl flex items-center justify-center border border-red-500/20">
                            <Clock className="h-9 w-9 text-red-500" />
                        </div>
                        
                        <div className="space-y-2">
                            <h1 className="text-2xl font-heading font-bold text-foreground">Assignment Expired</h1>
                            <p className="text-muted-foreground">The 5-minute acceptance window has passed for this project.</p>
                        </div>
                        
                        <Link 
                            href="/dashboard"
                            className="inline-flex items-center justify-center h-12 px-8 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-all"
                        >
                            Return to Dashboard
                        </Link>
                    </motion.div>
                </div>
            );
        }
        
        return (
            <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6 mesh-grid">
                <motion.div 
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="max-w-xl w-full enterprise-card bg-card p-10 space-y-8 shadow-2xl relative overflow-hidden"
                >
                     <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-indigo-400 to-primary/40" />
                     
                     {/* Countdown Timer */}
                     {assignmentTimeRemaining !== null && (
                         <div className={cn(
                             "mx-auto w-fit px-6 py-3 rounded-2xl border-2 flex items-center gap-3",
                             assignmentTimeRemaining < 60000 
                                 ? "bg-red-500/10 border-red-500/30 text-red-500" 
                                 : assignmentTimeRemaining < 120000 
                                     ? "bg-amber-500/10 border-amber-500/30 text-amber-500"
                                     : "bg-primary/10 border-primary/30 text-primary"
                         )}>
                             <Clock className={cn(
                                 "h-5 w-5",
                                 assignmentTimeRemaining < 60000 && "animate-pulse"
                             )} />
                             <div className="text-center">
                                 <p className="text-[9px] font-bold uppercase tracking-widest opacity-70">Time Remaining</p>
                                 <p className="text-2xl font-black tabular-nums tracking-wider">
                                     {formatTimeRemaining(assignmentTimeRemaining)}
                                 </p>
                             </div>
                         </div>
                     )}
                     
                     <div className="text-center space-y-4">
                        <div className="mx-auto h-20 w-20 bg-primary/10 rounded-2xl flex items-center justify-center mb-6 border border-primary/20 shadow-[0_0_20px_rgba(99,102,241,0.2)]">
                            <Briefcase className="h-9 w-9 text-primary" />
                        </div>
                        <h1 className="text-3xl font-heading font-bold text-foreground tracking-tight">New Project <span className="text-muted-foreground">Invitation</span></h1>
                        <div className="space-y-1">
                            <p className="text-muted-foreground font-medium">You have a new project request ready for review.</p>
                            <p className="text-foreground font-bold text-lg">{project.name}</p>
                        </div>
                     </div>

                     <div className="bg-muted/50 rounded-xl p-6 border border-border space-y-4">
                        <DetailRow label="Client Name" value={project.brand || project.clientName || 'N/A'} />
                        <DetailRow label="Due Date" value={project.deadline ? project.deadline : "TBD"} />
                        <DetailRow label="Revenue Share" value={`₹${project.editorPrice?.toLocaleString() || '0'}`} />
                        <div className="pt-4 border-t border-border">
                             <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest mb-2">Instructions</p>
                             <p className="text-muted-foreground leading-relaxed italic text-sm">"{project.description || "No specific instructions provided."}"</p>
                        </div>

                        {/* Script & Directions */}
                        {( (project as any).scriptText || (project.scripts && project.scripts.length > 0)) && (
                            <div className="pt-4 border-t border-border space-y-4">
                                <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">Scripts & Directions</p>
                                
                                {(project as any).scriptText && (
                                    <div className="p-4 bg-primary/5 rounded-xl border border-primary/10">
                                        <p className="text-xs text-primary/80 leading-relaxed whitespace-pre-wrap">{(project as any).scriptText}</p>
                                    </div>
                                )}

                                {project.scripts && project.scripts.length > 0 && (
                                    <div className="grid grid-cols-1 gap-2">
                                        {project.scripts.map((file: any, idx: number) => (
                                            <div key={idx} className="flex items-center justify-between p-3 bg-card rounded-xl border border-border group hover:border-primary/30 transition-all">
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                                                        <FileText className="h-4 w-4" />
                                                    </div>
                                                    <div className="flex flex-col min-w-0">
                                                        <span className="text-xs font-bold text-foreground truncate">{file.name}</span>
                                                        <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Script File</span>
                                                    </div>
                                                </div>
                                                <button 
                                                    onClick={() => setPreviewFile({ url: file.url, type: 'application/pdf', name: file.name })}
                                                    className="h-8 px-3 rounded-lg bg-primary/10 hover:bg-primary text-primary hover:text-primary-foreground text-[9px] font-bold uppercase tracking-widest transition-all"
                                                >
                                                    View
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Raw Footage & Assets */}
                        {(project.footageLink || (project.rawFiles && project.rawFiles.length > 0) || project.referenceLink || (project.referenceFiles && project.referenceFiles.length > 0) || ((project as any).bRoleFiles && (project as any).bRoleFiles.length > 0)) && (
                            <div className="pt-4 border-t border-border space-y-4">
                                <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">Project Assets (Preview Only)</p>
                                
                                <div className="flex flex-wrap gap-4">
                                    {(project as any).videoFormat && (
                                        <div className="flex flex-col">
                                            <span className="text-[8px] font-black text-muted-foreground uppercase tracking-widest leading-none mb-1">Format</span>
                                            <span className="text-[11px] font-bold text-primary uppercase">{ (project as any).videoFormat }</span>
                                        </div>
                                    )}
                                    {(project as any).aspectRatio && (
                                        <div className="flex flex-col">
                                            <span className="text-[8px] font-black text-muted-foreground uppercase tracking-widest leading-none mb-1">Ratio</span>
                                            <span className="text-[11px] font-bold text-primary uppercase">{ (project as any).aspectRatio }</span>
                                        </div>
                                    )}
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {project.footageLink && (
                                        <a href={project.footageLink.startsWith('http') ? project.footageLink : `https://${project.footageLink}`} target="_blank" className="flex items-center gap-3 p-3 bg-black/5 dark:bg-black/40 rounded-xl border border-border group hover:border-primary/30 transition-all">
                                            <div className="h-8 w-8 rounded-lg bg-card flex items-center justify-center text-muted-foreground group-hover:text-primary transition-colors">
                                                <LinkIcon className="h-4 w-4" />
                                            </div>
                                            <span className="text-xs font-bold text-muted-foreground group-hover:text-foreground">Raw Footage Drive</span>
                                        </a>
                                    )}
                                    {(project as any).referenceLink && (
                                        <a href={(project as any).referenceLink.startsWith('http') ? (project as any).referenceLink : `https://${(project as any).referenceLink}`} target="_blank" className="flex items-center gap-3 p-3 bg-emerald-500/5 rounded-xl border border-emerald-500/10 group hover:border-emerald-500/30 transition-all">
                                            <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500 group-hover:text-emerald-400 transition-colors">
                                                <Zap className="h-4 w-4" />
                                            </div>
                                            <span className="text-xs font-bold text-emerald-500 group-hover:text-emerald-400">Style Reference Link</span>
                                        </a>
                                    )}
                                </div>

                                {project.rawFiles && project.rawFiles.length > 0 ? (
                                    <div className="space-y-2">
                                        <p className="text-[9px] text-muted-foreground font-black uppercase tracking-widest ml-1">Raw Files</p>
                                        <div className="grid gap-2">
                                            {project.rawFiles.map((file: any, idx: number) => (
                                                <div key={idx} className="flex items-center justify-between p-2.5 bg-black/5 dark:bg-black/40 rounded-lg border border-border group">
                                                    <div className="flex items-center gap-3 min-w-0">
                                                        {file.name.match(/\.(zip|rar|7z)$/i) || file.type?.includes('zip') ? <Archive className="h-4 w-4 text-purple-500 group-hover:text-purple-400 transition-colors flex-shrink-0" /> : file.type?.includes('image') ? <ImageIcon className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" /> : <FileVideo className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />}
                                                        <div className="flex flex-col min-w-0">
                                                            <span className="text-xs font-bold text-muted-foreground truncate">{file.name}</span>
                                                            <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">{(file.size ? (file.size / (1024*1024)).toFixed(2) : '?')} MB</span>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        {!(file.name.match(/\.(zip|rar|7z)$/i) || file.type?.includes('zip')) && (
                                                            <button onClick={() => setPreviewFile({ url: file.url, type: file.type || 'video/mp4', name: file.name })} className="h-8 px-3 rounded bg-muted hover:bg-primary/20 hover:text-primary text-muted-foreground text-[9px] font-bold uppercase tracking-widest transition-all">Preview</button>
                                                        )}
                                                        <button onClick={() => handleDirectDownload(file.url, file.name)} className="h-8 w-8 rounded bg-muted hover:bg-primary/20 hover:text-primary text-muted-foreground transition-all flex items-center justify-center">
                                                            <Download className="h-3.5 w-3.5" />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="p-3 bg-red-500/5 rounded-lg border border-red-500/10">
                                        <p className="text-[10px] text-red-500/80 italic font-medium">Client has not uploaded any raw files.</p>
                                    </div>
                                )}

                                {(project as any).bRoleFiles && (project as any).bRoleFiles.length > 0 ? (
                                    <div className="space-y-2">
                                        <p className="text-[9px] text-amber-500/70 font-black uppercase tracking-widest ml-1">B-Roll Assets</p>
                                        <div className="grid gap-2">
                                            {(project as any).bRoleFiles.map((file: any, idx: number) => (
                                                <div key={idx} className="flex items-center justify-between p-2.5 bg-amber-500/5 rounded-lg border border-amber-500/10 group">
                                                    <div className="flex items-center gap-3 min-w-0">
                                                        {file.name.match(/\.(zip|rar|7z)$/i) || file.type?.includes('zip') ? <Archive className="h-4 w-4 text-purple-500 group-hover:text-purple-400 transition-colors" /> : file.type?.includes('image') ? <ImageIcon className="h-4 w-4 text-amber-500/70 group-hover:text-amber-500 transition-colors" /> : <FileVideo className="h-4 w-4 text-amber-500/70 group-hover:text-amber-500 transition-colors" />}
                                                        <div className="flex flex-col min-w-0">
                                                            <span className="text-xs font-bold text-amber-500/70 truncate">{file.name}</span>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        {!(file.name.match(/\.(zip|rar|7z)$/i) || file.type?.includes('zip')) && (
                                                            <button onClick={() => setPreviewFile({ url: file.url, type: file.type || 'video/mp4', name: file.name })} className="h-8 px-3 rounded bg-amber-500/10 hover:bg-amber-500/20 hover:text-amber-500 text-amber-500/70 text-[9px] font-bold uppercase tracking-widest transition-all">Preview</button>
                                                        )}
                                                        <button onClick={() => handleDirectDownload(file.url, file.name)} className="h-8 w-8 rounded bg-amber-500/10 hover:bg-amber-500/20 hover:text-amber-500 text-amber-500/70 transition-all flex items-center justify-center">
                                                            <Download className="h-3.5 w-3.5" />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="p-3 bg-red-500/5 rounded-lg border border-red-500/10">
                                        <p className="text-[10px] text-red-500/80 italic font-medium">Client has not uploaded any B-roll assets.</p>
                                    </div>
                                )}

                                {projectStyleReferenceFiles.length > 0 && (
                                    <div className="space-y-2">
                                        <p className="text-[9px] text-primary/70 font-black uppercase tracking-widest ml-1">Reference Assets</p>
                                        <div className="grid gap-2">
                                            {projectStyleReferenceFiles.map((file: any, idx: number) => (
                                                <div key={idx} className="flex items-center justify-between p-2.5 bg-primary/5 rounded-lg border border-primary/10 group">
                                                    <div className="flex items-center gap-3 min-w-0">
                                                        <Eye className="h-4 w-4 text-primary/70 group-hover:text-primary transition-colors" />
                                                        <div className="flex flex-col min-w-0">
                                                            <span className="text-xs font-bold text-primary/70 truncate">{file.name}</span>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <button onClick={() => setPreviewFile({ url: file.url, type: 'other', name: file.name })} className="h-8 px-3 rounded bg-primary/10 hover:bg-primary/20 hover:text-primary text-primary/70 text-[9px] font-bold uppercase tracking-widest transition-all">Preview</button>
                                                        <button onClick={() => handleDirectDownload(file.url, file.name)} className="h-8 w-8 rounded bg-primary/10 hover:bg-primary/20 hover:text-primary text-primary/70 transition-all flex items-center justify-center">
                                                            <Download className="h-3.5 w-3.5" />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {projectPmFiles.length > 0 && (
                                    <div className="space-y-2">
                                        <p className="text-[9px] text-muted-foreground font-black uppercase tracking-widest ml-1">PM Uploaded Files</p>
                                        <div className="grid gap-2">
                                            {projectPmFiles.map((file: any, idx: number) => (
                                                <div key={`${file.url}-${idx}`} className="flex items-center justify-between p-2.5 bg-muted/30 rounded-lg border border-border group">
                                                    <div className="flex items-center gap-3 min-w-0">
                                                        {file.type?.includes('image') ? <ImageIcon className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" /> : <FileVideo className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />}
                                                        <div className="flex flex-col min-w-0">
                                                            <span className="text-xs font-bold text-foreground truncate">{file.name}</span>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <button onClick={() => setPreviewFile({ url: file.url, type: file.type || 'application/octet-stream', name: file.name, playbackId: (file as any).playbackId })} className="h-8 px-3 rounded bg-muted hover:bg-primary/20 hover:text-primary text-muted-foreground text-[9px] font-bold uppercase tracking-widest transition-all">Preview</button>
                                                        <button onClick={() => handleDirectDownload(file.url, file.name)} className="h-8 w-8 rounded bg-muted hover:bg-primary/20 hover:text-primary text-muted-foreground transition-all flex items-center justify-center">
                                                            <Download className="h-3.5 w-3.5" />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                     </div>

                     <div className="flex gap-4 pt-2">
                        <button 
                            onClick={() => handleAssignmentResponse('rejected')} 
                            className="flex-1 h-12 rounded-lg border border-border bg-muted/50 hover:bg-red-500/10 hover:border-red-500/20 text-muted-foreground hover:text-red-400 text-[11px] font-bold uppercase tracking-widest transition-all active:scale-[0.98]"
                        >
                            Decline
                        </button>
                        <button 
                            onClick={() => handleAssignmentResponse('accepted')} 
                            className="flex-1 h-12 rounded-lg bg-primary  text-primary-foreground text-[11px] font-bold uppercase tracking-widest hover:bg-zinc-200 shadow-md shadow-primary/10 transition-all active:scale-[0.98]"
                        >
                            Accept
                        </button>
                     </div>
                </motion.div>
            </div>
        );
    }

    return (
        <div className="max-w-[1600px] mx-auto pb-20 space-y-10">
            <ProjectChat 
                projectId={id as string}
                currentUser={user}
                isOpen={isChatOpen}
                onClose={() => setIsChatOpen(false)}
            />
            
            {/* Header Section */}
            <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between pb-8 border-b border-border">
                <div className="space-y-4">
                    <Link href="/dashboard" className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-muted/50 border border-border text-muted-foreground hover:text-foreground text-[10px] font-bold uppercase tracking-widest transition-all hover:bg-muted/50">
                         <ArrowLeft className="h-3.5 w-3.5" />
                         Go Back
                    </Link>
                    <div className="flex flex-wrap items-center gap-4">
                        <h1 className="text-4xl md:text-5xl font-heading font-bold tracking-tight text-foreground leading-tight">{project.name}</h1>
                        <StatusIndicator status={project.status || 'active'} />
                    </div>
                    <div className="flex items-center gap-4 text-muted-foreground">
                        <span className="text-[11px] font-bold uppercase tracking-widest">ID: <span className="text-muted-foreground">{id?.toString().slice(0,12)}</span></span>
                        <div className="h-1 w-1 rounded-full bg-muted-foreground" />
                        <span className="text-[11px] font-bold uppercase tracking-widest">Type: <span className="text-muted-foreground">Custom Edit</span></span>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                     <button 
                         onClick={() => setIsChatOpen(true)}
                         className="h-11 px-5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold uppercase tracking-widest hover:bg-emerald-500/20 transition-all active:scale-[0.98] flex items-center gap-2.5 text-[11px]"
                     >
                         <MessageSquare className="h-4 w-4" />
                         Project Chat
                     </button>
                     <button className="h-11 w-11 rounded-lg bg-muted/50 border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-all active:scale-[0.98] hover:bg-muted/50">
                        <Share2 className="h-4 w-4" />
                     </button>
                     {(canManage || (isAssignedEditor && (project.assignmentStatus === 'accepted' || project.status === 'active'))) && (
                        <Link href={`/dashboard/projects/${id}/upload`}>
                            <button className="h-11 px-6 rounded-lg bg-primary  text-primary-foreground text-[11px] font-bold uppercase tracking-widest hover:bg-zinc-200 transition-all shadow-md shadow-primary/10 active:scale-[0.98] flex items-center gap-2.5">
                                <Upload className="h-4 w-4" />
                                Upload New Version
                            </button>
                        </Link>
                     )}
                </div>
            </div>

            {/* Main Content Grid or Simplified View */}
            {project.status === 'completed' && !isEditor ? (
                <div className="space-y-8 animate-in fade-in duration-500">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-6">
                        <div className="enterprise-card p-6 bg-muted/50">
                            <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Project Name</span>
                            <div className="text-xl font-bold text-foreground mt-1 truncate">{project.name}</div>
                        </div>
                        <div className="enterprise-card p-6 bg-muted/50">
                            <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Client Name</span>
                            <div className="text-xl font-bold text-foreground mt-1 truncate">{project.brand || project.clientName || 'N/A'}</div>
                        </div>
                        <div className="enterprise-card p-6 bg-muted/50">
                            <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Project Manager</span>
                            <div className="text-xl font-bold text-foreground mt-1 truncate">{assignedPM?.displayName || 'Not Assigned'}</div>
                        </div>
                        <div className="enterprise-card p-6 bg-muted/50">
                            <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Lead Editor</span>
                            <div className="text-xl font-bold text-foreground mt-1 truncate">{assignedEditor?.displayName || 'Not Assigned'}</div>
                        </div>
                        <div className="enterprise-card p-6 bg-muted/50">
                            <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Status</span>
                            <div className="flex items-center gap-2 mt-1">
                                <div className="h-2 w-2 rounded-full bg-emerald-500" />
                                <div className="text-xl font-bold text-foreground">Completed</div>
                            </div>
                        </div>
                        <div className="enterprise-card p-6 bg-emerald-500/[0.05] border-emerald-500/20">
                            <span className="text-[10px] text-emerald-500/80 font-bold uppercase tracking-widest">Total Revenue</span>
                            <div className="text-xl font-bold text-emerald-400 mt-1 tabular-nums truncate">₹{project.totalCost?.toLocaleString() || 0}</div>
                        </div>
                    </div>
                    {latestRevision && (
                        // If any payment is made, only allow download if fully paid
                        ((project.paymentStatus === 'full_paid') ||
                        // If no payment at all, allow pay later download if PM unlocked
                        (((!project.paymentStatus && (!project.amountPaid || project.amountPaid === 0)) && (user?.payLater || (project as any).isPayLaterRequest) && project.downloadsUnlocked))
                    )) && (
                        <div className="enterprise-card border-primary/20 bg-primary/[0.02] p-8 sm:p-12 text-center space-y-6 flex flex-col items-center">
                            <div className="h-16 w-16 bg-primary/20 border border-primary/30 rounded-2xl flex items-center justify-center text-primary shadow-[0_0_30px_rgba(99,102,241,0.2)]">
                                <FileVideo className="h-8 w-8" />
                            </div>
                            <div className="space-y-2">
                                <h3 className="text-2xl font-bold font-heading text-foreground">Final Video Delivery</h3>
                                <p className="text-muted-foreground text-sm max-w-md mx-auto">Your final high-quality video is ready. Thank you for your business!</p>
                            </div>
                            <button
                                disabled={isDownloading}
                                onClick={async () => {
                                    if (isClient && !project.editorRating) {
                                        setPendingDownloadId(latestRevision.id);
                                        setIsRatingModalOpen(true);
                                    } else {
                                        await initiateDownload(latestRevision.id);
                                    }
                                }}
                                className="h-12 px-8 rounded-xl bg-primary  text-primary-foreground text-[11px] font-bold uppercase tracking-widest hover:bg-zinc-200 transition-all active:scale-[0.98] flex items-center gap-2.5 shadow-md shadow-primary/10"
                            >
                                {isDownloading ? <><Loader2 className="h-4 w-4 animate-spin" /> Fetching...</> : <><Download className="h-4 w-4" /> Download Final Video</>}
                            </button>
                        </div>
                    )}

                    {invoices.length > 0 && (
                        <div className="enterprise-card border-emerald-500/20 bg-emerald-500/[0.02] p-8 space-y-6">
                            <div className="flex items-center gap-3">
                                <div className="h-12 w-12 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-center text-emerald-500">
                                    <FileText className="h-6 w-6" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-foreground">Invoice & Receipt</h3>
                                    <p className="text-sm text-muted-foreground mt-1">Download your project invoice</p>
                                </div>
                            </div>

                            <div className="space-y-3">
                                {invoices.map((invoice) => (
                                    <Link key={invoice.id} href={`/dashboard/invoices/${invoice.id}`}>
                                        <motion.div
                                            whileHover={{ scale: 1.01 }}
                                            className="flex items-center justify-between p-4 rounded-xl bg-background border border-border hover:border-emerald-500/30 hover:bg-emerald-500/5 transition-all group cursor-pointer"
                                        >
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className="h-10 w-10 bg-emerald-500/10 rounded-lg flex items-center justify-center text-emerald-500 group-hover:bg-emerald-500/20 transition-colors flex-shrink-0">
                                                    <FileText className="h-5 w-5" />
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-sm font-semibold text-foreground group-hover:text-emerald-600 transition-colors">{invoice.invoiceNumber}</p>
                                                    <p className="text-xs text-muted-foreground">₹{invoice.total.toLocaleString()}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 flex-shrink-0">
                                                <span className="text-xs font-bold text-emerald-600/60 uppercase tracking-widest">View PDF</span>
                                                <Download className="h-4 w-4 text-muted-foreground group-hover:text-emerald-600 transition-colors" />
                                            </div>
                                        </motion.div>
                                    </Link>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                
                {/* Left: Content & Versions */}
                <div className="lg:col-span-8 space-y-8">
                    

                    
                    {/* Project Preview */}
                    {revisions.length > 0 ? (
                        <div className="space-y-6">
                            <motion.div 
                                initial={{ opacity: 0, scale: 0.98 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="group relative aspect-video enterprise-card rounded-2xl overflow-hidden border-border"
                            >
                                <div className="absolute inset-0 bg-gradient-to-tr from-primary/5 to-transparent pointer-events-none" />
                                <div className="absolute inset-0 flex items-center justify-center opacity-10">
                                    <FileVideo className="h-24 w-24 text-foreground" />
                                </div>
                                
                                <div className="absolute inset-0 flex items-center justify-center bg-black/5 dark:bg-black/40 opacity-0 group-hover:opacity-100 transition-all duration-500 backdrop-blur-sm">
                                    <div className="flex flex-col items-center gap-4">
                                        <div className="h-16 w-16 bg-muted rounded-full flex items-center justify-center border border-border opacity-50">
                                            <Lock className="h-6 w-6 text-muted-foreground" />
                                        </div>
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-4 py-2 bg-black/5 dark:bg-black/40 border border-border rounded-lg">
                                            Awaiting Next Steps
                                        </span>
                                    </div>
                                </div>

                                {/* Video Metadata Overlays */}
                                <div className="absolute top-6 left-6 flex items-center gap-2.5">
                                    <div className="px-3 py-1.5 bg-background/80 backdrop-blur-lg rounded-lg border border-border flex items-center gap-2">
                                        <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse shadow-[0_0_8px_rgba(99,102,241,1)]" />
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-foreground">Current Version</span>
                                    </div>
                                    <div className="px-3 py-1.5 bg-background/80 backdrop-blur-lg rounded-lg border border-border">
                                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">v{latestRevision.version}</span>
                                    </div>
                                </div>
                            </motion.div>

                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 enterprise-card p-6 md:p-8">
                                <div className="space-y-1">
                                    <h3 className="font-heading font-bold text-xl text-foreground tracking-tight">Project Status</h3>
                                    <p className="text-sm text-muted-foreground font-medium">Version v{latestRevision.version} is ready for you to look at.</p>
                                </div>
                                <div className="flex items-center gap-3">
                                    {showFeedbackTool && project.status !== 'completed' && (
                                        <Link href={`/dashboard/projects/${id}/review/${latestRevision.id}`}>
                                            <button className="h-11 px-5 rounded-lg bg-muted/50 border border-border hover:bg-muted/50 text-muted-foreground hover:text-foreground text-[11px] font-bold uppercase tracking-widest transition-all active:scale-[0.98] flex items-center gap-2.5">
                                                <MessageSquare className="h-4 w-4" />
                                                Add Comments
                                            </button>
                                        </Link>
                                    )}
                                    {isClient ? (
                                        (() => {
                                            const hasRemainingBalance = (project?.totalCost || 0) > (project?.amountPaid || 0);
                                            const needsPayment = project?.paymentStatus !== 'full_paid' || hasRemainingBalance;
                                            
                                            return (
                                                <button
                                                    disabled={isDownloadingState}
                                                    onClick={async () => {
                                                        if (!latestRevision) return;
                                                        await initiateDownload(latestRevision.id);
                                                    }}
                                                    className={cn(
                                                        "h-11 px-6 rounded-lg text-[11px] font-bold uppercase tracking-widest transition-all active:scale-[0.98] flex items-center gap-2.5 shadow-md",
                                                        needsPayment
                                                            ? "bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-500/10"
                                                            : !project.editorRating
                                                                ? "bg-amber-600 text-white hover:bg-amber-700 shadow-amber-500/10"
                                                                : "bg-primary text-primary-foreground hover:bg-zinc-200 shadow-primary/10"
                                                    )}
                                                >
                                                    {isDownloadingState ? (
                                                        <><Loader2 className="h-4 w-4 animate-spin" /> Fetching...</>
                                                    ) : (
                                                        <>
                                                            <Download className="h-4 w-4" /> 
                                                            {needsPayment
                                                                ? "Pay & Download" 
                                                                : !project.editorRating 
                                                                    ? "Rate & Download" 
                                                                    : "Download Final Video"}
                                                        </>
                                                    )}
                                                </button>
                                            );
                                        })()
                                    ) : null}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="aspect-video enterprise-card bg-transparent border-dashed border-border flex flex-col items-center justify-center p-12 text-center">
                            <div className="h-16 w-16 bg-muted/50 rounded-2xl flex items-center justify-center mb-6 border border-border">
                                <Activity className="h-7 w-7 text-muted-foreground" />
                            </div>
                            <h3 className="text-xl font-bold text-foreground mb-2 tracking-tight">Setting Up Your Project</h3>
                            <p className="text-muted-foreground max-w-sm mb-8 text-sm font-medium leading-relaxed">
                                {(isEditor || canManage) ? "Project is ready. Please upload the first version of the video to start the review process." : "We're working on your video! We'll let you know as soon as the first version is ready for you to see."}
                            </p>
                            {(canManage || (isAssignedEditor && (project.assignmentStatus === 'accepted' || project.status === 'active'))) && (
                                <Link href={`/dashboard/projects/${id}/upload`}>
                                    <button className="h-12 px-8 rounded-lg bg-primary  text-primary-foreground text-[11px] font-bold uppercase tracking-widest hover:bg-zinc-200 transition-all shadow-md shadow-primary/10 active:scale-[0.98]">
                                        Upload First Draft
                                    </button>
                                </Link>
                            )}
                        </div>
                    )}

                    {/* History */}
                    {revisions.length > 1 && (
                        <div className="space-y-4">
                            <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.25em] ml-1">Previous Versions</h3>
                            <div className="grid gap-3">
                                {revisions.slice(1).map((rev, idx) => (
                                    <Link href={`/dashboard/projects/${id}/review/${rev.id}`} key={rev.id}>
                                        <motion.div 
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: idx * 0.05 }}
                                            className="flex items-center justify-between p-4 px-6 rounded-xl bg-muted/50 border border-border hover:bg-muted/50 hover:border-border transition-all group lg:hover:pl-8 origin-left"
                                        >
                                            <div className="flex items-center gap-4">
                                                <div className="h-10 w-10 bg-muted/50 rounded-lg flex items-center justify-center border border-border group-hover:border-primary/40 group-hover:text-primary transition-all duration-300">
                                                    <FileVideo className="h-4.5 w-4.5" />
                                                </div>
                                                <div className="space-y-0.5">
                                                    <p className="text-sm font-bold text-muted-foreground group-hover:text-foreground transition-colors tracking-tight">Version {rev.version}</p>
                                                    <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest" suppressHydrationWarning>{new Date(rev.createdAt).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                                                </div>
                                            </div>
                                            <div className="h-8 w-8 flex items-center justify-center rounded-lg bg-muted/50 border border-border text-muted-foreground group-hover:text-foreground group-hover:bg-primary/20 group-hover:border-primary/30 transition-all">
                                                <ChevronRight className="h-4 w-4" />
                                            </div>
                                        </motion.div>
                                    </Link>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Right: Metadata & Management */}
                <div className="lg:col-span-4 space-y-6">
                    
                    {/* Management Module (Admin/PM) */}
                    {canManage && (
                        <div className="space-y-6">
                            <div className="enterprise-card bg-primary/[0.03] border-primary/20 p-6 md:p-8 space-y-6 relative overflow-hidden group/manage">
                                <div className="absolute top-0 right-0 p-6 opacity-10 pointer-events-none group-hover/manage:opacity-20 transition-opacity">
                                    <ShieldCheck className="h-16 w-16 text-primary" />
                                </div>
                                <div className="flex justify-between items-center relative z-10">
                                    <h3 className="text-[10px] font-bold uppercase tracking-widest text-primary flex items-center gap-2">
                                        Editor Assignment
                                    </h3>
                                    {canAssignEditor && (
                                        <button 
                                            onClick={() => setIsAssignModalOpen(true)}
                                            className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
                                        >
                                            Modify
                                        </button>
                                    )}
                                </div>
                                
                                <div className="relative z-10">
                                    {project.assignedEditorId ? (
                                        <div className="flex items-center gap-4 p-4 rounded-xl bg-background/80 border border-border backdrop-blur-sm">
                                            <div className="h-11 w-11 rounded-lg bg-primary/20 flex items-center justify-center text-primary font-bold border border-primary/30 overflow-hidden">
                                                {editors.find(e => e.uid === project.assignedEditorId)?.photoURL ? (
                                                    <Image src={editors.find(e => e.uid === project.assignedEditorId)?.photoURL!} alt="Editor" width={44} height={44} className="w-full h-full object-cover" />
                                                ) : (
                                                    editors.find(e => e.uid === project.assignedEditorId)?.displayName?.[0].toUpperCase() || "E"
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-bold text-foreground truncate">
                                                    {editors.find(e => e.uid === project.assignedEditorId)?.displayName || "Active Node"}
                                                </p>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className={cn(
                                                        "text-[8px] uppercase font-black px-1.5 py-0.5 rounded border leading-none",
                                                        project.assignmentStatus === 'pending' ? "bg-amber-500/5 text-amber-500 border-amber-500/20" :
                                                        project.assignmentStatus === 'accepted' ? "bg-emerald-500/5 text-emerald-500 border-emerald-500/20" :
                                                        "bg-red-500/5 text-red-500 border-red-500/20"
                                                    )}>
                                                        {project.assignmentStatus || 'Assigned'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="text-center py-8 border border-dashed border-border rounded-xl bg-muted/50">
                                            <p className="text-muted-foreground text-[10px] font-bold uppercase tracking-widest">Awaiting Assignment</p>
                                        </div>
                                    )}
                                </div>

                                {/* Editor Select Modal */}
                                <Modal
                                    isOpen={isAssignModalOpen}
                                    onClose={() => setIsAssignModalOpen(false)}
                                    title="Assign Editor"
                                >
                                    <div className="space-y-6">
                                        <div className="space-y-2 max-h-[350px] overflow-y-auto pr-2 scrollbar-thin">
                                            {editors.map((editor) => {
                                                const isSelected = selectedEditorId === editor.uid;
                                                return (
                                                    <div 
                                                        key={editor.uid}
                                                        onClick={() => setSelectedEditorId(editor.uid)}
                                                        className={cn(
                                                            "flex items-center gap-4 p-4 rounded-xl border transition-all cursor-pointer",
                                                            isSelected ? "bg-primary/10 border-primary shadow-[0_0_15px_rgba(99,102,241,0.1)]" : "bg-muted/50 border-border hover:bg-muted/50"
                                                        )}
                                                    >
                                                        <div className={cn(
                                                            "h-10 w-10 rounded-lg flex items-center justify-center font-bold text-sm overflow-hidden",
                                                            isSelected ? "bg-primary text-foreground border border-primary/30" : "bg-muted text-muted-foreground border border-border"
                                                        )}>
                                                            {editor.photoURL ? (
                                                                <Image src={editor.photoURL} alt={editor.displayName || "Editor"} width={40} height={40} className="w-full h-full object-cover" />
                                                            ) : (
                                                                editor.displayName?.[0].toUpperCase() || "E"
                                                            )}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <p className={cn("text-sm font-bold truncate", isSelected ? "text-foreground" : "text-muted-foreground")}>
                                                                {editor.displayName || "Unknown"}
                                                            </p>
                                                            <p className="text-[10px] text-muted-foreground font-medium truncate">{editor.email}</p>
                                                        </div>
                                                        {isSelected && <CheckCircle2 className="h-4 w-4 text-primary" />}
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        <div className="space-y-4">
                                            <div className="space-y-1.5">
                                                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Editor Revenue Share (₹)</label>
                                                <input 
                                                    type="number"
                                                    value={editorRevenueShare}
                                                    onChange={(e) => setEditorRevenueShare(e.target.value)}
                                                    placeholder="e.g. 5000"
                                                    className="w-full h-11 bg-black/5 dark:bg-black/40 border border-border rounded-lg px-4 text-sm text-foreground focus:outline-none focus:border-primary/50 transition-colors"
                                                />
                                            </div>
                                            <button 
                                                onClick={async () => {
                                                    if (!selectedEditorId || !editorRevenueShare) {
                                                        toast.error("Please select an editor and enter revenue share");
                                                        return;
                                                    }
                                                    
                                                    const shareAmount = parseFloat(editorRevenueShare);
                                                    if (shareAmount > (project.totalCost || 0)) {
                                                        toast.error(`Editor revenue cannot exceed project cost (₹${project.totalCost || 0}). Negative platform margin is not allowed.`);
                                                        return;
                                                    }

                                                    setAssigning(true);
                                                    try {
                                                        await assignEditor(id as string, selectedEditorId, shareAmount, undefined, 'project_manager');
                                                        setProject(prev => prev ? ({ ...prev, assignedEditorId: selectedEditorId, editorPrice: shareAmount, assignmentStatus: 'pending', status: 'pending_assignment' }) : null);
                                                        toast.success("Editor assigned. Pending their acceptance.");
                                                        setIsAssignModalOpen(false);
                                                    } catch (err) {
                                                        toast.error("Process failed.");
                                                    } finally {
                                                        setAssigning(false);
                                                    }
                                                }}
                                                disabled={assigning || !selectedEditorId || !editorRevenueShare}
                                                className="w-full h-12 rounded-lg bg-primary  text-primary-foreground text-[11px] font-bold uppercase tracking-widest hover:bg-zinc-200 transition-all active:scale-[0.98] disabled:opacity-50"
                                            >
                                                {assigning ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : "Confirm Assignment"}
                                            </button>
                                        </div>
                                    </div>
                                </Modal>
                            </div>

                            {/* Admin Controls */}
                            {project.paymentStatus !== 'full_paid' && (
                                <div className="enterprise-card border-emerald-500/10 bg-emerald-500/[0.01] p-6 space-y-5">
                                     <div className="flex items-center gap-2 text-emerald-500">
                                         <ShieldCheck className="h-4 w-4" />
                                         <h3 className="text-[10px] font-bold uppercase tracking-widest">Override Options</h3>
                                     </div>
                                     <p className="text-xs text-muted-foreground leading-relaxed font-medium">
                                         Manual authorization can override billing gates for direct partner accounts.
                                     </p>
                                     <button 
                                        onClick={async () => {
                                            if (!user) return;
                                            try {
                                                const res = await unlockProjectDownloads(id as string, user.uid);
                                                if (res.success) {
                                                    toast.success("Gates authorized.");
                                                    setProject(prev => prev ? ({ ...prev, paymentStatus: 'full_paid', status: 'completed' }) : null);
                                                } else {
                                                    toast.error(res.error);
                                                }
                                            } catch (e) {
                                                toast.error("Override failed.");
                                            }
                                        }}
                                        className="w-full h-11 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 text-[10px] font-bold uppercase tracking-widest hover:bg-emerald-500 hover:text-primary-foreground transition-all active:scale-[0.98]"
                                     >
                                        Unlock Assets
                                     </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Metadata Section */}
                    <div className="enterprise-card p-6 md:p-8 space-y-8">
                        <div className="flex items-center gap-3 text-muted-foreground">
                            <LinkIcon className="h-4 w-4" /> 
                            <h3 className="text-[10px] font-bold uppercase tracking-widest">Project Details</h3>
                        </div>
                        
                        <div className="space-y-4">
                            <DetailRow label="Client Account" value={project.brand || project.clientName || 'N/A'} />
                            {assignedPM && <DetailRow label="Project Manager" value={assignedPM.displayName || "Assigned PM"} />}
                            {assignedSE && <DetailRow label="Sales Executive" value={assignedSE.displayName || "Assigned SE"} />}
                            {assignedSE && <DetailRow label="Sales Executive" value={assignedSE.displayName || "Assigned SE"} />}
                            {assignedEditor && <DetailRow label="Primary Editor" value={assignedEditor.displayName || "Assigned Editor"} />}
                            {(project as any).videoFormat && <DetailRow label="Video Format" value={(project as any).videoFormat} />}
                            {(project as any).aspectRatio && <DetailRow label="Aspect Ratio" value={(project as any).aspectRatio} />}
                            <DetailRow label="Estimated Duration" value={`${project.duration || 0}m`} />
                            <DetailRow label="Target Delivery" value={project.deadline ? project.deadline : "TBD"} />
                            <div className="pt-6 border-t border-border space-y-3">
                                <label className="text-[9px] text-muted-foreground uppercase font-black tracking-widest block">Project Intent</label>
                                <p className="text-sm text-muted-foreground leading-relaxed font-medium italic">
                                    "{project.description || "No description provided."}"
                                </p>
                            </div>
                        </div>
                    </div>

                    {(isClient || project.ownerId === user?.uid) && (assignedPM || assignedSE) && (
                        <div className="enterprise-card p-6 md:p-8 space-y-6">
                            <div className="flex items-center justify-between">
                                <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Project Team</h3>
                                <button
                                    onClick={() => setIsChatOpen(true)}
                                    className="h-9 px-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold uppercase tracking-widest hover:bg-emerald-500/20 transition-all"
                                >
                                    Open Chat
                                </button>
                            </div>

                            <div className="space-y-3">
                                {assignedPM && (
                                    <div className="flex items-center justify-between rounded-xl border border-border bg-muted/30 p-4">
                                        <div className="min-w-0">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Project Manager</p>
                                            <p className="text-sm font-bold text-foreground truncate mt-1">{assignedPM.displayName || 'Assigned PM'}</p>
                                            {assignedPM.email && <p className="text-xs text-muted-foreground truncate">{assignedPM.email}</p>}
                                        </div>
                                        <button
                                            onClick={() => setIsChatOpen(true)}
                                            className="h-9 px-3 rounded-lg bg-muted border border-border text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all text-[10px] font-bold uppercase tracking-widest"
                                        >
                                            Chat PM
                                        </button>
                                    </div>
                                )}

                                {assignedSE && (
                                    <div className="flex items-center justify-between rounded-xl border border-border bg-muted/30 p-4">
                                        <div className="min-w-0">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Sales Executive</p>
                                            <p className="text-sm font-bold text-foreground truncate mt-1">{assignedSE.displayName || 'Assigned SE'}</p>
                                            {assignedSE.email && <p className="text-xs text-muted-foreground truncate">{assignedSE.email}</p>}
                                        </div>
                                        <button
                                            onClick={() => setIsChatOpen(true)}
                                            className="h-9 px-3 rounded-lg bg-muted border border-border text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all text-[10px] font-bold uppercase tracking-widest"
                                        >
                                            Chat SE
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ===== PROFESSIONAL PROJECT ASSET DETAILS PANEL ===== */}
                    {/* Visible to ALL users: Editors, PMs, Admins, Clients */}
                    <div className="enterprise-card p-6 md:p-8 space-y-6">
                        <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                                <Briefcase className="h-4 w-4 text-primary" />
                            </div>
                            <h3 className="text-sm font-bold uppercase tracking-widest text-foreground">Project Assets</h3>
                        </div>

                        {/* Editor Not Accepted Warning */}
                        {project.assignmentStatus === 'pending' && !isClient && (
                            <motion.div 
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex items-start gap-3"
                            >
                                <AlertCircle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">Project Pending Review</p>
                                    <p className="text-xs text-amber-600/80 dark:text-amber-400/80 mt-1">Accept this project to access detailed assets and enable downloads</p>
                                </div>
                            </motion.div>
                        )}

                        <div className="grid gap-6">
                            {/* 1. Google Drive Link */}
                            <div className="space-y-3">
                                <div className="flex items-center gap-2">
                                    <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">📎 Google Drive Link</span>
                                </div>
                                {project.footageLink ? (
                                    <a 
                                        href={project.footageLink.startsWith('http') ? project.footageLink : `https://${project.footageLink}`} 
                                        target="_blank"
                                        className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20 hover:border-primary/40 hover:bg-primary/10 transition-all group"
                                    >
                                        <ExternalLink className="h-4 w-4 text-primary flex-shrink-0" />
                                        <span className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">Access Google Drive</span>
                                    </a>
                                ) : (
                                    <div className="p-3 rounded-lg border border-border/30 bg-muted/20">
                                        <p className="text-xs text-muted-foreground">Not uploaded yet</p>
                                    </div>
                                )}
                            </div>

                            {/* 2. Raw Video Files */}
                            <div className="space-y-3 pt-3 border-t border-border/30">
                                <div className="flex items-center gap-2">
                                    <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">🎬 Raw Video Files</span>
                                </div>
                                {project.rawFiles && project.rawFiles.length > 0 ? (
                                    <div className="grid gap-2 max-h-[250px] overflow-y-auto pr-2 custom-scrollbar">
                                        {project.rawFiles.map((file, idx) => (
                                            <div key={idx} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border/30 hover:bg-muted/30 transition-all group">
                                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                                    {file.name.match(/\.(zip|rar|7z)$/i) || file.type?.includes('zip') ? <Archive className="h-4 w-4 text-purple-500 flex-shrink-0" /> : <FileVideo className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
                                                    <div className="min-w-0">
                                                        <p className="text-xs font-semibold text-foreground truncate">{file.name}</p>
                                                        {file.size && <p className="text-[9px] text-muted-foreground">{(file.size / (1024*1024)).toFixed(1)} MB</p>}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2 flex-shrink-0">
                                                    {!(file.name.match(/\.(zip|rar|7z)$/i) || file.type?.includes('zip')) && (
                                                        <button 
                                                            onClick={() => setPreviewFile({ url: file.url, type: file.type || 'video/mp4', name: file.name, playbackId: (file as any).playbackId })} 
                                                            className="h-8 px-2.5 rounded text-xs font-bold uppercase tracking-widest bg-muted/50 hover:bg-primary/20 text-muted-foreground hover:text-primary transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                                            disabled={project.assignmentStatus === 'pending' && !isClient}
                                                            title={project.assignmentStatus === 'pending' && !isClient ? "Accept project to preview" : ""}
                                                        >
                                                            Preview
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => handleDirectDownload(file.url, file.name)}
                                                        className="h-8 w-8 rounded-lg bg-muted/50 hover:bg-primary/20 text-muted-foreground hover:text-primary flex items-center justify-center transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                                        disabled={project.assignmentStatus === 'pending' && !isClient}
                                                        title={project.assignmentStatus === 'pending' && !isClient ? "Accept project to download" : ""}
                                                    >
                                                        <Download className="h-3.5 w-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="p-3 rounded-lg border border-border/30 bg-muted/20">
                                        <p className="text-xs text-muted-foreground">Not uploaded yet</p>
                                    </div>
                                )}
                            </div>

                            {/* 3. Scripts & Directions */}
                            <div className="space-y-3 pt-3 border-t border-border/30">
                                <div className="flex items-center gap-2">
                                    <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">📝 Scripts & Directions</span>
                                </div>

                                {/* Uploaded Script Files */}
                                {project.scripts && project.scripts.length > 0 && (
                                    <div className="grid gap-2">
                                        {project.scripts.slice(0, 2).map((script, idx) => (
                                            <div key={idx} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border/30 hover:bg-muted/30 transition-all group">
                                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                                    <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                                    <p className="text-xs font-semibold text-foreground truncate">{script.name}</p>
                                                </div>
                                                <div className="flex items-center gap-2 flex-shrink-0">
                                                    <button 
                                                        onClick={() => setPreviewFile({ url: script.url, type: script.type || 'text/plain', name: script.name })}
                                                        className="h-8 px-2.5 rounded text-xs font-bold uppercase tracking-widest bg-muted/50 hover:bg-primary/20 text-muted-foreground hover:text-primary transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                                        disabled={project.assignmentStatus === 'pending' && !isClient}
                                                        title={project.assignmentStatus === 'pending' && !isClient ? "Accept project to preview" : ""}
                                                    >
                                                        Preview
                                                    </button>
                                                    <button 
                                                        onClick={() => handleDirectDownload(script.url, script.name)}
                                                        className="h-8 w-8 rounded-lg bg-muted/50 hover:bg-primary/20 text-muted-foreground hover:text-primary flex items-center justify-center transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                                        disabled={project.assignmentStatus === 'pending' && !isClient}
                                                        title={project.assignmentStatus === 'pending' && !isClient ? "Accept project to download" : ""}
                                                    >
                                                        <Download className="h-3.5 w-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Pasted Script Text */}
                                {(project as any).scriptText && (
                                    <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                                        <div className="flex items-center justify-between gap-2 mb-3">
                                            <p className="text-[10px] font-bold uppercase tracking-widest text-primary">✍️ Pasted Script</p>
                                            <button 
                                                onClick={() => {
                                                    navigator.clipboard.writeText((project as any).scriptText);
                                                    toast.success("Script copied to clipboard");
                                                }}
                                                className="h-7 px-2.5 rounded text-[9px] font-bold uppercase tracking-widest bg-primary/10 hover:bg-primary/20 text-primary transition-all flex items-center gap-1.5"
                                            >
                                                <Copy className="h-3 w-3" /> Copy
                                            </button>
                                        </div>
                                        <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap font-medium max-h-[120px] overflow-y-auto">
                                            {(project as any).scriptText}
                                        </p>
                                    </div>
                                )}

                                {/* Empty State */}
                                {!((project as any).scriptText) && (!project.scripts || project.scripts.length === 0) && (
                                    <div className="p-3 rounded-lg border border-border/30 bg-muted/20">
                                        <p className="text-xs text-muted-foreground">Not uploaded yet</p>
                                    </div>
                                )}
                            </div>

                            {/* 4. Audio Files */}
                            <div className="space-y-3 pt-3 border-t border-border/30">
                                <div className="flex items-center gap-2">
                                    <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">🎧 Audio Files</span>
                                </div>
                                {project.audioFiles && project.audioFiles.length > 0 ? (
                                    <div className="grid gap-2 max-h-[250px] overflow-y-auto pr-2 custom-scrollbar">
                                        {project.audioFiles.map((file, idx) => (
                                            <div key={`${file.url}-${idx}`} className="p-3 rounded-lg border border-border/30 hover:bg-muted/30 transition-all group space-y-2 overflow-hidden">
                                                <div className="flex items-center justify-between gap-3 min-w-0">
                                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                                        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                                                        <p className="text-xs font-semibold text-foreground truncate min-w-0 block">{file.name}</p>
                                                    </div>
                                                    <button
                                                        onClick={() => handleDirectDownload(file.url, file.name)}
                                                        className="h-8 w-8 rounded-lg bg-muted/50 hover:bg-primary/20 text-muted-foreground hover:text-primary flex items-center justify-center transition-all shrink-0"
                                                    >
                                                        <Download className="h-3.5 w-3.5" />
                                                    </button>
                                                </div>
                                                <audio controls className="w-full max-w-full h-8" src={file.url} preload="metadata" />
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="p-3 rounded-lg border border-border/30 bg-muted/20">
                                        <p className="text-xs text-muted-foreground">Not uploaded yet</p>
                                    </div>
                                )}
                            </div>

                            {/* 5. B-Roll Assets */}
                            <div className="space-y-3 pt-3 border-t border-border/30">
                                <div className="flex items-center gap-2">
                                    <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">🎞️ B-Roll Assets</span>
                                </div>
                                {(project as any).bRoleFiles && (project as any).bRoleFiles.length > 0 ? (
                                    <div className="grid gap-2 max-h-[250px] overflow-y-auto pr-2 custom-scrollbar">
                                        {(project as any).bRoleFiles.map((file: any, idx: number) => (
                                            <div key={idx} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border/30 hover:bg-muted/30 transition-all group">
                                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                                    {file.name.match(/\.(zip|rar|7z)$/i) || file.type?.includes('zip') ? <Archive className="h-4 w-4 text-purple-500 flex-shrink-0" /> : file.type?.includes('image') ? (
                                                        <ImageIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                                    ) : (
                                                        <FileVideo className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                                    )}
                                                    <p className="text-xs font-semibold text-foreground truncate">{file.name}</p>
                                                </div>
                                                <div className="flex items-center gap-2 flex-shrink-0">
                                                    {!(file.name.match(/\.(zip|rar|7z)$/i) || file.type?.includes('zip')) && (
                                                        <button 
                                                            onClick={() => setPreviewFile({ url: file.url, type: file.type || 'video/mp4', name: file.name, playbackId: (file as any).playbackId })}
                                                            className="h-8 px-2.5 rounded text-xs font-bold uppercase tracking-widest bg-muted/50 hover:bg-primary/20 text-muted-foreground hover:text-primary transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                                            disabled={project.assignmentStatus === 'pending' && !isClient}
                                                            title={project.assignmentStatus === 'pending' && !isClient ? "Accept project to preview" : ""}
                                                        >
                                                            Preview
                                                        </button>
                                                    )}
                                                    <button 
                                                        onClick={() => handleDirectDownload(file.url, file.name)}
                                                        className="h-8 w-8 rounded-lg bg-muted/50 hover:bg-primary/20 text-muted-foreground hover:text-primary flex items-center justify-center transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                                        disabled={project.assignmentStatus === 'pending' && !isClient}
                                                        title={project.assignmentStatus === 'pending' && !isClient ? "Accept project to download" : ""}
                                                    >
                                                        <Download className="h-3.5 w-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="p-3 rounded-lg border border-border/30 bg-muted/20">
                                        <p className="text-xs text-muted-foreground">Not uploaded yet</p>
                                    </div>
                                )}
                            </div>

                            {/* 5. Style References */}
                            <div className="space-y-3 pt-3 border-t border-border/30">
                                <div className="flex items-center gap-2">
                                    <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">✨ Style References</span>
                                </div>

                                {/* Reference Link */}
                                {(project as any).referenceLink && (
                                    <a 
                                        href={(project as any).referenceLink.startsWith('http') ? (project as any).referenceLink : `https://${(project as any).referenceLink}`}
                                        target="_blank"
                                        className="flex items-center gap-3 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20 hover:border-emerald-500/40 hover:bg-emerald-500/10 transition-all group"
                                    >
                                        <LinkIcon className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                                        <span className="text-sm font-semibold text-foreground group-hover:text-emerald-600 transition-colors">Open Style Reference</span>
                                    </a>
                                )}

                                {/* Reference Files */}
                                {projectStyleReferenceFiles.length > 0 && (
                                    <div className="grid gap-2 max-h-[250px] overflow-y-auto pr-2 custom-scrollbar">
                                        {projectStyleReferenceFiles.map((file: any, idx: number) => (
                                            <div key={idx} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border/30 hover:bg-muted/30 transition-all group">
                                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                                    {file.type?.includes('image') ? (
                                                        <ImageIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                                    ) : (
                                                        <FileVideo className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                                    )}
                                                    <p className="text-xs font-semibold text-foreground truncate">{file.name}</p>
                                                </div>
                                                <div className="flex items-center gap-2 flex-shrink-0">
                                                    <button 
                                                        onClick={() => setPreviewFile({ url: file.url, type: file.type || 'image', name: file.name, playbackId: (file as any).playbackId })}
                                                        className="h-8 px-2.5 rounded text-xs font-bold uppercase tracking-widest bg-muted/50 hover:bg-primary/20 text-muted-foreground hover:text-primary transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                                        disabled={project.assignmentStatus === 'pending' && !isClient}
                                                        title={project.assignmentStatus === 'pending' && !isClient ? "Accept project to preview" : ""}
                                                    >
                                                        Preview
                                                    </button>
                                                    <button 
                                                        onClick={() => handleDirectDownload(file.url, file.name)}
                                                        className="h-8 w-8 rounded-lg bg-muted/50 hover:bg-primary/20 text-muted-foreground hover:text-primary flex items-center justify-center transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                                        disabled={project.assignmentStatus === 'pending' && !isClient}
                                                        title={project.assignmentStatus === 'pending' && !isClient ? "Accept project to download" : ""}
                                                    >
                                                        <Download className="h-3.5 w-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Empty State */}
                                {!(project as any).referenceLink && projectStyleReferenceFiles.length === 0 && (
                                    <div className="p-3 rounded-lg border border-border/30 bg-muted/20">
                                        <p className="text-xs text-muted-foreground">Not uploaded yet</p>
                                    </div>
                                )}
                            </div>

                            {/* 6. PM Uploaded Files */}
                            <div className="space-y-3 pt-3 border-t border-border/30">
                                <div className="flex items-center gap-2">
                                    <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">📤 PM Uploaded Files</span>
                                </div>
                                {projectPmFiles.length > 0 ? (
                                    <div className="grid gap-2 max-h-[250px] overflow-y-auto pr-2 custom-scrollbar">
                                        {projectPmFiles.map((file: any, idx: number) => (
                                            <div key={`${file.url}-${idx}`} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border/30 hover:bg-muted/30 transition-all group">
                                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                                    {file.type?.includes('image') ? (
                                                        <ImageIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                                    ) : (
                                                        <FileVideo className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                                    )}
                                                    <p className="text-xs font-semibold text-foreground truncate">{file.name}</p>
                                                </div>
                                                <div className="flex items-center gap-2 flex-shrink-0">
                                                    <button
                                                        onClick={() => setPreviewFile({ url: file.url, type: file.type || 'application/octet-stream', name: file.name, playbackId: (file as any).playbackId })}
                                                        className="h-8 px-2.5 rounded text-xs font-bold uppercase tracking-widest bg-muted/50 hover:bg-primary/20 text-muted-foreground hover:text-primary transition-all"
                                                    >
                                                        Preview
                                                    </button>
                                                    <button
                                                        onClick={() => handleDirectDownload(file.url, file.name)}
                                                        className="h-8 w-8 rounded-lg bg-muted/50 group-hover:bg-primary/20 group-hover:text-primary text-muted-foreground flex items-center justify-center transition-all flex-shrink-0"
                                                    >
                                                        <Download className="h-3.5 w-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="p-3 rounded-lg border border-border/30 bg-muted/20">
                                        <p className="text-xs text-muted-foreground">No PM uploads yet</p>
                                    </div>
                                )}
                            </div>

                            {previewFile && (
                                <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-xl flex items-center justify-center p-4" onClick={() => setPreviewFile(null)}>
                                    <div className="relative max-w-5xl w-full max-h-[90vh] bg-black rounded-3xl overflow-hidden shadow-[0_0_100px_rgba(var(--primary),0.2)] flex items-center justify-center" onClick={e => e.stopPropagation()}>
                                        <button onClick={() => setPreviewFile(null)} className="absolute top-6 right-6 h-12 w-12 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center backdrop-blur-md z-10 transition-all">
                                            <X className="h-6 w-6" />
                                        </button>
                                        
                                        {/* Image Preview */}
                                        {previewFile.type === 'image' || previewFile.type.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(previewFile.name) ? (
                                            <img src={previewFile.url} alt={previewFile.name} className="max-w-full max-h-full object-contain" />
                                        ) : previewFile.type === 'video' || previewFile.type.startsWith('video/') || /\.(mp4|webm|mov|avi|mkv)$/i.test(previewFile.name) ? (
                                            <VideoPlayer videoPath={previewFile.url} playbackId={previewFile.playbackId} title={previewFile.name} className="w-full h-full" />
                                        ) : previewFile.type === 'pdf' || previewFile.type === 'application/pdf' || previewFile.name.toLowerCase().endsWith('.pdf') ? (
                                            <iframe src={previewFile.url} className="w-full h-screen border-none" />
                                        ) : (
                                            <div className="flex flex-col items-center gap-6 p-12 text-center">
                                                <div className="h-20 w-20 bg-muted/20 rounded-2xl flex items-center justify-center border border-border">
                                                    <FileText className="h-10 w-10 text-muted-foreground" />
                                                </div>
                                                <div className="space-y-2">
                                                    <h3 className="text-xl font-bold text-white tracking-tight">{previewFile.name}</h3>
                                                    <p className="text-muted-foreground text-sm uppercase tracking-widest font-bold">Preview not available for this file type</p>
                                                </div>
                                                <button 
                                                    onClick={() => handleDirectDownload(previewFile.url, previewFile.name)}
                                                    className="h-12 px-8 rounded-xl bg-primary text-primary-foreground text-[11px] font-bold uppercase tracking-widest hover:bg-zinc-200 transition-all flex items-center gap-3"
                                                >
                                                    <Download className="h-4 w-4" /> Download to View
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Client Upload */}
                            {isClient && (
                                <div className="pt-4 border-t border-border">
                                    {isUploadingAsset ? (
                                        <div className="w-full bg-muted/50 rounded-xl border border-border px-4 py-3 space-y-2.5">
                                            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                                                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                                                Uploading Raw Asset
                                            </div>
                                            <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                                                <motion.div
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${uploadAssetProgress}%` }}
                                                    className="h-full bg-primary shadow-[0_0_10px_rgba(99,102,241,0.6)]"
                                                />
                                            </div>
                                            <div className="grid grid-cols-1 xs:grid-cols-2 md:grid-cols-3 gap-2 text-[10px] text-muted-foreground">
                                                <div>Progress: <span className="text-foreground font-bold">{uploadAssetProgress.toFixed(1)}%</span></div>
                                                <div>Speed: <span className="text-foreground font-bold">{formatBytes(uploadAssetSpeedBps)}/s</span></div>
                                                <div>ETA: <span className="text-foreground font-bold">{formatEta(uploadAssetEtaSeconds)}</span></div>
                                            </div>
                                        </div>
                                    ) : (
                                        <label className="flex items-center justify-center w-full h-24 rounded-xl border-2 border-dashed border-border hover:border-primary/50 hover:bg-muted/50 transition-all cursor-pointer group">
                                            <div className="text-center">
                                                <Upload className="h-6 w-6 mx-auto text-muted-foreground group-hover:text-primary transition-colors mb-1" />
                                                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground group-hover:text-primary transition-colors">Upload Raw Files</p>
                                            </div>
                                            <input 
                                                type="file"
                                                onChange={handleAssetUpload}
                                                disabled={isUploadingAsset}
                                                className="hidden"
                                                accept="video/*"
                                            />
                                        </label>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Operational Progress */}
                    <div className="enterprise-card p-6 md:p-8 space-y-8">
                        <div className="flex justify-between items-center">
                            <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Project Timeline</h3>
                            <Activity className="h-3 w-3 text-muted-foreground" />
                        </div>
                        <div className="space-y-8 relative px-2">
                            <div className="absolute left-[13px] top-4 bottom-4 w-[1px] bg-muted/50" />
                            <Milestone label="Project Started" date="Validated" active />
                            <Milestone label="Editing" date={revisions.length > 0 ? "Active" : "Pending"} active={revisions.length > 0} />
                            <Milestone label="Client Review" date="Scheduled" active={revisions.length > 0} />
                            <Milestone label="Final Delivery" date="Pending" active={project.status === 'completed'} />
                        </div>
                    </div>


                </div>
            </div>
            )}

            {/* Payment Authorization Modal */}
            <Modal
               isOpen={isPaymentModalOpen}
               onClose={() => setIsPaymentModalOpen(false)}
               title="Payment"
            >
                <div className="space-y-8">
                    <div className="flex items-center gap-5 p-6 bg-emerald-500/[0.03] text-emerald-400 rounded-xl border border-emerald-500/20">
                        <div className="h-12 w-12 bg-emerald-500/10 rounded-xl flex items-center justify-center shrink-0 border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.1)]">
                            <IndianRupee className="h-6 w-6" />
                        </div>
                        <div className="space-y-0.5 min-w-0">
                            <h4 className="font-bold text-base tracking-tight truncate">Final 50% Balance</h4>
                            <p className="text-xs text-muted-foreground font-medium leading-relaxed">Complete your remaining project payment with 18% GST to unlock high-quality download.</p>
                        </div>
                    </div>

                    <div className="space-y-3 px-1">
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-muted-foreground font-bold uppercase tracking-widest text-[10px]">Total Project Cost (Excl. GST)</span>
                            <span className="text-muted-foreground font-bold font-heading">₹{project?.totalCost?.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-muted-foreground font-bold uppercase tracking-widest text-[10px]">Initial 50% Paid</span>
                            <span className="font-bold font-heading text-emerald-500">₹{(project?.amountPaid || 0).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-muted-foreground font-bold uppercase tracking-widest text-[10px]">GST on Final Billing (18%)</span>
                            <span className="text-muted-foreground font-bold font-heading">₹{((((project?.totalCost || 0) - (project?.amountPaid || 0)) * 0.18)).toLocaleString()}</span>
                        </div>
                        <div className="h-px bg-muted/50 my-4" />
                        <div className="flex justify-between items-end">
                            <span className="text-foreground font-bold uppercase tracking-widest text-[11px] mb-1">Final Billing Amount (Incl. GST)</span>
                            <span className="text-primary font-black font-heading text-4xl tracking-tighter text-glow">₹{((((project?.totalCost || 0) - (project?.amountPaid || 0)) * 1.18)).toLocaleString()}</span>
                        </div>
                    </div>

                    <div className="pt-4 space-y-4">
                        <PaymentButton 
                            projectId={id as string}
                            user={user}
                            amount={((project?.totalCost || 0) - (project?.amountPaid || 0)) * 1.18}
                            accountingAmount={(project?.totalCost || 0) - (project?.amountPaid || 0)}
                            taxRate={18}
                            description={`Final Payment: ${project?.name}`}
                            prefill={{
                                name: user?.displayName || "",
                                email: user?.email || ""
                            }}
                            onSuccess={async () => {
                                const finalAmount = (project?.totalCost || 0) - (project?.amountPaid || 0);
                                if ((project as any).isPayLaterRequest) {
                                    // Settle pending dues for pay later
                                    const userRef = doc(db, "users", user!.uid);
                                    await updateDoc(userRef, {
                                        pendingDues: increment(-finalAmount)
                                    });
                                }
                                
                                await updateDoc(doc(db, "projects", id as string), {
                                    paymentStatus: 'full_paid',
                                    amountPaid: project?.totalCost
                                });
                                
                                setProject(prev => prev ? ({ 
                                    ...prev, 
                                    paymentStatus: 'full_paid', 
                                    amountPaid: project?.totalCost 
                                }) : null);

                                setIsPaymentModalOpen(false);

                                // If they've already rated before, go straight to download.
                                // Otherwise, require rating first.
                                if (project?.editorRating) {
                                    toast.success("Payment successful! Starting your download...");
                                    if (pendingDownloadId) {
                                        const rid = pendingDownloadId;
                                        setPendingDownloadId(null);
                                        setTimeout(() => executeDownload(rid), 300);
                                    }
                                } else {
                                    toast.success("Payment successful! Please rate your editor to unlock the download.");
                                    setTimeout(() => {
                                        setIsRatingModalOpen(true);
                                    }, 500);
                                }
                            }}
                        />
                        <p className="text-center text-[10px] text-muted-foreground font-bold uppercase tracking-widest opacity-60">
                            Secure payments by Razorpay
                        </p>
                    </div>
                </div>
        </Modal>


            {/* Timeline Modal */}
            <Modal
                isOpen={isTimelineModalOpen}
                onClose={() => setIsTimelineModalOpen(false)}
                title="Project Timeline"
            >
                <div className="space-y-6">
                    <p className="text-sm text-muted-foreground">Track each stage of your project in one place.</p>
                    <div className="space-y-8 relative px-2 py-2">
                        <div className="absolute left-[13px] top-4 bottom-4 w-[1px] bg-muted/50" />
                        <Milestone label="Project Started" date="Validated" active />
                        <Milestone label="Editing" date={revisions.length > 0 ? "Active" : "Pending"} active={revisions.length > 0} />
                        <Milestone label="Client Review" date={revisions.length > 0 ? "Ready" : "Scheduled"} active={revisions.length > 0} />
                        <Milestone label="Final Delivery" date={project.status === 'completed' ? "Delivered" : "Pending"} active={project.status === 'completed'} />
                    </div>
                    <button
                        onClick={() => setIsTimelineModalOpen(false)}
                        className="w-full h-11 rounded-lg bg-primary text-primary-foreground text-[11px] font-bold uppercase tracking-widest hover:bg-primary/90 transition-all"
                    >
                        Close
                    </button>
                </div>
            </Modal>

            {/* Rating Modal */}
            <Modal
                isOpen={isRatingModalOpen}
                onClose={() => setIsRatingModalOpen(false)}
                title="Rate Your Editor"
            >
                <div className="space-y-6">
                    <p className="text-muted-foreground text-sm leading-relaxed text-center">
                        How was your experience working with {project?.assignedEditorId ? editors.find(e => e.uid === project.assignedEditorId)?.displayName || 'your editor' : 'your editor'}?
                    </p>
                    <div className="flex justify-center gap-2">
                        {[1, 2, 3, 4, 5].map((star) => (
                            <button
                                key={star}
                                onClick={() => setEditorRating(star)}
                                className={cn(
                                    "p-2 rounded-xl transition-all",
                                    editorRating >= star ? "text-yellow-400 bg-yellow-400/10 shadow-[0_0_15px_rgba(250,204,21,0.2)]" : "text-muted-foreground hover:text-yellow-400/50 hover:bg-muted"
                                )}
                            >
                                <Star className={cn("h-8 w-8", editorRating >= star ? "fill-yellow-400" : "")} />
                            </button>
                        ))}
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Leave a Review <span className="text-muted-foreground/50 normal-case font-medium">(Optional)</span></label>
                        <textarea
                            value={editorReview}
                            onChange={(e) => setEditorReview(e.target.value)}
                            placeholder="Share your thoughts about the video editing quality, speed, and communication..."
                            className="w-full h-32 bg-black/5 dark:bg-black/40 border border-border rounded-xl p-4 text-sm text-foreground focus:outline-none focus:border-primary/50 transition-colors resize-none"
                        />
                    </div>
                    {editorRating === 0 && (
                        <p className="text-[11px] text-amber-500 font-bold text-center flex items-center justify-center gap-1.5">
                            <Star className="h-3.5 w-3.5 fill-amber-500" /> A star rating is required to proceed
                        </p>
                    )}
                    <button
                        onClick={handleRatingSubmit}
                        disabled={isSubmittingRating || editorRating === 0}
                        className="w-full h-12 rounded-xl bg-primary  text-primary-foreground text-[11px] font-bold uppercase tracking-widest hover:bg-zinc-200 transition-all active:scale-[0.98] disabled:opacity-50"
                    >
                        {isSubmittingRating ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : "Submit & Download"}
                    </button>
                </div>
            </Modal>
        </div>
    );
}

// Visual Sub-components
function StatusIndicator({ status }: { status: string }) {
    const config: any = {
        completed: { label: "Completed", bg: "bg-emerald-500/10", border: "border-emerald-500/30", text: "text-emerald-400" },
        active: { label: "In Production", bg: "bg-blue-500/10", border: "border-blue-500/30", text: "text-blue-400" },
        pending_assignment: { label: "Setup Initiation", bg: "bg-amber-500/10", border: "border-amber-500/30", text: "text-amber-400" },
    };
    const c = config[status] || config.active;
    return (
        <div className={cn("px-4 py-2 rounded-xl border text-[11px] font-black uppercase tracking-widest bg-black/5 dark:bg-black/40 shadow-lg", c.border, c.text)}>
            <div className="flex items-center gap-2">
                <div className={cn("h-1.5 w-1.5 rounded-full bg-current", status !== 'completed' && "animate-pulse")} />
                {c.label}
            </div>
        </div>
    )
}

function DetailRow({ label, value }: { label: string, value: string }) {
    return (
        <div className="flex justify-between items-end border-b border-border pb-4 group last:border-0 last:pb-0">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground group-hover:text-muted-foreground transition-colors mb-0.5">{label}</span>
            <span className="font-heading font-black text-base text-foreground group-hover:text-primary transition-all tracking-tight">{value}</span>
        </div>
    );
}

function Milestone({ label, date, active }: { label: string, date: string, active?: boolean }) {
    return (
        <div className="flex items-start gap-6 relative z-10 group">
            <div className={cn(
                "h-6 w-6 rounded-lg border transition-all duration-700 relative z-20 mt-0.5 flex items-center justify-center shadow-lg",
                active ? "bg-primary border-primary/50 shadow-primary/20 rotate-45" : "bg-zinc-900 border-border"
            )}>
                 {active && <div className="h-2 w-2 bg-primary  rounded-full -rotate-45 shadow-[0_0_8px_rgba(255,255,255,0.8)]" />}
            </div>
            <div className="space-y-1">
                <p className={cn("text-[11px] font-black uppercase tracking-[0.2em] transition-colors", active ? "text-foreground" : "text-muted-foreground")}>{label}</p>
                <p className={cn("text-[10px] font-bold tracking-widest uppercase", active ? "text-muted-foreground" : "text-muted-foreground")}>{date}</p>
            </div>
            {active && (
                <div className="absolute left-2.5 top-2.5 -translate-x-1/2 -translate-y-1/2 w-4 h-4 bg-primary/20 blur-md rounded-full pointer-events-none" />
            )}
        </div>
    );
}
