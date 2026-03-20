"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/context/auth-context";
import { 
    Loader2, 
    Search,
    MoreHorizontal,
    Trash2,
    AlertCircle,
    UserPlus,
    Calendar,
    Briefcase,
    RefreshCw,
    Plus,
    ChevronDown,
    Activity,
    Layers,
    User as UserIcon,
    Zap,
    Monitor,
    ExternalLink,
    IndianRupee,
    Clock,
    CheckCircle2,
    XCircle,
    X,
    FileVideo,
    Eye,
    Settings,
    ChevronRight,
    Download,
    Star,
    Sparkles,
    MessageSquare,
    Upload,
    File,
    X as XIcon,
    Copy,
    ImageIcon,
    FileText,
    Link as LinkIcon
} from "lucide-react";
import { db, storage } from "@/lib/firebase/config";
import { collection, query, orderBy, onSnapshot, updateDoc, doc, where } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { Project, User } from "@/types/schema";
import { 
    assignEditor,
    autoAssignEditor,
    setEditorPrice, 
    toggleProjectAutoPay,
    settleProjectPayment,
    deleteProject,
    bulkSettleEditorDues
} from "@/app/actions/admin-actions";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { 
    DropdownMenu, 
    DropdownMenuContent, 
    DropdownMenuItem, 
    DropdownMenuTrigger,
    DropdownMenuSeparator, 
    DropdownMenuLabel 
} from "@/components/ui/dropdown-menu";
import { Modal } from "@/components/ui/modal";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Label } from "@/components/ui/label";
import { FilePreview } from "@/components/file-preview";
import { ReviewSystemModal } from "./review-system-modal";


// Stats Card Component
function StatsCard({ icon, value, label, color = "blue", alert = false }: {
    icon: React.ReactNode;
    value: number | string;
    label: string;
    color?: "blue" | "amber" | "green" | "purple" | "red";
    alert?: boolean;
}) {
    const colorStyles = {
        blue: "bg-blue-500/10 text-blue-600 border-blue-500/20",
        amber: "bg-amber-500/10 text-amber-600 border-amber-500/20",
        green: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
        purple: "bg-purple-500/10 text-purple-600 border-purple-500/20",
        red: "bg-red-500/10 text-red-600 border-red-500/20"
    };

    return (
        <motion.div 
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ y: -2 }}
            className={cn(
                "relative bg-card border border-border rounded-xl p-5 hover:shadow-md transition-all duration-200",
                alert && "ring-2 ring-amber-500/30"
            )}
        >
            <div className="flex items-start justify-between">
                <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center border", colorStyles[color])}>
                    {icon}
                </div>
                {alert && (
                    <span className="flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-amber-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                    </span>
                )}
            </div>
            <div className="mt-4">
                <p className="text-3xl font-bold text-foreground tabular-nums">{value}</p>
                <p className="text-sm text-muted-foreground mt-1">{label}</p>
            </div>
        </motion.div>
    );
}

