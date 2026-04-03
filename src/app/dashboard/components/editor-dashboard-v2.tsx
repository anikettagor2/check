"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/context/auth-context";
import { db } from "@/lib/firebase/config";
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc, getDocs, limit } from "firebase/firestore";
import { Project } from "@/types/schema";
import { cn } from "@/lib/utils";
import { 
    Loader2,
    Eye,
    IndianRupee,
    CheckCircle2,
    Clock,
    AlertCircle,
    MessageCircle,
    Film,
    Check,
    X as XIcon,
    Upload,
    Download,
    FileStack,
    Zap,
    CheckCircle,
    RefreshCw,
    MessageSquare,
    History,
    FileVideo,
    FileText,
    File,
    Archive,
    FileIcon,
    Briefcase,
    Banknote,
    Circle,
    User,
    Mail,
    Users,
    LinkIcon,
    ArrowRight,
    ExternalLink,
    Copy,
    ImageIcon
} from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { UploadDraftModal } from "./upload-draft-modal";
import { ReviewSystemModal } from "./review-system-modal";
import { preloadVideosIntoMemory, warmVideoInMemory } from "@/lib/video-preload";
import { FilePreview } from "@/components/file-preview";
import { useVideoTranscodeStatus } from "@/hooks/use-video-transcode-status";

function isVideoResource(resource?: string) {
    if (!resource) return false;
    return /\.(mp4|webm|mov|avi|mkv)(\?|$)/i.test(resource);
}

function isVideoFile(file: any) {
    const type = file?.type || "";
    const name = file?.name || "";
    return type.startsWith("video/") || /\.(mp4|webm|mov|avi|mkv)$/i.test(name);
}

