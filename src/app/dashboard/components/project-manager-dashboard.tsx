"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/context/auth-context";
import { 
    Loader2, 
    LayoutDashboard, 
    Users, 
    FolderOpen, 
    LogOut,
    Search,
    Filter,
    MoreHorizontal,
    Trash2,
    ArrowUpRight,
    ArrowDownLeft,
    AlertCircle,
    UserPlus,
    CheckCircle2,
    Calendar,
    Briefcase,
    RefreshCw,
    Plus,
    ChevronDown,
    Shield,
    HardDrive,
    Activity,
    Layers,
    Cpu,
    Terminal,
    User as UserIcon,
    Zap,
    Globe,
    Monitor,
    Database,
    Star,
    ExternalLink,
    MonitorPlay,
    IndianRupee,
    FileText
} from "lucide-react";
import { db } from "@/lib/firebase/config";
import { collection, query, orderBy, onSnapshot, updateDoc, doc, arrayUnion, where } from "firebase/firestore";
import { Project, User } from "@/types/schema";
import { 
    assignEditor,
    togglePayLater, 
    setEditorPrice, 
    toggleProjectAutoPay,
    settleProjectPayment,
    deleteProject,
    updateClientCreditLimit
} from "@/app/actions/admin-actions";
import { unlockProjectDownloads } from "@/app/actions/project-actions";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
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


function IndicatorCard({ label, value, subtext, trend, trendUp, alert, icon }: any) {
    return (
        <motion.div 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ y: -4, transition: { duration: 0.2 } }}
            className={cn(
                "group relative enterprise-card p-6 md:p-8 transition-all duration-300",
                alert && "after:absolute after:inset-0 after:rounded-xl after:ring-1 after:ring-primary/40 after:animate-pulse"
            )}
        >
            <div className="flex justify-between items-start mb-6">
                <div className="h-10 w-10 bg-muted border border-border rounded-lg flex items-center justify-center text-muted-foreground group-hover:text-primary group-hover:border-primary/30 transition-all duration-300">
                    {icon}
                </div>
                {alert && <div className="h-2 w-2 rounded-full bg-primary animate-pulse shadow-[0_0_10px_rgba(var(--primary),0.8)]" />}
            </div>
            
            <div className="space-y-1.5">
                <span className="text-[11px] uppercase font-bold tracking-widest text-muted-foreground group-hover:text-foreground transition-colors">{label}</span>
                <div className="flex items-end gap-3">
                    <span className="text-3xl font-black tracking-tight text-foreground font-heading tabular-nums">{value}</span>
                </div>
                
                <div className="flex items-center gap-3 pt-4 border-t border-border mt-4">
                    {trend && (
                        <span className={cn(
                            "flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest", 
                            trendUp ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20" : "bg-muted text-muted-foreground border border-border"
                        )}>
                            {trend}
                        </span>
                    )}
                    <span className="text-muted-foreground/60 text-[10px] font-bold uppercase tracking-wider">{subtext}</span>
                </div>
            </div>
        </motion.div>
    );
}

function StatusIndicator({ status }: { status: string }) {
    const config: any = {
        active: { label: "IN PRODUCTION", color: "text-blue-400", bg: "bg-blue-400/5", border: "border-blue-400/20" },
        in_review: { label: "QA REVIEW", color: "text-purple-400", bg: "bg-purple-400/5", border: "border-purple-400/20" },
        pending_assignment: { label: "IDLE QUEUE", color: "text-amber-400", bg: "bg-amber-400/5", border: "border-amber-400/20" },
        approved: { label: "AUTHORIZED", color: "text-emerald-400", bg: "bg-emerald-400/5", border: "border-emerald-400/20" },
        completed: { label: "COMPLETED", color: "text-muted-foreground", bg: "bg-zinc-500/5", border: "border-zinc-500/20" },
    };
    const s = config[status] || config.completed;
    return (
        <span className={cn(
            "inline-flex items-center gap-2 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest border transition-all", 
            s.bg, s.color, s.border
        )}>
            <div className={cn("w-1 h-1 rounded-full bg-current shadow-[0_0_5px_currentColor]", status === 'active' && "animate-pulse")} />
            {s.label}
        </span>
    );
}

function ProjectStatusBadges({ project }: { project: any }) {
    const badges = [];

    // Overall Status
    if (project.status === 'completed' || project.status === 'archived') {
        badges.push({ label: "Completed", color: "text-muted-foreground", bg: "bg-zinc-500/10", border: "border-zinc-500/20" });
    } else if (project.status === 'in_review') {
        badges.push({ label: "In Review", color: "text-purple-400", bg: "bg-purple-400/10", border: "border-purple-400/20" });
    } else if (project.status === 'active') {
        badges.push({ label: "Editing", color: "text-blue-400", bg: "bg-blue-400/10", border: "border-blue-400/20", pulse: true });
    } else if (project.status === 'approved') {
        badges.push({ label: "Approved", color: "text-emerald-400", bg: "bg-emerald-400/10", border: "border-emerald-400/20" });
    } else if (project.status === 'pending_assignment') {
        badges.push({ label: "Awaiting Editor", color: "text-amber-400", bg: "bg-amber-400/10", border: "border-amber-400/20" });
    }

    // Payment Status
    if (project.paymentStatus === 'paid') {
        badges.push({ label: "Paid", color: "text-emerald-500", bg: "bg-emerald-500/10", border: "border-emerald-500/20" });
    } else if (project.paymentStatus === 'overdue') {
        badges.push({ label: "Overdue", color: "text-red-500", bg: "bg-red-500/10", border: "border-red-500/20" });
    }

    return (
        <div className="flex flex-wrap gap-2">
            {badges.map((badge, i) => (
                <span key={i} className={cn(
                    "px-2.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest border transition-all flex items-center gap-1.5",
                    badge.bg, badge.color, badge.border
                )}>
                    {badge.pulse && <div className="h-1 w-1 rounded-full bg-current animate-pulse ring-2 ring-current/20" />}
                    {badge.label}
                </span>
            ))}
        </div>
    );
}

