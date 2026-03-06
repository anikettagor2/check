"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/context/auth-context";
import { db, storage } from "@/lib/firebase/config";
import { doc, collection, query, where, orderBy, updateDoc, arrayUnion, onSnapshot } from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { Project, Revision } from "@/types/schema";
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
    Star
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { assignEditor, getAllUsers, respondToAssignment } from "@/app/actions/admin-actions";
import { unlockProjectDownloads, requestDownloadUnlock, registerDownload, submitEditorRating } from "@/app/actions/project-actions";
import { User, ProjectAssignmentStatus } from "@/types/schema";
import { Modal } from "@/components/ui/modal";
import { PaymentButton } from "@/components/payment-button";
import { ProjectChat } from "@/components/project-chat";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";

interface ExtendedProject extends Project {
    brand?: string;
    duration?: number;
    deadline?: string;
    totalCost?: number;
    amountPaid?: number;
    footageLink?: string;
    assignmentStatus?: ProjectAssignmentStatus;
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
    const [isDownloading, setIsDownloading] = useState(false);
    const [assignedPM, setAssignedPM] = useState<User | null>(null);

    const handleAssetUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || !e.target.files[0] || !project) return;
        const file = e.target.files[0];
        
        setIsUploadingAsset(true);
        try {
            const storageRef = ref(storage, `raw_footage/${project.ownerId}/${Date.now()}_${file.name}`);
            const uploadTask = uploadBytesResumable(storageRef, file);

            await new Promise<void>((resolve, reject) => {
                uploadTask.on('state_changed', 
                    (snapshot) => {
                        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                        setUploadAssetProgress(progress);
                    }, 
                    (error) => reject(error), 
                    () => resolve()
                );
            });

            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
            const newFileMetadata = {
                name: file.name,
                url: downloadURL,
                size: file.size,
                type: file.type,
                uploadedAt: Date.now()
            };

            await updateDoc(doc(db, "projects", project.id), {
                rawFiles: arrayUnion(newFileMetadata)
            });

            toast.success("File uploaded successfully.");

        } catch (error) {
            console.error("Asset upload failed:", error);
            toast.error("Upload failed.");
        } finally {
            setIsUploadingAsset(false);
            setUploadAssetProgress(0);
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

    // Admin: Fetch Editors & PMs
    useEffect(() => {
        if (user?.role === 'admin' || user?.role === 'project_manager' || (user?.role === 'client' && project?.assignedPMId)) {
            getAllUsers().then(res => {
                if (res.success && res.data) {
                    const allUsers = res.data as User[];
                    if (user?.role === 'admin' || user?.role === 'project_manager') {
                        setEditors(allUsers.filter(u => u.role === 'editor'));
                    }
                    if (project?.assignedPMId) {
                        const pm = allUsers.find(u => u.uid === project.assignedPMId);
                        if (pm) setAssignedPM(pm);
                    }
                }
            });
        }
    }, [user, project?.assignedPMId]);

    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
    const [selectedEditorId, setSelectedEditorId] = useState<string | null>(null);
    const [editorRevenueShare, setEditorRevenueShare] = useState<string>("");
    const [previewFileUrl, setPreviewFileUrl] = useState<string | null>(null);
    const [isRatingModalOpen, setIsRatingModalOpen] = useState(false);
    const [editorRating, setEditorRating] = useState(0);
    const [editorReview, setEditorReview] = useState('');
    const [isSubmittingRating, setIsSubmittingRating] = useState(false);
    const [pendingDownloadId, setPendingDownloadId] = useState<string | null>(null);
    const [isChatOpen, setIsChatOpen] = useState(false);

    const initiateDownload = async (revisionId: string) => {
        setIsDownloading(true);
        try {
            const res = await registerDownload(id as string, revisionId);
            if (res.success && res.downloadUrl) {
                const anchor = document.createElement('a');
                anchor.href = res.downloadUrl;
                anchor.download = `${project?.name || 'video'}_v${revisions.find(r => r.id===revisionId)?.version || 1}.mp4`;
                document.body.appendChild(anchor);
                anchor.click();
                document.body.removeChild(anchor);
                toast.success(`Download initiated.`);
                
                const isPayLaterMode = user?.payLater || (project as any).isPayLaterRequest;
                if (isPayLaterMode) {
                    await updateDoc(doc(db, "projects", id as string), {
                        clientHasDownloaded: true,
                        downloadUnlockedAt: Date.now(),
                        status: 'completed'
                    });
                    setProject(prev => prev ? ({ ...prev, clientHasDownloaded: true, status: 'completed' }) : null);
                } else {
                    await updateDoc(doc(db, "projects", id as string), {
                        status: 'completed'
                    });
                    setProject(prev => prev ? ({ ...prev, status: 'completed' }) : null);
                }
            } else {
                toast.error(res.error || 'Download error.');
            }
        } catch (e: any) {
            toast.error(e.message || 'Download failed.');
        } finally {
            setIsDownloading(false);
        }
    };

    const handleRatingSubmit = async () => {
        if (editorRating === 0) {
            toast.error("Please select a rating.");
            return;
        }
        setIsSubmittingRating(true);
        try {
            const res = await submitEditorRating(id as string, editorRating, editorReview);
            if (res.success) {
                toast.success("Thank you for your feedback!");
                setProject(prev => prev ? ({ ...prev, editorRating, editorReview }) : null);
                setIsRatingModalOpen(false);
                
                if (pendingDownloadId) {
                    await initiateDownload(pendingDownloadId);
                    setPendingDownloadId(null);
                }
            } else {
                toast.error(res.error);
            }
        } catch (e: any) {
            toast.error("Failed to submit rating.");
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
            await respondToAssignment(id, response, reason);
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
    const isEditor = user?.role === 'editor';
    const isAssignedEditor = isEditor && project.assignedEditorId === user?.uid;
    const isPaymentLocked = isClient && project.paymentStatus !== 'full_paid';

    const showFeedbackTool = canManage ? (project.assignmentStatus === 'accepted') : true;

    // EDITOR OFFER VIEW
    if (isAssignedEditor && project.assignmentStatus === 'pending') {
        return (
            <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6 mesh-grid">
                <motion.div 
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="max-w-xl w-full enterprise-card bg-card p-10 space-y-8 shadow-2xl relative overflow-hidden"
                >
                     <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-indigo-400 to-primary/40" />
                     
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

                        {(project.footageLink || (project.rawFiles && project.rawFiles.length > 0) || project.referenceLink || (project.referenceFiles && project.referenceFiles.length > 0)) && (
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

                                {(project.rawFiles && project.rawFiles.length > 0) && (
                                    <div className="space-y-2">
                                        <p className="text-[9px] text-muted-foreground font-black uppercase tracking-widest ml-1">Raw Files</p>
                                        <div className="grid gap-2">
                                            {project.rawFiles.map((file: any, idx: number) => (
                                                <div key={idx} className="flex items-center justify-between p-2.5 bg-black/5 dark:bg-black/40 rounded-lg border border-border group">
                                                    <div className="flex items-center gap-3 min-w-0">
                                                        <FileVideo className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                                                        <div className="flex flex-col min-w-0">
                                                            <span className="text-xs font-bold text-muted-foreground truncate">{file.name}</span>
                                                            <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">{(file.size ? (file.size / (1024*1024)).toFixed(2) : '?')} MB</span>
                                                        </div>
                                                    </div>
                                                    <button onClick={() => setPreviewFileUrl(file.url)} className="h-8 px-3 rounded bg-muted hover:bg-primary/20 hover:text-primary text-muted-foreground text-[9px] font-bold uppercase tracking-widest transition-all">Preview</button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {(project as any).referenceFiles && (project as any).referenceFiles.length > 0 && (
                                    <div className="space-y-2">
                                        <p className="text-[9px] text-primary/70 font-black uppercase tracking-widest ml-1">Reference Assets</p>
                                        <div className="grid gap-2">
                                            {(project as any).referenceFiles.map((file: any, idx: number) => (
                                                <div key={idx} className="flex items-center justify-between p-2.5 bg-primary/5 rounded-lg border border-primary/10 group">
                                                    <div className="flex items-center gap-3 min-w-0">
                                                        <Eye className="h-4 w-4 text-primary/70 group-hover:text-primary transition-colors" />
                                                        <div className="flex flex-col min-w-0">
                                                            <span className="text-xs font-bold text-primary/70 truncate">{file.name}</span>
                                                        </div>
                                                    </div>
                                                    <button onClick={() => setPreviewFileUrl(file.url)} className="h-8 px-3 rounded bg-primary/10 hover:bg-primary/20 hover:text-primary text-primary/70 text-[9px] font-bold uppercase tracking-widest transition-all">Preview</button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {previewFileUrl && (
                                    <div className="mt-4 rounded-xl overflow-hidden bg-background border border-border relative">
                                        <button onClick={() => setPreviewFileUrl(null)} className="absolute top-2 right-2 h-8 w-8 bg-black/60 text-white rounded-lg flex items-center justify-center z-10 hover:bg-red-500 transition-colors"><X className="h-4 w-4" /></button>
                                        <video src={previewFileUrl} controls controlsList="nodownload" className="w-full max-h-[400px]" autoPlay />
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
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                        <div className="enterprise-card p-6 bg-muted/50">
                            <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Project Name</span>
                            <div className="text-xl font-bold text-foreground mt-1 truncate">{project.name}</div>
                        </div>
                        <div className="enterprise-card p-6 bg-muted/50">
                            <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Client Name</span>
                            <div className="text-xl font-bold text-foreground mt-1 truncate">{project.brand || project.clientName || 'N/A'}</div>
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
                    {latestRevision && (project.paymentStatus === 'full_paid' || user?.payLater || (project as any).isPayLaterRequest) && (
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
                                
                                <div className="absolute inset-0 flex items-center justify-center bg-black/5 dark:bg-black/40 dark:bg-black/5 dark:bg-black/40 dark:bg-black/5 dark:bg-black/40 dark:bg-black/5 dark:bg-black/40 opacity-0 group-hover:opacity-100 transition-all duration-500 backdrop-blur-sm">
                                    {showFeedbackTool ? (
                                        <Link href={`/dashboard/projects/${id}/review/${latestRevision.id}`}>
                                            <button className="h-20 w-20 bg-primary  rounded-full flex items-center justify-center hover:scale-110 transition-transform shadow-2xl active:scale-95">
                                                <Play className="h-8 w-8 text-primary-foreground fill-primary ml-1" />
                                            </button>
                                        </Link>
                                    ) : (
                                        <div className="flex flex-col items-center gap-4">
                                            <div className="h-16 w-16 bg-muted rounded-full flex items-center justify-center border border-border opacity-50">
                                                <Lock className="h-6 w-6 text-muted-foreground" />
                                            </div>
                                            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-4 py-2 bg-black/5 dark:bg-black/40 dark:bg-black/5 dark:bg-black/40 dark:bg-black/5 dark:bg-black/40 dark:bg-black/5 dark:bg-black/40 border border-border rounded-lg">
                                                Awaiting Next Steps
                                            </span>
                                        </div>
                                    )}
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
                                    {showFeedbackTool && (
                                        <Link href={`/dashboard/projects/${id}/review/${latestRevision.id}`}>
                                            <button className="h-11 px-5 rounded-lg bg-muted/50 border border-border hover:bg-muted/50 text-muted-foreground hover:text-foreground text-[11px] font-bold uppercase tracking-widest transition-all active:scale-[0.98] flex items-center gap-2.5">
                                                <MessageSquare className="h-4 w-4" />
                                                Add Comments
                                            </button>
                                        </Link>
                                    )}
                                    {isClient ? (
                                        (() => {
                                            if (isPaymentLocked && !user?.payLater) {
                                                return (
                                                    <button onClick={handleFinalPayment} className="h-11 px-6 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-bold uppercase tracking-widest hover:bg-emerald-500/20 transition-all active:scale-[0.98] flex items-center gap-2.5 shadow-[0_0_20px_rgba(16,185,129,0.1)]">
                                                        <IndianRupee className="h-4 w-4" />
                                                        Complete Payment
                                                    </button>
                                                );
                                            }

                                            if (project.downloadsUnlocked || user?.payLater || (project as any).isPayLaterRequest) {
                                                return (
                                                    <button
                                                        disabled={isDownloading}
                                                        onClick={async () => {
                                                            if (!latestRevision) return;
                                                            if (isClient && !project.editorRating) {
                                                                setPendingDownloadId(latestRevision.id);
                                                                setIsRatingModalOpen(true);
                                                            } else {
                                                                await initiateDownload(latestRevision.id);
                                                            }
                                                        }}
                                                        className="h-11 px-6 rounded-lg bg-primary  text-primary-foreground text-[11px] font-bold uppercase tracking-widest hover:bg-zinc-200 transition-all active:scale-[0.98] flex items-center gap-2.5 shadow-md shadow-primary/10"
                                                    >
                                                        {isDownloading ? <><Loader2 className="h-4 w-4 animate-spin" /> Fetching...</> : <><Download className="h-4 w-4" /> Download</>}
                                                    </button>
                                                );
                                            }

                                            if (project.downloadUnlockRequested) {
                                                return (
                                                    <div className="flex items-center gap-3 h-11 px-5 bg-muted/50 border border-border rounded-lg">
                                                        <Loader2 className="h-3.5 w-3.5 text-muted-foreground animate-spin" />
                                                        <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Checking Download Access</span>
                                                    </div>
                                                );
                                            }

                                            return (
                                                <button
                                                    onClick={async () => {
                                                        if (!user) return;
                                                        const res = await requestDownloadUnlock(id as string, user.uid);
                                                        if (res.success) {
                                                            toast.success("Download request logged.");
                                                            setProject(prev => prev ? ({ ...prev, downloadUnlockRequested: true }) : null);
                                                        } else {
                                                            toast.error(res.error);
                                                        }
                                                    }}
                                                    className="h-11 px-6 rounded-lg bg-primary/10 border border-primary/20 text-primary text-[11px] font-bold uppercase tracking-widest hover:bg-primary/20 transition-all active:scale-[0.98] flex items-center gap-2.5"
                                                >
                                                    <Unlock className="h-4 w-4" />
                                                    Get Video File
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
                                    <button 
                                        onClick={() => setIsAssignModalOpen(true)}
                                        className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
                                    >
                                        Modify
                                    </button>
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
                                                    className="w-full h-11 bg-black/5 dark:bg-black/40 dark:bg-black/5 dark:bg-black/40 dark:bg-black/5 dark:bg-black/40 dark:bg-black/5 dark:bg-black/40 border border-border rounded-lg px-4 text-sm text-foreground focus:outline-none focus:border-primary/50 transition-colors"
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
                                                        await assignEditor(id as string, selectedEditorId, shareAmount);
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

                    {/* Technical Assets */}
                    <div className="enterprise-card p-6 md:p-8 space-y-8">
                        <div className="flex items-center gap-3 text-muted-foreground">
                            <Briefcase className="h-4 w-4" /> 
                            <h3 className="text-[10px] font-bold uppercase tracking-widest">Project Files</h3>
                        </div>
                        
                        <div className="grid gap-4">
                            {/* Raw Data Link */}
                            {project.footageLink && (
                                <a 
                                    href={project.footageLink.startsWith('http') ? project.footageLink : `https://${project.footageLink}`} 
                                    target="_blank" 
                                    className="flex items-center justify-between p-4 rounded-xl bg-muted/50 border border-border hover:bg-muted/50 hover:border-primary/30 transition-all group"
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="h-9 w-9 flex items-center justify-center rounded-lg bg-muted text-muted-foreground group-hover:text-primary transition-colors">
                                            <ExternalLink className="h-4 w-4" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest leading-none mb-1.5">Raw Footage</p>
                                            <p className="text-sm font-bold text-muted-foreground group-hover:text-foreground transition-colors truncate">Open Drive Link</p>
                                        </div>
                                    </div>
                                </a>
                            )}

                            {/* Local Asset Grid */}
                            {project.rawFiles && project.rawFiles.length > 0 && (
                                <div className="space-y-3 pt-2">
                                    <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest ml-1">Embedded Assets</p>
                                    <div className="grid gap-2">
                                        {project.rawFiles.map((file, idx) => (
                                            <div 
                                                key={idx}
                                                className="flex flex-col p-3.5 bg-muted/50 rounded-xl border border-border transition-all group"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className="h-9 w-9 rounded-lg bg-zinc-900 border border-border flex items-center justify-center text-muted-foreground group-hover:text-primary group-hover:bg-primary/5 transition-all">
                                                        <FileVideo className="h-4 w-4" />
                                                    </div>
                                                    <div className="flex-1 min-w-0 text-left">
                                                        <p className="text-xs font-bold text-muted-foreground truncate group-hover:text-foreground mb-0.5">{file.name}</p>
                                                        <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-tighter">{(file.size ? (file.size / (1024*1024)).toFixed(2) : '?')} MB</p>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <button onClick={() => setPreviewFileUrl(file.url)} className="h-8 px-3 rounded bg-muted hover:bg-primary/20 hover:text-primary text-muted-foreground text-[9px] font-bold uppercase tracking-widest transition-all flex items-center gap-2">
                                                            <Eye className="h-3.5 w-3.5" /> Preview
                                                        </button>
                                                        <a href={file.url} download={file.name} target="_blank" className="h-8 w-8 rounded bg-muted hover:bg-zinc-800 flex items-center justify-center text-muted-foreground transition-all">
                                                            <Download className="h-3.5 w-3.5" />
                                                        </a>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Reference Section */}
                            {((project as any).referenceLink || ((project as any).referenceFiles && (project as any).referenceFiles.length > 0)) && (
                                <div className="space-y-4 pt-4 border-t border-border">
                                    <p className="text-[9px] text-primary/70 font-black uppercase tracking-widest ml-1 flex items-center gap-2">
                                        <Zap className="h-3 w-3" /> Style Reference Components
                                    </p>
                                    <div className="grid gap-3">
                                        {(project as any).referenceLink && (
                                            <a 
                                                href={(project as any).referenceLink.startsWith('http') ? (project as any).referenceLink : `https://${(project as any).referenceLink}`} 
                                                target="_blank" 
                                                className="flex items-center justify-between p-4 rounded-xl bg-primary/5 border border-primary/20 hover:border-primary/40 transition-all group"
                                            >
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <div className="h-9 w-9 flex items-center justify-center rounded-lg bg-primary/10 text-primary">
                                                        <LinkIcon className="h-4 w-4" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="text-[9px] text-primary font-bold uppercase tracking-widest leading-none mb-1.5">Style URL</p>
                                                        <p className="text-sm font-bold text-primary truncate">Open Reference Page</p>
                                                    </div>
                                                </div>
                                            </a>
                                        )}
                                        
                                        {(project as any).referenceFiles && (project as any).referenceFiles.length > 0 && (
                                            <div className="grid gap-2">
                                                {(project as any).referenceFiles.map((file: any, idx: number) => (
                                                    <div key={idx} className="flex items-center justify-between p-3.5 bg-background/50 border border-border rounded-xl transition-all group">
                                                        <div className="flex items-center gap-3 min-w-0">
                                                            <Eye className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                                                            <div className="flex-1 min-w-0 text-left">
                                                                <p className="text-xs font-bold text-muted-foreground truncate group-hover:text-foreground">{file.name}</p>
                                                            </div>
                                                        </div>
                                                        <button onClick={() => setPreviewFileUrl(file.url)} className="h-8 px-3 rounded bg-muted hover:bg-primary/20 hover:text-primary text-muted-foreground text-[9px] font-bold uppercase tracking-widest transition-all">Preview</button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {previewFileUrl && (
                                <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-xl flex items-center justify-center p-4" onClick={() => setPreviewFileUrl(null)}>
                                    <div className="relative max-w-5xl w-full aspect-video bg-black rounded-3xl overflow-hidden shadow-[0_0_100px_rgba(var(--primary),0.2)]" onClick={e => e.stopPropagation()}>
                                        <button onClick={() => setPreviewFileUrl(null)} className="absolute top-6 right-6 h-12 w-12 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center backdrop-blur-md z-10 transition-all">
                                            <X className="h-6 w-6" />
                                        </button>
                                        <video src={previewFileUrl} controls className="w-full h-full" autoPlay />
                                    </div>
                                </div>
                            )}

                            {/* Inject Asset */}
                            {isClient && (
                                <div className="pt-2">
                                    {isUploadingAsset ? (
                                        <div className="h-12 w-full bg-muted/50 rounded-xl border border-border flex items-center px-5 gap-4">
                                            <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
                                            <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
                                                <motion.div 
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${uploadAssetProgress}%` }}
                                                    className="h-full bg-primary shadow-[0_0_10px_rgba(99,102,241,0.6)]"
                                                />
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="relative">
                                            <button className="w-full h-12 rounded-xl bg-muted/50 border border-border hover:border-border hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-all group relative overflow-hidden">
                                                <div className="flex items-center justify-center gap-2.5 relative z-10 text-[10px] font-bold uppercase tracking-widest">
                                                    <Upload className="h-3.5 w-3.5" />
                                                    Add Files
                                                </div>
                                                <input 
                                                    type="file" 
                                                    className="absolute inset-0 opacity-0 cursor-pointer z-20"
                                                    onChange={handleAssetUpload}
                                                />
                                            </button>
                                        </div>
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
               isOpen={isPaymentModalOpen && !user?.payLater}
               onClose={() => setIsPaymentModalOpen(false)}
               title="Payment"
            >
                <div className="space-y-8">
                    <div className="flex items-center gap-5 p-6 bg-emerald-500/[0.03] text-emerald-400 rounded-xl border border-emerald-500/20">
                        <div className="h-12 w-12 bg-emerald-500/10 rounded-xl flex items-center justify-center shrink-0 border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.1)]">
                            <IndianRupee className="h-6 w-6" />
                        </div>
                        <div className="space-y-0.5 min-w-0">
                            <h4 className="font-bold text-base tracking-tight truncate">Final Payment</h4>
                            <p className="text-xs text-muted-foreground font-medium leading-relaxed">Complete the payment to unlock and download your final high-quality video.</p>
                        </div>
                    </div>

                    <div className="space-y-3 px-1">
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-muted-foreground font-bold uppercase tracking-widest text-[10px]">Total Price</span>
                            <span className="text-muted-foreground font-bold font-heading">₹{project?.totalCost?.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-muted-foreground font-bold uppercase tracking-widest text-[10px]">Paid So Far</span>
                            <span className="text-muted-foreground font-bold font-heading">₹{project?.amountPaid?.toLocaleString() || '0'}</span>
                        </div>
                        <div className="h-px bg-muted/50 my-4" />
                        <div className="flex justify-between items-end">
                            <span className="text-foreground font-bold uppercase tracking-widest text-[11px] mb-1">Remaining Balance</span>
                            <span className="text-primary font-black font-heading text-4xl tracking-tighter text-glow">₹{((project?.totalCost || 0) - (project?.amountPaid || 0)).toLocaleString()}</span>
                        </div>
                    </div>

                    <div className="pt-4 space-y-4">
                        <PaymentButton 
                            projectId={id as string}
                            user={user}
                            amount={(project?.totalCost || 0) - (project?.amountPaid || 0)}
                            description={`Billing for: ${project?.name}`}
                            prefill={{
                                name: user?.displayName || "",
                                email: user?.email || ""
                            }}
                            onSuccess={() => {
                                setProject(prev => prev ? ({ ...prev, paymentStatus: 'full_paid', status: 'completed' }) : null);
                                setIsPaymentModalOpen(false);
                                toast.success("Payment successful! Your final video is now available for download.");
                            }}
                        />
                        <p className="text-center text-[10px] text-muted-foreground font-bold uppercase tracking-widest opacity-60">
                            Secure payments by Razorpay
                        </p>
                    </div>
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
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Leave a Review (Optional)</label>
                        <textarea
                            value={editorReview}
                            onChange={(e) => setEditorReview(e.target.value)}
                            placeholder="Share your thoughts about the video editing quality, speed, and communication..."
                            className="w-full h-32 bg-black/5 dark:bg-black/40 dark:bg-black/5 dark:bg-black/40 dark:bg-black/5 dark:bg-black/40 dark:bg-black/5 dark:bg-black/40 border border-border rounded-xl p-4 text-sm text-foreground focus:outline-none focus:border-primary/50 transition-colors resize-none"
                        />
                    </div>
                    <button
                        onClick={handleRatingSubmit}
                        disabled={isSubmittingRating || editorRating === 0}
                        className="w-full h-12 rounded-xl bg-primary  text-primary-foreground text-[11px] font-bold uppercase tracking-widest hover:bg-zinc-200 transition-all active:scale-[0.98] disabled:opacity-50"
                    >
                        {isSubmittingRating ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : "Submit Feedback"}
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
        <div className={cn("px-4 py-2 rounded-xl border text-[11px] font-black uppercase tracking-[0.1em] bg-black/5 dark:bg-black/40 dark:bg-black/5 dark:bg-black/40 dark:bg-black/5 dark:bg-black/40 dark:bg-black/5 dark:bg-black/40 shadow-lg", c.border, c.text)}>
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