export function EditorDashboardV2() {
    const { user } = useAuth();
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [previewFile, setPreviewFile] = useState<any | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [userData, setUserData] = useState<any>(null);
    const [selectedProjectAssets, setSelectedProjectAssets] = useState<any>(null);
    const [selectedProjectDetails, setSelectedProjectDetails] = useState<Project | null>(null);
    const [allUsers, setAllUsers] = useState<any>({});
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [selectedUploadProject, setSelectedUploadProject] = useState<Project | null>(null);
    const [projectRevisions, setProjectRevisions] = useState<Record<string, any>>({});
    const [projectTimers, setProjectTimers] = useState<Record<string, number>>({});
    const [isReviewSystemOpen, setIsReviewSystemOpen] = useState(false);
    const [reviewProject, setReviewProject] = useState<Project | null>(null);

    useEffect(() => {
        if (!user) return;
        setLoading(true);

        // Fetch assigned projects
        const projectsRef = collection(db, "projects");
        const q = query(
            projectsRef, 
            where("assignedEditorId", "==", user.uid)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedProjects: Project[] = [];
            const revisionsMap: Record<string, any> = {};
            const now = Date.now();
            
            snapshot.forEach((doc) => {
                const project = { id: doc.id, ...doc.data() } as Project;
                
                // Filter out expired assignments - don't show if assignment has expired and not yet accepted
                if (project.assignmentStatus === 'pending' && (project as any).assignmentExpiresAt) {
                    if (now > (project as any).assignmentExpiresAt) {
                        // Assignment expired, skip this project
                        return;
                    }
                }
                
                // Also skip if assignment status is 'expired'
                if (project.assignmentStatus === 'expired') {
                    return;
                }
                
                fetchedProjects.push(project);
                
                // Fetch latest revision for this project
                const revisionsRef = collection(db, "revisions");
                const revQ = query(
                    revisionsRef,
                    where("projectId", "==", project.id),
                    orderBy("version", "desc"),
                    limit(1)
                );
                
                getDocs(revQ).then(revSnap => {
                    if (!revSnap.empty) {
                        const latestRev = revSnap.docs[0];
                        revisionsMap[project.id] = {
                            id: latestRev.id,
                            ...latestRev.data()
                        };
                        setProjectRevisions(prev => ({
                            ...prev,
                            [project.id]: revisionsMap[project.id]
                        }));
                    }
                });
            });

            fetchedProjects.sort((a, b) => {
                const aUpdated = typeof a.updatedAt === "number" ? a.updatedAt : 0;
                const bUpdated = typeof b.updatedAt === "number" ? b.updatedAt : 0;
                return bUpdated - aUpdated;
            });
            
            setProjects(fetchedProjects);
            setProjectRevisions(revisionsMap);
            setLoading(false);
        }, (error) => {
            console.error("[EditorDashboardV2] Failed to subscribe assigned projects", {
                code: (error as any)?.code,
                message: error?.message,
                uid: user.uid,
            });
            toast.error("Failed to load assigned projects. Please refresh.");
            setLoading(false);
        });

        // Fetch user data
        const userRef = doc(db, "users", user.uid);
        const unsubscribeUser = onSnapshot(userRef, (docSnap) => {
            if (docSnap.exists()) {
                setUserData(docSnap.data());
            }
        });

        // Fetch all users for PM contact info
        const usersRef = collection(db, "users");
        const usersQuery = query(usersRef);
        const unsubscribeUsers = onSnapshot(usersQuery, (snapshot) => {
            const usersMap: any = {};
            snapshot.forEach((doc) => {
                usersMap[doc.id] = doc.data();
            });
            setAllUsers(usersMap);
        });

        return () => { 
            unsubscribe(); 
            unsubscribeUser();
            unsubscribeUsers();
        };
    }, [user]);

    // Timer countdown for pending assignments - calculates from assignmentExpiresAt
    useEffect(() => {
        const interval = setInterval(() => {
            setProjectTimers(prev => {
                const updated = { ...prev };
                let hasActive = false;
                
                // Recalculate time remaining for each pending project based on assignmentExpiresAt
                for (const projectId in updated) {
                    const project = projects.find(p => p.id === projectId);
                    if (project && project.assignmentStatus === 'pending') {
                        const expiresAt = (project as any).assignmentExpiresAt || 0;
                        const now = Date.now();
                        const remaining = Math.max(0, Math.floor((expiresAt - now) / 1000));
                        
                        if (remaining > 0) {
                            updated[projectId] = remaining;
                            hasActive = true;
                        } else if (remaining === 0 && updated[projectId] > 0) {
                            // Timer just expired
                            handleAssignmentTimeout(projectId);
                        }
                    }
                }
                
                return hasActive ? updated : {};
            });
        }, 1000);
        
        return () => clearInterval(interval);
    }, [projects]);

    const handleAssignmentTimeout = async (projectId: string) => {
        const project = projects.find(p => p.id === projectId);
        if (!project) return;

        // Check if still pending (cloud function will auto-reject, but we show UI feedback)
        toast.error(
            "⏱️ Assignment Time Expired: You did not accept this project within 15 minutes. The PM has been notified automatically.",
            { duration: 5000 }
        );

        // Remove from pending state UI
        setProjectTimers(prev => {
            const updated = { ...prev };
            delete updated[projectId];
            return updated;
        });

        // Close modal if this project was open
        if (selectedProjectDetails?.id === projectId) {
            setSelectedProjectDetails(null);
        }
    };

    // Sub-component for asset grid items with transcoding status
    const AssetGridItem = ({ file, idx, onPreview }: { file: any, idx: number, onPreview: () => void }) => {
        const transcodeState = useVideoTranscodeStatus(file.storagePath || "", file.name || "");
        const effectiveUrl = (transcodeState.status === "ready" && transcodeState.videoUrl) 
            ? transcodeState.videoUrl 
            : file.url;
        
        return (
            <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="group border border-border rounded-lg overflow-hidden bg-muted/20 hover:bg-muted/40 transition-all relative"
            >
                <div className="relative aspect-video bg-black flex items-center justify-center overflow-hidden">
                    {transcodeState.status === 'processing' && (
                        <div className="absolute inset-0 z-10 bg-black/40 backdrop-blur-[2px] flex flex-col items-center justify-center gap-2">
                            <Loader2 className="h-6 w-6 text-white animate-spin" />
                            <span className="text-[10px] text-white font-bold uppercase tracking-tighter">Optimizing...</span>
                        </div>
                    )}
                    <video 
                        src={effectiveUrl} 
                        controls
                        preload="metadata"
                        playsInline
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" 
                    />
                    <button
                        onClick={onPreview}
                        className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity cursor-pointer z-20"
                    >
                        <Eye className="h-8 w-8 text-white" />
                    </button>
                </div>
                <div className="p-3">
                    <div className="flex items-start justify-between gap-1">
                        <p className="text-sm font-medium text-foreground truncate flex-1">{file.name}</p>
                        {transcodeState.status === 'ready' && (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                        )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                        {file.size ? `${(file.size / (1024*1024)).toFixed(2)} MB` : 'N/A'}
                    </p>
                    <button
                        onClick={onPreview}
                        className={cn(
                            "mt-2 w-full px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1",
                            transcodeState.status === 'ready' 
                                ? "bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20" 
                                : "bg-primary/10 text-primary hover:bg-primary/20"
                        )}
                    >
                        <Eye className="h-3 w-3" />
                        {transcodeState.status === 'ready' ? 'Play Optimized' : 'Play'}
                    </button>
                </div>
            </motion.div>
        );
    };

    // Video Player with Optimization Integration
    const OptimizedVideoModal = ({ file, onClose }: { file: any, onClose: () => void }) => {
        const transcodeState = useVideoTranscodeStatus(file.storagePath, file.name);
        const effectiveUrl = (transcodeState.status === "ready" && transcodeState.videoUrl) 
            ? transcodeState.videoUrl 
            : file.url;
        
        const isOptimized = transcodeState.status === "ready";

        return (
            <motion.div 
                key="video-preview-modal"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[9999] bg-black/95 backdrop-blur-xl flex items-center justify-center p-4 pointer-events-auto" 
                onClick={onClose}
            >
                <motion.div 
                    initial={{ scale: 0.95 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0.95 }}
                    className="relative w-full h-full md:h-auto md:max-w-7xl md:aspect-video bg-black rounded-3xl overflow-hidden shadow-[0_0_200px_rgba(0,0,0,0.8)]" 
                    onClick={e => e.stopPropagation()}
                >
                    <button 
                        onClick={onClose} 
                        className="absolute top-6 right-6 h-12 w-12 bg-white/20 hover:bg-white/30 text-white rounded-full flex items-center justify-center backdrop-blur-md z-[10000] transition-all hover:bg-white/40 cursor-pointer active:scale-95"
                    >
                        <X className="h-6 w-6" />
                    </button>
                    
                    {isOptimized && (
                        <div className="absolute top-6 left-6 z-[10000] flex items-center gap-2 px-4 py-2 bg-emerald-500/90 text-white text-xs font-bold rounded-full backdrop-blur-md shadow-lg border border-emerald-400/30">
                            <CheckCircle2 className="h-4 w-4" />
                            Playing Optimized MP4
                        </div>
                    )}

                    {!isOptimized && file.name?.toLowerCase().endsWith('.mov') && (
                        <div className="absolute top-6 left-6 z-[10000] flex items-center gap-2 px-4 py-2 bg-amber-500/90 text-white text-xs font-bold rounded-full backdrop-blur-md shadow-lg border border-amber-400/30">
                            <Clock className="h-4 w-4" />
                            Playing Raw .MOV (Optimizing...)
                        </div>
                    )}

                    <video 
                        src={effectiveUrl} 
                        controls 
                        preload="auto"
                        playsInline
                        className="w-full h-full object-contain" 
                        autoPlay
                        controlsList="nodownload"
                    />
                </motion.div>
            </motion.div>
        );
    };

    // Calculate time remaining when details modal opens for pending projects
    useEffect(() => {
        if (selectedProjectDetails?.assignmentStatus === "pending") {
            const expiresAt = (selectedProjectDetails as any).assignmentExpiresAt || 0;
            const now = Date.now();
            const remaining = Math.max(0, Math.floor((expiresAt - now) / 1000));
            
            setProjectTimers(prev => ({
                ...prev,
                [selectedProjectDetails.id]: remaining
            }));
        }
    }, [selectedProjectDetails?.id, selectedProjectDetails?.assignmentStatus, selectedProjectDetails?.assignmentExpiresAt]);

    useEffect(() => {
        const urls = projects.flatMap((project) => {
            const raw = (project.rawFiles || []).filter(isVideoFile).map((file: any) => file?.url);
            const delivered = (project.deliveredFiles || []).filter(isVideoFile).map((file: any) => file?.url);
            const pmFiles = ((((project as any).pmFiles || []) as any[]).filter(isVideoFile).map((file) => file?.url));
            return [...raw, ...delivered, ...pmFiles];
        });

        preloadVideosIntoMemory(urls, 30);
    }, [projects]);

    const formatTimeRemaining = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const editorStatus = userData?.availabilityStatus || "offline";

    const buildWhatsAppLink = (phoneNumber: string | null | undefined) => {
        if (!phoneNumber) return null;
        // Clean and normalize phone number for WhatsApp
        const cleaned = phoneNumber.replace(/\D/g, '');
        const isIndia = cleaned.length === 10;
        const formatted = isIndia ? `91${cleaned}` : cleaned;
        return `https://wa.me/${formatted}`;
    };

    const handleAcceptProject = async (projectId: string) => {
        if (!user?.uid) return;
        try {
            await updateDoc(doc(db, "projects", projectId), {
                assignmentStatus: "accepted"
            });
            toast.success("Project accepted! You can now upload draft files.");
            setSelectedProjectDetails(null);
            setProjectTimers(prev => {
                const updated = { ...prev };
                delete updated[projectId];
                return updated;
            });
        } catch (error) {
            toast.error("Failed to accept project");
            console.error(error);
        }
    };

    const handleRejectProject = async (projectId: string) => {
        if (!user?.uid) return;
        
        // Prompt for rejection reason (required)
        const reason = window.prompt("Please provide a reason for declining this project:\n\n(This is required and will be shown to the PM)");
        if (!reason?.trim()) {
            toast.error("A reason is required to decline the project.");
            return;
        }
        
        try {
            const { respondToAssignment } = await import('@/app/actions/admin-actions');
            const result = await respondToAssignment(projectId, 'rejected', reason.trim());
            
            if (result.success) {
                toast.success("Project declined. PM will be notified with your reason.");
                setSelectedProjectDetails(null);
                setProjectTimers(prev => {
                    const updated = { ...prev };
                    delete updated[projectId];
                    return updated;
                });
            } else {
                toast.error(result.error || "Failed to decline project");
            }
        } catch (error) {
            toast.error("Failed to decline project");
            console.error(error);
        }
    };

    const getPMWhatsAppNumber = (project: any) => {
        const pmId = project.assignedPMId;
        if (!pmId || !allUsers[pmId]) return null;
        const pmData = allUsers[pmId];
        return pmData.whatsappNumber || pmData.phoneNumber;
    };

    const handleStatusUpdate = async (newStatus: "online" | "offline" | "sleep") => {
        if (!user?.uid) return;
        try {
            await updateDoc(doc(db, "users", user.uid), {
                availabilityStatus: newStatus,
                updatedAt: Date.now(),
            });
            toast.success(`Status updated to ${newStatus}`);
        } catch {
            toast.error("Failed to update status");
        }
    };

    // Filter projects based on search
    const filteredProjects = projects.filter(p =>
        p.name?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Count statistics
    const activeProjects = projects.filter(p => p.status === 'active');
    const completedProjects = projects.filter(p => ['completed', 'approved'].includes(p.status));
    const totalEarnings = completedProjects.reduce((acc, curr) => acc + (curr.editorPrice || 0), 0);
    const pendingEarnings = projects
        .filter(p => ['completed', 'approved'].includes(p.status) && !p.editorPaid)
        .reduce((acc, p) => acc + (p.editorPrice || 0), 0);
    const selectedProjectPmFiles = selectedProjectDetails
        ? ((((selectedProjectDetails as any).pmFiles || []) as any[]).length > 0
            ? (((selectedProjectDetails as any).pmFiles || []) as any[])
            : (selectedProjectDetails.referenceFiles || []).filter((file: any) => Boolean(file?.uploadedBy)))
        : [];
    const selectedProjectStyleReferenceFiles = selectedProjectDetails
        ? (selectedProjectDetails.referenceFiles || []).filter((file: any) => !file?.uploadedBy)
        : [];
    const canEditorDownloadAssets = selectedProjectDetails?.assignmentStatus === 'accepted';

    const getStatusColor = (status: string) => {
        switch(status) {
            case 'active': return 'bg-blue-500/10 text-blue-600 dark:text-blue-400';
            case 'in_review': return 'bg-amber-500/10 text-amber-600 dark:text-amber-400';
            case 'completed': return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
            case 'approved': return 'bg-emerald-600/10 text-emerald-700 dark:text-emerald-300';
            default: return 'bg-muted text-muted-foreground';
        }
    };

    const getStatusIcon = (status: string) => {
        switch(status) {
            case 'active': return <Clock className="h-4 w-4" />;
            case 'in_review': return <AlertCircle className="h-4 w-4" />;
            case 'completed':
            case 'approved': return <CheckCircle2 className="h-4 w-4" />;
            default: return null;
        }
    };

    const getStatusLabel = (status: string) => {
        return status.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    };

    const getPaymentStatus = (project: Project) => {
        if (!['completed', 'approved'].includes(project.status)) {
            return { label: 'Pending', color: 'text-muted-foreground' };
        }
        return project.editorPaid 
            ? { label: 'Paid', color: 'text-emerald-500 font-bold' }
            : { label: 'Unpaid', color: 'text-amber-500 font-bold' };
    };

    const triggerDirectDownload = async (url: string, fileName?: string) => {
        if (!canEditorDownloadAssets) {
            toast.error("You can download assets only after accepting the project assignment.");
            return;
        }
        try {
            // Check if it's a firebase storage URL
            if (url.includes("firebasestorage.googleapis.com")) {
                const downloadApiUrl = `/api/downloadProxy?url=${encodeURIComponent(url)}&fileName=${encodeURIComponent(fileName || 'download')}`;
                const anchor = document.createElement("a");
                anchor.href = downloadApiUrl;
                anchor.download = fileName || "download";
                document.body.appendChild(anchor);
                anchor.click();
                anchor.remove();
                return;
            }

            const response = await fetch(url);
            if (!response.ok) throw new Error("Failed to fetch file");

            const blob = await response.blob();
            const blobUrl = window.URL.createObjectURL(blob);
            const anchor = document.createElement("a");
            anchor.href = blobUrl;
            anchor.download = fileName || "download";
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            window.URL.revokeObjectURL(blobUrl);
        } catch {
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = fileName || "download";
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
        }
    };

    const triggerAudioDownload = async (url: string, fileName?: string) => {
        try {
            if (url.includes("firebasestorage.googleapis.com")) {
                const downloadApiUrl = `/api/downloadProxy?url=${encodeURIComponent(url)}&fileName=${encodeURIComponent(fileName || 'audio')}`;
                const anchor = document.createElement("a");
                anchor.href = downloadApiUrl;
                anchor.download = fileName || "audio";
                document.body.appendChild(anchor);
                anchor.click();
                anchor.remove();
                return;
            }

            const response = await fetch(url);
            if (!response.ok) throw new Error("Failed to fetch file");

            const blob = await response.blob();
            const blobUrl = window.URL.createObjectURL(blob);
            const anchor = document.createElement("a");
            anchor.href = blobUrl;
            anchor.download = fileName || "audio";
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            window.URL.revokeObjectURL(blobUrl);
        } catch {
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = fileName || "audio";
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
        }
    };

    const openFilePreview = (file: any) => {
        if (isVideoFile(file)) {
            warmVideoInMemory(file.url);
            setPreviewFile(file);
            return;
        }
        window.open(file.url, "_blank", "noopener,noreferrer");
    };

    if (loading) {
        return (
            <div className="flex h-[calc(100vh-12rem)] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <>
            {/* Video Preview Modal - Top Level */}
            <AnimatePresence>
                {previewFile && (
                    <OptimizedVideoModal 
                        file={previewFile}
                        onClose={() => setPreviewFile(null)}
                    />
                )}
            </AnimatePresence>

            {/* Assets Modal - Upload/Client Videos */}
            <AnimatePresence>
                {selectedProjectAssets && (
                    <motion.div 
                        key="assets-modal"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[9998] bg-black/60 backdrop-blur-md flex items-center justify-center p-4 pointer-events-auto" 
                        onClick={() => setSelectedProjectAssets(null)}
                    >
                        <motion.div 
                            initial={{ scale: 0.95, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.95, y: 20 }}
                            className="relative w-full max-w-4xl bg-card border border-border rounded-2xl overflow-hidden shadow-2xl max-h-[85vh] overflow-y-auto" 
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="sticky top-0 bg-card border-b border-border p-6 flex items-center justify-between z-50">
                                <div>
                                    <h2 className="text-xl font-bold text-foreground">{selectedProjectAssets.name}</h2>
                                    <p className="text-sm text-muted-foreground mt-1">Client Uploaded Video Assets</p>
                                </div>
                                <button 
                                    onClick={() => setSelectedProjectAssets(null)} 
                                    className="h-10 w-10 bg-muted/30 hover:bg-muted/50 text-foreground rounded-lg flex items-center justify-center transition-colors cursor-pointer active:scale-95"
                                >
                                    <XIcon className="h-5 w-5" />
                                </button>
                            </div>

                            <div className="p-6 space-y-4">
                                {selectedProjectAssets.rawFiles && selectedProjectAssets.rawFiles.length > 0 ? (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {selectedProjectAssets.rawFiles.map((file: any, idx: number) => (
                                            <AssetGridItem 
                                                key={idx} 
                                                file={file} 
                                                idx={idx} 
                                                onPreview={() => setPreviewFile(file)} 
                                            />
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center py-12">
                                        <Film className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                                        <p className="text-muted-foreground">No video assets uploaded yet</p>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Project Details Modal */}
            <AnimatePresence>
                {selectedProjectDetails && (
                    <motion.div
                        key="project-details-modal"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[9997] bg-black/60 backdrop-blur-md flex items-center justify-center p-4 pointer-events-auto"
                        onClick={() => setSelectedProjectDetails(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.96, y: 16 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.96, y: 16 }}
                            className="relative w-full max-w-6xl max-h-[88vh] overflow-y-auto bg-card border border-border rounded-2xl shadow-2xl"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="sticky top-0 z-20 bg-card/95 backdrop-blur border-b border-border p-5 flex items-center justify-between">
                                <div>
                                    <h3 className="text-xl font-bold text-foreground">{selectedProjectDetails.name}</h3>
                                    <p className="text-xs text-muted-foreground mt-1">Project Details</p>
                                </div>
                                <button
                                    onClick={() => setSelectedProjectDetails(null)}
                                    className="h-9 w-9 rounded-lg bg-muted/40 hover:bg-muted/70 text-muted-foreground hover:text-foreground flex items-center justify-center transition-all"
                                >
                                    <XIcon className="h-4 w-4" />
                                </button>
                            </div>

                            <div className="p-5 grid grid-cols-1 lg:grid-cols-3 gap-5">
                                <div className="lg:col-span-2 space-y-4">
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                        <div className="p-3 rounded-lg border border-border bg-muted/20">
                                            <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Type</p>
                                            <p className="text-sm font-semibold mt-1">{selectedProjectDetails.videoType || 'Video'}</p>
                                        </div>
                                        <div className="p-3 rounded-lg border border-border bg-muted/20">
                                            <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Format</p>
                                            <p className="text-sm font-semibold mt-1">{selectedProjectDetails.videoFormat || '—'}</p>
                                        </div>
                                        <div className="p-3 rounded-lg border border-border bg-muted/20">
                                            <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Aspect Ratio</p>
                                            <p className="text-sm font-semibold mt-1">{selectedProjectDetails.aspectRatio || '—'}</p>
                                        </div>
                                        <div className="p-3 rounded-lg border border-border bg-muted/20">
                                            <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Duration</p>
                                            <p className="text-sm font-semibold mt-1">{selectedProjectDetails.duration ? `${selectedProjectDetails.duration}m` : '—'}</p>
                                        </div>
                                    </div>

                                    {/* PROFESSIONAL CLIENT UPLOADED ASSETS PANEL */}
                                    <div className="bg-muted/20 border border-border/50 rounded-xl p-6 space-y-5">
                                        <div className="flex items-center gap-2">
                                            <div className="h-8 w-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                                                <Briefcase className="h-4 w-4 text-primary" />
                                            </div>
                                            <h4 className="text-sm font-bold uppercase tracking-widest text-foreground">Client Assets</h4>
                                        </div>

                                        {/* 1. Google Drive Link */}
                                        <div className="space-y-3">
                                            <div className="flex items-center gap-2">
                                                <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">📎 Google Drive Link</span>
                                            </div>
                                            {selectedProjectDetails.footageLink ? (
                                                <a 
                                                    href={selectedProjectDetails.footageLink.startsWith('http') ? selectedProjectDetails.footageLink : `https://${selectedProjectDetails.footageLink}`} 
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
                                            {selectedProjectDetails.rawFiles && selectedProjectDetails.rawFiles.length > 0 ? (
                                                <div className="grid gap-2">
                                                    {selectedProjectDetails.rawFiles.slice(0, 3).map((file: any, idx: number) => (
                                                        <div key={idx} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border/30 hover:bg-muted/30 transition-all group">
                                                            <div className="flex items-center gap-2 min-w-0 flex-1">
                                                                <FileVideo className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                                                <div className="min-w-0">
                                                                    <p className="text-xs font-semibold text-foreground truncate">{file.name}</p>
                                                                    {file.size && <p className="text-[9px] text-muted-foreground">{(file.size / (1024*1024)).toFixed(1)} MB</p>}
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-2 flex-shrink-0">
                                                                <button
                                                                    onClick={() => openFilePreview(file)}
                                                                    className="h-8 px-2.5 rounded text-xs font-bold uppercase tracking-widest bg-muted/50 hover:bg-primary/20 text-muted-foreground hover:text-primary transition-all"
                                                                >
                                                                    Preview
                                                                </button>
                                                                <button
                                                                    onClick={() => triggerDirectDownload(file.url, file.name)}
                                                                    className="h-8 w-8 rounded-lg bg-muted/50 group-hover:bg-primary/20 group-hover:text-primary text-muted-foreground flex items-center justify-center transition-all flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                                                                    disabled={!canEditorDownloadAssets}
                                                                >
                                                                    <Download className="h-3.5 w-3.5" />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                    {(selectedProjectDetails.rawFiles?.length || 0) > 3 && (
                                                        <p className="text-xs text-muted-foreground text-center py-1">+{(selectedProjectDetails.rawFiles?.length || 0) - 3} more files</p>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className="p-3 rounded-lg border border-border/30 bg-muted/20">
                                                    <p className="text-xs text-muted-foreground">Not uploaded yet</p>
                                                </div>
                                            )}
                                        </div>

                                        {/* 3. Scripts & Pasted Text */}
                                        <div className="space-y-3 pt-3 border-t border-border/30">
                                            <div className="flex items-center gap-2">
                                                <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">📝 Scripts & Directions</span>
                                            </div>

                                            {/* Uploaded Script Files */}
                                            {selectedProjectDetails.scripts && selectedProjectDetails.scripts.length > 0 && (
                                                <div className="grid gap-2">
                                                    {selectedProjectDetails.scripts.slice(0, 2).map((file: any, idx: number) => (
                                                        <div key={idx} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border/30 hover:bg-muted/30 transition-all group">
                                                            <div className="flex items-center gap-2 min-w-0 flex-1">
                                                                <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                                                <p className="text-xs font-semibold text-foreground truncate">{file.name}</p>
                                                            </div>
                                                            <div className="flex items-center gap-2 flex-shrink-0">
                                                                <button
                                                                    onClick={() => openFilePreview(file)}
                                                                    className="h-8 px-2.5 rounded text-xs font-bold uppercase tracking-widest bg-muted/50 hover:bg-primary/20 text-muted-foreground hover:text-primary transition-all"
                                                                >
                                                                    Preview
                                                                </button>
                                                                <button
                                                                    onClick={() => triggerDirectDownload(file.url, file.name)}
                                                                    className="h-8 w-8 rounded-lg bg-muted/50 group-hover:bg-primary/20 group-hover:text-primary text-muted-foreground flex items-center justify-center transition-all flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                                                                    disabled={!canEditorDownloadAssets}
                                                                >
                                                                    <Download className="h-3.5 w-3.5" />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {/* Pasted Script Text */}
                                            {(selectedProjectDetails as any).scriptText && (
                                                <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                                                    <div className="flex items-center justify-between gap-2 mb-3">
                                                        <p className="text-[10px] font-bold uppercase tracking-widest text-primary">✍️ Pasted Script</p>
                                                        <button 
                                                            onClick={() => {
                                                                navigator.clipboard.writeText((selectedProjectDetails as any).scriptText);
                                                                toast.success("Script copied to clipboard");
                                                            }}
                                                            className="h-7 px-2.5 rounded text-[9px] font-bold uppercase tracking-widest bg-primary/10 hover:bg-primary/20 text-primary transition-all flex items-center gap-1.5"
                                                        >
                                                            <Copy className="h-3 w-3" /> Copy
                                                        </button>
                                                    </div>
                                                    <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap font-medium max-h-[120px] overflow-y-auto">
                                                        {(selectedProjectDetails as any).scriptText}
                                                    </p>
                                                </div>
                                            )}

                                            {/* Empty State */}
                                            {!((selectedProjectDetails as any).scriptText) && (!selectedProjectDetails.scripts || selectedProjectDetails.scripts.length === 0) && (
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
                                            {selectedProjectDetails.audioFiles && selectedProjectDetails.audioFiles.length > 0 ? (
                                                <div className="grid gap-2">
                                                    {selectedProjectDetails.audioFiles.map((file: any, idx: number) => (
                                                        <div key={`${file.url}-${idx}`} className="p-3 rounded-lg border border-border/30 hover:bg-muted/30 transition-all group space-y-2 overflow-hidden">
                                                            <div className="flex items-center justify-between gap-3 min-w-0">
                                                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                                                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                                                                    <p className="text-xs font-semibold text-foreground truncate min-w-0 block">{file.name}</p>
                                                                </div>
                                                                <button
                                                                    onClick={() => triggerAudioDownload(file.url, file.name)}
                                                                    className="h-8 w-8 rounded-lg bg-muted/50 group-hover:bg-primary/20 group-hover:text-primary text-muted-foreground flex items-center justify-center transition-all flex-shrink-0"
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
                                            {(selectedProjectDetails as any).bRoleFiles && (selectedProjectDetails as any).bRoleFiles.length > 0 ? (
                                                <div className="grid gap-2 max-h-56 overflow-y-auto pr-1">
                                                    {(selectedProjectDetails as any).bRoleFiles.map((file: any, idx: number) => (
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
                                                                    onClick={() => openFilePreview(file)}
                                                                    className="h-8 px-2.5 rounded text-xs font-bold uppercase tracking-widest bg-muted/50 hover:bg-primary/20 text-muted-foreground hover:text-primary transition-all"
                                                                >
                                                                    Preview
                                                                </button>
                                                                <button
                                                                    onClick={() => triggerDirectDownload(file.url, file.name)}
                                                                    className="h-8 w-8 rounded-lg bg-muted/50 group-hover:bg-primary/20 group-hover:text-primary text-muted-foreground flex items-center justify-center transition-all flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                                                                    disabled={!canEditorDownloadAssets}
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
                                            {(selectedProjectDetails as any).referenceLink && (
                                                <a 
                                                    href={(selectedProjectDetails as any).referenceLink.startsWith('http') ? (selectedProjectDetails as any).referenceLink : `https://${(selectedProjectDetails as any).referenceLink}`}
                                                    target="_blank"
                                                    className="flex items-center gap-3 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20 hover:border-emerald-500/40 hover:bg-emerald-500/10 transition-all group"
                                                >
                                                    <LinkIcon className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                                                    <span className="text-sm font-semibold text-foreground group-hover:text-emerald-600 transition-colors">Open Style Reference</span>
                                                </a>
                                            )}

                                            {/* Reference Files */}
                                            {selectedProjectStyleReferenceFiles.length > 0 && (
                                                <div className="grid gap-2">
                                                    {selectedProjectStyleReferenceFiles.slice(0, 2).map((file: any, idx: number) => (
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
                                                                    onClick={() => openFilePreview(file)}
                                                                    className="h-8 px-2.5 rounded text-xs font-bold uppercase tracking-widest bg-muted/50 hover:bg-primary/20 text-muted-foreground hover:text-primary transition-all"
                                                                >
                                                                    Preview
                                                                </button>
                                                                <button
                                                                    onClick={() => triggerDirectDownload(file.url, file.name)}
                                                                    className="h-8 w-8 rounded-lg bg-muted/50 group-hover:bg-primary/20 group-hover:text-primary text-muted-foreground flex items-center justify-center transition-all flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                                                                    disabled={!canEditorDownloadAssets}
                                                                >
                                                                    <Download className="h-3.5 w-3.5" />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                    {(selectedProjectStyleReferenceFiles.length || 0) > 2 && (
                                                        <p className="text-xs text-muted-foreground text-center py-1">+{(selectedProjectStyleReferenceFiles.length || 0) - 2} more files</p>
                                                    )}
                                                </div>
                                            )}

                                            {/* Empty State */}
                                            {!(selectedProjectDetails as any).referenceLink && selectedProjectStyleReferenceFiles.length === 0 && (
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
                                            {selectedProjectPmFiles.length > 0 ? (
                                                <div className="grid gap-2">
                                                    {selectedProjectPmFiles.slice(0, 2).map((file: any, idx: number) => (
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
                                                                    onClick={() => openFilePreview(file)}
                                                                    className="h-8 px-2.5 rounded text-xs font-bold uppercase tracking-widest bg-muted/50 hover:bg-primary/20 text-muted-foreground hover:text-primary transition-all"
                                                                >
                                                                    Preview
                                                                </button>
                                                                <button
                                                                    onClick={() => triggerDirectDownload(file.url, file.name)}
                                                                    className="h-8 w-8 rounded-lg bg-muted/50 group-hover:bg-primary/20 group-hover:text-primary text-muted-foreground flex items-center justify-center transition-all flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                                                                    disabled={!canEditorDownloadAssets}
                                                                >
                                                                    <Download className="h-3.5 w-3.5" />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                    {selectedProjectPmFiles.length > 2 && (
                                                        <p className="text-xs text-muted-foreground text-center py-1">+{selectedProjectPmFiles.length - 2} more files</p>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className="p-3 rounded-lg border border-border/30 bg-muted/20">
                                                    <p className="text-xs text-muted-foreground">No PM uploads yet</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="bg-muted/30 border border-border rounded-lg p-4 space-y-4">
                                        <div className="flex items-center gap-2 justify-between">
                                            <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest">📅 Timeline & Activity Log</p>
                                            {selectedProjectDetails.logs && selectedProjectDetails.logs.length > 0 && (
                                                <span className="text-[9px] font-bold px-2 py-1 bg-primary/20 text-primary rounded-full">
                                                    {selectedProjectDetails.logs.length} events
                                                </span>
                                            )}
                                        </div>

                                        {selectedProjectDetails.logs && selectedProjectDetails.logs.length > 0 ? (
                                            <div className="space-y-2 max-h-[320px] overflow-y-auto pr-2">
                                                {[...selectedProjectDetails.logs].reverse().slice(0, 12).map((log: any, idx: number) => {
                                                    const eventType = String(log.event || '').toLowerCase();
                                                    const isUpload = eventType.includes('upload') || eventType.includes('added');
                                                    const isStatusChange = eventType.includes('status') || eventType.includes('change');
                                                    const isComment = eventType.includes('comment') || eventType.includes('noted');
                                                    const isCompletion = eventType.includes('completed') || eventType.includes('finished');
                                                    const isDownload = eventType.includes('download') || eventType.includes('exported');

                                                    let bgColor = 'bg-muted/20';
                                                    let borderColor = 'border-muted/30';
                                                    let iconBg = 'bg-muted/40 text-muted-foreground';
                                                    let dotColor = 'bg-muted-foreground/40';
                                                    let icon = <FileIcon className="h-3.5 w-3.5" />;

                                                    if (isUpload) {
                                                        bgColor = 'bg-blue-500/10';
                                                        borderColor = 'border-blue-500/20';
                                                        iconBg = 'bg-blue-500/20 text-blue-500';
                                                        dotColor = 'bg-blue-500';
                                                        icon = <Upload className="h-3.5 w-3.5" />;
                                                    } else if (isStatusChange) {
                                                        bgColor = 'bg-amber-500/10';
                                                        borderColor = 'border-amber-500/20';
                                                        iconBg = 'bg-amber-500/20 text-amber-500';
                                                        dotColor = 'bg-amber-500';
                                                        icon = <RefreshCw className="h-3.5 w-3.5" />;
                                                    } else if (isComment) {
                                                        bgColor = 'bg-cyan-500/10';
                                                        borderColor = 'border-cyan-500/20';
                                                        iconBg = 'bg-cyan-500/20 text-cyan-500';
                                                        dotColor = 'bg-cyan-500';
                                                        icon = <MessageSquare className="h-3.5 w-3.5" />;
                                                    } else if (isCompletion) {
                                                        bgColor = 'bg-emerald-500/10';
                                                        borderColor = 'border-emerald-500/20';
                                                        iconBg = 'bg-emerald-500/20 text-emerald-500';
                                                        dotColor = 'bg-emerald-500';
                                                        icon = <CheckCircle2 className="h-3.5 w-3.5" />;
                                                    } else if (isDownload) {
                                                        bgColor = 'bg-purple-500/10';
                                                        borderColor = 'border-purple-500/20';
                                                        iconBg = 'bg-purple-500/20 text-purple-500';
                                                        dotColor = 'bg-purple-500';
                                                        icon = <Download className="h-3.5 w-3.5" />;
                                                    }

                                                    return (
                                                        <div key={idx} className={`flex items-start gap-3 p-3 rounded-lg border transition-all hover:border-opacity-50 group ${bgColor} ${borderColor}`}>
                                                            <div className={`h-6 w-6 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${iconBg}`}>
                                                                {icon}
                                                            </div>
                                                            <div className="min-w-0 flex-1">
                                                                <div className="flex items-start justify-between gap-2">
                                                                    <div className="flex-1">
                                                                        <p className="text-xs font-bold text-foreground capitalize">{String(log.event || '').replace(/_/g, ' ')}</p>
                                                                        {log.details && (
                                                                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{log.details}</p>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-center gap-2 mt-2 text-[10px]">
                                                                    <span className="text-muted-foreground font-medium">{log.userName || 'System'}</span>
                                                                    <span className="text-muted-foreground/50">•</span>
                                                                    <span className="text-muted-foreground/60">{new Date(log.timestamp).toLocaleDateString()} {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <div className="py-8 text-center">
                                                <div className="h-12 w-12 rounded-lg bg-muted/30 mx-auto mb-3 flex items-center justify-center text-muted-foreground">
                                                    <History className="h-5 w-5" />
                                                </div>
                                                <p className="text-xs text-muted-foreground font-medium">No activity yet</p>
                                                <p className="text-[10px] text-muted-foreground mt-1">Project updates will appear here</p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    {selectedProjectDetails.assignmentStatus === "pending" && (
                                        <div className="bg-gradient-to-br from-amber-500/20 via-amber-500/10 to-transparent border border-amber-500/30 rounded-lg p-4 space-y-4">
                                            <div className="flex items-start gap-3">
                                                <div className="h-10 w-10 rounded-lg bg-amber-500/20 flex items-center justify-center text-amber-500 flex-shrink-0 mt-0.5">
                                                    <AlertCircle className="h-5 w-5" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs font-bold text-amber-500 uppercase tracking-widest">Decision Required</p>
                                                    <p className="text-sm text-foreground font-semibold mt-1">Please respond to this project assignment</p>
                                                </div>
                                            </div>

                                            {projectTimers[selectedProjectDetails.id] ? (
                                                <div className="bg-amber-500/10 rounded-lg p-3 border border-amber-500/20">
                                                    <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mb-2">⏱️ Time Remaining</p>
                                                    <div className="text-3xl font-black text-amber-500 tabular-nums font-mono">
                                                        {formatTimeRemaining(projectTimers[selectedProjectDetails.id])}
                                                    </div>
                                                </div>
                                            ) : null}

                                            <div className="grid grid-cols-2 gap-2.5">
                                                <button
                                                    onClick={() => handleAcceptProject(selectedProjectDetails.id)}
                                                    className="h-10 inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-500 hover:bg-emerald-500/30 hover:border-emerald-500/60 text-[10px] font-bold uppercase tracking-widest transition-all active:scale-95"
                                                >
                                                    <Check className="h-4 w-4" />
                                                    Accept
                                                </button>
                                                <button
                                                    onClick={() => handleRejectProject(selectedProjectDetails.id)}
                                                    className="h-10 inline-flex items-center justify-center gap-2 rounded-lg bg-red-500/20 border border-red-500/40 text-red-500 hover:bg-red-500/30 hover:border-red-500/60 text-[10px] font-bold uppercase tracking-widest transition-all active:scale-95"
                                                >
                                                    <XIcon className="h-4 w-4" />
                                                    Reject
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                    <div className="bg-muted/30 border border-border rounded-lg p-4 space-y-4">
                                        <div className="flex items-center gap-2">
                                            <div className="h-8 w-8 rounded-lg bg-primary/20 flex items-center justify-center text-primary">
                                                <Users className="h-4 w-4" />
                                            </div>
                                            <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest">Project Manager</p>
                                        </div>

                                        {selectedProjectDetails.assignedPMId && allUsers[selectedProjectDetails.assignedPMId] ? (
                                            <div className="space-y-3">
                                                <div>
                                                    <p className="text-sm font-bold text-foreground">{allUsers[selectedProjectDetails.assignedPMId].displayName || 'Project Manager'}</p>
                                                    {allUsers[selectedProjectDetails.assignedPMId].email && (
                                                        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
                                                            <Mail className="h-3 w-3" />
                                                            {allUsers[selectedProjectDetails.assignedPMId].email}
                                                        </p>
                                                    )}
                                                </div>
                                                <button
                                                    onClick={() => {
                                                        const pmNumber = getPMWhatsAppNumber(selectedProjectDetails as any);
                                                        if (!pmNumber) return;
                                                        const link = buildWhatsAppLink(pmNumber);
                                                        if (link) window.open(link, '_blank');
                                                    }}
                                                    disabled={!getPMWhatsAppNumber(selectedProjectDetails as any)}
                                                    className="w-full h-9 inline-flex items-center justify-center gap-2 rounded-lg bg-green-500/10 border border-green-500/20 text-green-500 hover:bg-green-500/20 hover:border-green-500/40 disabled:opacity-50 disabled:cursor-not-allowed text-[10px] font-bold uppercase tracking-widest transition-all active:scale-95"
                                                >
                                                    <MessageCircle className="h-4 w-4" />
                                                    Message on WhatsApp
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="py-6 text-center">
                                                <div className="h-10 w-10 rounded-lg bg-muted/30 mx-auto mb-2 flex items-center justify-center text-muted-foreground">
                                                    <User className="h-4 w-4 opacity-50" />
                                                </div>
                                                <p className="text-xs text-muted-foreground font-medium">No Project Manager Assigned</p>
                                            </div>
                                        )}
                                    </div>

                                    <div className="bg-muted/30 border border-border rounded-lg p-4 space-y-3">
                                        <div className="flex items-center gap-2">
                                            <div className="h-8 w-8 rounded-lg bg-primary/20 flex items-center justify-center text-primary">
                                                <Briefcase className="h-4 w-4" />
                                            </div>
                                            <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest">Project Overview</p>
                                        </div>

                                        <div className="grid gap-2.5">
                                            <div className="flex items-center justify-between p-2.5 rounded-lg bg-card border border-border/50">
                                                <div className="flex items-center gap-2">
                                                    <div className="h-6 w-6 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500">
                                                        <User className="h-3.5 w-3.5" />
                                                    </div>
                                                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Client</span>
                                                </div>
                                                <span className="text-xs font-bold text-foreground">{selectedProjectDetails.clientName || 'N/A'}</span>
                                            </div>

                                            <div className="flex items-center justify-between p-2.5 rounded-lg bg-card border border-border/50">
                                                <div className="flex items-center gap-2">
                                                    <div className="h-6 w-6 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                                                        <Banknote className="h-3.5 w-3.5" />
                                                    </div>
                                                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Your Payment</span>
                                                </div>
                                                <span className="text-xs font-bold text-emerald-500">₹{(selectedProjectDetails.editorPrice || 0).toLocaleString()}</span>
                                            </div>

                                            <div className="flex items-center justify-between p-2.5 rounded-lg bg-card border border-border/50">
                                                <div className="flex items-center gap-2">
                                                    <div className="h-6 w-6 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-500">
                                                        <Circle className="h-3.5 w-3.5" />
                                                    </div>
                                                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Status</span>
                                                </div>
                                                <span className={cn(
                                                    "text-xs font-bold px-2 py-1 rounded-full",
                                                    selectedProjectDetails.status === 'completed' && 'bg-emerald-500/20 text-emerald-500',
                                                    selectedProjectDetails.status === 'active' && 'bg-blue-500/20 text-blue-500',
                                                    selectedProjectDetails.status === 'in_review' && 'bg-amber-500/20 text-amber-500',
                                                    selectedProjectDetails.status === 'pending_assignment' && 'bg-gray-500/20 text-gray-500'
                                                )}>
                                                    {getStatusLabel(selectedProjectDetails.status)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/20 rounded-lg p-4 space-y-3">
                                        <div className="flex items-center gap-2">
                                            <div className="h-8 w-8 rounded-lg bg-primary/20 flex items-center justify-center text-primary">
                                                <MessageSquare className="h-4 w-4" />
                                            </div>
                                            <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest">Manager Notes</p>
                                        </div>
                                        <div className="bg-card/50 border border-primary/10 rounded-lg p-3">
                                            <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap break-words font-medium">
                                                {(selectedProjectDetails as any).pmRemarks || 'No remarks from the manager yet.'}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="space-y-6 max-w-[1600px] mx-auto pb-16">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                        <h1 className="text-2xl md:text-3xl font-bold text-foreground">My Projects</h1>
                        <p className="text-muted-foreground mt-1">All projects assigned to you with payment and status information.</p>
                    </div>
                    <div className="flex items-center gap-3 bg-card border border-border rounded-lg px-4 py-2 w-fit">
                        <div className={cn(
                            "h-2.5 w-2.5 rounded-full",
                            editorStatus === "online"
                                ? "bg-emerald-500"
                                : editorStatus === "sleep"
                                    ? "bg-amber-500"
                                    : "bg-red-500"
                        )} />
                        <select
                            value={editorStatus}
                            onChange={(e) => handleStatusUpdate(e.target.value as "online" | "offline" | "sleep")}
                            className="bg-transparent border-none text-sm font-medium text-foreground focus:ring-0 cursor-pointer appearance-none pr-2"
                            style={{ colorScheme: "dark" }}
                        >
                            <option value="online" className="bg-card text-foreground">Online</option>
                            <option value="sleep" className="bg-card text-foreground">Away</option>
                            <option value="offline" className="bg-card text-foreground">Offline</option>
                        </select>
                    </div>
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                    <div className="bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 rounded-xl p-5 space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="text-xs uppercase tracking-widest text-muted-foreground font-bold">Total Projects</div>
                            <div className="h-8 w-8 rounded-lg bg-primary/20 flex items-center justify-center text-primary">
                                <FileStack className="h-4 w-4" />
                            </div>
                        </div>
                        <div className="text-3xl font-black text-primary tabular-nums">{projects.length}</div>
                        <div className="h-1 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-primary w-full"></div>
                        </div>
                    </div>

                    <div className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 border border-blue-500/20 rounded-xl p-5 space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="text-xs uppercase tracking-widest text-muted-foreground font-bold">Active</div>
                            <div className="h-8 w-8 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-500">
                                <Zap className="h-4 w-4" />
                            </div>
                        </div>
                        <div className="text-3xl font-black text-blue-500 tabular-nums">{activeProjects.length}</div>
                        <div className="h-1 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 w-full" style={{width: `${activeProjects.length > 0 ? Math.min((activeProjects.length / projects.length) * 100, 100) : 0}%`}}></div>
                        </div>
                    </div>

                    <div className="bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border border-emerald-500/20 rounded-xl p-5 space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="text-xs uppercase tracking-widest text-muted-foreground font-bold">Completed</div>
                            <div className="h-8 w-8 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-500">
                                <CheckCircle className="h-4 w-4" />
                            </div>
                        </div>
                        <div className="text-3xl font-black text-emerald-500 tabular-nums">{completedProjects.length}</div>
                        <div className="h-1 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500" style={{width: `${completedProjects.length > 0 ? Math.min((completedProjects.length / projects.length) * 100, 100) : 0}%`}}></div>
                        </div>
                    </div>

                    <div className="bg-gradient-to-br from-amber-500/10 to-amber-500/5 border border-amber-500/20 rounded-xl p-5 space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="text-xs uppercase tracking-widest text-muted-foreground font-bold">Pending</div>
                            <div className="h-8 w-8 rounded-lg bg-amber-500/20 flex items-center justify-center text-amber-500">
                                <IndianRupee className="h-4 w-4" />
                            </div>
                        </div>
                        <div className="text-3xl font-black text-amber-600 tabular-nums">₹{pendingEarnings.toLocaleString()}</div>
                        <div className="h-1 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-amber-500 w-full"></div>
                        </div>
                    </div>
                </div>

                {/* Search Bar */}
                <div className="relative">
                    <input
                        type="text"
                        placeholder="Search projects by name..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl border border-border bg-muted/30 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    />
                </div>

                {/* Projects Table */}
                <div className="bg-card border border-border rounded-xl overflow-hidden">
                    <div className="p-4 md:p-5 border-b border-border flex items-center justify-between">
                        <h2 className="text-lg font-semibold text-foreground">Assigned Projects</h2>
                        <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">{filteredProjects.length} projects</span>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="bg-muted/30 border-b border-border">
                                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">#</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Project Name</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Assigned PM</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Editor Share</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Payment</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">PM Remarks</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {filteredProjects.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} className="px-4 py-14 text-center text-sm text-muted-foreground">
                                            {projects.length === 0 ? 'No projects assigned yet.' : 'No projects match your search.'}
                                        </td>
                                    </tr>
                                ) : (
                                    filteredProjects.map((project, index) => {
                                        const paymentStatus = getPaymentStatus(project);
                                        const pmWhatsApp = getPMWhatsAppNumber(project);
                                        const isAccepted = project.assignmentStatus === "accepted";

                                        return (
                                            <tr key={project.id} className={cn("hover:bg-muted/20 transition-colors", ['completed', 'approved'].includes(project.status) && "bg-emerald-500/5")}>
                                                <td className="px-4 py-4">
                                                    <span className="text-sm font-bold text-muted-foreground">{index + 1}</span>
                                                </td>
                                                <td className="px-4 py-4">
                                                    <div className="font-semibold text-foreground">{project.name}</div>
                                                </td>
                                                <td className="px-4 py-4">
                                                    <div className="text-sm font-medium text-foreground">
                                                        {project.assignedPMId && allUsers[project.assignedPMId]
                                                            ? allUsers[project.assignedPMId].displayName || 'Project Manager'
                                                            : 'Not Assigned'}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-4">
                                                    <div className="text-sm font-bold text-emerald-500 tabular-nums">
                                                        ₹{(project.editorPrice || 0).toLocaleString()}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-4">
                                                    <div className={cn(
                                                        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold",
                                                        getStatusColor(project.status)
                                                    )}>
                                                        {getStatusIcon(project.status)}
                                                        {getStatusLabel(project.status)}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-4">
                                                    <div className={cn("text-sm", paymentStatus.color)}>
                                                        {['completed', 'approved'].includes(project.status) 
                                                            ? paymentStatus.label 
                                                            : 'N/A'
                                                        }
                                                    </div>
                                                </td>
                                                <td className="px-4 py-4">
                                                    <div className="max-w-xs">
                                                        <p className="text-sm text-muted-foreground truncate hover:text-foreground transition-colors" title={(project as any).pmRemarks || 'No remarks'}>
                                                            {(project as any).pmRemarks || '—'}
                                                        </p>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-4">
                                                    {['completed', 'approved'].includes(project.status) ? (
                                                        <button
                                                            onClick={() => setSelectedProjectDetails(project)}
                                                            className="h-9 px-4 inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-500 hover:bg-emerald-500/30 text-[10px] font-bold uppercase tracking-widest transition-all whitespace-nowrap"
                                                            title="View completed project details"
                                                        >
                                                            <CheckCircle2 className="h-4 w-4" />
                                                            Project Details
                                                        </button>
                                                    ) : projectRevisions[project.id] ? (
                                                        <button
                                                            onClick={() => {
                                                                setReviewProject(project);
                                                                setIsReviewSystemOpen(true);
                                                            }}
                                                            className="h-9 px-4 inline-flex items-center justify-center gap-2 rounded-lg bg-blue-500/20 border border-blue-500/40 text-blue-500 hover:bg-blue-500/30 text-[10px] font-bold uppercase tracking-widest transition-all whitespace-nowrap"
                                                            title="Review uploaded draft"
                                                        >
                                                            <Eye className="h-4 w-4" />
                                                            Review
                                                        </button>
                                                    ) : (
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <button
                                                                onClick={() => setSelectedProjectDetails(project)}
                                                                className="h-8 px-3 inline-flex items-center justify-center gap-1 rounded-lg bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20 text-[10px] font-bold uppercase tracking-widest transition-all whitespace-nowrap"
                                                                title="View complete project details"
                                                            >
                                                                <Eye className="h-3.5 w-3.5" />
                                                                Details
                                                            </button>

                                                            <button
                                                                onClick={() => {
                                                                    if (pmWhatsApp) {
                                                                        const link = buildWhatsAppLink(pmWhatsApp);
                                                                        if (link) window.open(link, '_blank');
                                                                    }
                                                                }}
                                                                disabled={!pmWhatsApp}
                                                                className="h-8 px-3 inline-flex items-center justify-center gap-1 rounded-lg bg-green-500/10 border border-green-500/20 text-green-500 hover:bg-green-500/20 disabled:opacity-50 disabled:cursor-not-allowed text-[10px] font-bold uppercase tracking-widest transition-all whitespace-nowrap"
                                                                title="Chat with PM on WhatsApp"
                                                            >
                                                                <MessageCircle className="h-3.5 w-3.5" />
                                                                Chat PM
                                                            </button>

                                                            <a
                                                                onClick={(e) => {
                                                                    e.preventDefault();
                                                                    e.stopPropagation();
                                                                    if (isAccepted) {
                                                                        setSelectedUploadProject(project);
                                                                        setIsUploadModalOpen(true);
                                                                    }
                                                                }}
                                                                className={cn(
                                                                    "h-8 px-3 inline-flex items-center justify-center gap-1 rounded-lg border text-[10px] font-bold uppercase tracking-widest transition-all whitespace-nowrap cursor-pointer",
                                                                    isAccepted
                                                                        ? "bg-amber-500/10 border-amber-500/20 text-amber-500 hover:bg-amber-500/20"
                                                                        : "bg-muted/20 border-border text-muted-foreground cursor-not-allowed"
                                                                )}
                                                                title={isAccepted ? "Upload draft files for this project" : "Accept assignment to upload draft"}
                                                            >
                                                                <Upload className="h-3.5 w-3.5" />
                                                                Upload
                                                            </a>
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
                {completedProjects.length > 0 && (
                    <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-6">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <h3 className="font-semibold text-emerald-600 dark:text-emerald-400 text-lg mb-1">Total Earnings</h3>
                                <p className="text-sm text-emerald-600/70 dark:text-emerald-400/70">From all completed projects</p>
                            </div>
                            <div className="text-right">
                                <p className="text-3xl font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
                                    ₹{totalEarnings.toLocaleString()}
                                </p>
                                {pendingEarnings > 0 && (
                                    <p className="text-sm text-amber-600 dark:text-amber-400 font-semibold mt-1">
                                        ₹{pendingEarnings.toLocaleString()} pending payment
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <ReviewSystemModal
                isOpen={isReviewSystemOpen}
                onClose={() => setIsReviewSystemOpen(false)}
                project={reviewProject ? { 
                    id: reviewProject.id, 
                    name: reviewProject.name,
                    clientName: (reviewProject as any).clientName || reviewProject.name,
                    paymentStatus: reviewProject.paymentStatus,
                    editorRating: reviewProject.editorRating
                } : null}
                allowUploadDraft={true}
            />

            {/* Upload Draft Modal */}
            <UploadDraftModal
                isOpen={isUploadModalOpen}
                projectId={selectedUploadProject?.id || ""}
                projectName={selectedUploadProject?.name || ""}
                onClose={() => {
                    setIsUploadModalOpen(false);
                    setSelectedUploadProject(null);
                }}
                onSuccess={() => {
                    // Refresh projects after upload
                    setProjects([...projects]);
                }}
            />
        </>
    );
}
