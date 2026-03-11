"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { useAuth } from "@/lib/context/auth-context";
import { db, storage } from "@/lib/firebase/config";
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc, addDoc, getDocs, limit } from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { Project, Revision } from "@/types/schema";
import { cn } from "@/lib/utils";
import { 
    Clock, 
    CheckCircle2, 
    AlertCircle, 
    Search, 
    IndianRupee,
    FileText,
    Upload,
    Eye,
    Calendar,
    Video,
    TrendingUp,
    Wallet,
    Star,
    Timer,
    Award,
    Play,
    CircleDot,
    ArrowRight,
    Briefcase,
    Users,
    FileVideo,
    Link as LinkIcon,
    Zap,
    ChevronRight,
    UploadCloud,
    X,
    Loader2,
    ExternalLink,
    MessageSquare,
    Sparkles
} from "lucide-react";
import { toast } from "sonner";
import { respondToAssignment } from "@/app/actions/admin-actions";
import { handleRevisionUploaded } from "@/app/actions/notification-actions";
import { motion, AnimatePresence } from "framer-motion";
import { EditorPerformance } from "./editor-performance";

export function EditorDashboardV2() {
    const { user } = useAuth();
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [mainTab, setMainTab] = useState<'tasks' | 'performance'>('tasks');
    const [searchQuery, setSearchQuery] = useState("");
    const [userData, setUserData] = useState<any>(null);
    const [selectedProject, setSelectedProject] = useState<Project | null>(null);
    
    // Upload state
    const [uploadingProjectId, setUploadingProjectId] = useState<string | null>(null);
    const [uploadFile, setUploadFile] = useState<File | null>(null);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadDescription, setUploadDescription] = useState("");
    const [isUploading, setIsUploading] = useState(false);

    const handleResponse = async (projectId: string, response: 'accepted' | 'rejected') => {
        let reason: string | undefined;
        if (response === 'rejected') {
            const promptReason = window.prompt("Please provide a reason for declining this project:");
            if (!promptReason) {
                toast.error("A reason is required to decline.");
                return;
            }
            reason = promptReason;
        }
        const res = await respondToAssignment(projectId, response, reason);
        if (res.success) {
            toast.success(response === 'accepted' ? "Project accepted! You can start working." : "Project declined.");
        } else {
            toast.error(res.error);
        }
    };

    useEffect(() => {
        if (!user) return;
        setLoading(true);

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
            
            // Auto-select first active project if none selected
            if (!selectedProject && fetchedProjects.length > 0) {
                const active = fetchedProjects.find(p => p.status === 'active' && p.assignmentStatus !== 'pending');
                setSelectedProject(active || fetchedProjects[0]);
            }
        });

        const userRef = doc(db, "users", user.uid);
        const unsubscribeUser = onSnapshot(userRef, (docSnap) => {
            if (docSnap.exists()) {
                setUserData(docSnap.data());
            }
        });

        return () => { unsubscribe(); unsubscribeUser(); };
    }, [user]);

    // Derived State
    const pendingInvitations = projects.filter(p => p.assignmentStatus === 'pending');
    const activeProjects = projects.filter(p => p.status === 'active' && p.assignmentStatus !== 'pending');
    const reviewProjects = projects.filter(p => p.status === 'in_review');
    const completedProjects = projects.filter(p => ['completed', 'approved'].includes(p.status));
    
    const totalEarnings = completedProjects.reduce((acc, curr) => acc + (curr.editorPrice || 0), 0);
    const pendingEarnings = projects.filter(p => ['completed', 'approved'].includes(p.status) && !p.editorPaid).reduce((acc, p) => acc + (p.editorPrice || 0), 0);
    
    const ratedProjects = projects.filter(p => p.editorRating);
    const averageRating = ratedProjects.length > 0
        ? ratedProjects.reduce((acc, curr) => acc + (curr.editorRating || 0), 0) / ratedProjects.length
        : 0;

    const editorStatus = userData?.availabilityStatus || 'offline';

    const handleStatusUpdate = async (newStatus: 'online' | 'offline' | 'sleep') => {
        if (!user?.uid) return;
        try {
            await updateDoc(doc(db, "users", user.uid), {
                availabilityStatus: newStatus,
                updatedAt: Date.now()
            });
            toast.success(`Status updated to ${newStatus}`);
        } catch(err) {
            toast.error("Failed to update status");
        }
    };

    const handleUploadRevision = async () => {
        if (!uploadFile || !user || !selectedProject) return;

        if (uploadFile.size > 2 * 1024 * 1024 * 1024) {
            toast.error("File is too large. Max size is 2GB.");
            return;
        }

        setIsUploading(true);
        setUploadProgress(0);

        try {
            const q = query(
                collection(db, "revisions"),
                where("projectId", "==", selectedProject.id),
                orderBy("version", "desc"),
                limit(1)
            );
            const snap = await getDocs(q);
            let nextVersion = 1;
            if (!snap.empty) {
                const latest = snap.docs[0].data() as Revision;
                nextVersion = latest.version + 1;
            }

            const storageRef = ref(storage, `projects/${selectedProject.id}/v${nextVersion}_${uploadFile.name}`);
            const uploadTask = uploadBytesResumable(storageRef, uploadFile);

            uploadTask.on('state_changed', 
                (snapshot) => {
                    const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                    setUploadProgress(progress);
                }, 
                (error) => {
                    console.error("Upload failed:", error);
                    toast.error("Upload failed. Please try again.");
                    setIsUploading(false);
                }, 
                async () => {
                    try {
                        const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);

                        const newRevision: Omit<Revision, "id"> = {
                            projectId: selectedProject.id,
                            version: nextVersion,
                            videoUrl: downloadURL,
                            status: 'active',
                            uploadedBy: user.uid,
                            createdAt: Date.now(),
                            description: uploadDescription
                        };
            
                        await addDoc(collection(db, "revisions"), newRevision);
                        await handleRevisionUploaded(selectedProject.id);
                        
                        toast.success("Draft uploaded successfully!");
                        setIsUploading(false);
                        setUploadFile(null);
                        setUploadDescription("");
                        setUploadingProjectId(null);
                    } catch (dbError) {
                        console.error("Error saving revision:", dbError);
                        toast.error("Failed to save revision.");
                        setIsUploading(false);
                    }
                }
            );

        } catch (error: any) {
            console.error("Error starting upload:", error);
            toast.error("Upload error occurred.");
            setIsUploading(false);
        }
    };

    const workingProjects = [...activeProjects, ...reviewProjects];

    return (
        <div className="min-h-screen bg-background">
            {/* Hero Header */}
            <div className="border-b border-border bg-card/50">
                <div className="max-w-[1800px] mx-auto px-6 py-8">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                        <div className="space-y-2">
                            <div className="flex items-center gap-4">
                                <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center">
                                    <Briefcase className="h-7 w-7 text-primary" />
                                </div>
                                <div>
                                    <h1 className="text-2xl font-bold text-foreground">Editor Workspace</h1>
                                    <p className="text-sm text-muted-foreground">Welcome back, {user?.displayName?.split(' ')[0]}</p>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-4">
                            {/* Status Selector */}
                            <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-muted/50 border border-border">
                                <div className={cn(
                                    "h-2.5 w-2.5 rounded-full",
                                    editorStatus === 'online' ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" :
                                    editorStatus === 'sleep' ? "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)]" : "bg-zinc-500"
                                )} />
                                <select 
                                    value={editorStatus}
                                    onChange={(e) => handleStatusUpdate(e.target.value as any)}
                                    className="bg-transparent border-none text-sm font-medium text-foreground focus:ring-0 cursor-pointer capitalize"
                                >
                                    <option value="online">Available</option>
                                    <option value="sleep">Away</option>
                                    <option value="offline">Offline</option>
                                </select>
                            </div>

                            {/* Toggle */}
                            <div className="flex bg-muted rounded-xl p-1">
                                <button
                                    onClick={() => setMainTab('tasks')}
                                    className={cn(
                                        "px-5 py-2.5 text-sm font-medium rounded-lg transition-all",
                                        mainTab === 'tasks' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    <span className="flex items-center gap-2">
                                        <Briefcase className="h-4 w-4" />
                                        Projects
                                    </span>
                                </button>
                                <button
                                    onClick={() => setMainTab('performance')}
                                    className={cn(
                                        "px-5 py-2.5 text-sm font-medium rounded-lg transition-all",
                                        mainTab === 'performance' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    <span className="flex items-center gap-2">
                                        <TrendingUp className="h-4 w-4" />
                                        Performance
                                    </span>
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Stats Row */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-8">
                        <StatCard
                            label="Pending"
                            value={pendingInvitations.length}
                            icon={<AlertCircle className="h-5 w-5" />}
                            color="amber"
                            highlight={pendingInvitations.length > 0}
                        />
                        <StatCard
                            label="In Progress"
                            value={workingProjects.length}
                            icon={<Play className="h-5 w-5" />}
                            color="blue"
                        />
                        <StatCard
                            label="Completed"
                            value={completedProjects.length}
                            icon={<CheckCircle2 className="h-5 w-5" />}
                            color="green"
                        />
                        <StatCard
                            label="Earnings"
                            value={`₹${totalEarnings.toLocaleString()}`}
                            icon={<Wallet className="h-5 w-5" />}
                            color="purple"
                        />
                        <StatCard
                            label="Rating"
                            value={averageRating > 0 ? averageRating.toFixed(1) : '—'}
                            icon={<Star className="h-5 w-5" />}
                            color="amber"
                            suffix={averageRating > 0 ? "/5" : ""}
                        />
                    </div>
                </div>
            </div>

            {mainTab === 'tasks' ? (
                <div className="max-w-[1800px] mx-auto px-6 py-8">
                    {/* Pending Invitations Alert */}
                    {pendingInvitations.length > 0 && (
                        <motion.div 
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="mb-8 p-6 rounded-2xl bg-amber-500/5 border border-amber-500/20"
                        >
                            <div className="flex items-center gap-4 mb-6">
                                <div className="h-12 w-12 rounded-xl bg-amber-500/10 flex items-center justify-center">
                                    <Sparkles className="h-6 w-6 text-amber-500" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-amber-600 dark:text-amber-400 text-lg">New Project Invitations</h3>
                                    <p className="text-sm text-amber-600/70 dark:text-amber-400/70">Review and respond within the deadline</p>
                                </div>
                            </div>
                            <div className="grid gap-4">
                                {pendingInvitations.map((project) => (
                                    <div key={project.id} className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 bg-background rounded-xl border border-border">
                                        <div className="flex-1 min-w-0">
                                            <h4 className="font-semibold text-foreground truncate">{project.name}</h4>
                                            <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-muted-foreground">
                                                <span className="flex items-center gap-1.5">
                                                    <Users className="h-3.5 w-3.5" />
                                                    {project.clientName || project.brand || 'Client'}
                                                </span>
                                                <span className="flex items-center gap-1.5">
                                                    <Video className="h-3.5 w-3.5" />
                                                    {project.videoType?.replace('_', ' ') || 'Video'}
                                                </span>
                                                <span className="flex items-center gap-1.5 text-emerald-500 font-medium">
                                                    <IndianRupee className="h-3.5 w-3.5" />
                                                    {project.editorPrice?.toLocaleString() || 0}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <button 
                                                onClick={() => handleResponse(project.id, 'rejected')}
                                                className="px-5 py-2.5 rounded-xl bg-muted text-muted-foreground hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/20 border border-transparent text-sm font-medium transition-all"
                                            >
                                                Decline
                                            </button>
                                            <button 
                                                onClick={() => handleResponse(project.id, 'accepted')}
                                                className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium transition-all"
                                            >
                                                Accept Project
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </motion.div>
                    )}

                    {/* Main Content Grid */}
                    <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
                        {/* Projects List - Left Side */}
                        <div className="xl:col-span-4 space-y-4">
                            <div className="flex items-center justify-between">
                                <h2 className="text-lg font-semibold text-foreground">Your Projects</h2>
                                <span className="text-sm text-muted-foreground">{workingProjects.length} active</span>
                            </div>

                            {/* Search */}
                            <div className="relative">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <input 
                                    type="text"
                                    placeholder="Search projects..."
                                    className="w-full h-11 pl-11 pr-4 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                            </div>

                            {/* Project Cards */}
                            <div className="space-y-3 max-h-[calc(100vh-400px)] overflow-y-auto pr-2">
                                {loading ? (
                                    <div className="text-center py-12">
                                        <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                                    </div>
                                ) : workingProjects.filter(p => !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 ? (
                                    <div className="text-center py-12 px-6">
                                        <Video className="h-12 w-12 mx-auto mb-4 text-muted-foreground/30" />
                                        <p className="text-muted-foreground">No active projects</p>
                                    </div>
                                ) : (
                                    workingProjects
                                        .filter(p => !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase()))
                                        .map((project) => (
                                            <motion.div
                                                key={project.id}
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                onClick={() => setSelectedProject(project)}
                                                className={cn(
                                                    "p-4 rounded-xl border cursor-pointer transition-all hover:shadow-md",
                                                    selectedProject?.id === project.id 
                                                        ? "bg-primary/5 border-primary/30 shadow-sm" 
                                                        : "bg-card border-border hover:border-primary/20"
                                                )}
                                            >
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="flex-1 min-w-0">
                                                        <h3 className="font-semibold text-foreground truncate">{project.name}</h3>
                                                        <p className="text-sm text-muted-foreground mt-1 capitalize">
                                                            {project.videoType?.replace('_', ' ') || 'Video'}
                                                        </p>
                                                    </div>
                                                    <StatusBadge status={project.status} />
                                                </div>
                                                <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
                                                    <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                                                        <Calendar className="h-3.5 w-3.5" />
                                                        {project.deadline || 'No deadline'}
                                                    </span>
                                                    <span className="text-sm font-semibold text-emerald-500">
                                                        ₹{(project.editorPrice || 0).toLocaleString()}
                                                    </span>
                                                </div>
                                            </motion.div>
                                        ))
                                )}

                                {/* Completed Projects Section */}
                                {completedProjects.length > 0 && (
                                    <div className="pt-6 mt-6 border-t border-border">
                                        <h3 className="text-sm font-medium text-muted-foreground mb-3">Completed ({completedProjects.length})</h3>
                                        {completedProjects.slice(0, 3).map((project) => (
                                            <div
                                                key={project.id}
                                                onClick={() => setSelectedProject(project)}
                                                className={cn(
                                                    "p-3 rounded-lg border cursor-pointer transition-all mb-2",
                                                    selectedProject?.id === project.id 
                                                        ? "bg-emerald-500/5 border-emerald-500/20" 
                                                        : "bg-card/50 border-border hover:border-emerald-500/20"
                                                )}
                                            >
                                                <div className="flex items-center justify-between">
                                                    <span className="text-sm font-medium text-foreground truncate">{project.name}</span>
                                                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Project Details - Right Side */}
                        <div className="xl:col-span-8">
                            {selectedProject ? (
                                <ProjectDetailPanel 
                                    project={selectedProject}
                                    onUploadClick={() => setUploadingProjectId(selectedProject.id)}
                                    uploadingProjectId={uploadingProjectId}
                                    uploadFile={uploadFile}
                                    setUploadFile={setUploadFile}
                                    uploadProgress={uploadProgress}
                                    uploadDescription={uploadDescription}
                                    setUploadDescription={setUploadDescription}
                                    isUploading={isUploading}
                                    onUpload={handleUploadRevision}
                                    onCancelUpload={() => {
                                        setUploadingProjectId(null);
                                        setUploadFile(null);
                                        setUploadDescription("");
                                    }}
                                />
                            ) : (
                                <div className="h-full flex items-center justify-center min-h-[500px] bg-card rounded-2xl border border-border">
                                    <div className="text-center">
                                        <Video className="h-16 w-16 mx-auto mb-4 text-muted-foreground/20" />
                                        <p className="text-muted-foreground">Select a project to view details</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Pending Earnings Notice */}
                    {pendingEarnings > 0 && (
                        <div className="mt-8 p-6 rounded-2xl bg-emerald-500/5 border border-emerald-500/20">
                            <div className="flex items-center gap-6">
                                <div className="h-14 w-14 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                                    <Wallet className="h-7 w-7 text-emerald-500" />
                                </div>
                                <div>
                                    <p className="text-sm text-emerald-600 dark:text-emerald-400">Pending Payout</p>
                                    <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
                                        ₹{pendingEarnings.toLocaleString()}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                <div className="max-w-7xl mx-auto px-6 py-8">
                    {user && <EditorPerformance user={user} projects={completedProjects} />}
                </div>
            )}
        </div>
    );
}

// Stat Card Component
function StatCard({ label, value, icon, color, highlight, suffix }: { 
    label: string; 
    value: string | number; 
    icon: React.ReactNode; 
    color: 'blue' | 'amber' | 'green' | 'purple';
    highlight?: boolean;
    suffix?: string;
}) {
    const colorClasses = {
        blue: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
        amber: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
        green: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
        purple: 'bg-purple-500/10 text-purple-500 border-purple-500/20'
    };

    return (
        <div className={cn(
            "p-4 rounded-xl border bg-card transition-all",
            highlight ? "border-amber-500/50 shadow-[0_0_20px_rgba(245,158,11,0.1)]" : "border-border"
        )}>
            <div className="flex items-center justify-between mb-3">
                <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center border", colorClasses[color])}>
                    {icon}
                </div>
            </div>
            <div className="flex items-baseline gap-1">
                <p className="text-2xl font-bold text-foreground">{value}</p>
                {suffix && <span className="text-sm text-muted-foreground">{suffix}</span>}
            </div>
            <p className="text-sm text-muted-foreground mt-1">{label}</p>
        </div>
    );
}

// Status Badge Component
function StatusBadge({ status }: { status: string }) {
    const config: Record<string, { label: string; className: string }> = {
        active: { label: 'In Progress', className: 'bg-blue-500/10 text-blue-500 border-blue-500/20' },
        in_review: { label: 'In Review', className: 'bg-purple-500/10 text-purple-500 border-purple-500/20' },
        revision: { label: 'Revision', className: 'bg-orange-500/10 text-orange-500 border-orange-500/20' },
        completed: { label: 'Done', className: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' },
        approved: { label: 'Approved', className: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' }
    };

    const { label, className } = config[status] || config.active;

    return (
        <span className={cn("px-2.5 py-1 text-xs font-medium rounded-lg border", className)}>
            {label}
        </span>
    );
}

// Project Detail Panel Component
function ProjectDetailPanel({ 
    project,
    onUploadClick,
    uploadingProjectId,
    uploadFile,
    setUploadFile,
    uploadProgress,
    uploadDescription,
    setUploadDescription,
    isUploading,
    onUpload,
    onCancelUpload
}: {
    project: Project;
    onUploadClick: () => void;
    uploadingProjectId: string | null;
    uploadFile: File | null;
    setUploadFile: (file: File | null) => void;
    uploadProgress: number;
    uploadDescription: string;
    setUploadDescription: (desc: string) => void;
    isUploading: boolean;
    onUpload: () => void;
    onCancelUpload: () => void;
}) {
    const isUploadMode = uploadingProjectId === project.id;
    const canUpload = !['completed', 'approved'].includes(project.status);

    return (
        <div className="bg-card rounded-2xl border border-border overflow-hidden">
            {/* Header */}
            <div className="p-6 border-b border-border bg-muted/30">
                <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2">
                            <h2 className="text-xl font-bold text-foreground truncate">{project.name}</h2>
                            <StatusBadge status={project.status} />
                        </div>
                        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1.5">
                                <Users className="h-4 w-4" />
                                {project.clientName || project.brand || 'Client'}
                            </span>
                            <span className="flex items-center gap-1.5">
                                <Video className="h-4 w-4" />
                                {project.videoType?.replace('_', ' ') || 'Video'}
                            </span>
                            {project.deadline && (
                                <span className="flex items-center gap-1.5">
                                    <Calendar className="h-4 w-4" />
                                    Due: {project.deadline}
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="text-right">
                        <p className="text-sm text-muted-foreground">Your Earnings</p>
                        <p className="text-2xl font-bold text-emerald-500">₹{(project.editorPrice || 0).toLocaleString()}</p>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
                {/* Project Brief */}
                {project.description && (
                    <div className="space-y-3">
                        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                            <FileText className="h-4 w-4 text-primary" />
                            Project Brief
                        </h3>
                        <p className="text-sm text-muted-foreground leading-relaxed bg-muted/30 rounded-xl p-4 border border-border">
                            {project.description}
                        </p>
                    </div>
                )}

                {/* Project Assets - Visible without scrolling */}
                <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                        <FileVideo className="h-4 w-4 text-primary" />
                        Project Assets
                    </h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Raw Footage Link */}
                        {project.footageLink && (
                            <a 
                                href={project.footageLink.startsWith('http') ? project.footageLink : `https://${project.footageLink}`}
                                target="_blank"
                                className="flex items-center gap-4 p-4 rounded-xl border border-border bg-muted/30 hover:border-primary/30 hover:bg-primary/5 transition-all group"
                            >
                                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-105 transition-transform">
                                    <LinkIcon className="h-5 w-5" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-medium text-foreground">Raw Footage</p>
                                    <p className="text-sm text-muted-foreground truncate">Access source files</p>
                                </div>
                                <ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                            </a>
                        )}

                        {/* Reference Link */}
                        {(project as any).referenceLink && (
                            <a 
                                href={(project as any).referenceLink.startsWith('http') ? (project as any).referenceLink : `https://${(project as any).referenceLink}`}
                                target="_blank"
                                className="flex items-center gap-4 p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 hover:border-emerald-500/40 hover:bg-emerald-500/10 transition-all group"
                            >
                                <div className="h-12 w-12 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 group-hover:scale-105 transition-transform">
                                    <Zap className="h-5 w-5" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-medium text-emerald-600 dark:text-emerald-400">Style Reference</p>
                                    <p className="text-sm text-emerald-600/70 dark:text-emerald-400/70 truncate">View reference video</p>
                                </div>
                                <ExternalLink className="h-4 w-4 text-emerald-500/50 group-hover:text-emerald-500 transition-colors" />
                            </a>
                        )}
                    </div>

                    {/* Uploaded Raw Files */}
                    {project.rawFiles && project.rawFiles.length > 0 && (
                        <div className="space-y-3">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Uploaded Files</p>
                            <div className="grid gap-2">
                                {project.rawFiles.map((file: any, idx: number) => (
                                    <div key={idx} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <FileVideo className="h-5 w-5 text-muted-foreground" />
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
                                                <p className="text-xs text-muted-foreground">
                                                    {file.size ? (file.size / (1024*1024)).toFixed(2) : '?'} MB
                                                </p>
                                            </div>
                                        </div>
                                        <a 
                                            href={file.url} 
                                            target="_blank"
                                            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                                        >
                                            View
                                        </a>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Reference Files */}
                    {(project as any).referenceFiles && (project as any).referenceFiles.length > 0 && (
                        <div className="space-y-3">
                            <p className="text-xs font-semibold text-emerald-500/70 uppercase tracking-wider">Reference Assets</p>
                            <div className="grid gap-2">
                                {(project as any).referenceFiles.map((file: any, idx: number) => (
                                    <div key={idx} className="flex items-center justify-between p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <Eye className="h-5 w-5 text-emerald-500" />
                                            <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400 truncate">{file.name}</p>
                                        </div>
                                        <a 
                                            href={file.url} 
                                            target="_blank"
                                            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 transition-colors"
                                        >
                                            View
                                        </a>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* No assets message */}
                    {!project.footageLink && !(project as any).referenceLink && (!project.rawFiles || project.rawFiles.length === 0) && (
                        <div className="text-center py-8 px-6 rounded-xl bg-muted/30 border border-border">
                            <FileVideo className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
                            <p className="text-sm text-muted-foreground">No project assets uploaded yet</p>
                        </div>
                    )}
                </div>

                {/* Video Details */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {(project as any).videoFormat && (
                        <div className="p-4 rounded-xl bg-muted/30 border border-border">
                            <p className="text-xs text-muted-foreground mb-1">Format</p>
                            <p className="font-semibold text-foreground">{(project as any).videoFormat}</p>
                        </div>
                    )}
                    {(project as any).aspectRatio && (
                        <div className="p-4 rounded-xl bg-muted/30 border border-border">
                            <p className="text-xs text-muted-foreground mb-1">Aspect Ratio</p>
                            <p className="font-semibold text-foreground">{(project as any).aspectRatio}</p>
                        </div>
                    )}
                    {(project as any).duration && (
                        <div className="p-4 rounded-xl bg-muted/30 border border-border">
                            <p className="text-xs text-muted-foreground mb-1">Duration</p>
                            <p className="font-semibold text-foreground">{(project as any).duration}</p>
                        </div>
                    )}
                    {project.videoType && (
                        <div className="p-4 rounded-xl bg-muted/30 border border-border">
                            <p className="text-xs text-muted-foreground mb-1">Type</p>
                            <p className="font-semibold text-foreground capitalize">{project.videoType.replace('_', ' ')}</p>
                        </div>
                    )}
                </div>

                {/* Upload Section */}
                {canUpload && (
                    <div className="pt-6 border-t border-border">
                        {!isUploadMode ? (
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="font-semibold text-foreground">Ready to submit?</h3>
                                    <p className="text-sm text-muted-foreground">Upload your draft for client review</p>
                                </div>
                                <button 
                                    onClick={onUploadClick}
                                    className="px-6 py-3 rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-all flex items-center gap-2"
                                >
                                    <Upload className="h-4 w-4" />
                                    Upload Draft
                                </button>
                            </div>
                        ) : (
                            <motion.div 
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="space-y-6"
                            >
                                <div className="flex items-center justify-between">
                                    <h3 className="font-semibold text-foreground flex items-center gap-2">
                                        <UploadCloud className="h-5 w-5 text-primary" />
                                        Upload New Draft
                                    </h3>
                                    <button 
                                        onClick={onCancelUpload}
                                        className="p-2 rounded-lg hover:bg-muted transition-colors"
                                    >
                                        <X className="h-4 w-4 text-muted-foreground" />
                                    </button>
                                </div>

                                {/* File Drop Zone */}
                                <div className={cn(
                                    "relative border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer",
                                    uploadFile 
                                        ? "border-primary/50 bg-primary/5" 
                                        : "border-border hover:border-primary/30 hover:bg-muted/30"
                                )}>
                                    <input 
                                        type="file" 
                                        accept="video/*"
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                        onChange={(e) => {
                                            if (e.target.files && e.target.files[0]) {
                                                setUploadFile(e.target.files[0]);
                                            }
                                        }}
                                    />
                                    {uploadFile ? (
                                        <div className="space-y-3">
                                            <div className="h-16 w-16 mx-auto rounded-xl bg-primary/10 flex items-center justify-center">
                                                <FileVideo className="h-8 w-8 text-primary" />
                                            </div>
                                            <div>
                                                <p className="font-semibold text-foreground">{uploadFile.name}</p>
                                                <p className="text-sm text-emerald-500">{(uploadFile.size / (1024 * 1024)).toFixed(2)} MB</p>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            <div className="h-16 w-16 mx-auto rounded-xl bg-muted flex items-center justify-center">
                                                <UploadCloud className="h-8 w-8 text-muted-foreground" />
                                            </div>
                                            <div>
                                                <p className="font-medium text-foreground">Drop your video file here</p>
                                                <p className="text-sm text-muted-foreground">MP4, MOV, WebM up to 2GB</p>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Description */}
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-foreground">Version Notes (Optional)</label>
                                    <textarea 
                                        placeholder="Describe what's changed in this version..."
                                        className="w-full h-24 p-4 rounded-xl border border-border bg-muted/30 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                                        value={uploadDescription}
                                        onChange={(e) => setUploadDescription(e.target.value)}
                                    />
                                </div>

                                {/* Progress */}
                                {isUploading && (
                                    <div className="space-y-2">
                                        <div className="flex justify-between text-sm">
                                            <span className="text-muted-foreground">Uploading...</span>
                                            <span className="font-medium text-foreground">{Math.round(uploadProgress)}%</span>
                                        </div>
                                        <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                                            <div 
                                                className="h-full bg-primary transition-all duration-300"
                                                style={{ width: `${uploadProgress}%` }}
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* Submit Button */}
                                <button 
                                    onClick={onUpload}
                                    disabled={!uploadFile || isUploading}
                                    className="w-full py-4 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {isUploading ? (
                                        <>
                                            <Loader2 className="h-5 w-5 animate-spin" />
                                            Uploading...
                                        </>
                                    ) : (
                                        <>
                                            <Upload className="h-5 w-5" />
                                            Submit for Review
                                        </>
                                    )}
                                </button>
                            </motion.div>
                        )}
                    </div>
                )}

                {/* Action Buttons */}
                <div className="flex flex-wrap gap-3 pt-4">
                    <Link 
                        href={`/dashboard/projects/${project.id}`}
                        className="flex-1 px-5 py-3 rounded-xl border border-border bg-muted/30 text-foreground font-medium hover:bg-muted/50 transition-all flex items-center justify-center gap-2"
                    >
                        <Eye className="h-4 w-4" />
                        View Full Details
                    </Link>
                    <Link 
                        href={`/dashboard/projects/${project.id}`}
                        className="px-5 py-3 rounded-xl border border-primary/20 bg-primary/5 text-primary font-medium hover:bg-primary/10 transition-all flex items-center gap-2"
                    >
                        <MessageSquare className="h-4 w-4" />
                        Project Chat
                    </Link>
                </div>
            </div>
        </div>
    );
}
