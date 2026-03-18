"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/context/auth-context";
import { db } from "@/lib/firebase/config";
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc } from "firebase/firestore";
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
    Upload
} from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { UploadDraftModal } from "./upload-draft-modal";

export function EditorDashboardV2() {
    const { user } = useAuth();
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [previewVideoUrl, setPreviewVideoUrl] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [userData, setUserData] = useState<any>(null);
    const [selectedProjectAssets, setSelectedProjectAssets] = useState<any>(null);
    const [selectedProjectDetails, setSelectedProjectDetails] = useState<Project | null>(null);
    const [allUsers, setAllUsers] = useState<any>({});
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [selectedUploadProject, setSelectedUploadProject] = useState<Project | null>(null);

    useEffect(() => {
        if (!user) return;
        setLoading(true);

        // Fetch assigned projects
        const projectsRef = collection(db, "projects");
        const q = query(
            projectsRef, 
            where("assignedEditorId", "==", user.uid),
            orderBy("updatedAt", "desc")
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedProjects: Project[] = [];
            snapshot.forEach((doc) => {
                fetchedProjects.push({ id: doc.id, ...doc.data() } as Project);
            });
            setProjects(fetchedProjects);
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
        } catch (error) {
            toast.error("Failed to accept project");
            console.error(error);
        }
    };

    const handleRejectProject = async (projectId: string) => {
        if (!user?.uid) return;
        try {
            await updateDoc(doc(db, "projects", projectId), {
                assignmentStatus: "rejected",
                assignedEditorId: null,
                updatedAt: Date.now()
            });
            toast.success("Project rejected. PM will be notified.");
        } catch (error) {
            toast.error("Failed to reject project");
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
        p.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.clientName?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Count statistics
    const activeProjects = projects.filter(p => p.status === 'active');
    const completedProjects = projects.filter(p => ['completed', 'approved'].includes(p.status));
    const totalEarnings = completedProjects.reduce((acc, curr) => acc + (curr.editorPrice || 0), 0);
    const pendingEarnings = projects
        .filter(p => ['completed', 'approved'].includes(p.status) && !p.editorPaid)
        .reduce((acc, p) => acc + (p.editorPrice || 0), 0);

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
        try {
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
            anchor.target = "_blank";
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
        }
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
                {previewVideoUrl && (
                    <motion.div 
                        key="video-preview-modal"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[9999] bg-black/95 backdrop-blur-xl flex items-center justify-center p-4 pointer-events-auto" 
                        onClick={() => setPreviewVideoUrl(null)}
                    >
                        <motion.div 
                            initial={{ scale: 0.95 }}
                            animate={{ scale: 1 }}
                            exit={{ scale: 0.95 }}
                            className="relative w-full h-full md:h-auto md:max-w-7xl md:aspect-video bg-black rounded-3xl overflow-hidden shadow-[0_0_200px_rgba(0,0,0,0.8)]" 
                            onClick={e => e.stopPropagation()}
                        >
                            <button 
                                onClick={() => setPreviewVideoUrl(null)} 
                                className="absolute top-6 right-6 h-12 w-12 bg-white/20 hover:bg-white/30 text-white rounded-full flex items-center justify-center backdrop-blur-md z-[10000] transition-all hover:bg-white/40"
                            >
                                <X className="h-6 w-6" />
                            </button>
                            <video 
                                src={previewVideoUrl} 
                                controls 
                                className="w-full h-full object-contain" 
                                autoPlay
                                controlsList="nodownload"
                            />
                        </motion.div>
                    </motion.div>
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
                                    className="h-10 w-10 bg-muted/30 hover:bg-muted/50 text-foreground rounded-lg flex items-center justify-center transition-colors"
                                >
                                    <XIcon className="h-5 w-5" />
                                </button>
                            </div>

                            <div className="p-6 space-y-4">
                                {selectedProjectAssets.rawFiles && selectedProjectAssets.rawFiles.length > 0 ? (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {selectedProjectAssets.rawFiles.map((file: any, idx: number) => (
                                            <motion.div 
                                                key={idx}
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ delay: idx * 0.05 }}
                                                className="group border border-border rounded-lg overflow-hidden bg-muted/20 hover:bg-muted/40 transition-all"
                                            >
                                                <div className="relative aspect-video bg-black flex items-center justify-center overflow-hidden">
                                                    <video 
                                                        src={file.url} 
                                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" 
                                                    />
                                                    <button
                                                        onClick={() => setPreviewVideoUrl(file.url)}
                                                        className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity cursor-pointer"
                                                    >
                                                        <Eye className="h-8 w-8 text-white" />
                                                    </button>
                                                </div>
                                                <div className="p-3">
                                                    <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
                                                    <p className="text-xs text-muted-foreground mt-1">
                                                        {file.size ? `${(file.size / (1024*1024)).toFixed(2)} MB` : 'N/A'}
                                                    </p>
                                                    <button
                                                        onClick={() => setPreviewVideoUrl(file.url)}
                                                        className="mt-2 w-full px-3 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 text-xs font-semibold transition-colors flex items-center justify-center gap-1"
                                                    >
                                                        <Eye className="h-3 w-3" />
                                                        Play
                                                    </button>
                                                </div>
                                            </motion.div>
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

                                    <div className="bg-muted/30 border border-border rounded-lg p-4 space-y-3">
                                        <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest">Project Files</p>

                                        {selectedProjectDetails.footageLink && (
                                            <div className="flex items-center justify-between gap-3 p-2 rounded-md bg-card border border-border">
                                                <span className="text-xs font-medium truncate">Raw Footage Drive Link</span>
                                                <button
                                                    onClick={() => window.open(selectedProjectDetails.footageLink, '_blank')}
                                                    className="h-8 w-8 rounded-md bg-muted hover:bg-primary/20 hover:text-primary text-muted-foreground flex items-center justify-center transition-all"
                                                    title="Open link"
                                                >
                                                    <Eye className="h-3.5 w-3.5" />
                                                </button>
                                            </div>
                                        )}

                                        {selectedProjectDetails.rawFiles && selectedProjectDetails.rawFiles.length > 0 && (
                                            <div className="space-y-2">
                                                <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Client Assets</p>
                                                {selectedProjectDetails.rawFiles.map((file: any, idx: number) => (
                                                    <div key={`raw-${idx}`} className="flex items-center justify-between gap-3 p-2 rounded-md bg-card border border-border">
                                                        <span className="text-xs font-medium truncate">{file.name}</span>
                                                        <div className="flex items-center gap-2">
                                                            <button
                                                                onClick={() => setPreviewVideoUrl(file.url)}
                                                                className="h-8 w-8 rounded-md bg-muted hover:bg-primary/20 hover:text-primary text-muted-foreground flex items-center justify-center transition-all"
                                                                title="Preview"
                                                            >
                                                                <Eye className="h-3.5 w-3.5" />
                                                            </button>
                                                            <button
                                                                onClick={() => triggerDirectDownload(file.url, file.name)}
                                                                className="h-8 w-8 rounded-md bg-muted hover:bg-primary/20 hover:text-primary text-muted-foreground flex items-center justify-center transition-all"
                                                                title="Download"
                                                            >
                                                                <Upload className="h-3.5 w-3.5" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {selectedProjectDetails.referenceFiles && selectedProjectDetails.referenceFiles.length > 0 && (
                                            <div className="space-y-2">
                                                <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Manager References</p>
                                                {selectedProjectDetails.referenceFiles.map((file: any, idx: number) => (
                                                    <div key={`ref-${idx}`} className="flex items-center justify-between gap-3 p-2 rounded-md bg-card border border-border">
                                                        <div className="min-w-0 flex-1">
                                                            <p className="text-xs font-medium truncate">{file.name}</p>
                                                            <p className="text-[10px] text-muted-foreground">Uploaded by Project Manager</p>
                                                        </div>
                                                        <button
                                                            onClick={() => triggerDirectDownload(file.url, file.name)}
                                                            className="h-8 w-8 rounded-md bg-muted hover:bg-primary/20 hover:text-primary text-muted-foreground flex items-center justify-center transition-all"
                                                            title="Download"
                                                        >
                                                            <Upload className="h-3.5 w-3.5" />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    <div className="bg-muted/30 border border-border rounded-lg p-4">
                                        <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest mb-3">Project Timeline & Updates</p>
                                        {selectedProjectDetails.logs && selectedProjectDetails.logs.length > 0 ? (
                                            <div className="space-y-3 max-h-[240px] overflow-y-auto">
                                                {[...selectedProjectDetails.logs].reverse().slice(0, 12).map((log: any, idx: number) => (
                                                    <div key={idx} className="flex items-start gap-3 pb-3 border-b border-border last:border-0 last:pb-0">
                                                        <div className="h-2 w-2 mt-1.5 rounded-full bg-primary" />
                                                        <div className="min-w-0 flex-1">
                                                            <p className="text-xs font-semibold text-foreground">{String(log.event || '').replace(/_/g, ' ')}</p>
                                                            {log.details && <p className="text-xs text-muted-foreground mt-0.5">{log.details}</p>}
                                                            <p className="text-[10px] text-muted-foreground mt-1">{log.userName || 'System'} • {new Date(log.timestamp).toLocaleString()}</p>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="text-xs text-muted-foreground">No updates recorded yet.</p>
                                        )}
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div className="bg-muted/30 border border-border rounded-lg p-4">
                                        <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest mb-3">Assigned Manager</p>
                                        <p className="text-sm font-semibold text-foreground">
                                            {selectedProjectDetails.assignedPMId && allUsers[selectedProjectDetails.assignedPMId]
                                                ? allUsers[selectedProjectDetails.assignedPMId].displayName || 'Project Manager'
                                                : 'Not Assigned'}
                                        </p>
                                        <p className="text-xs text-muted-foreground mt-1">
                                            {selectedProjectDetails.assignedPMId && allUsers[selectedProjectDetails.assignedPMId]
                                                ? allUsers[selectedProjectDetails.assignedPMId].email || ''
                                                : ''}
                                        </p>

                                        <button
                                            onClick={() => {
                                                const pmNumber = getPMWhatsAppNumber(selectedProjectDetails as any);
                                                if (!pmNumber) return;
                                                const link = buildWhatsAppLink(pmNumber);
                                                if (link) window.open(link, '_blank');
                                            }}
                                            disabled={!getPMWhatsAppNumber(selectedProjectDetails as any)}
                                            className="mt-3 h-8 w-full inline-flex items-center justify-center gap-1 rounded-lg bg-green-500/10 border border-green-500/20 text-green-500 hover:bg-green-500/20 disabled:opacity-50 disabled:cursor-not-allowed text-[10px] font-bold uppercase tracking-widest transition-all"
                                        >
                                            <MessageCircle className="h-3.5 w-3.5" />
                                            Chat with Project Manager
                                        </button>
                                    </div>

                                    <div className="bg-muted/30 border border-border rounded-lg p-4 space-y-2">
                                        <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest mb-2">Project Snapshot</p>
                                        <div className="flex items-center justify-between text-xs">
                                            <span className="text-muted-foreground">Client</span>
                                            <span className="font-semibold text-foreground">{selectedProjectDetails.clientName || 'N/A'}</span>
                                        </div>
                                        <div className="flex items-center justify-between text-xs">
                                            <span className="text-muted-foreground">Editor Share</span>
                                            <span className="font-semibold text-foreground">₹{(selectedProjectDetails.editorPrice || 0).toLocaleString()}</span>
                                        </div>
                                        <div className="flex items-center justify-between text-xs">
                                            <span className="text-muted-foreground">Status</span>
                                            <span className="font-semibold text-foreground">{getStatusLabel(selectedProjectDetails.status)}</span>
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
                    <div className="bg-card border border-border rounded-xl p-5">
                        <div className="text-xs uppercase tracking-widest text-muted-foreground font-bold mb-2">Total Projects</div>
                        <div className="text-3xl font-black text-foreground tabular-nums">{projects.length}</div>
                    </div>
                    <div className="bg-card border border-border rounded-xl p-5">
                        <div className="text-xs uppercase tracking-widest text-muted-foreground font-bold mb-2">Active</div>
                        <div className="text-3xl font-black text-blue-500 tabular-nums">{activeProjects.length}</div>
                    </div>
                    <div className="bg-card border border-border rounded-xl p-5">
                        <div className="text-xs uppercase tracking-widest text-muted-foreground font-bold mb-2">Completed</div>
                        <div className="text-3xl font-black text-emerald-500 tabular-nums">{completedProjects.length}</div>
                    </div>
                    <div className="bg-card border border-border rounded-xl p-5">
                        <div className="text-xs uppercase tracking-widest text-muted-foreground font-bold mb-2">Payment Pending</div>
                        <div className="text-3xl font-black text-amber-500 tabular-nums">₹{pendingEarnings.toLocaleString()}</div>
                    </div>
                </div>

                {/* Search Bar */}
                <div className="relative">
                    <input
                        type="text"
                        placeholder="Search projects by name or client..."
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
                                            <tr key={project.id} className="hover:bg-muted/20 transition-colors">
                                                <td className="px-4 py-4">
                                                    <span className="text-sm font-bold text-muted-foreground">{index + 1}</span>
                                                </td>
                                                <td className="px-4 py-4">
                                                    <div className="font-semibold text-foreground">{project.name}</div>
                                                    <div className="text-xs text-muted-foreground">{project.clientName || 'N/A'}</div>
                                                </td>
                                                <td className="px-4 py-4">
                                                    <div className="text-sm font-medium text-foreground">{(project as any).assignedPMName || 'Project Manager'}</div>
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
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Earnings Summary */}
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