// Status Badge Component
function StatusBadge({ status, size = "sm" }: { status: string; size?: "sm" | "md" }) {
    const configs: Record<string, { label: string; className: string }> = {
        pending_assignment: { label: "Pending", className: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
        active: { label: "In Progress", className: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
        in_review: { label: "In Review", className: "bg-purple-500/10 text-purple-600 border-purple-500/20" },
        completed: { label: "Completed", className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
        approved: { label: "Approved", className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
        archived: { label: "Archived", className: "bg-zinc-500/10 text-zinc-500 border-zinc-500/20" },
        delivered: { label: "Delivered", className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" }
    };
    
    const config = configs[status] || { label: status, className: "bg-zinc-500/10 text-zinc-500 border-zinc-500/20" };
    
    return (
        <span className={cn(
            "inline-flex items-center rounded-full border font-medium",
            size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs",
            config.className
        )}>
            {config.label}
        </span>
    );
}

// Status Select Styling Helper
function getStatusSelectColor(status: string): string {
    const colorMap: Record<string, string> = {
        pending_assignment: "bg-amber-500/15 border-amber-500/50 text-amber-600",
        active: "bg-blue-500/15 border-blue-500/50 text-blue-600",
        in_review: "bg-purple-500/15 border-purple-500/50 text-purple-600",
        completed: "bg-emerald-500/15 border-emerald-500/50 text-emerald-600",
        approved: "bg-emerald-500/15 border-emerald-500/50 text-emerald-600",
        archived: "bg-zinc-500/15 border-zinc-500/50 text-zinc-500"
    };
    return colorMap[status] || "bg-muted border-border text-foreground";
}

// Payment Badge Component
function PaymentBadge({ type, paid }: { type: "client" | "editor"; paid: boolean }) {
    return (
        <span className={cn(
            "inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold border",
            paid 
                ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" 
                : type === "client" 
                    ? "bg-red-500/10 text-red-500 border-red-500/20"
                    : "bg-amber-500/10 text-amber-600 border-amber-500/20"
        )}>
            {type === "client" ? "Client" : "Editor"}: {paid ? "Paid" : "Pending"}
        </span>
    );
}

export function ProjectManagerDashboard() {
    const { user } = useAuth();

    const [projects, setProjects] = useState<Project[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [editors, setEditors] = useState<User[]>([]);
    const [selectedEditorDetail, setSelectedEditorDetail] = useState<User | null>(null);
    const [isEditorModalOpen, setIsEditorModalOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    
    // Modals
    const [selectedProject, setSelectedProject] = useState<Project | null>(null);
    const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
    const [isManageModalOpen, setIsManageModalOpen] = useState(false);
    const [editorPriceInput, setEditorPriceInput] = useState("");
    const [assignDeadline, setAssignDeadline] = useState("");
    const [isAutoAssigning, setIsAutoAssigning] = useState(false);
    
    // Project Detail Modal
    const [inspectProject, setInspectProject] = useState<Project | null>(null);
    const [isProjectDetailModalOpen, setIsProjectDetailModalOpen] = useState(false);
    const [reviewLoading, setReviewLoading] = useState(false);
    const [isUploadingPMFile, setIsUploadingPMFile] = useState(false);
    const [pmFileInput, setPmFileInput] = useState<HTMLInputElement | null>(null);
    const [openRejectionPopup, setOpenRejectionPopup] = useState<string | null>(null);
    
    const [isReviewSystemOpen, setIsReviewSystemOpen] = useState(false);
    const [reviewProject, setReviewProject] = useState<Project | null>(null);
    
    const [previewFile, setPreviewFile] = useState<{ url: string; type: string; name: string } | null>(null);

    useEffect(() => {
        setLoading(true);
        const q = query(
            collection(db, "projects"), 
            where("assignedPMId", "==", user?.uid || ""),
            orderBy("createdAt", "desc")
        );
        const unsubProjects = onSnapshot(q, (snapshot) => {
            setProjects(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Project)));
        });

        const usersQ = collection(db, "users");
        const unsubUsers = onSnapshot(usersQ, (snapshot) => {
             const allUsers = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as User));
             setUsers(allUsers);
             setEditors(allUsers.filter((u) => u.role === 'editor'));
             setLoading(false);
        });

        return () => {
            unsubProjects();
            unsubUsers();
        };
    }, []);

    const handleAssignEditor = async (editorId: string) => {
        if (!selectedProject) return;
        if (!editorPriceInput || isNaN(Number(editorPriceInput)) || Number(editorPriceInput) <= 0) {
            toast.error("Please enter a valid editor payment amount.");
            return;
        }

        if (Number(editorPriceInput) > (selectedProject.totalCost || 0)) {
            toast.error(`Editor payment cannot exceed project cost (₹${selectedProject.totalCost || 0}).`);
            return;
        }

        try {
            const res = await assignEditor(selectedProject.id, editorId, Number(editorPriceInput), assignDeadline);
            if (res.success) {
                toast.success("Editor assigned successfully");
                setIsAssignModalOpen(false);
                setSelectedProject(null);
                setEditorPriceInput("");
                setAssignDeadline("");
            } else {
                toast.error(res.error || "Failed to assign editor");
            }
        } catch (err) { 
            toast.error("Something went wrong. Please try again."); 
        }
    };

    const handleAutoAssign = async () => {
        if (!selectedProject) return;
        if (!editorPriceInput || isNaN(Number(editorPriceInput)) || Number(editorPriceInput) <= 0) {
            toast.error("Please enter a valid editor payment amount.");
            return;
        }

        if (Number(editorPriceInput) > (selectedProject.totalCost || 0)) {
            toast.error(`Editor payment cannot exceed project cost (₹${selectedProject.totalCost || 0}).`);
            return;
        }

        setIsAutoAssigning(true);
        try {
            const res = await autoAssignEditor(selectedProject.id, Number(editorPriceInput), assignDeadline);
            if (res.success) {
                toast.success(`Auto-assigned to ${res.editorName} (Priority ${res.priority})`);
                setIsAssignModalOpen(false);
                setSelectedProject(null);
                setEditorPriceInput("");
                setAssignDeadline("");
            } else {
                toast.error(res.error || "Auto-assign failed");
            }
        } catch (err) {
            toast.error("Something went wrong. Please try again.");
        } finally {
            setIsAutoAssigning(false);
        }
    };

    const handleSettlePayment = async (projectId: string) => {
        try {
            const result = await settleProjectPayment(projectId, user!.uid, user!.displayName || "PM", "project_manager");
            if (result.success) {
                toast.success("Payment marked as complete");
            } else {
                toast.error(result.error || "Failed to settle payment");
            }
        } catch (error) {
            toast.error("An error occurred");
        }
    };

    const handleReimburseEditor = async (projectId: string) => {
        try {
            await updateDoc(doc(db, "projects", projectId), {
                editorPaid: true,
                editorPaidAt: Date.now()
            });
            const { addProjectLog } = await import("@/app/actions/admin-actions");
            await addProjectLog(projectId, 'PAYMENT_MARKED', { uid: user?.uid || 'system', displayName: user?.displayName || 'PM' }, 'Editor payment completed.');
            toast.success("Editor payment marked as complete");
        } catch (error) {
            toast.error("Failed to update payment status");
        }
    };

    const handleSettleAllDues = async (editorId: string) => {
        const editorProjects = projects.filter(p => p.assignedEditorId === editorId && p.clientHasDownloaded && !p.editorPaid);
        if (editorProjects.length === 0) return;
        
        if(!confirm(`Settle all ${editorProjects.length} pending payments for this editor?`)) return;
        
        const pids = editorProjects.map(p => p.id);
        const res = await bulkSettleEditorDues(pids, { 
            uid: user!.uid, 
            displayName: user!.displayName || "PM", 
            designation: 'Project Manager' 
        });
        
        if(res.success) toast.success("All payments settled");
        else toast.error("Failed to settle payments");
    };

    const handleOpenReview = async (projectId: string) => {
        setReviewLoading(true);
        try {
            const target = projects.find((p) => p.id === projectId) || inspectProject || null;
            if (!target) {
                toast.error("Project not found.");
                return;
            }
            if (target.status === 'completed') {
                toast.error("Review is disabled for completed projects.");
                return;
            }
            setReviewProject(target);
            setIsReviewSystemOpen(true);
        } catch (err) {
            console.error('Review error:', err);
            toast.error("Failed to open review.");
        } finally {
            setReviewLoading(false);
        }
    };

    const handleDeleteProject = async (projectId: string) => {
        if(!confirm("Are you sure you want to delete this project? This action cannot be undone.")) return;
        const result = await deleteProject(projectId);
        if (result.success) toast.success("Project deleted");
        else toast.error("Failed to delete project");
    };

    const handleUpdateProjectInline = async (projectId: string, field: string, value: any) => {
        try {
            await updateDoc(doc(db, "projects", projectId), { [field]: value, updatedAt: Date.now() });
            toast.success("Updated");
        } catch (err) {
            toast.error("Failed to update");
        }
    };

    const handleUploadPMFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!inspectProject || !user) return;
        const files = e.target.files;
        if (!files || files.length === 0) return;

        setIsUploadingPMFile(true);
        try {
            const file = files[0];
            const timestamp = Date.now();
            const fileName = `${timestamp}-${file.name}`;
            const storageRef = ref(storage, `projects/${inspectProject.id}/pm-files/${fileName}`);

            // Upload to Firebase Storage
            await uploadBytes(storageRef, file);
            const downloadURL = await getDownloadURL(storageRef);

            // Add to project's pmFiles array (using referenceFiles field)
            const currentReferenceFiles = inspectProject.referenceFiles || [];
            const newPMFile = {
                name: file.name,
                url: downloadURL,
                size: file.size,
                type: file.type,
                uploadedAt: timestamp,
                uploadedBy: user.uid
            };

            await updateDoc(doc(db, "projects", inspectProject.id), {
                referenceFiles: [...currentReferenceFiles, newPMFile],
                updatedAt: Date.now()
            });

            toast.success("File uploaded successfully");
            
            // Reset file input
            if (pmFileInput) {
                pmFileInput.value = '';
            }
        } catch (error) {
            console.error("Upload error:", error);
            toast.error("Failed to upload file");
        } finally {
            setIsUploadingPMFile(false);
        }
    };

    const handleDirectDownload = async (url: string, fileName?: string) => {
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

    // Stats calculations
    const unassignedCount = projects.filter(p => !p.assignedEditorId).length;
    const activeCount = projects.filter(p => !['completed', 'approved', 'archived', 'delivered'].includes(p.status)).length;
    const pendingUnlockCount = projects.filter(p => p.downloadUnlockRequested && p.paymentStatus !== 'full_paid').length;
    const editorPendingCount = projects.filter(p => p.assignedEditorId && p.clientHasDownloaded && !p.editorPaid).length;

    // PM availability status
    const currentUserData = users.find(u => u.uid === user?.uid);
    const pmStatus = currentUserData?.availabilityStatus || 'offline';

    const handleStatusUpdate = async (newStatus: 'online' | 'offline' | 'sleep') => {
        if (!user?.uid) return;
        try {
            await updateDoc(doc(db, "users", user.uid), {
                availabilityStatus: newStatus,
                updatedAt: Date.now()
            });
            toast.success(`Status changed to ${newStatus}`);
        } catch(err) {
            toast.error("Failed to update status");
        }
    };

    // Filter projects by search
    const filteredProjects = projects.filter(p => 
        !searchQuery || 
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        p.clientName?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="space-y-8 max-w-[1600px] mx-auto pb-16">
            {/* Header */}
            <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4"
            >
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-foreground">
                        Welcome back, {user?.displayName?.split(' ')[0]}
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Managing {projects.length} project{projects.length !== 1 ? 's' : ''}
                    </p>
                </div>
                
                <div className="flex items-center gap-4">
                    {/* Availability Status */}
                    <div className="flex items-center gap-3 bg-card border border-border rounded-lg px-4 py-2">
                        <div className={cn(
                            "h-2.5 w-2.5 rounded-full",
                            pmStatus === 'online' ? "bg-emerald-500" :
                            pmStatus === 'sleep' ? "bg-amber-500" : "bg-red-500"
                        )} />
                        <select 
                            value={pmStatus}
                            onChange={(e) => handleStatusUpdate(e.target.value as any)}
                            className="bg-transparent border-none text-sm font-medium text-foreground focus:ring-0 cursor-pointer appearance-none pr-6"
                            style={{ colorScheme: "dark" }}
                        >
                            <option value="online" className="bg-card text-foreground">Available</option>
                            <option value="sleep" className="bg-card text-foreground">Away</option>
                            <option value="offline" className="bg-card text-foreground">Offline</option>
                        </select>
                        <ChevronDown className="h-4 w-4 text-muted-foreground -ml-4" />
                    </div>
                </div>
            </motion.div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatsCard 
                    icon={<Plus className="h-5 w-5" />}
                    value={unassignedCount}
                    label="Needs Assignment"
                    color="amber"
                    alert={unassignedCount > 0}
                />
                <StatsCard 
                    icon={<Activity className="h-5 w-5" />}
                    value={activeCount}
                    label="Active Projects"
                    color="blue"
                />
                <StatsCard 
                    icon={<IndianRupee className="h-5 w-5" />}
                    value={editorPendingCount}
                    label="Pending Editor Payments"
                    color="purple"
                    alert={editorPendingCount > 0}
                />
                <StatsCard 
                    icon={<Download className="h-5 w-5" />}
                    value={pendingUnlockCount}
                    label="Download Requests"
                    color="green"
                    alert={pendingUnlockCount > 0}
                />
            </div>

            {/* Projects Table */}
            <motion.div 
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="bg-card border border-border rounded-xl overflow-hidden"
            >
                {/* Table Header */}
                <div className="p-4 md:p-5 border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <h2 className="text-lg font-semibold text-foreground">All Projects</h2>
                        <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">
                            {filteredProjects.length} total
                        </span>
                    </div>
                    
                    <div className="flex items-center gap-3">
                        <div className="relative flex-1 md:w-72">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <input 
                                type="text" 
                                placeholder="Search projects or clients..." 
                                className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-4 text-sm focus:border-primary/50 focus:outline-none transition-colors"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="bg-muted/50 border-b border-border">
                                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Project</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Client</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Editor</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Editor Pay</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Payments</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Deadline</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Notes</th>
                                <th className="px-4 py-3 w-12"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {loading ? (
                                <tr>
                                    <td colSpan={9} className="px-4 py-16 text-center">
                                        <RefreshCw className="animate-spin h-5 w-5 mx-auto text-muted-foreground" />
                                    </td>
                                </tr>
                            ) : filteredProjects.length === 0 ? (
                                <tr>
                                    <td colSpan={9} className="px-4 py-16 text-center text-muted-foreground text-sm">
                                        No projects found
                                    </td>
                                </tr>
                            ) : (
                                filteredProjects.map((project, idx) => {
                                    const assignedEditor = editors.find(e => e.uid === project.assignedEditorId);
                                    
                                    return (
                                        <motion.tr 
                                            key={project.id}
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            transition={{ delay: idx * 0.02 }}
                                            className="group hover:bg-muted/30 transition-colors"
                                        >
                                            {/* Project Name */}
                                            <td className="px-4 py-3">
                                                <div className="max-w-[180px]">
                                                    <button 
                                                        onClick={() => { setInspectProject(project); setIsProjectDetailModalOpen(true); }}
                                                        className="text-sm font-medium text-foreground hover:text-primary transition-colors text-left truncate block cursor-pointer active:scale-95"
                                                        title={project.name}
                                                    >
                                                        {project.name}
                                                    </button>
                                                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                                                        {project.videoType || 'Video'} • {new Date(project.createdAt).toLocaleDateString()}
                                                    </p>
                                                </div>
                                            </td>
                                            
                                            {/* Client */}
                                            <td className="px-4 py-3">
                                                <span className="text-sm text-foreground">{project.clientName || '—'}</span>
                                            </td>
                                            
                                            {/* Status Dropdown */}
                                            <td className="px-4 py-3">
                                                <select 
                                                    value={project.status} 
                                                    onChange={(e) => handleUpdateProjectInline(project.id, 'status', e.target.value)}
                                                    className={cn("text-xs font-medium px-3 py-1.5 rounded-md focus:outline-none focus:border-primary border", getStatusSelectColor(project.status))}
                                                >
                                                    <option value="pending_assignment">Pending</option>
                                                    <option value="active">In Progress</option>
                                                    <option value="in_review">In Review</option>
                                                    <option value="completed">Completed</option>
                                                    <option value="approved">Approved</option>
                                                </select>
                                            </td>
                                            
                                            {/* Editor Dropdown with Profile View */}
                                            <td className="px-4 py-3">
                                                <div className="space-y-1">
                                                    <div className="flex items-center gap-2">
                                                        <DropdownMenu>
                                                            <DropdownMenuTrigger asChild>
                                                                <button className={cn(
                                                                    "flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all min-w-[140px] max-w-[160px] cursor-pointer active:scale-95",
                                                                    project.assignmentStatus === 'rejected'
                                                                        ? "bg-red-500/10 border-red-500/30 text-red-600 hover:bg-red-500/20"
                                                                        : project.assignedEditorId 
                                                                        ? "bg-primary/10 border-primary/30 text-foreground hover:bg-primary/20" 
                                                                        : "bg-muted border-border text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                                                                )}>
                                                                    {project.assignmentStatus === 'rejected' ? (
                                                                        <>
                                                                            <AlertCircle className="h-4 w-4 shrink-0" />
                                                                            <span>Rejected</span>
                                                                        </>
                                                                    ) : project.assignedEditorId ? (
                                                                        <>
                                                                            <div className="h-5 w-5 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary shrink-0">
                                                                                {editors.find(e => e.uid === project.assignedEditorId)?.displayName?.[0] || 'E'}
                                                                            </div>
                                                                            <span className="truncate">{editors.find(e => e.uid === project.assignedEditorId)?.displayName || 'Editor'}</span>
                                                                        </>
                                                                    ) : (
                                                                        <>
                                                                            <UserIcon className="h-4 w-4 shrink-0" />
                                                                            <span>Unassigned</span>
                                                                        </>
                                                                    )}
                                                                    <ChevronDown className="h-3.5 w-3.5 ml-auto shrink-0 opacity-50" />
                                                                </button>
                                                            </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="start" className="w-[320px] p-2">
                                                        <DropdownMenuLabel className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-2 pb-2">
                                                            Select Editor
                                                        </DropdownMenuLabel>
                                                        <DropdownMenuSeparator />
                                                        
                                                        {/* Unassign Option */}
                                                        {project.assignedEditorId && (
                                                            <>
                                                                <DropdownMenuItem 
                                                                    onClick={async () => {
                                                                        await handleUpdateProjectInline(project.id, 'assignedEditorId', null);
                                                                    }}
                                                                    className="flex items-center gap-3 p-3 cursor-pointer text-red-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg"
                                                                >
                                                                    <XCircle className="h-4 w-4" />
                                                                    <span className="text-xs font-medium">Remove Assignment</span>
                                                                </DropdownMenuItem>
                                                                <DropdownMenuSeparator className="my-2" />
                                                            </>
                                                        )}
                                                        
                                                        {/* Editor List */}
                                                        <div className="max-h-[300px] overflow-y-auto space-y-1">
                                                            {editors.map(editor => {
                                                                const isAssigned = project.assignedEditorId === editor.uid;
                                                                const status = editor.availabilityStatus || 'offline';
                                                                const completedCount = projects.filter(p => p.assignedEditorId === editor.uid && p.status === 'completed').length;
                                                                
                                                                return (
                                                                    <div 
                                                                        key={editor.uid}
                                                                        className={cn(
                                                                            "p-3 rounded-lg border transition-all",
                                                                            isAssigned 
                                                                                ? "bg-primary/10 border-primary/30" 
                                                                                : "bg-muted/30 border-transparent hover:bg-muted/50 hover:border-border"
                                                                        )}
                                                                    >
                                                                        <div className="flex items-center gap-3">
                                                                            {/* Avatar */}
                                                                            <div className="relative shrink-0">
                                                                                <div className={cn(
                                                                                    "h-9 w-9 rounded-lg flex items-center justify-center text-xs font-bold overflow-hidden",
                                                                                    isAssigned ? "bg-primary text-primary-foreground" : "bg-muted border border-border"
                                                                                )}>
                                                                                    {editor.photoURL ? (
                                                                                        <Image src={editor.photoURL} alt="" width={36} height={36} className="w-full h-full object-cover" />
                                                                                    ) : (
                                                                                        editor.displayName?.[0] || 'E'
                                                                                    )}
                                                                                </div>
                                                                                <div className={cn(
                                                                                    "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background",
                                                                                    status === 'online' ? "bg-emerald-500" : 
                                                                                    status === 'sleep' ? "bg-amber-500" : "bg-red-500"
                                                                                )} />
                                                                            </div>
                                                                            
                                                                            {/* Info */}
                                                                            <div className="flex-1 min-w-0">
                                                                                <div className="flex items-center gap-2">
                                                                                    <p className="text-xs font-bold text-foreground truncate">{editor.displayName}</p>
                                                                                    {isAssigned && <CheckCircle2 className="h-3 w-3 text-primary shrink-0" />}
                                                                                </div>
                                                                                <div className="flex items-center gap-2 mt-0.5">
                                                                                    <span className="text-[10px] text-muted-foreground">{completedCount} completed</span>
                                                                                    {editor.rating && (
                                                                                        <>
                                                                                            <span className="text-muted-foreground/30">•</span>
                                                                                            <span className="flex items-center gap-0.5 text-[10px] text-amber-500">
                                                                                                <Star className="h-2.5 w-2.5 fill-amber-500" />
                                                                                                {editor.rating}
                                                                                            </span>
                                                                                        </>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                        
                                                                        {/* Action Buttons */}
                                                                        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/50">
                                                                            <button 
                                                                                onClick={(e) => {
                                                                                    e.preventDefault();
                                                                                    e.stopPropagation();
                                                                                    setSelectedEditorDetail(editor);
                                                                                    setIsEditorModalOpen(true);
                                                                                }}
                                                                                className="flex-1 h-7 flex items-center justify-center gap-1.5 bg-muted hover:bg-muted/80 border border-border rounded-md text-[10px] font-medium text-muted-foreground hover:text-foreground transition-all"
                                                                            >
                                                                                <Eye className="h-3 w-3" />
                                                                                View Profile
                                                                            </button>
                                                                            <button 
                                                                                onClick={async (e) => {
                                                                                    e.preventDefault();
                                                                                    e.stopPropagation();
                                                                                    if (!project.editorPrice) {
                                                                                        toast.error("Set editor payment first");
                                                                                    } else {
                                                                                        const res = await assignEditor(project.id, editor.uid, project.editorPrice, project.deadline || '');
                                                                                        if (res.success) toast.success('Editor assigned');
                                                                                        else toast.error(res.error || 'Failed');
                                                                                    }
                                                                                }}
                                                                                disabled={isAssigned || status === 'offline'}
                                                                                className={cn(
                                                                                    "flex-1 h-7 flex items-center justify-center gap-1.5 rounded-md text-[10px] font-bold transition-all",
                                                                                    isAssigned 
                                                                                        ? "bg-primary/20 text-primary cursor-default"
                                                                                        : status === 'offline'
                                                                                            ? "bg-muted text-muted-foreground cursor-not-allowed"
                                                                                            : "bg-primary text-primary-foreground hover:bg-primary/90"
                                                                                )}
                                                                            >
                                                                                {isAssigned ? (
                                                                                    <>
                                                                                        <CheckCircle2 className="h-3 w-3" />
                                                                                        Assigned
                                                                                    </>
                                                                                ) : status === 'offline' ? (
                                                                                    'Offline'
                                                                                ) : (
                                                                                    <>
                                                                                        <UserPlus className="h-3 w-3" />
                                                                                        Assign
                                                                                    </>
                                                                                )}
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                                {/* Rejection Tooltip */}
                                                {project.assignmentStatus === 'rejected' && project.editorDeclineReason && (
                                                    <div className="relative">
                                                        <button 
                                                            onClick={() => setOpenRejectionPopup(openRejectionPopup === project.id ? null : project.id)}
                                                            className="h-8 w-8 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-600 hover:bg-red-500/20 transition-colors cursor-pointer active:scale-95"
                                                            title="View rejection reason"
                                                        >
                                                            <AlertCircle className="h-4 w-4" />
                                                        </button>
                                                        {openRejectionPopup === project.id && (
                                                            <>
                                                                <div className="fixed inset-0 z-40" onClick={() => setOpenRejectionPopup(null)} />
                                                                <div className="absolute left-full ml-2 bottom-0 z-50 w-72 p-3 bg-card border border-red-500/30 rounded-lg shadow-xl text-[11px]">
                                                                    <p className="font-semibold text-red-600 mb-1">
                                                                        {users.find(u => u.uid === project.assignedEditorId)?.displayName || 'Editor'} rejected
                                                                    </p>
                                                                    <p className="text-red-500/80 leading-relaxed">{project.editorDeclineReason}</p>
                                                                </div>
                                                            </>
                                                        )}
                                                    </div>
                                                )}
                                                    </div>
                                                </div>
                                            </td>
                                            {/* Editor Price */}
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-1">
                                                    <span className="text-xs text-muted-foreground">₹</span>
                                                    <input 
                                                        type="number" 
                                                        defaultValue={project.editorPrice || ''}
                                                        onBlur={(e) => handleUpdateProjectInline(project.id, 'editorPrice', Number(e.target.value))}
                                                        placeholder="0"
                                                        className="bg-transparent border-b border-border/50 text-sm w-16 pb-0.5 focus:outline-none focus:border-primary text-foreground tabular-nums"
                                                    />
                                                </div>
                                            </td>
                                            
                                            {/* Payment Status */}
                                            <td className="px-4 py-3">
                                                <div className="flex flex-col gap-1">
                                                    <PaymentBadge type="client" paid={project.paymentStatus === 'full_paid'} />
                                                    {project.assignedEditorId && (
                                                        <PaymentBadge type="editor" paid={!!project.editorPaid} />
                                                    )}
                                                </div>
                                            </td>
                                            
                                            {/* Deadline */}
                                            <td className="px-4 py-3 text-sm text-muted-foreground tabular-nums">
                                                {project.deadline ? new Date(project.deadline).toLocaleDateString() : '—'}
                                            </td>
                                            
                                            {/* Notes/Highlights */}
                                            <td className="px-4 py-3">
                                                <input 
                                                    type="text" 
                                                    defaultValue={(project as any).highlights || ''}
                                                    onBlur={(e) => handleUpdateProjectInline(project.id, 'highlights', e.target.value)}
                                                    placeholder="Add note..."
                                                    className="bg-transparent border-b border-border/50 text-xs w-full pb-0.5 focus:outline-none focus:border-primary text-foreground min-w-[80px]"
                                                />
                                            </td>
                                            
                                            {/* Actions */}
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => handleOpenReview(project.id)}
                                                    disabled={reviewLoading || project.status === 'completed'}
                                                    className="h-8 flex items-center gap-1.5 px-3 rounded-md bg-primary/10 hover:bg-primary/20 text-primary text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer active:scale-95"
                                                >
                                                    {reviewLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <MessageSquare className="h-3 w-3" />}
                                                    Review
                                                </button>
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <button className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer active:scale-95">
                                                            <MoreHorizontal className="h-4 w-4" />
                                                        </button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" className="w-48">
                                                        <DropdownMenuLabel className="text-xs text-muted-foreground">Actions</DropdownMenuLabel>
                                                        <DropdownMenuSeparator />
                                                        
                                                        <DropdownMenuItem 
                                                            onClick={() => { setInspectProject(project); setIsProjectDetailModalOpen(true); }}
                                                            className="text-sm cursor-pointer"
                                                        >
                                                            <Eye className="mr-2 h-4 w-4" /> View Details
                                                        </DropdownMenuItem>
                                                        
                                                        {!project.assignedEditorId && project.status !== 'completed' && project.status !== 'archived' && (
                                                            <DropdownMenuItem 
                                                                onClick={() => { setSelectedProject(project); setEditorPriceInput(project.editorPrice?.toString() || ""); setIsAssignModalOpen(true); }}
                                                                className="text-sm cursor-pointer"
                                                            >
                                                                <UserPlus className="mr-2 h-4 w-4" /> Assign Editor
                                                            </DropdownMenuItem>
                                                        )}
                                                        
                                                        {project.assignedEditorId && project.status !== 'completed' && project.status !== 'archived' && (
                                                            <DropdownMenuItem 
                                                                onClick={() => { setSelectedProject(project); setEditorPriceInput(project.editorPrice?.toString() || ""); setIsManageModalOpen(true); }}
                                                                className="text-sm cursor-pointer"
                                                            >
                                                                <Settings className="mr-2 h-4 w-4" /> Manage Project
                                                            </DropdownMenuItem>
                                                        )}
                                                        
                                                        {(project as any).paymentOption === 'pay_later' && project.paymentStatus !== 'full_paid' && (
                                                            <DropdownMenuItem 
                                                                onClick={() => handleSettlePayment(project.id)}
                                                                className="text-sm cursor-pointer text-emerald-600"
                                                            >
                                                                <IndianRupee className="mr-2 h-4 w-4" /> Mark Payment Complete
                                                            </DropdownMenuItem>
                                                        )}
                                                        
                                                        <DropdownMenuSeparator />
                                                        <DropdownMenuItem 
                                                            onClick={() => handleDeleteProject(project.id)}
                                                            className="text-sm cursor-pointer text-red-500"
                                                        >
                                                            <Trash2 className="mr-2 h-4 w-4" /> Delete Project
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                                </div>
                                            </td>
                                        </motion.tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
                
                {/* Table Footer */}
                <div className="px-4 py-3 border-t border-border bg-muted/30 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                        Showing {filteredProjects.length} of {projects.length} projects
                    </span>
                </div>
            </motion.div>

            {/* ==================== MODALS ==================== */}
            
            {/* Assign Editor Modal */}
            <Modal isOpen={isAssignModalOpen} onClose={() => setIsAssignModalOpen(false)} title="Assign Editor" maxWidth="max-w-2xl">
                <div className="mt-4 space-y-6">
                    {/* Selected Project Info Card */}
                    <div className="p-4 rounded-xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/20">
                        <div className="flex items-start justify-between">
                            <div className="space-y-1">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-primary">Assigning editor to</p>
                                <p className="text-lg font-bold text-foreground">{selectedProject?.name}</p>
                                <div className="flex items-center gap-3 mt-2">
                                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                        <FileVideo className="w-3.5 h-3.5" />
                                        {selectedProject?.videoType || 'Video'}
                                    </span>
                                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                        <IndianRupee className="w-3.5 h-3.5" />
                                        {selectedProject?.budget?.toLocaleString() || '0'}
                                    </span>
                                </div>
                            </div>
                            <div className={cn(
                                "px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide",
                                (selectedProject as any)?.urgency === 'urgent' 
                                    ? "bg-amber-500/20 text-amber-500 border border-amber-500/30" 
                                    : "bg-blue-500/20 text-blue-500 border border-blue-500/30"
                            )}>
                                {(selectedProject as any)?.urgency === 'urgent' ? '⚡ Urgent' : '24hrs'}
                            </div>
                        </div>
                    </div>

                    {/* Editor Price & Deadline */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Editor Payment (₹)</Label>
                            <input 
                                type="number"
                                placeholder="e.g. 500"
                                value={editorPriceInput}
                                onChange={(e) => setEditorPriceInput(e.target.value)}
                                className="w-full h-11 px-4 rounded-xl bg-muted/50 border border-border focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm font-medium transition-all"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Deadline (optional)</Label>
                            <input 
                                type="datetime-local"
                                value={assignDeadline}
                                onChange={(e) => setAssignDeadline(e.target.value)}
                                className="w-full h-11 px-4 rounded-xl bg-muted/50 border border-border focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm font-medium transition-all"
                            />
                        </div>
                    </div>

                    {/* Auto Assign Option */}
                    <div className="relative overflow-hidden rounded-xl border border-primary/30 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-5">
                        <div className="absolute top-0 right-0 p-3 opacity-30">
                            <Sparkles className="w-16 h-16 text-primary" />
                        </div>
                        <div className="relative z-10 flex items-center justify-between gap-4">
                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    <Zap className="w-5 h-5 text-primary" />
                                    <h3 className="font-bold text-foreground">Auto Assign</h3>
                                </div>
                                <p className="text-xs text-muted-foreground max-w-sm">
                                    Automatically assign to the best available editor based on priority and workload
                                </p>
                            </div>
                            <button
                                onClick={handleAutoAssign}
                                disabled={isAutoAssigning || !editorPriceInput}
                                className="px-6 py-3 bg-primary text-primary-foreground rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-primary/20 cursor-pointer active:scale-95"
                            >
                                {isAutoAssigning ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Finding Best Editor...
                                    </>
                                ) : (
                                    <>
                                        <Zap className="w-4 h-4" />
                                        Auto Assign
                                    </>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* OR Divider */}
                    <div className="flex items-center gap-4">
                        <div className="flex-1 h-px bg-border" />
                        <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">or choose manually</span>
                        <div className="flex-1 h-px bg-border" />
                    </div>

                    {/* Editors List */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Available Editors</Label>
                            <span className="text-[10px] text-muted-foreground">{editors.length} editor{editors.length !== 1 ? 's' : ''}</span>
                        </div>
                        <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                            {editors.length === 0 ? (
                                <div className="py-12 text-center border border-dashed border-border rounded-xl">
                                    <UserIcon className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                                    <p className="text-sm text-muted-foreground">No editors available</p>
                                </div>
                            ) : (
                                editors.map(editor => {
                                    const status = editor.availabilityStatus || 'offline';
                                    const isOffline = status === 'offline';
                                    const completedCount = projects.filter(p => p.assignedEditorId === editor.uid && p.status === 'completed').length;
                                    const rating = editor.rating || 4.5;
                                    const skills = editor.skills || [];
                                    const hasPortfolio = editor.portfolio && editor.portfolio.length > 0;

                                    return (
                                        <div 
                                            key={editor.uid} 
                                            className={cn(
                                                "p-4 bg-card border border-border rounded-xl transition-all",
                                                isOffline ? "opacity-60" : "hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5"
                                            )}
                                        >
                                            {/* Editor Header */}
                                            <div className="flex items-start justify-between mb-3">
                                                <div className="flex items-center gap-3">
                                                    <div className="relative">
                                                        <Avatar className="h-12 w-12 ring-2 ring-border">
                                                            <AvatarImage src={editor.photoURL || undefined} />
                                                            <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/10 text-primary text-base font-bold">
                                                                {editor.displayName?.[0]}
                                                            </AvatarFallback>
                                                        </Avatar>
                                                        <div className={cn(
                                                            "absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-card",
                                                            status === 'online' ? "bg-emerald-500" : 
                                                            status === 'sleep' ? "bg-amber-500" : "bg-red-500"
                                                        )} />
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-bold text-foreground">{editor.displayName}</p>
                                                        <div className="flex items-center gap-2 mt-0.5">
                                                            <span className={cn(
                                                                "text-[10px] font-bold uppercase tracking-wide",
                                                                status === 'online' ? "text-emerald-500" : 
                                                                status === 'sleep' ? "text-amber-500" : "text-muted-foreground"
                                                            )}>
                                                                {status}
                                                            </span>
                                                            <span className="text-muted-foreground/30">•</span>
                                                            <span className="flex items-center gap-1 text-[10px] text-amber-500">
                                                                <Star className="w-3 h-3 fill-amber-500" />
                                                                {rating}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <div className="text-right">
                                                        <p className="text-lg font-bold text-foreground">{completedCount}</p>
                                                        <p className="text-[9px] text-muted-foreground uppercase tracking-wide">completed</p>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Skills Preview */}
                                            {skills.length > 0 && (
                                                <div className="flex flex-wrap gap-1.5 mb-3">
                                                    {skills.slice(0, 4).map((skill: string, idx: number) => (
                                                        <span 
                                                            key={idx} 
                                                            className="px-2 py-0.5 bg-muted/80 border border-border rounded-md text-[10px] font-medium text-muted-foreground"
                                                        >
                                                            {skill}
                                                        </span>
                                                    ))}
                                                    {skills.length > 4 && (
                                                        <span className="px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                                            +{skills.length - 4} more
                                                        </span>
                                                    )}
                                                </div>
                                            )}

                                            {/* Actions Row */}
                                            <div className="flex items-center gap-2 pt-3 border-t border-border">
                                                <button 
                                                    onClick={() => { setSelectedEditorDetail(editor); setIsEditorModalOpen(true); }}
                                                    className="flex-1 h-9 flex items-center justify-center gap-2 bg-muted/50 hover:bg-muted border border-border rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground transition-all"
                                                >
                                                    <Eye className="w-3.5 h-3.5" />
                                                    View Profile
                                                </button>
                                                {hasPortfolio && (
                                                    <button 
                                                        onClick={() => { setSelectedEditorDetail(editor); setIsEditorModalOpen(true); }}
                                                        className="h-9 px-3 flex items-center justify-center gap-2 bg-primary/10 hover:bg-primary/20 border border-primary/20 rounded-lg text-xs font-medium text-primary transition-all"
                                                    >
                                                        <ExternalLink className="w-3.5 h-3.5" />
                                                        Portfolio
                                                    </button>
                                                )}
                                                <button 
                                                    disabled={isOffline}
                                                    onClick={() => handleAssignEditor(editor.uid)}
                                                    className={cn(
                                                        "h-9 px-5 flex items-center justify-center gap-2 rounded-lg text-xs font-bold transition-all",
                                                        isOffline 
                                                            ? "bg-muted text-muted-foreground cursor-not-allowed" 
                                                            : "bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20"
                                                    )}
                                                >
                                                    {isOffline ? 'Offline' : 'Assign'}
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>
            </Modal>

            {/* Editor Profile Modal */}
            <Modal isOpen={isEditorModalOpen} onClose={() => setIsEditorModalOpen(false)} title="Editor Profile" maxWidth="max-w-2xl">
                {selectedEditorDetail && (
                    <div className="mt-4 space-y-6">
                        {/* Profile Header Card */}
                        <div className="relative p-6 rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/20 overflow-hidden">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/2" />
                            <div className="relative flex items-center gap-5">
                                <div className="relative">
                                    <Avatar className="h-20 w-20 ring-4 ring-primary/20">
                                        <AvatarImage src={selectedEditorDetail.photoURL || undefined} />
                                        <AvatarFallback className="bg-gradient-to-br from-primary/30 to-primary/10 text-primary text-2xl font-black">
                                            {selectedEditorDetail.displayName?.[0]}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className={cn(
                                        "absolute -bottom-1 -right-1 h-5 w-5 rounded-full border-3 border-card flex items-center justify-center",
                                        selectedEditorDetail.availabilityStatus === 'online' ? "bg-emerald-500" : 
                                        selectedEditorDetail.availabilityStatus === 'sleep' ? "bg-amber-500" : "bg-red-500"
                                    )} />
                                </div>
                                <div className="flex-1">
                                    <h3 className="text-xl font-black text-foreground">{selectedEditorDetail.displayName}</h3>
                                    <p className="text-sm text-muted-foreground font-medium">Professional Video Editor</p>
                                    <div className="flex items-center gap-3 mt-2">
                                        <span className={cn(
                                            "px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide",
                                            selectedEditorDetail.availabilityStatus === 'online' 
                                                ? "bg-emerald-500/20 text-emerald-500" 
                                                : selectedEditorDetail.availabilityStatus === 'sleep'
                                                    ? "bg-amber-500/20 text-amber-500"
                                                    : "bg-red-500/20 text-red-500"
                                        )}>
                                            {selectedEditorDetail.availabilityStatus || 'offline'}
                                        </span>
                                        <span className="flex items-center gap-1 text-sm text-amber-500 font-bold">
                                            <Star className="w-4 h-4 fill-amber-500" />
                                            {selectedEditorDetail.rating || '4.5'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Stats Grid */}
                        <div className="grid grid-cols-4 gap-3">
                            <div className="bg-card border border-border rounded-xl p-4 text-center">
                                <p className="text-2xl font-black text-foreground">
                                    {projects.filter(p => p.assignedEditorId === selectedEditorDetail.uid && p.status === 'completed').length}
                                </p>
                                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-1">Completed</p>
                            </div>
                            <div className="bg-card border border-border rounded-xl p-4 text-center">
                                <p className="text-2xl font-black text-foreground">
                                    {projects.filter(p => p.assignedEditorId === selectedEditorDetail.uid && (p.status === 'active' || p.status === 'pending_assignment' || p.status === 'in_review')).length}
                                </p>
                                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-1">In Progress</p>
                            </div>
                            <div className="bg-card border border-border rounded-xl p-4 text-center">
                                <div className="flex items-center justify-center gap-1">
                                    <Star className="w-4 h-4 fill-amber-500 text-amber-500" />
                                    <p className="text-2xl font-black text-foreground">{selectedEditorDetail.rating || '4.5'}</p>
                                </div>
                                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-1">Rating</p>
                            </div>
                            <div className="bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 text-center">
                                <p className="text-2xl font-black text-emerald-500">₹{(selectedEditorDetail.income || 0).toLocaleString()}</p>
                                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-1">Earned</p>
                            </div>
                        </div>

                        {/* Skills Section */}
                        {selectedEditorDetail.skills && selectedEditorDetail.skills.length > 0 && (
                            <div className="p-4 bg-card border border-border rounded-xl">
                                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">Skills & Expertise</p>
                                <div className="flex flex-wrap gap-2">
                                    {selectedEditorDetail.skills.map((skill: string, idx: number) => (
                                        <span 
                                            key={idx} 
                                            className="bg-primary/10 text-primary border border-primary/20 px-3 py-1.5 rounded-lg text-xs font-bold"
                                        >
                                            {skill}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Portfolio Section */}
                        <div className="p-4 bg-card border border-border rounded-xl">
                            <div className="flex items-center justify-between mb-4">
                                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Portfolio Works</p>
                                {selectedEditorDetail.portfolio && selectedEditorDetail.portfolio.length > 0 && (
                                    <span className="text-[10px] text-muted-foreground">{selectedEditorDetail.portfolio.length} items</span>
                                )}
                            </div>
                            {selectedEditorDetail.portfolio && selectedEditorDetail.portfolio.length > 0 ? (
                                <div className="grid grid-cols-2 gap-3">
                                    {selectedEditorDetail.portfolio.map((item: {name?: string; url: string; thumbnail?: string}, i: number) => (
                                        <a 
                                            key={i} 
                                            href={item.url} 
                                            target="_blank" 
                                            rel="noopener noreferrer" 
                                            className="group relative flex items-center gap-3 p-3 bg-muted/50 border border-border rounded-xl hover:border-primary/40 hover:bg-muted transition-all"
                                        >
                                            <div className="h-12 w-12 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center shrink-0">
                                                <FileVideo className="w-5 h-5 text-primary" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-bold text-foreground truncate group-hover:text-primary transition-colors">
                                                    {item.name || `Work ${i + 1}`}
                                                </p>
                                                <p className="text-[10px] text-muted-foreground">Click to view</p>
                                            </div>
                                            <ExternalLink className="w-4 h-4 text-muted-foreground group-hover:text-primary shrink-0" />
                                        </a>
                                    ))}
                                </div>
                            ) : (
                                <div className="py-8 text-center border border-dashed border-border rounded-xl">
                                    <FileVideo className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
                                    <p className="text-sm text-muted-foreground">No portfolio items yet</p>
                                </div>
                            )}
                        </div>

                        {/* Action Bar */}
                        {selectedProject && (
                            <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
                                <button
                                    onClick={() => setIsEditorModalOpen(false)}
                                    className="h-10 px-5 bg-muted hover:bg-muted/80 border border-border rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground transition-all"
                                >
                                    Close
                                </button>
                                <button
                                    disabled={selectedEditorDetail.availabilityStatus === 'offline'}
                                    onClick={() => {
                                        handleAssignEditor(selectedEditorDetail.uid);
                                        setIsEditorModalOpen(false);
                                    }}
                                    className={cn(
                                        "h-10 px-6 rounded-xl text-sm font-bold transition-all",
                                        selectedEditorDetail.availabilityStatus === 'offline'
                                            ? "bg-muted text-muted-foreground cursor-not-allowed"
                                            : "bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20"
                                    )}
                                >
                                    Assign This Editor
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </Modal>

            {/* Manage Project Modal */}
            <Modal isOpen={isManageModalOpen} onClose={() => setIsManageModalOpen(false)} title="Manage Project">
                <div className="mt-4 space-y-6">
                    <div className="space-y-2">
                        <Label className="text-sm font-medium">Editor Payment (₹)</Label>
                        <div className="flex gap-3">
                            <input 
                                type="number"
                                placeholder="e.g. 500"
                                value={editorPriceInput}
                                onChange={(e) => setEditorPriceInput(e.target.value)}
                                className="flex-1 h-10 px-3 rounded-lg bg-background border border-border focus:border-primary/50 focus:outline-none text-sm"
                            />
                            <button 
                                onClick={async () => {
                                    if (!selectedProject || !user) return;
                                    if (Number(editorPriceInput) > (selectedProject.totalCost || 0)) {
                                        toast.error(`Editor payment cannot exceed project cost (₹${selectedProject.totalCost || 0}).`);
                                        return;
                                    }
                                    const res = await setEditorPrice(selectedProject.id, Number(editorPriceInput), { uid: user.uid, displayName: user.displayName || 'PM' });
                                    if (res.success) toast.success("Payment updated");
                                    else toast.error("Failed to update");
                                }}
                                className="px-4 h-10 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
                            >
                                Update
                            </button>
                        </div>
                    </div>

                    <div className="pt-4 border-t border-border">
                        <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30 border border-border">
                            <div>
                                <p className="text-sm font-medium text-foreground">Auto-Pay</p>
                                <p className="text-xs text-muted-foreground mt-0.5">Automatically pay editor after approval</p>
                            </div>
                            <button 
                                onClick={async () => {
                                    if (!selectedProject || !user) return;
                                    const res = await toggleProjectAutoPay(selectedProject.id, !selectedProject.autoPay, { uid: user.uid, displayName: user.displayName || 'PM' });
                                    if (res.success) {
                                        toast.success(`Auto-pay ${!selectedProject.autoPay ? 'enabled' : 'disabled'}`);
                                        setSelectedProject(prev => prev ? { ...prev, autoPay: !prev.autoPay } : null);
                                    } else toast.error("Failed to toggle");
                                }}
                                className={cn(
                                    "h-9 px-4 rounded-md text-sm font-medium transition-all",
                                    selectedProject?.autoPay 
                                        ? "bg-emerald-500 text-white" 
                                        : "bg-muted text-muted-foreground border border-border hover:text-foreground"
                                )}
                            >
                                {selectedProject?.autoPay ? "Enabled" : "Disabled"}
                            </button>
                        </div>
                    </div>
                </div>
            </Modal>

            {/* Project Details Modal */}
            <Modal 
                isOpen={isProjectDetailModalOpen} 
                onClose={() => setIsProjectDetailModalOpen(false)} 
                title="Project Details"
                maxWidth="max-w-4xl"
            >
                {inspectProject && (
                    <>
                    <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-6 max-h-[70vh] overflow-y-auto pr-2">
                        {/* Main Info */}
                        <div className="lg:col-span-2 space-y-5">
                            {/* Project Header */}
                            <div className="flex items-start gap-4 p-4 bg-muted/30 border border-border rounded-lg">
                                <div className="h-12 w-12 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                                    <FileVideo className="h-6 w-6 text-primary" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="text-lg font-semibold text-foreground truncate">{inspectProject.name}</h3>
                                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                                        <StatusBadge status={inspectProject.status} size="md" />
                                        <span className="text-xs text-muted-foreground">
                                            Created {new Date(inspectProject.createdAt).toLocaleDateString()}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Specs Grid */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                {[
                                    { label: 'Type', value: inspectProject.videoType || '—', icon: <Layers className="h-4 w-4" /> },
                                    { label: 'Format', value: inspectProject.videoFormat || '—', icon: <Monitor className="h-4 w-4" /> },
                                    { label: 'Ratio', value: inspectProject.aspectRatio || '—', icon: <FileVideo className="h-4 w-4" /> },
                                    { label: 'Duration', value: inspectProject.duration ? `${inspectProject.duration} min` : '—', icon: <Clock className="h-4 w-4" /> },
                                ].map((spec, i) => (
                                    <div key={i} className="bg-muted/30 border border-border rounded-lg p-3">
                                        <div className="flex items-center gap-2 text-muted-foreground mb-1">
                                            {spec.icon}
                                            <span className="text-xs">{spec.label}</span>
                                        </div>
                                        <p className="text-sm font-medium text-foreground">{spec.value}</p>
                                    </div>
                                ))}
                            </div>

                            {/* Assignments */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div className="bg-muted/30 border border-border rounded-lg p-4">
                                    <p className="text-xs text-muted-foreground mb-1">Project Manager</p>
                                    <p className="text-sm font-medium text-foreground">
                                        {users.find(u => u.uid === inspectProject.assignedPMId)?.displayName || 'Not assigned'}
                                    </p>
                                </div>
                                <div className="bg-muted/30 border border-border rounded-lg p-4">
                                    <p className="text-xs text-muted-foreground mb-1">Editor</p>
                                    <p className="text-sm font-medium text-foreground">
                                        {users.find(u => u.uid === inspectProject.assignedEditorId)?.displayName || 'Not assigned'}
                                    </p>
                                </div>
                            </div>

                            {/* Description */}
                            {inspectProject.description && (
                                <div className="bg-muted/30 border border-border rounded-lg p-4">
                                    <p className="text-xs text-muted-foreground mb-2">Description</p>
                                    <p className="text-sm text-foreground leading-relaxed">{inspectProject.description}</p>
                                </div>
                            )}

                            {/* Client Raw Files */}
                            <div className="bg-muted/30 border border-border rounded-lg p-4">
                                <p className="text-xs text-muted-foreground mb-4 font-semibold">Client Raw Files</p>
                                {inspectProject.rawFiles && inspectProject.rawFiles.length > 0 ? (
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                        {inspectProject.rawFiles.map((file: any, idx: number) => (
                                            <FilePreview
                                                key={`${file.url}-${idx}`}
                                                file={file}
                                                index={idx}
                                                onDownload={handleDirectDownload}
                                            />
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-xs text-muted-foreground">No raw files uploaded by client yet.</p>
                                )}
                            </div>

                            {/* PM Reference/Upload Files */}
                            <div className="bg-muted/30 border border-border rounded-lg p-4">
                                <div className="flex items-center justify-between mb-4">
                                    <p className="text-xs text-muted-foreground font-semibold">PM Reference Files</p>
                                </div>
                                
                                {/* File List */}
                                {inspectProject.referenceFiles && inspectProject.referenceFiles.length > 0 ? (
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                                        {inspectProject.referenceFiles.map((file: any, idx: number) => (
                                            <FilePreview
                                                key={`${file.url}-${idx}`}
                                                file={file}
                                                index={idx}
                                                onDownload={handleDirectDownload}
                                            />
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-xs text-muted-foreground mb-4">No reference files uploaded yet.</p>
                                )}

                                {/* Upload Button */}
                                <div className="flex gap-2">
                                    <input
                                        ref={el => setPmFileInput(el)}
                                        type="file"
                                        onChange={handleUploadPMFile}
                                        disabled={isUploadingPMFile}
                                        className="hidden"
                                        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.zip,.rar"
                                    />
                                    <button
                                        onClick={() => pmFileInput?.click()}
                                        disabled={isUploadingPMFile}
                                        className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-primary/10 text-primary hover:bg-primary/20 border border-primary/30 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {isUploadingPMFile ? (
                                            <>
                                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                Uploading...
                                            </>
                                        ) : (
                                            <>
                                                <Upload className="h-3.5 w-3.5" />
                                                Upload File
                                            </>
                                        )}
                                    </button>
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
                                    {inspectProject.footageLink ? (
                                        <a 
                                            href={inspectProject.footageLink.startsWith('http') ? inspectProject.footageLink : `https://${inspectProject.footageLink}`} 
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
                                    {inspectProject.rawFiles && inspectProject.rawFiles.length > 0 ? (
                                        <div className="grid gap-2">
                                            {inspectProject.rawFiles.slice(0, 3).map((file: any, idx: number) => (
                                                <div key={idx} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border/30 hover:bg-muted/30 transition-all group">
                                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                                        <FileVideo className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                                        <div className="min-w-0">
                                                            <p className="text-xs font-semibold text-foreground truncate">{file.name}</p>
                                                            {file.size && <p className="text-[9px] text-muted-foreground">{(file.size / (1024*1024)).toFixed(1)} MB</p>}
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => handleDirectDownload(file.url, file.name)}
                                                        className="h-8 w-8 rounded-lg bg-muted/50 group-hover:bg-primary/20 group-hover:text-primary text-muted-foreground flex items-center justify-center transition-all flex-shrink-0"
                                                    >
                                                        <Download className="h-3.5 w-3.5" />
                                                    </button>
                                                </div>
                                            ))}
                                            {(inspectProject.rawFiles?.length || 0) > 3 && (
                                                <p className="text-xs text-muted-foreground text-center py-1">+{(inspectProject.rawFiles?.length || 0) - 3} more files</p>
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
                                    {inspectProject.scripts && inspectProject.scripts.length > 0 && (
                                        <div className="grid gap-2">
                                            {inspectProject.scripts.slice(0, 2).map((file: any, idx: number) => (
                                                <div key={idx} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border/30 hover:bg-muted/30 transition-all group">
                                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                                        <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                                        <p className="text-xs font-semibold text-foreground truncate">{file.name}</p>
                                                    </div>
                                                    <button
                                                        onClick={() => handleDirectDownload(file.url, file.name)}
                                                        className="h-8 w-8 rounded-lg bg-muted/50 group-hover:bg-primary/20 group-hover:text-primary text-muted-foreground flex items-center justify-center transition-all flex-shrink-0"
                                                    >
                                                        <Download className="h-3.5 w-3.5" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Pasted Script Text */}
                                    {(inspectProject as any).scriptText && (
                                        <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                                            <div className="flex items-center justify-between gap-2 mb-3">
                                                <p className="text-[10px] font-bold uppercase tracking-widest text-primary">✍️ Pasted Script</p>
                                                <button 
                                                    onClick={() => {
                                                        navigator.clipboard.writeText((inspectProject as any).scriptText);
                                                        toast.success("Script copied to clipboard");
                                                    }}
                                                    className="h-7 px-2.5 rounded text-[9px] font-bold uppercase tracking-widest bg-primary/10 hover:bg-primary/20 text-primary transition-all flex items-center gap-1.5"
                                                >
                                                    <Copy className="h-3 w-3" /> Copy
                                                </button>
                                            </div>
                                            <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap font-medium max-h-[120px] overflow-y-auto">
                                                {(inspectProject as any).scriptText}
                                            </p>
                                        </div>
                                    )}

                                    {/* Empty State */}
                                    {!((inspectProject as any).scriptText) && (!inspectProject.scripts || inspectProject.scripts.length === 0) && (
                                        <div className="p-3 rounded-lg border border-border/30 bg-muted/20">
                                            <p className="text-xs text-muted-foreground">Not uploaded yet</p>
                                        </div>
                                    )}
                                </div>

                                {/* 4. B-Roll Assets */}
                                <div className="space-y-3 pt-3 border-t border-border/30">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">🎞️ B-Roll Assets</span>
                                    </div>
                                    {(inspectProject as any).bRoleFiles && (inspectProject as any).bRoleFiles.length > 0 ? (
                                        <div className="grid gap-2">
                                            {(inspectProject as any).bRoleFiles.slice(0, 2).map((file: any, idx: number) => (
                                                <div key={idx} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border/30 hover:bg-muted/30 transition-all group">
                                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                                        {file.type?.includes('image') ? (
                                                            <ImageIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                                        ) : (
                                                            <FileVideo className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                                        )}
                                                        <p className="text-xs font-semibold text-foreground truncate">{file.name}</p>
                                                    </div>
                                                    <button
                                                        onClick={() => handleDirectDownload(file.url, file.name)}
                                                        className="h-8 w-8 rounded-lg bg-muted/50 group-hover:bg-primary/20 group-hover:text-primary text-muted-foreground flex items-center justify-center transition-all flex-shrink-0"
                                                    >
                                                        <Download className="h-3.5 w-3.5" />
                                                    </button>
                                                </div>
                                            ))}
                                            {((inspectProject as any).bRoleFiles?.length || 0) > 2 && (
                                                <p className="text-xs text-muted-foreground text-center py-1">+{((inspectProject as any).bRoleFiles?.length || 0) - 2} more files</p>
                                            )}
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
                                    {(inspectProject as any).referenceLink && (
                                        <a 
                                            href={(inspectProject as any).referenceLink.startsWith('http') ? (inspectProject as any).referenceLink : `https://${(inspectProject as any).referenceLink}`}
                                            target="_blank"
                                            className="flex items-center gap-3 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20 hover:border-emerald-500/40 hover:bg-emerald-500/10 transition-all group"
                                        >
                                            <LinkIcon className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                                            <span className="text-sm font-semibold text-foreground group-hover:text-emerald-600 transition-colors">Open Style Reference</span>
                                        </a>
                                    )}

                                    {/* Reference Files */}
                                    {(inspectProject as any).referenceFiles && (inspectProject as any).referenceFiles.length > 0 && (
                                        <div className="grid gap-2">
                                            {(inspectProject as any).referenceFiles.slice(0, 2).map((file: any, idx: number) => (
                                                <div key={idx} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border/30 hover:bg-muted/30 transition-all group">
                                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                                        {file.type?.includes('image') ? (
                                                            <ImageIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                                        ) : (
                                                            <FileVideo className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                                        )}
                                                        <p className="text-xs font-semibold text-foreground truncate">{file.name}</p>
                                                    </div>
                                                    <button
                                                        onClick={() => handleDirectDownload(file.url, file.name)}
                                                        className="h-8 w-8 rounded-lg bg-muted/50 group-hover:bg-primary/20 group-hover:text-primary text-muted-foreground flex items-center justify-center transition-all flex-shrink-0"
                                                    >
                                                        <Download className="h-3.5 w-3.5" />
                                                    </button>
                                                </div>
                                            ))}
                                            {((inspectProject as any).referenceFiles?.length || 0) > 2 && (
                                                <p className="text-xs text-muted-foreground text-center py-1">+{((inspectProject as any).referenceFiles?.length || 0) - 2} more files</p>
                                            )}
                                        </div>
                                    )}

                                    {/* Empty State */}
                                    {!(inspectProject as any).referenceLink && (!((inspectProject as any).referenceFiles) || (inspectProject as any).referenceFiles.length === 0) && (
                                        <div className="p-3 rounded-lg border border-border/30 bg-muted/20">
                                            <p className="text-xs text-muted-foreground">Not uploaded yet</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Review Button */}
                            <button
                                onClick={() => handleOpenReview(inspectProject.id)}
                                disabled={reviewLoading || inspectProject.status === 'completed'}
                                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer active:scale-95"
                            >
                                {reviewLoading ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <MessageSquare className="h-4 w-4" />
                                )}
                                Open Review & Comments
                            </button>

                            {/* Decline Reason */}
                            {inspectProject.assignmentStatus === 'rejected' && inspectProject.editorDeclineReason && (
                                <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20">
                                    <div className="flex items-center gap-2 text-red-500 mb-2">
                                        <AlertCircle className="h-4 w-4" />
                                        <p className="text-sm font-medium">
                                            {users.find(u => u.uid === inspectProject.assignedEditorId)?.displayName || 'Editor'} Declined
                                        </p>
                                    </div>
                                    <p className="text-sm text-red-500/80">{inspectProject.editorDeclineReason}</p>
                                </div>
                            )}
                        </div>

                        {/* Sidebar - Financials & History */}
                        <div className="space-y-5">
                            {/* Financials */}
                            <div className="bg-muted/30 border border-border rounded-lg p-4 space-y-4">
                                <h4 className="text-sm font-semibold text-foreground">Payment Details</h4>
                                
                                <div className="p-3 bg-card rounded-lg border border-border">
                                    <p className="text-xs text-muted-foreground">Project Value</p>
                                    <p className="text-2xl font-bold text-foreground tabular-nums mt-1">
                                        ₹{inspectProject.totalCost?.toLocaleString() || '0'}
                                    </p>
                                </div>
                                
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                                        <p className="text-xs text-emerald-600">Editor Pay</p>
                                        <p className="text-lg font-bold text-emerald-600 tabular-nums">
                                            ₹{inspectProject.editorPrice?.toLocaleString() || '0'}
                                        </p>
                                    </div>
                                    <div className="p-3 bg-primary/10 border border-primary/20 rounded-lg">
                                        <p className="text-xs text-primary">Platform Fee</p>
                                        <p className="text-lg font-bold text-primary tabular-nums">
                                            ₹{((inspectProject.totalCost || 0) - (inspectProject.editorPrice || 0)).toLocaleString()}
                                        </p>
                                    </div>
                                </div>
                                
                                <div className="flex items-center justify-between pt-3 border-t border-border">
                                    <span className="text-xs text-muted-foreground">Auto-Pay</span>
                                    <span className={cn(
                                        "text-xs font-medium",
                                        inspectProject.autoPay ? "text-emerald-600" : "text-muted-foreground"
                                    )}>
                                        {inspectProject.autoPay ? 'Enabled' : 'Disabled'}
                                    </span>
                                </div>
                            </div>

                            {/* Activity Log */}
                            <div className="bg-muted/30 border border-border rounded-lg p-4">
                                <h4 className="text-sm font-semibold text-foreground mb-4">Activity Log</h4>
                                <div className="space-y-3 max-h-[250px] overflow-y-auto">
                                    {inspectProject.logs && inspectProject.logs.length > 0 ? (
                                        [...inspectProject.logs].reverse().slice(0, 10).map((log: any, i) => (
                                            <div key={i} className="flex items-start gap-3 pb-3 border-b border-border last:border-0 last:pb-0">
                                                <div className="h-2 w-2 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-xs font-medium text-foreground">
                                                        {log.event.replace(/_/g, ' ')}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground truncate">{log.details}</p>
                                                    <p className="text-[10px] text-muted-foreground mt-1">
                                                        {log.userName} • {new Date(log.timestamp).toLocaleString()}
                                                    </p>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <p className="text-xs text-muted-foreground text-center py-4">No activity yet</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                    {/* Preview Modal */}
                    {previewFile && (
                        <div className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-xl flex items-center justify-center p-4" onClick={() => setPreviewFile(null)}>
                            <div className="relative max-w-3xl w-full max-h-[80vh] bg-black rounded-xl overflow-hidden shadow-2xl flex items-center justify-center" onClick={e => e.stopPropagation()}>
                                <button onClick={() => setPreviewFile(null)} className="absolute top-4 right-4 h-10 w-10 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center backdrop-blur-md z-10 transition-all">
                                    <X className="h-5 w-5" />
                                </button>
                                {previewFile.type.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(previewFile.name) ? (
                                    <img src={previewFile.url} alt={previewFile.name} className="max-w-full max-h-full object-contain" />
                                ) : previewFile.type.startsWith('video/') || /\.(mp4|webm|mov)$/i.test(previewFile.name) ? (
                                    <video src={previewFile.url} controls className="w-full h-full" autoPlay />
                                ) : (
                                    <div className="text-center text-white">
                                        <FileVideo className="h-12 w-12 mx-auto mb-4 opacity-50" />
                                        <p className="text-sm">{previewFile.name}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                    </>
                )}
            </Modal>

            <ReviewSystemModal
                isOpen={isReviewSystemOpen}
                onClose={() => setIsReviewSystemOpen(false)}
                project={reviewProject ? { 
                    id: reviewProject.id, 
                    name: reviewProject.name,
                    paymentStatus: reviewProject.paymentStatus,
                    editorRating: reviewProject.editorRating
                } : null}
            />

        </div>
    );
}