export function ProjectManagerDashboard() {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState<'projects' | 'clients' | 'finance'>('projects');
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
    
    // History Modal
    const [inspectProject, setInspectProject] = useState<Project | null>(null);
    const [isProjectDetailModalOpen, setIsProjectDetailModalOpen] = useState(false);

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
            toast.error("Please enter a valid editor revenue amount first.");
            return;
        }

        // Prevent negative revenue margins
        if (Number(editorPriceInput) > (selectedProject.totalCost || 0)) {
            toast.error(`Editor revenue cannot exceed project cost (₹${selectedProject.totalCost || 0}). Negative platform margin is not allowed.`);
            return;
        }

        try {
            const res = await assignEditor(selectedProject.id, editorId, Number(editorPriceInput), assignDeadline);
            if (res.success) {
                toast.success(`Editor assigned. Awaiting their acceptance.`);
                setIsAssignModalOpen(false);
                setSelectedProject(null);
                setEditorPriceInput("");
                setAssignDeadline("");
            } else {
                toast.error(res.error || "Failed to assign.");
            }
        } catch (err) { 
            toast.error("Failed to assign. Please try again."); 
        }
    };

    const handleSettlePayment = async (projectId: string) => {
        try {
            const result = await settleProjectPayment(projectId, user!.uid, user!.displayName || "Unknown PM", "project_manager");
            if (result.success) {
                toast.success("Payment marked as settled");
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
            await addProjectLog(projectId, 'PAYMENT_MARKED', { uid: user?.uid || 'system', displayName: user?.displayName || 'PM' }, 'Editor payment marked as cleared.');
            toast.success("Editor payout marked as settled.");
        } catch (error) {
            toast.error("Failed to settle payout.");
        }
    };

    const handleDeleteProject = async (projectId: string) => {
        if(!confirm("Proceed with permanent deletion of this project?")) return;
        const result = await deleteProject(projectId);
        if (result.success) toast.success("Project purged.");
        else toast.error("Purge failed.");
    };

    const unassignedCount = projects.filter(p => !p.assignedEditorId).length;
    const activeCount = projects.filter(p => p.status === 'active').length;
    const pendingUnlockCount = projects.filter(p => p.downloadUnlockRequested && p.paymentStatus !== 'full_paid').length;

    const currentUserData = users.find(u => u.uid === user?.uid);
    const pmStatus = currentUserData?.availabilityStatus || 'offline';

    const handleStatusUpdate = async (newStatus: 'online' | 'offline' | 'sleep') => {
        if (!user?.uid) return;
        try {
            await updateDoc(doc(db, "users", user.uid), {
                availabilityStatus: newStatus,
                updatedAt: Date.now()
            });
            toast.success(`Availability changed to ${newStatus}`);
        } catch(err) {
            toast.error("Failed to update status");
        }
    };

    const clientsOverLimit = users.filter(u => u.role === 'client' && u.payLater).filter(u => {
        const uProjects = projects.filter(p => p.clientId === u.uid);
        const uPending = uProjects.reduce((acc, p) => acc + ((p.totalCost || 0) - (p.amountPaid || 0)), 0);
        return uPending >= (u.creditLimit || 5000);
    });

    return (
        <div className="space-y-10 max-w-[1600px] mx-auto pb-20 pt-4">
            {clientsOverLimit.length > 0 && (
                <motion.div 
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 mb-6 flex items-center justify-between gap-4"
                >
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-red-500/20 flex items-center justify-center">
                            <AlertCircle className="h-6 w-6 text-red-500" />
                        </div>
                        <div>
                            <h4 className="text-sm font-bold uppercase tracking-tight">Financial Risk Alert: {clientsOverLimit.length} Clients Over Credit Limit</h4>
                            <p className="text-[11px] font-medium opacity-80 uppercase tracking-widest mt-0.5">The following clients have exceeded their assigned credit limits: {clientsOverLimit.map(c => c.displayName).join(', ')}. Please review and collect pending dues.</p>
                        </div>
                    </div>
                    <button onClick={() => { setActiveTab('clients'); setSearchQuery(''); }} className="px-4 py-2 bg-red-500 text-white rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-red-600 transition-all active:scale-95">Review Clients</button>
                </motion.div>
            )}
            {/* Header Layer */}
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8 pb-8 border-b border-border">
                <motion.div 
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="space-y-2"
                >
                    <div className="flex items-center gap-2 mb-2">
                        <div className="px-2 py-0.5 rounded bg-primary/10 border border-primary/20">
                            <span className="text-[10px] font-bold text-primary uppercase tracking-widest">Agency Hub</span>
                        </div>
                    </div>
                    <h1 className="text-4xl md:text-5xl font-heading font-bold tracking-tight text-foreground leading-tight">Active <span className="text-muted-foreground">Projects</span></h1>
                    <div className="flex items-center gap-6 pt-2">
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <UserIcon className="h-3.5 w-3.5" />
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Manager: {user?.displayName?.split(' ')[0]}</span>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground mr-4">
                            <Activity className="h-3.5 w-3.5" />
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Network: Connected</span>
                        </div>
                        <div className="relative border-l border-border pl-6 flex items-center">
                            <div className={cn(
                                "h-2 w-2 rounded-full mr-2",
                                pmStatus === 'online' ? "bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]" :
                                pmStatus === 'sleep' ? "bg-yellow-500" : "bg-red-500"
                            )} />
                            <select 
                                value={pmStatus}
                                onChange={(e) => handleStatusUpdate(e.target.value as any)}
                                className="bg-transparent border-none text-[11px] font-bold uppercase tracking-widest text-primary hover:text-foreground transition-colors focus:ring-0 cursor-pointer appearance-none pr-6"
                            >
                                <option value="online" className="bg-card">Online</option>
                                <option value="sleep" className="bg-card">Sleep</option>
                                <option value="offline" className="bg-card">Offline</option>
                            </select>
                            <ChevronDown className="absolute right-0 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-primary pointer-events-none" />
                        </div>
                    </div>
                </motion.div>
                
                <motion.div 
                   initial={{ opacity: 0, x: 20 }}
                   animate={{ opacity: 1, x: 0 }}
                   className="flex items-center gap-3"
                >
                    <div className="flex bg-muted border border-border rounded-lg p-1">
                        {['projects', 'clients', 'finance'].map(tab => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab as any)}
                                className={cn(
                                    "px-5 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-md transition-all",
                                    activeTab === tab 
                                        ? "bg-primary text-primary-foreground shadow-lg" 
                                        : "text-muted-foreground hover:text-foreground"
                                )}
                            >
                                {tab}
                            </button>
                        ))}
                    </div>
                </motion.div>
            </div>

            {/* Statistics Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                 <IndicatorCard 
                    label="New Requests" 
                    value={unassignedCount} 
                    icon={<Plus className="h-4 w-4" />}
                    subtext="Needs an editor"
                    alert={unassignedCount > 0}
                />
                 <IndicatorCard 
                    label="Active Projects" 
                    value={activeCount} 
                    icon={<MonitorPlay className="h-4 w-4" />}
                    subtext="Being edited now"
                    trendUp={true}
                    trend="Stable"
                />
                 <IndicatorCard 
                    label="Our Editors" 
                    value={editors.length} 
                    icon={<Users className="h-4 w-4" />}
                    subtext="Total team"
                />
                 <IndicatorCard 
                    label="Download Requests" 
                    value={pendingUnlockCount} 
                    icon={<IndianRupee className="h-4 w-4" />}
                    subtext="Approval needed"
                    alert={pendingUnlockCount > 0}
                />
            </div>

            {/* Main Data Layer */}
            <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="enterprise-card bg-card/40 backdrop-blur-sm overflow-hidden"
            >
                <div className="p-6 border-b border-border flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6 w-full lg:w-auto">
                        <div className="relative w-full sm:w-80">
                             <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground transition-colors" />
                             <input 
                                type="text" 
                                placeholder={`Locate ${activeTab} in system...`} 
                                className="h-10 w-full rounded-lg border border-border bg-muted/50 pl-11 pr-4 text-xs font-medium text-foreground focus:bg-muted/50 focus:border-primary/50 focus:outline-none transition-all placeholder:text-muted-foreground"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                             />
                        </div>
                        
                        <div className="hidden lg:flex items-center gap-2">
                             <Monitor className="h-3.5 w-3.5 text-muted-foreground" />
                             <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Search & Filter</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <button className="h-10 px-4 rounded-lg border border-border bg-muted/50 text-[11px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-all flex items-center gap-2">
                            <Filter className="h-3.5 w-3.5" /> Filter
                        </button>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <AnimatePresence mode="wait">
                    {activeTab === 'projects' && (
                     <motion.table 
                        key="projects"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="w-full text-left"
                     >
                        <thead>
                            <tr className="bg-muted/50">
                                <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-widest border-b border-border">Project Identifier</th>
                                <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-widest border-b border-border">Status</th>
                                <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-widest border-b border-border">Assigned Editor</th>
                                <th className="px-6 py-4 border-b border-border w-[80px]"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {loading ? (
                                <tr><td colSpan={4} className="px-6 py-24 text-center"><RefreshCw className="animate-spin h-5 w-5 mx-auto text-primary" /></td></tr>
                            ) : projects.length === 0 ? (
                                <tr><td colSpan={4} className="px-6 py-24 text-center text-muted-foreground text-[10px] font-bold uppercase tracking-widest">No Projects Found</td></tr>
                            ) : (
                                projects.filter(p => !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.clientName?.toLowerCase().includes(searchQuery.toLowerCase())).map((project, idx) => {
                                    const assignedEditor = editors.find(e => e.uid === project.assignedEditorId);
                                    
                                    return (
                                    <motion.tr 
                                        key={project.id}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: idx * 0.05 }}
                                        className="group hover:bg-muted/50 transition-colors"
                                    >
                                        <td className="px-6 py-6 transition-all duration-300 group-hover:pl-8">
                                            <div className="flex flex-col gap-1">
                                                <div className="text-base font-bold text-foreground tracking-tight leading-tight group-hover:text-primary transition-colors">{project.name}</div>
                                                <div className="flex items-center gap-3">
                                                    <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">{project.clientName || 'ENTITY_NULL'}</span>
                                                    <span className="text-[9px] text-muted-foreground font-bold tracking-widest uppercase">HEX: {project.id.slice(0,12)}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-6 border-b border-border group-hover:border-border">
                                            <StatusIndicator status={project.status} />
                                        </td>
                                        <td className="px-6 py-6">
                                            {assignedEditor ? (
                                                <div className="flex items-center gap-3 bg-muted/50 border border-border p-2 rounded-lg w-fit group-hover:border-primary/30 transition-all">
                                                    <Avatar className="h-7 w-7 border border-border rounded-md">
                                                        <AvatarImage src={assignedEditor.photoURL || undefined} className="object-cover" />
                                                        <AvatarFallback className="text-[9px] bg-primary/20 text-primary font-bold">{assignedEditor.displayName?.[0]}</AvatarFallback>
                                                    </Avatar>
                                                    <div className="flex flex-col">
                                                         <span className="text-[11px] font-bold text-foreground leading-none uppercase tracking-tight">{assignedEditor.displayName}</span>
                                                         <span className="text-[9px] text-muted-foreground leading-none mt-1 uppercase font-bold tracking-widest">Authorized</span>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-2 text-amber-500 bg-amber-500/5 px-3 py-1.5 rounded-lg border border-amber-500/20 w-fit">
                                                    <div className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                                                    <span className="text-[9px] font-bold uppercase tracking-widest">Needs Editor</span>
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-6 text-right">
                                            <div className="flex items-center justify-end gap-3">
                                                {project.downloadUnlockRequested && project.paymentStatus !== 'full_paid' && (
                                                        <button
                                                        className="h-8 px-4 text-[9px] font-bold uppercase tracking-widest bg-emerald-500 text-foreground rounded-lg shadow-lg hover:opacity-90 transition-all active:scale-[0.98]"
                                                        onClick={async () => {
                                                            if (!user) return;
                                                            const res = await unlockProjectDownloads(project.id, user.uid);
                                                            if (res.success) toast.success(`Payment Confirmed: Content unlocked.`);
                                                            else toast.error("Authorization failed");
                                                        }}
                                                    >
                                                        Confirm Payment
                                                    </button>
                                                )}
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <button className="h-9 w-9 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-all active:scale-[0.98]"><MoreHorizontal className="h-3.5 w-3.5" /></button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" className="w-56 bg-popover border-border p-1.5 rounded-xl shadow-2xl">
                                                         <DropdownMenuLabel className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest px-3 py-2">Project Options</DropdownMenuLabel>
                                                         <DropdownMenuSeparator className="my-1 bg-border" />
                                                         
                                                         {!(project.status === 'completed' || project.status === 'archived') && (
                                                             <>
                                                        {!project.assignedEditorId && (
                                                            <DropdownMenuItem className="p-2.5 text-xs text-popover-foreground hover:bg-muted transition-colors cursor-pointer rounded-lg px-3" onClick={() => { setSelectedProject(project); setEditorPriceInput(project.editorPrice?.toString() || ""); setIsAssignModalOpen(true); }}>
                                                                <UserPlus className="mr-2.5 h-3.5 w-3.5 text-muted-foreground" /> Assign Editor
                                                            </DropdownMenuItem>
                                                        )}
                                                        {project.assignedEditorId && (
                                                            <DropdownMenuItem className="p-2.5 text-xs text-popover-foreground hover:bg-muted transition-colors cursor-pointer rounded-lg px-3" onClick={() => { setSelectedProject(project); setEditorPriceInput(project.editorPrice?.toString() || ""); setIsManageModalOpen(true); }}>
                                                                <Briefcase className="mr-2.5 h-3.5 w-3.5 text-muted-foreground" /> Manage Project
                                                            </DropdownMenuItem>
                                                        )}
                                                        {(project as any).paymentOption === 'pay_later' && project.paymentStatus !== 'full_paid' && (
                                                            <DropdownMenuItem className="p-2.5 text-xs text-emerald-500 hover:bg-emerald-500/10 transition-colors cursor-pointer rounded-lg px-3 font-bold" onClick={() => handleSettlePayment(project.id)}>
                                                                <IndianRupee className="mr-2.5 h-3.5 w-3.5" /> Settle Payment
                                                            </DropdownMenuItem>
                                                        )}
                                                             </>
                                                         )}

                                                         <DropdownMenuItem className="p-2.5 text-xs text-popover-foreground hover:bg-muted transition-colors cursor-pointer rounded-lg px-3" onClick={() => { setInspectProject(project); setIsProjectDetailModalOpen(true); }}>
                                                            <Search className="mr-2.5 h-3.5 w-3.5 text-muted-foreground" /> Project Status
                                                         </DropdownMenuItem>
                                                         <DropdownMenuSeparator className="my-1 bg-border" />
                                                         <DropdownMenuItem onClick={() => handleDeleteProject(project.id)} className="p-2.5 text-xs text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer rounded-lg px-3">
                                                             <Trash2 className="mr-2.5 h-3.5 w-3.5" /> Delete Project
                                                         </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </div>
                                        </td>
                                    </motion.tr>
                                )})
                            )}
                        </tbody>
                     </motion.table>
                    )}

                    {activeTab === 'clients' && (
                        <motion.div 
                            key="clients"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="flex flex-col"
                        >
                             <div className="bg-muted/50 px-6 py-4 border-b border-border flex items-center justify-between text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                                 <span>Entity Identity</span>
                                 <span>Operational Permissions</span>
                             </div>
                             <div className="divide-y divide-border">
                                {users.filter(u => u.role === 'client' && (!searchQuery || u.displayName?.toLowerCase().includes(searchQuery.toLowerCase()) || u.email?.toLowerCase().includes(searchQuery.toLowerCase()))).map((u, idx) => (
                                     <motion.div 
                                        key={u.uid} 
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: idx * 0.05 }}
                                        className="px-6 py-6 flex items-center justify-between hover:bg-muted/30 transition-colors group"
                                    >
                                        <div className="flex items-center gap-4">
                                            <Avatar className="h-10 w-10 border border-border rounded bg-muted">
                                                <AvatarImage src={u.photoURL || undefined} className="object-cover" />
                                                <AvatarFallback className="text-muted-foreground font-bold text-xs uppercase">{u.displayName?.[0]}</AvatarFallback>
                                            </Avatar>
                                            <div>
                                                <div className="text-base font-bold text-foreground tracking-tight leading-tight">{u.displayName}</div>
                                                <div className="text-xs text-muted-foreground font-medium group-hover:text-foreground transition-colors mt-0.5">{u.email}</div>
                                                <div className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest mt-1">UID: {u.uid.slice(0,12)}</div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-6">
                                            <div className="flex flex-col items-end gap-1.5">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Credit Limit</span>
                                                    <div className="relative">
                                                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">₹</span>
                                                        <input 
                                                            type="number" 
                                                            defaultValue={u.creditLimit || 5000}
                                                            onBlur={async (e) => {
                                                                const val = Number(e.target.value);
                                                                if(val < 0) return;
                                                                const res = await updateClientCreditLimit(u.uid, val);
                                                                if(res.success) toast.success("Limit updated");
                                                                else toast.error("Update failed");
                                                            }}
                                                            className="h-8 w-24 pl-5 pr-2 bg-muted border border-border rounded text-[10px] font-bold text-foreground focus:border-primary/50 outline-none transition-all"
                                                        />
                                                    </div>
                                                </div>
                                                { (projects.filter(p => p.clientId === u.uid && p.paymentStatus !== 'full_paid').reduce((acc, curr) => acc + (curr.totalCost || 0), 0)) > (u.creditLimit || 5000) && (
                                                    <div className="flex items-center gap-1.5 px-2 py-0.5 bg-red-500/10 border border-red-500/20 rounded">
                                                        <AlertCircle className="h-2.5 w-2.5 text-red-500" />
                                                        <span className="text-[8px] font-black text-red-500 uppercase tracking-widest">LIMIT_EXCEEDED</span>
                                                    </div>
                                                )}
                                            </div>

                                            <button 
                                                className={cn(
                                                    "h-9 px-4 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all border",
                                                    u.payLater 
                                                        ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20 shadow-lg" 
                                                        : "bg-muted/50 text-muted-foreground border-border hover:text-foreground"
                                                )}
                                                onClick={async () => {
                                                    const res = await togglePayLater(u.uid, !u.payLater);
                                                    if(res.success) toast.success(`Entity protocol adjusted.`);
                                                    else toast.error("Failed to adjust");
                                                }}
                                            >
                                                Deferred Payment: {u.payLater ? "AUTHORIZED" : "REVOKED"}
                                            </button>
                                        </div>
                                    </motion.div>
                                ))}
                             </div>
                             {users.filter(u => u.role === 'client').length === 0 && (
                                 <div className="px-6 py-24 text-center text-muted-foreground text-[10px] font-bold uppercase tracking-widest">NUL_INDEX: No Clients Located</div>
                             )}
                        </motion.div>
                    )}
                    
                    {activeTab === 'finance' && (
                        <motion.div
                            key="finance"
                            initial={{ opacity: 0, scale: 0.98 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.98 }}
                            className="p-8 space-y-6"
                        >
                            <div className="flex flex-col gap-2 mb-6">
                                <h2 className="text-xl font-bold tracking-tight text-foreground mb-1 flex items-center gap-2">
                                    <IndianRupee className="h-5 w-5 text-primary" />
                                    Financial Settlement Hub
                                </h2>
                                <p className="text-xs font-medium text-muted-foreground leading-relaxed max-w-2xl">
                                    Centralized treasury for managing outstanding liabilities. Track and settle dues for both clients (receivables) and editors (payables).
                                </p>
                            </div>
                            
                            <div className="grid gap-8">
                                {/* Client Dues Section */}
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2 px-1">
                                        <div className="h-2 w-2 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.5)]" />
                                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Client Receivables (Pay Later)</h3>
                                    </div>
                                    <div className="grid gap-6">
                                        {users.filter(u => u.role === 'client' && (u.payLater || projects.some(p => p.clientId === u.uid && (p as any).isPayLaterRequest))).map(client => {
                                            const clientProjects = projects.filter(p => p.clientId === client.uid && p.paymentStatus !== 'full_paid' && ((p as any).isPayLaterRequest || client.payLater));
                                            const totalDues = clientProjects.reduce((sum, p) => sum + (p.totalCost || 0), 0);
                                            
                                            if (totalDues === 0) return null;

                                            return (
                                                <motion.div 
                                                    key={client.uid}
                                                    initial={{ opacity: 0, y: 10 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    className="enterprise-card bg-muted/50 border border-border rounded-xl overflow-hidden"
                                                >
                                                    <div className="p-6 border-b border-border bg-muted/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                                        <div className="flex items-center gap-4">
                                                            <div className="h-12 w-12 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-500">
                                                                <IndianRupee className="h-6 w-6" />
                                                            </div>
                                                            <div>
                                                                <h3 className="text-lg font-bold text-foreground tracking-tight">{client.displayName || 'Unknown Client'}</h3>
                                                                <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest mt-1">{client.companyName || client.email}</p>
                                                            </div>
                                                        </div>
                                                        <div className="flex flex-col md:items-end gap-1 border border-orange-500/20 bg-orange-500/5 px-6 py-3 rounded-xl">
                                                            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Total Pending Dues</span>
                                                            <span className="text-2xl font-black text-orange-400 tabular-nums">₹{totalDues.toLocaleString()}</span>
                                                        </div>
                                                    </div>
                                                    
                                                    <div className="divide-y divide-border bg-card/40">
                                                        {clientProjects.map(project => (
                                                            <div key={project.id} className="p-4 px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-muted/50 transition-colors">
                                                                <div className="flex items-center gap-4 min-w-0">
                                                                    <div className="h-8 w-8 rounded bg-muted/50 border border-border flex items-center justify-center shrink-0">
                                                                        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                                                                    </div>
                                                                    <div className="min-w-0">
                                                                        <Link href={`/dashboard/projects/${project.id}`} className="text-sm font-bold text-foreground tracking-tight truncate hover:text-primary transition-colors block">
                                                                            {project.name}
                                                                        </Link>
                                                                        <div className="flex items-center gap-2 mt-1">
                                                                            <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest">ID: {project.id.slice(0,8)}</span>
                                                                            <div className="h-1 w-1 rounded-full bg-muted-foreground" />
                                                                            <span className={cn("text-[9px] font-bold uppercase tracking-widest", project.clientHasDownloaded ? "text-emerald-500" : "text-amber-500")}>
                                                                                {project.clientHasDownloaded ? "File Downloaded" : "File Not Downloaded"}
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-center justify-between sm:justify-end gap-6 w-full sm:w-auto shrink-0">
                                                                    <span className="text-sm font-black text-foreground tabular-nums">₹{project.totalCost?.toLocaleString() || 0}</span>
                                                                    <button 
                                                                        onClick={(e) => { e.preventDefault(); handleSettlePayment(project.id); }}
                                                                        className="h-9 px-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 hover:bg-emerald-500 text-[10px] hover:text-foreground font-bold uppercase tracking-widest transition-all shadow-[0_0_15px_rgba(16,185,129,0.1)] hover:shadow-[0_0_20px_rgba(16,185,129,0.4)] active:scale-95 flex items-center gap-2"
                                                                    >
                                                                        <CheckCircle2 className="h-3.5 w-3.5" />
                                                                        Mark Received
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </motion.div>
                                            );
                                        })}
                                        
                                        {users.filter(u => u.role === 'client' && (u.payLater || projects.some(p => p.clientId === u.uid && (p as any).isPayLaterRequest))).every(client => {
                                            return projects.filter(p => p.clientId === client.uid && p.paymentStatus !== 'full_paid' && ((p as any).isPayLaterRequest || client.payLater)).reduce((sum, p) => sum + (p.totalCost || 0), 0) === 0;
                                        }) && (
                                            <div className="enterprise-card p-8 text-center flex flex-col items-center justify-center border-dashed border-2 border-border opacity-60">
                                                <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest">All client balances cleared</h3>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Editor Dues Section */}
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2 px-1">
                                        <div className="h-2 w-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
                                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Editor Payables (Pending Payouts)</h3>
                                    </div>
                                    <div className="grid gap-6">
                                        {users.filter(u => u.role === 'editor' && projects.some(p => p.assignedEditorId === u.uid && p.status === 'completed' && !p.editorPaid)).map(editor => {
                                            const editorProjects = projects.filter(p => p.assignedEditorId === editor.uid && p.status === 'completed' && !p.editorPaid);
                                            const totalEditorDues = editorProjects.reduce((sum, p) => sum + (p.editorPrice || 0), 0);

                                            if (totalEditorDues === 0) return null;

                                            return (
                                                <motion.div 
                                                    key={editor.uid}
                                                    initial={{ opacity: 0, y: 10 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    className="enterprise-card bg-muted/50 border border-border rounded-xl overflow-hidden"
                                                >
                                                    <div className="p-6 border-b border-border bg-muted/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                                        <div className="flex items-center gap-4">
                                                            <Avatar className="h-12 w-12 border border-border rounded-xl bg-muted/50">
                                                                <AvatarImage src={editor.photoURL || undefined} className="object-cover" />
                                                                <AvatarFallback className="text-primary font-bold text-sm uppercase">{editor.displayName?.[0]}</AvatarFallback>
                                                            </Avatar>
                                                            <div>
                                                                <h3 className="text-lg font-bold text-foreground tracking-tight">{editor.displayName || 'Unknown Editor'}</h3>
                                                                <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest mt-1 text-blue-400/80">{editor.email}</p>
                                                            </div>
                                                        </div>
                                                        <div className="flex flex-col md:items-end gap-1 border border-blue-500/20 bg-blue-500/5 px-6 py-3 rounded-xl">
                                                            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Total Payout Pending</span>
                                                            <span className="text-2xl font-black text-blue-400 tabular-nums">₹{totalEditorDues.toLocaleString()}</span>
                                                        </div>
                                                    </div>
                                                    
                                                    <div className="divide-y divide-border bg-card/40">
                                                        {editorProjects.map(project => (
                                                            <div key={project.id} className="p-4 px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-muted/50 transition-colors">
                                                                <div className="flex items-center gap-4 min-w-0">
                                                                    <div className="h-8 w-8 rounded bg-muted/50 border border-border flex items-center justify-center shrink-0">
                                                                        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                                                                    </div>
                                                                    <div className="min-w-0">
                                                                        <Link href={`/dashboard/projects/${project.id}`} className="text-sm font-bold text-foreground tracking-tight truncate hover:text-primary transition-colors block">
                                                                            {project.name}
                                                                        </Link>
                                                                        <div className="flex items-center gap-2 mt-1">
                                                                            <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest">ID: {project.id.slice(0,8)}</span>
                                                                            <div className="h-1 w-1 rounded-full bg-muted-foreground" />
                                                                            <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-500">Project Completed</span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-center justify-between sm:justify-end gap-6 w-full sm:w-auto shrink-0">
                                                                    <div className="flex flex-col items-end mr-4">
                                                                        <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-tighter">Editor Share</span>
                                                                        <span className="text-sm font-black text-foreground tabular-nums">₹{project.editorPrice?.toLocaleString() || 0}</span>
                                                                    </div>
                                                                    <button 
                                                                        onClick={(e) => { e.preventDefault(); handleReimburseEditor(project.id); }}
                                                                        className="h-9 px-4 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500 hover:text-foreground text-[10px] font-bold uppercase tracking-widest transition-all active:scale-95 flex items-center gap-2 shadow-[0_0_15px_rgba(59,130,246,0.1)] hover:shadow-[0_0_20px_rgba(59,130,246,0.4)]"
                                                                    >
                                                                        <RefreshCw className="h-3.5 w-3.5" />
                                                                        Settle Payout
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </motion.div>
                                            );
                                        })}

                                        {users.filter(u => u.role === 'editor' && projects.some(p => p.assignedEditorId === u.uid && p.status === 'completed' && !p.editorPaid)).length === 0 && (
                                            <div className="enterprise-card p-8 text-center flex flex-col items-center justify-center border-dashed border-2 border-border opacity-60">
                                                <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest">All editor payouts settled</h3>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}
                    </AnimatePresence>
                </div>
                
                <div className="p-6 border-t border-border bg-muted/30 flex items-center justify-between">
                    <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
                        Showing: {activeTab === 'projects' ? projects.length : users.filter(u => u.role === 'client').length} results
                    </span>
                    <div className="flex items-center gap-2">
                        <button className="h-9 px-4 rounded-lg border border-border bg-muted/50 text-[10px] font-bold text-muted-foreground uppercase tracking-widest hover:text-foreground disabled:opacity-30 transition-all active:scale-[0.98]" disabled>Back</button>
                        <button className="h-9 px-4 rounded-lg border border-border bg-muted/50 text-[10px] font-bold text-muted-foreground uppercase tracking-widest hover:text-foreground disabled:opacity-30 transition-all active:scale-[0.98]" disabled>Next</button>
                    </div>
                </div>
            </motion.div>

            {/* Assignment Modal */}
            <Modal isOpen={isAssignModalOpen} onClose={() => setIsAssignModalOpen(false)} title="Assign Editor">
                 <div className="mt-6 space-y-3 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                      <div className="flex items-center gap-3 p-4 rounded-xl bg-primary/5 border border-primary/20 mb-4">
                          <Zap className="h-4 w-4 text-primary" />
                          <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest leading-relaxed">
                              Assign an editor to <span className="text-primary font-black">{selectedProject?.name}</span>
                          </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                          <div className="p-4 bg-muted/30 border border-border rounded-xl space-y-3">
                              <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Editor Revenue (₹)</Label>
                              <input 
                                  type="number"
                                  placeholder="e.g. 500"
                                  value={editorPriceInput}
                                  onChange={(e) => setEditorPriceInput(e.target.value)}
                                  className="w-full h-11 px-4 rounded-lg bg-background border border-border focus:border-primary/50 transition-all text-sm font-bold tracking-tight"
                              />
                          </div>
                          <div className="p-4 bg-muted/30 border border-border rounded-xl space-y-3">
                              <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Optional Deadline</Label>
                              <input 
                                  type="datetime-local"
                                  value={assignDeadline}
                                  onChange={(e) => setAssignDeadline(e.target.value)}
                                  className="w-full h-11 px-4 rounded-lg bg-background border border-border focus:border-primary/50 transition-all text-sm font-bold tracking-tight"
                              />
                          </div>
                      </div>

                      <div className="grid gap-3">
                        {editors.length === 0 ? (
                            <div className="py-12 text-center text-muted-foreground text-[10px] font-bold uppercase tracking-widest border border-dashed border-border rounded-2xl">
                                No Editors Available
                            </div>
                        ) : (
                            editors.map(editor => {
                                 const status = editor.availabilityStatus || 'offline';
                                 const isOffline = status === 'offline';
                                 const isSleep = status === 'sleep';
                                 const isOnline = status === 'online';

                                 return (
                                    <div key={editor.uid} className={cn(
                                        "flex items-center justify-between p-4 bg-muted/50 border border-border rounded-xl transition-all group/editor",
                                        isOffline ? "opacity-50 grayscale-[0.5]" : "hover:border-primary/50"
                                    )}>
                                        <div className="flex items-center gap-4 cursor-pointer" onClick={() => { setSelectedEditorDetail(editor); setIsEditorModalOpen(true); }}>
                                            <Avatar className="h-10 w-10 border border-border">
                                                <AvatarImage src={editor.photoURL || undefined} className="object-cover" />
                                                <AvatarFallback className="bg-primary/10 text-primary font-bold">{editor.displayName?.[0]}</AvatarFallback>
                                            </Avatar>
                                            <div>
                                                <div className="text-sm font-bold text-foreground group-hover/editor:text-primary transition-colors">{editor.displayName}</div>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <div className={cn(
                                                        "h-1.5 w-1.5 rounded-full", 
                                                        isOnline ? "bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" : 
                                                        isSleep ? "bg-amber-500" : "bg-red-500"
                                                    )} />
                                                    <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">{status}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <button 
                                            disabled={isOffline}
                                            onClick={() => handleAssignEditor(editor.uid)}
                                            className={cn(
                                                "h-9 px-4 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all",
                                                isOffline 
                                                    ? "bg-muted text-muted-foreground cursor-not-allowed" 
                                                    : "bg-primary text-primary-foreground hover:bg-zinc-200 shadow-lg active:scale-95"
                                            )}
                                        >
                                            {isOffline ? 'Editor Offline' : 'Assign Editor'}
                                        </button>
                                    </div>
                                 );
                            })
                        )}
                      </div>
                 </div>
            </Modal>

            {/* Editor Detail Modal */}
            <Modal isOpen={isEditorModalOpen} onClose={() => setIsEditorModalOpen(false)} title="Editor Profile" maxWidth="max-w-2xl">
                 {selectedEditorDetail && (
                     <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-6 pr-2 max-h-[85vh] overflow-y-auto custom-scrollbar pb-10 text-left">
                         {/* Left Column: Identity & Access */}
                         <div className="lg:col-span-4 space-y-6">
                             <div className="bg-muted/30 border border-border rounded-2xl p-6 relative overflow-hidden group text-center lg:text-left transition-all hover:bg-muted/50">
                                 <div className="h-20 w-20 rounded-2xl overflow-hidden border-2 border-primary/20 bg-muted/50 mx-auto lg:mx-0 relative mb-4">
                                     {selectedEditorDetail.photoURL ? (
                                         <Image src={selectedEditorDetail.photoURL} alt="" fill className="object-cover" />
                                     ) : (
                                         <div className="h-full w-full flex items-center justify-center bg-primary/10 text-primary text-2xl font-black">
                                             {selectedEditorDetail.displayName?.[0]}
                                         </div>
                                     )}
                                 </div>
                                 <div className="space-y-1.5">
                                     <h3 className="text-xl font-black text-foreground tracking-tight">{selectedEditorDetail.displayName}</h3>
                                     <div className="flex flex-wrap items-center justify-center lg:justify-start gap-2">
                                         <span className="px-2 py-0.5 bg-primary/10 text-primary border border-primary/20 rounded-md text-[8px] font-black uppercase tracking-widest">Authorized Editor</span>
                                         <span className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest bg-muted border border-border px-2 py-0.5 rounded-md">ID: {selectedEditorDetail.uid.slice(0,8)}</span>
                                     </div>
                                 </div>
                             </div>

                             <div className="bg-muted/30 border border-border rounded-2xl p-5 space-y-4">
                                 <h4 className="text-[10px] font-black text-muted-foreground uppercase tracking-widest flex items-center gap-2 px-1">
                                     <Activity className="h-3.5 w-3.5 text-primary" /> Performance Matrix
                                 </h4>
                                 <div className="grid grid-cols-2 gap-3">
                                     <div className="bg-card border border-border rounded-xl p-3 text-center">
                                         <div className="text-base font-black text-foreground">{projects.filter(p => p.assignedEditorId === selectedEditorDetail.uid && p.status === 'completed').length}</div>
                                         <div className="text-[8px] font-black text-muted-foreground uppercase tracking-widest mt-1">Deliveries</div>
                                     </div>
                                     <div className="bg-card border border-border rounded-xl p-3 text-center">
                                         <div className="text-base font-black text-primary">{selectedEditorDetail.rating || '4.5'}</div>
                                         <div className="text-[8px] font-black text-muted-foreground uppercase tracking-widest mt-1">Avg Rating</div>
                                     </div>
                                 </div>
                                 <div className="p-4 bg-emerald-500/5 border border-emerald-500/10 rounded-xl flex items-center justify-between">
                                     <div className="flex flex-col text-left">
                                         <span className="text-[8px] font-black text-emerald-500/60 uppercase tracking-widest">Total Earnings</span>
                                         <span className="text-lg font-black text-emerald-500 tabular-nums">₹{(selectedEditorDetail.income || 0).toLocaleString()}</span>
                                     </div>
                                     <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                                         <IndianRupee className="h-4 w-4 text-emerald-500" />
                                     </div>
                                 </div>
                             </div>

                             <div className="bg-muted/30 border border-border rounded-2xl p-4 text-center">
                                 <div className="text-xs font-black text-foreground">{Math.floor((Date.now() - (selectedEditorDetail.createdAt || Date.now())) / (1000 * 60 * 60 * 24))}</div>
                                 <div className="text-[8px] font-bold text-muted-foreground uppercase tracking-[0.2em] mt-1 text-center">Days Active on Platform</div>
                             </div>
                         </div>

                         {/* Right Column: Portfolio & Details */}
                         <div className="lg:col-span-8 space-y-6">
                             <div className="bg-muted/30 border border-border rounded-2xl p-6 space-y-4">
                                 <h4 className="text-[10px] font-black text-primary uppercase tracking-[0.2em] flex items-center gap-2">
                                     <MonitorPlay className="h-4 w-4" /> Showcase Masterpieces
                                 </h4>
                                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                     {selectedEditorDetail.portfolio?.length ? selectedEditorDetail.portfolio.map((item, i) => (
                                         <a key={i} href={item.url} target="_blank" rel="noopener noreferrer" className="bg-card border border-border rounded-xl p-4 flex flex-col gap-3 group/port hover:border-primary/40 transition-all">
                                             <div className="flex items-center justify-between">
                                                 <span className="text-[11px] font-black text-foreground/80 group-hover/port:text-primary transition-colors tracking-tight truncate max-w-[140px]">{item.name || 'Untitled Work'}</span>
                                                 <ExternalLink className="h-3 w-3 text-muted-foreground" />
                                             </div>
                                             <div className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">Creative Portfolio Item</div>
                                         </a>
                                     )) : (
                                         <div className="col-span-full py-12 flex flex-col items-center justify-center bg-card/50 border border-dashed border-border rounded-xl opacity-40 gap-3">
                                             <Database className="h-6 w-6 text-muted-foreground" />
                                             <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Portfolio Repository Empty</p>
                                         </div>
                                     )}
                                 </div>
                             </div>

                             {selectedEditorDetail.skills && selectedEditorDetail.skills.length > 0 && (
                                 <div className="bg-muted/30 border border-border rounded-2xl p-6 space-y-4">
                                     <h4 className="text-[10px] font-black text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                                         <Zap className="h-3.5 w-3.5 text-primary" /> Technical Toolset
                                     </h4>
                                     <div className="flex flex-wrap gap-2">
                                         {selectedEditorDetail.skills.map((skill: string, idx: number) => (
                                             <span key={idx} className="bg-primary/10 text-primary border border-primary/20 px-3 py-1 rounded-md text-[9px] font-black uppercase tracking-widest">
                                                 {skill}
                                             </span>
                                         ))}
                                     </div>
                                 </div>
                             )}
                         </div>
                     </div>
                 )}
            </Modal>
            {/* Project Management Modal */}
            <Modal
                isOpen={isManageModalOpen}
                onClose={() => setIsManageModalOpen(false)}
                title="Manage Project Parameters"
            >
                <div className="space-y-8 py-4">
                    <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest mb-4">Configure revenue share and workflow automation.</p>
                    <div className="space-y-4">
                        <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Editor Revenue Share (₹)</Label>
                        <div className="flex gap-3">
                            <input 
                                type="number"
                                placeholder="e.g. 500"
                                value={editorPriceInput}
                                onChange={(e) => setEditorPriceInput(e.target.value)}
                                className="flex-1 h-11 px-4 rounded-lg bg-muted border border-border focus:border-primary/50 transition-all text-sm font-bold tracking-tight"
                            />
                            <button 
                                onClick={async () => {
                                    if (!selectedProject || !user) return;
                                    if (Number(editorPriceInput) > (selectedProject.totalCost || 0)) {
                                        toast.error(`Editor revenue cannot exceed project cost (₹${selectedProject.totalCost || 0}). Negative platform margin is not allowed.`);
                                        return;
                                    }
                                    const res = await setEditorPrice(selectedProject.id, Number(editorPriceInput), { uid: user.uid, displayName: user.displayName || 'PM' });
                                    if (res.success) toast.success("Revenue share established");
                                    else toast.error("Failed to update");
                                }}
                                className="px-6 bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-widest rounded-lg hover:opacity-90 active:scale-95 transition-all"
                            >
                                Update
                            </button>
                        </div>
                    </div>

                    <div className="pt-8 border-t border-border">
                        <div className="flex items-center justify-between p-4 rounded-xl bg-muted/50 border border-border group hover:border-primary/30 transition-all">
                            <div className="space-y-1">
                                <div className="text-[11px] font-bold text-foreground uppercase tracking-widest">AutoPay Algorithm</div>
                                <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-tight">Authorize automated payments upon review?</div>
                            </div>
                            <button 
                                onClick={async () => {
                                    if (!selectedProject || !user) return;
                                    const res = await toggleProjectAutoPay(selectedProject.id, !selectedProject.autoPay, { uid: user.uid, displayName: user.displayName || 'PM' });
                                    if (res.success) {
                                        toast.success(`AutoPay ${!selectedProject.autoPay ? 'Authorized' : 'Suspended'}`);
                                        setSelectedProject(prev => prev ? { ...prev, autoPay: !prev.autoPay } : null);
                                    } else toast.error("Failed to toggle");
                                }}
                                className={cn(
                                    "h-10 px-6 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all",
                                    selectedProject?.autoPay 
                                        ? "bg-emerald-500 text-foreground shadow-[0_0_15px_rgba(16,185,129,0.3)]" 
                                        : "bg-muted-foreground text-muted-foreground border border-zinc-700 hover:text-foreground"
                                )}
                            >
                                {selectedProject?.autoPay ? "ENABLED" : "DISABLED"}
                            </button>
                        </div>
                    </div>
                </div>
            </Modal>

            {/* Project Audit Inspector */}
            <Modal 
                isOpen={isProjectDetailModalOpen} 
                onClose={() => setIsProjectDetailModalOpen(false)} 
                title={`Infrastructure Audit // ${inspectProject?.name}`}
                maxWidth="max-w-6xl"
            >
                {inspectProject && (
                    <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6 max-h-[85vh] overflow-y-auto pr-2 custom-scrollbar pb-6 text-left">
                        {/* LEFT COLUMN: Main Specs & Data */}
                        <div className="lg:col-span-8 space-y-6">
                            {/* Project Identity & Status */}
                            <div className="bg-muted/30 border border-border rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden group">
                                <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none group-hover:opacity-10 transition-opacity">
                                    <Terminal className="h-24 w-24" />
                                </div>
                                <div className="flex items-center gap-5 relative z-10">
                                    <div className="h-16 w-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-inner">
                                        <MonitorPlay className="h-8 w-8" />
                                    </div>
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                            <h4 className="text-2xl font-black text-foreground tracking-tight">{inspectProject.name}</h4>
                                            <span className="text-[9px] bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full font-black uppercase tracking-widest">{inspectProject.status}</span>
                                        </div>
                                        <div className="flex items-center gap-3 text-muted-foreground">
                                            <span className="text-[10px] font-bold uppercase tracking-[0.2em]">REF: {inspectProject.id}</span>
                                            <span className="h-1 w-1 rounded-full bg-border" />
                                            <span className="text-[10px] font-bold uppercase tracking-[0.2em]">{new Date(inspectProject.createdAt).toLocaleDateString()}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="relative z-10 flex flex-col items-end gap-2 text-right">
                                    <ProjectStatusBadges project={inspectProject} />
                                    <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest bg-card px-3 py-1 rounded-md border border-border">
                                        Last Updated: {new Date(inspectProject.updatedAt).toLocaleString()}
                                    </div>
                                </div>
                            </div>

                            {/* Technical Matrix */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                {[
                                    { label: 'Video Type', value: inspectProject.videoType || 'N/A', icon: <Layers className="h-3.5 w-3.5" /> },
                                    { label: 'Format', value: inspectProject.videoFormat || 'N/A', icon: <Monitor className="h-3.5 w-3.5" /> },
                                    { label: 'Ratio', value: inspectProject.aspectRatio || 'N/A', icon: <Cpu className="h-3.5 w-3.5" /> },
                                    { label: 'Duration', value: inspectProject.duration ? `${inspectProject.duration}m` : 'N/A', icon: <Calendar className="h-3.5 w-3.5" /> },
                                ].map((spec, i) => (
                                    <div key={i} className="bg-muted/30 border border-border rounded-xl p-4 space-y-2 hover:border-primary/30 transition-all">
                                        <div className="flex items-center gap-2 text-muted-foreground">
                                            {spec.icon}
                                            <span className="text-[9px] font-bold uppercase tracking-widest">{spec.label}</span>
                                        </div>
                                        <div className="text-sm font-black text-foreground tracking-tight">{spec.value}</div>
                                    </div>
                                ))}
                            </div>

                            {/* Resource Access & Links */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="bg-muted/30 border border-border rounded-xl p-5 space-y-4">
                                    <h5 className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-2">
                                        <HardDrive className="h-3.5 w-3.5" /> Source Infrastructure
                                    </h5>
                                    <div className="space-y-3">
                                        <div className="p-3 bg-card border border-border rounded-lg flex items-center justify-between group/link">
                                            <div className="flex flex-col">
                                                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-tight">Main Footage</span>
                                                <span className="text-xs font-bold text-foreground truncate max-w-[150px]">{inspectProject.footageLink || 'N/A'}</span>
                                            </div>
                                            {inspectProject.footageLink && (
                                                <a href={inspectProject.footageLink} target="_blank" className="h-8 w-8 rounded-md bg-muted flex items-center justify-center text-muted-foreground hover:text-primary transition-all">
                                                    <ExternalLink className="h-4 w-4" />
                                                </a>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className="flex-1 p-3 bg-card border border-border rounded-lg text-center">
                                                <div className="text-[10px] font-black text-foreground">{(inspectProject.rawFiles?.length || 0)}</div>
                                                <div className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest">Raw Files</div>
                                            </div>
                                            <div className="flex-1 p-3 bg-card border border-border rounded-lg text-center">
                                                <div className="text-[10px] font-black text-foreground">{(inspectProject.scripts?.length || 0)}</div>
                                                <div className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest">Scripts</div>
                                            </div>
                                            <div className="flex-1 p-3 bg-card border border-border rounded-lg text-center">
                                                <div className="text-[10px] font-black text-foreground">{(inspectProject.referenceFiles?.length || 0)}</div>
                                                <div className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest">Refs</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                
                                <div className="bg-muted/30 border border-border rounded-xl p-5 space-y-4">
                                    <h5 className="text-[10px] font-black uppercase tracking-widest text-emerald-500 flex items-center gap-2">
                                        <Activity className="h-3.5 w-3.5" /> Assignments
                                    </h5>
                                    <div className="grid grid-cols-1 gap-3">
                                        <div className="p-3 bg-card border border-border rounded-lg flex items-center gap-3">
                                            <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center">
                                                <UserIcon className="h-4 w-4 text-muted-foreground" />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-tight">Managed By (PM)</span>
                                                <span className="text-xs font-black text-foreground">
                                                    {users.find((u: any) => u.uid === inspectProject.assignedPMId)?.displayName || 'Infrastructure Unmanaged'}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="p-3 bg-card border border-border rounded-lg flex items-center gap-3">
                                            <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center">
                                                <Briefcase className="h-4 w-4 text-muted-foreground" />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-tight">Assigned Editor</span>
                                                <span className="text-xs font-black text-foreground">
                                                    {users.find((u: any) => u.uid === inspectProject.assignedEditorId)?.displayName || 'Awaiting Assignment'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Description / Creative Brief */}
                            {inspectProject.description && (
                                <div className="bg-muted/30 border border-border rounded-xl p-5 space-y-2">
                                    <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Internal Brief / Description</div>
                                    <p className="text-xs leading-relaxed text-foreground/80 font-medium italic">“{inspectProject.description}”</p>
                                </div>
                            )}

                            {inspectProject.assignmentStatus === 'rejected' && inspectProject.editorDeclineReason && (
                                <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 space-y-2 mt-4">
                                    <div className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-2">
                                        <AlertCircle className="h-4 w-4 text-red-400" /> Editor Decline Reason
                                    </div>
                                    <p className="text-xs text-red-400/90 font-medium italic">“{inspectProject.editorDeclineReason}”</p>
                                </div>
                            )}
                        </div>

                        {/* RIGHT COLUMN: Financials & History */}
                        <div className="lg:col-span-4 space-y-6">
                            {/* Treasury Ledger */}
                            <div className="bg-muted/30 border border-border rounded-2xl p-6 space-y-6">
                                <h5 className="text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground border-b border-border pb-3 flex items-center gap-2">
                                    <IndianRupee className="h-4 w-4 text-primary" /> Treasury Ledger
                                </h5>
                                <div className="space-y-5">
                                    <div className="flex flex-col">
                                        <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Global Project Value</span>
                                        <div className="text-3xl font-black text-foreground tabular-nums tracking-tighter">₹{inspectProject.totalCost?.toLocaleString()}</div>
                                    </div>
                                    <div className="grid grid-cols-1 gap-3">
                                        <div className="p-4 bg-emerald-500/5 border border-emerald-500/10 rounded-xl flex items-center justify-between">
                                            <div className="flex flex-col">
                                                <span className="text-[8px] font-black text-emerald-500/60 uppercase tracking-widest">Editor Payout</span>
                                                <span className="text-lg font-black text-emerald-500 tabular-nums">₹{inspectProject.editorPrice?.toLocaleString() || '0'}</span>
                                            </div>
                                            <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                                                <ArrowUpRight className="h-4 w-4 text-emerald-500" />
                                            </div>
                                        </div>
                                    </div>
                                    <div className="pt-2 border-t border-border flex items-center justify-between">
                                        <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Auto-Settlement</span>
                                        <div className={cn("text-[10px] font-black uppercase px-2 py-0.5 rounded border", inspectProject.autoPay ? "text-primary border-primary/20 bg-primary/5" : "text-muted-foreground border-border bg-muted")}>
                                            {inspectProject.autoPay ? 'Authorized' : 'Disabled'}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Event Feed (History) */}
                            <div className="bg-muted/30 border border-border rounded-2xl p-6 flex flex-col max-h-[400px]">
                                <h5 className="text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground border-b border-border pb-3 flex items-center gap-2 sticky top-0 bg-transparent backdrop-blur-sm z-10">
                                    <Activity className="h-4 w-4 text-primary" /> Incident History
                                </h5>
                                <div className="flex-1 overflow-y-auto mt-6 space-y-6 pr-2 custom-scrollbar">
                                    {inspectProject.logs && inspectProject.logs.length > 0 ? (
                                        [...inspectProject.logs].reverse().map((log: any, i) => (
                                            <div key={i} className="relative pl-6 before:absolute before:left-1 before:top-1.5 before:w-0.5 before:h-[calc(100%+1.5rem)] before:bg-border last:before:hidden">
                                                <div className="absolute left-[-1px] top-1.5 h-2.5 w-2.5 rounded-full bg-border border border-muted ring-2 ring-muted group-hover:bg-primary transition-all" />
                                                <div className="space-y-1">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <span className="text-[10px] font-black text-foreground uppercase tracking-tight truncate">{log.event.replace('_', ' ')}</span>
                                                        <span className="text-[8px] font-bold text-muted-foreground tabular-nums flex-shrink-0">
                                                            {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                    </div>
                                                    <p className="text-[11px] text-muted-foreground font-medium leading-relaxed">{log.details}</p>
                                                    <div className="flex items-center gap-1.5 pt-1">
                                                        <span className="text-[8px] font-black text-primary uppercase">{log.userName}</span>
                                                        {log.designation && <span className="text-[8px] font-bold text-muted-foreground italic truncate">/ {log.designation}</span>}
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="py-12 flex flex-col items-center justify-center opacity-30 gap-3">
                                            <Database className="h-6 w-6 text-muted-foreground" />
                                            <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">No Logs Cached</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
}

