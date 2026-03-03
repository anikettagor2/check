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
    settleProjectPayment
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
            await updateDoc(doc(db, "projects", selectedProject.id), {
                 assignedEditorId: editorId,
                 editorPrice: Number(editorPriceInput),
                 assignmentStatus: 'pending',
                 status: 'pending_assignment', 
                 members: arrayUnion(editorId),
                 updatedAt: Date.now()
            });
            toast.success(`Editor assigned. Awaiting their acceptance.`);
            setIsAssignModalOpen(false);
            setSelectedProject(null);
            setEditorPriceInput("");
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

    return (
        <div className="space-y-10 max-w-[1600px] mx-auto pb-20 pt-4">
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
                                className="bg-transparent border-none text-[11px] font-bold uppercase tracking-widest text-primary hover:text-white transition-colors focus:ring-0 cursor-pointer appearance-none pr-6"
                            >
                                <option value="online" className="bg-[#161920]">Online</option>
                                <option value="sleep" className="bg-[#161920]">Sleep</option>
                                <option value="offline" className="bg-[#161920]">Offline</option>
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
                className="enterprise-card bg-[#161920]/40 backdrop-blur-sm overflow-hidden"
            >
                <div className="p-6 border-b border-white/5 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6 w-full lg:w-auto">
                        <div className="relative w-full sm:w-80">
                             <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 transition-colors" />
                             <input 
                                type="text" 
                                placeholder={`Locate ${activeTab} in system...`} 
                                className="h-10 w-full rounded-lg border border-white/10 bg-white/[0.02] pl-11 pr-4 text-xs font-medium text-white focus:bg-white/[0.04] focus:border-primary/50 focus:outline-none transition-all placeholder:text-zinc-600"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                             />
                        </div>
                        
                        <div className="hidden lg:flex items-center gap-2">
                             <Monitor className="h-3.5 w-3.5 text-zinc-600" />
                             <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Search & Filter</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <button className="h-10 px-4 rounded-lg border border-white/10 bg-white/[0.03] text-[11px] font-bold uppercase tracking-widest text-zinc-400 hover:text-white transition-all flex items-center gap-2">
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
                            <tr className="bg-white/[0.01]">
                                <th className="px-6 py-4 text-[11px] font-bold text-zinc-500 uppercase tracking-widest border-b border-white/5">Project Identifier</th>
                                <th className="px-6 py-4 text-[11px] font-bold text-zinc-500 uppercase tracking-widest border-b border-white/5">Status</th>
                                <th className="px-6 py-4 text-[11px] font-bold text-zinc-500 uppercase tracking-widest border-b border-white/5">Assigned Editor</th>
                                <th className="px-6 py-4 border-b border-white/5 w-[80px]"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {loading ? (
                                <tr><td colSpan={4} className="px-6 py-24 text-center"><RefreshCw className="animate-spin h-5 w-5 mx-auto text-primary" /></td></tr>
                            ) : projects.length === 0 ? (
                                <tr><td colSpan={4} className="px-6 py-24 text-center text-zinc-600 text-[10px] font-bold uppercase tracking-widest">No Projects Found</td></tr>
                            ) : (
                                projects.filter(p => !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.clientName?.toLowerCase().includes(searchQuery.toLowerCase())).map((project, idx) => {
                                    const assignedEditor = editors.find(e => e.uid === project.assignedEditorId);
                                    
                                    return (
                                    <motion.tr 
                                        key={project.id}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: idx * 0.05 }}
                                        className="group hover:bg-white/[0.02] transition-colors"
                                    >
                                        <td className="px-6 py-6 transition-all duration-300 group-hover:pl-8">
                                            <div className="flex flex-col gap-1">
                                                <div className="text-base font-bold text-white tracking-tight leading-tight group-hover:text-primary transition-colors">{project.name}</div>
                                                <div className="flex items-center gap-3">
                                                    <span className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest">{project.clientName || 'ENTITY_NULL'}</span>
                                                    <span className="text-[9px] text-zinc-800 font-bold tracking-widest uppercase">HEX: {project.id.slice(0,12)}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-6 border-b border-white/0 group-hover:border-white/5">
                                            <StatusIndicator status={project.status} />
                                        </td>
                                        <td className="px-6 py-6">
                                            {assignedEditor ? (
                                                <div className="flex items-center gap-3 bg-white/[0.03] border border-white/10 p-2 rounded-lg w-fit group-hover:border-primary/30 transition-all">
                                                    <Avatar className="h-7 w-7 border border-white/10 rounded-md">
                                                        <AvatarImage src={assignedEditor.photoURL || undefined} className="object-cover" />
                                                        <AvatarFallback className="text-[9px] bg-primary/20 text-primary font-bold">{assignedEditor.displayName?.[0]}</AvatarFallback>
                                                    </Avatar>
                                                    <div className="flex flex-col">
                                                         <span className="text-[11px] font-bold text-white leading-none uppercase tracking-tight">{assignedEditor.displayName}</span>
                                                         <span className="text-[9px] text-zinc-600 leading-none mt-1 uppercase font-bold tracking-widest">Authorized</span>
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
                                                        className="h-8 px-4 text-[9px] font-bold uppercase tracking-widest bg-emerald-500 text-white rounded-lg shadow-lg hover:opacity-90 transition-all active:scale-[0.98]"
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
                                                        <DropdownMenuItem className="p-2.5 text-xs text-popover-foreground hover:bg-muted transition-colors cursor-pointer rounded-lg px-3" onClick={() => { setInspectProject(project); setIsProjectDetailModalOpen(true); }}>
                                                            <Search className="mr-2.5 h-3.5 w-3.5 text-muted-foreground" /> Project Status
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
                                        <div className="flex items-center gap-4">
                                            <button 
                                                className={cn(
                                                    "h-9 px-4 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all border",
                                                    u.payLater 
                                                        ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20 shadow-lg" 
                                                        : "bg-white/[0.02] text-zinc-500 border-white/10 hover:text-white"
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
                                 <div className="px-6 py-24 text-center text-zinc-700 text-[10px] font-bold uppercase tracking-widest">NUL_INDEX: No Clients Located</div>
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
                                <h2 className="text-xl font-bold tracking-tight text-white mb-1 flex items-center gap-2">
                                    <IndianRupee className="h-5 w-5 text-primary" />
                                    Pay Later Finance Hub
                                </h2>
                                <p className="text-xs font-medium text-zinc-400 leading-relaxed max-w-2xl">
                                    Manage outstanding dues for your projects. Track payments for clients utilizing the Pay Later feature.
                                </p>
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
                                            className="enterprise-card bg-white/[0.02] border border-white/5 rounded-xl overflow-hidden"
                                        >
                                            <div className="p-6 border-b border-white/5 bg-white/[0.01] flex flex-col md:flex-row md:items-center justify-between gap-4">
                                                <div className="flex items-center gap-4">
                                                    <div className="h-12 w-12 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-500">
                                                        <IndianRupee className="h-6 w-6" />
                                                    </div>
                                                    <div>
                                                        <h3 className="text-lg font-bold text-white tracking-tight">{client.displayName || 'Unknown Client'}</h3>
                                                        <p className="text-xs text-zinc-500 font-bold uppercase tracking-widest mt-1">{client.companyName || client.email}</p>
                                                    </div>
                                                </div>
                                                <div className="flex flex-col md:items-end gap-1 border border-orange-500/20 bg-orange-500/5 px-6 py-3 rounded-xl">
                                                    <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest">Total Pending Dues</span>
                                                    <span className="text-2xl font-black text-orange-400 tabular-nums">₹{totalDues.toLocaleString()}</span>
                                                </div>
                                            </div>
                                            
                                            <div className="divide-y divide-white/5 bg-[#161920]/40">
                                                {clientProjects.map(project => (
                                                    <div key={project.id} className="p-4 px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-white/[0.02] transition-colors">
                                                        <div className="flex items-center gap-4 min-w-0">
                                                            <div className="h-8 w-8 rounded bg-white/[0.03] border border-white/5 flex items-center justify-center shrink-0">
                                                                <FileText className="h-3.5 w-3.5 text-zinc-400" />
                                                            </div>
                                                            <div className="min-w-0">
                                                                <Link href={`/dashboard/projects/${project.id}`} className="text-sm font-bold text-white tracking-tight truncate hover:text-primary transition-colors block">
                                                                    {project.name}
                                                                </Link>
                                                                <div className="flex items-center gap-2 mt-1">
                                                                    <span className="text-[9px] text-zinc-600 font-bold uppercase tracking-widest">ID: {project.id.slice(0,8)}</span>
                                                                    <div className="h-1 w-1 rounded-full bg-zinc-700" />
                                                                    <span className={cn("text-[9px] font-bold uppercase tracking-widest", project.clientHasDownloaded ? "text-emerald-500" : "text-amber-500")}>
                                                                        {project.clientHasDownloaded ? "File Downloaded" : "File Not Downloaded"}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center justify-between sm:justify-end gap-6 w-full sm:w-auto shrink-0">
                                                            <span className="text-sm font-black text-white tabular-nums">₹{project.totalCost?.toLocaleString() || 0}</span>
                                                            <button 
                                                                onClick={(e) => { e.preventDefault(); handleSettlePayment(project.id); }}
                                                                className="h-9 px-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 hover:bg-emerald-500 text-[10px] hover:text-white font-bold uppercase tracking-widest transition-all shadow-[0_0_15px_rgba(16,185,129,0.1)] hover:shadow-[0_0_20px_rgba(16,185,129,0.4)] active:scale-95 flex items-center gap-2"
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
                                    <div className="enterprise-card p-12 text-center flex flex-col items-center justify-center border-dashed border-2 border-white/5 opacity-60">
                                        <div className="h-16 w-16 bg-white/[0.03] rounded-2xl flex items-center justify-center border border-white/5 mb-4 shadow-[0_0_30px_rgba(255,255,255,0.02)]">
                                            <CheckCircle2 className="h-8 w-8 text-emerald-500/50" />
                                        </div>
                                        <h3 className="text-xl font-bold text-white tracking-tight">No Pending Dues</h3>
                                        <p className="text-zinc-500 text-sm font-medium mt-2 max-w-sm">There are no outstanding pay later payments for the projects you are currently managing.</p>
                                    </div>
                                )}
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

                      <div className="p-4 bg-muted/30 border border-border rounded-xl mb-4 space-y-3">
                          <Label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Set Editor Revenue (₹) - Required</Label>
                          <input 
                              type="number"
                              placeholder="e.g. 500"
                              value={editorPriceInput}
                              onChange={(e) => setEditorPriceInput(e.target.value)}
                              className="w-full h-11 px-4 rounded-lg bg-background border border-border focus:border-primary/50 transition-all text-sm font-bold tracking-tight"
                          />
                      </div>

                      <div className="grid gap-3">
                        {editors.length === 0 ? (
                            <div className="py-12 text-center text-zinc-600 text-[10px] font-bold uppercase tracking-widest border border-dashed border-white/5 rounded-2xl">
                                No Editors Available
                            </div>
                        ) : (
                            editors.map(editor => {
                                 const isOnline = (editor as any).updatedAt > Date.now() - 10 * 60 * 1000;
                                 return (
                                    <div key={editor.uid} className="flex items-center justify-between p-4 bg-white/[0.02] border border-white/5 rounded-xl hover:border-primary/50 transition-all group/editor">
                                        <div className="flex items-center gap-4 cursor-pointer" onClick={() => { setSelectedEditorDetail(editor); setIsEditorModalOpen(true); }}>
                                            <Avatar className="h-10 w-10 border border-white/10">
                                                <AvatarImage src={editor.photoURL || undefined} className="object-cover" />
                                                <AvatarFallback className="bg-primary/10 text-primary font-bold">{editor.displayName?.[0]}</AvatarFallback>
                                            </Avatar>
                                            <div>
                                                <div className="text-sm font-bold text-white group-hover/editor:text-primary transition-colors">{editor.displayName}</div>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <div className={cn("h-1.5 w-1.5 rounded-full", isOnline ? "bg-emerald-500 animate-pulse" : "bg-zinc-700")} />
                                                    <span className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest">{isOnline ? 'Online' : 'Offline'}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <button 
                                            onClick={() => handleAssignEditor(editor.uid)}
                                            className="h-9 px-4 bg-white text-black text-[10px] font-bold uppercase tracking-widest rounded-lg hover:bg-zinc-200 transition-all"
                                        >
                                            Assign Editor
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
                     <div className="mt-8 space-y-8 max-h-[70vh] overflow-y-auto pr-4 custom-scrollbar">
                         <div className="flex items-start gap-8">
                             <div className="h-24 w-24 rounded-2xl overflow-hidden border-2 border-white/5 bg-white/[0.02] relative">
                                 {selectedEditorDetail.photoURL ? (
                                     <Image src={selectedEditorDetail.photoURL} alt="" fill className="object-cover" />
                                 ) : (
                                     <div className="h-full w-full flex items-center justify-center bg-primary/10 text-primary text-2xl font-black">
                                         {selectedEditorDetail.displayName?.[0]}
                                     </div>
                                 )}
                             </div>
                             <div className="flex-1 space-y-2">
                                 <h2 className="text-2xl font-black text-white">{selectedEditorDetail.displayName}</h2>
                                 <div className="flex items-center gap-3">
                                     <span className="px-2 py-0.5 bg-primary/10 text-primary border border-primary/20 rounded text-[9px] font-bold uppercase tracking-widest">Authorized Editor</span>
                                     <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Member for {Math.floor((Date.now() - (selectedEditorDetail.createdAt || Date.now())) / (1000 * 60 * 60 * 24))} Days</span>
                                 </div>
                                 <div className="flex gap-4 pt-2">
                                     <div className="text-center">
                                         <div className="text-lg font-black text-white">{projects.filter(p => p.assignedEditorId === selectedEditorDetail.uid && p.status === 'completed').length}</div>
                                         <div className="text-[8px] font-bold text-zinc-600 uppercase tracking-widest">Done</div>
                                     </div>
                                     <div className="text-center">
                                         <div className="text-lg font-black text-primary">₹{(selectedEditorDetail.income || 0).toLocaleString()}</div>
                                         <div className="text-[8px] font-bold text-zinc-600 uppercase tracking-widest">Earnings</div>
                                     </div>
                                     <div className="text-center">
                                         <div className="text-lg font-black text-white">{selectedEditorDetail.rating || '—'}</div>
                                         <div className="text-[8px] font-bold text-zinc-600 uppercase tracking-widest">Rating</div>
                                     </div>
                                 </div>
                             </div>
                         </div>

                         <div className="space-y-4">
                             <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                                 <MonitorPlay className="h-3 w-3 text-primary" /> Showcase Portfolio
                             </h4>
                             <div className="grid grid-cols-2 gap-3">
                                 {selectedEditorDetail.portfolio?.map((item, i) => (
                                     <a key={i} href={item.url} target="_blank" className="p-3 bg-white/[0.02] border border-white/5 rounded-xl flex items-center justify-between group/link">
                                         <span className="text-[11px] font-bold text-zinc-300 group-hover:text-white transition-colors">{item.name}</span>
                                         <ExternalLink className="h-3 w-3 text-zinc-700" />
                                     </a>
                                 )) || (
                                     <div className="col-span-2 py-10 border border-dashed border-white/5 rounded-2xl text-center text-zinc-700 text-[10px] font-bold uppercase tracking-widest">No Showcase Items Ingested</div>
                                 )}
                             </div>
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
                        <Label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Editor Revenue Share (₹)</Label>
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
                                        ? "bg-emerald-500 text-white shadow-[0_0_15px_rgba(16,185,129,0.3)]" 
                                        : "bg-zinc-800 text-zinc-400 border border-zinc-700 hover:text-white"
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
                title={`Project Status Dashboard: ${inspectProject?.name}`}
                maxWidth="max-w-4xl"
            >
                {inspectProject && (
                    <div className="mt-8 space-y-10 max-h-[75vh] overflow-y-auto pr-4 custom-scrollbar">
                        {/* Header Spec */}
                        <div className="flex flex-col gap-6">
                            <div className="flex items-center gap-6">
                                <div className="h-12 w-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                                    <MonitorPlay className="h-6 w-6" />
                                </div>
                                <div>
                                    <h4 className="text-xl font-bold text-white tracking-tight">{inspectProject.name}</h4>
                                    <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mt-1">Management Overview // Ref: {inspectProject.id}</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                                <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5 space-y-2.5 group hover:border-primary/20 transition-all">
                                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Total Price</span>
                                    <div className="text-2xl font-black text-white tabular-nums tracking-tight">₹{inspectProject.totalCost?.toLocaleString()}</div>
                                </div>
                                <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5 space-y-2.5 group hover:border-emerald-500/20 transition-all">
                                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Editor Share</span>
                                    <div className="text-2xl font-black text-emerald-500 tabular-nums tracking-tight">₹{inspectProject.editorPrice?.toLocaleString() || '0'}</div>
                                </div>
                                <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5 space-y-2.5 group transition-all">
                                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">AutoPay</span>
                                    <div className={cn("text-sm font-black uppercase tracking-widest", inspectProject.autoPay ? "text-primary drop-shadow-[0_0_8px_rgba(99,102,241,0.4)]" : "text-zinc-600")}>
                                        {inspectProject.autoPay ? 'Authorized' : 'Disabled'}
                                    </div>
                                </div>
                                <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5 space-y-2.5 group transition-all">
                                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Assigned PM</span>
                                    <div className="text-[13px] font-bold text-zinc-300 truncate tracking-tight group-hover:text-white transition-colors">
                                        {users.find((u: any) => u.uid === inspectProject.assignedPMId)?.displayName || 'Unassigned'}
                                    </div>
                                </div>
                            </div>
                            
                            {inspectProject.assignmentStatus === 'rejected' && inspectProject.editorDeclineReason && (
                                <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 space-y-2 mt-4">
                                    <div className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-2">
                                        <AlertCircle className="h-4 w-4 text-red-400" /> Editor Decline Reason
                                    </div>
                                    <p className="text-xs text-red-400/90 font-medium italic">“{inspectProject.editorDeclineReason}”</p>
                                </div>
                            )}
                        </div>

                        {/* Timeline Data */}
                        <div className="space-y-6">
                            <div className="flex items-center gap-2.5">
                                <Activity className="h-4 w-4 text-primary" />
                                <h5 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">Project Event History</h5>
                            </div>

                            <div className="relative space-y-8 pl-8 before:absolute before:left-3 before:top-2 before:bottom-2 before:w-px before:bg-white/5">
                                {inspectProject.logs && inspectProject.logs.length > 0 ? (
                                    [...inspectProject.logs].reverse().map((log: any, i) => (
                                        <div key={i} className="relative group">
                                            <div className="absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full bg-zinc-800 border border-zinc-700 group-hover:bg-primary group-hover:border-primary transition-all z-10" />
                                            <div className="space-y-1">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[10px] font-black text-white uppercase tracking-widest">{log.event.replace('_', ' ')}</span>
                                                    <span className="text-[9px] font-bold text-zinc-600 tabular-nums">{new Date(log.timestamp).toLocaleString()}</span>
                                                </div>
                                                <p className="text-xs text-zinc-400 font-medium leading-relaxed">{log.details}</p>
                                                <div className="flex flex-col gap-1 text-[9px] font-bold text-zinc-600 uppercase tracking-widest pt-1">
                                                    <div className="flex items-center gap-2">
                                                        <span>Performed By:</span>
                                                        <span className="text-zinc-500">{log.userName}</span>
                                                    </div>
                                                    {(log as any).designation && (
                                                        <div className="flex items-center gap-2">
                                                            <span>Designation:</span>
                                                            <span className="text-zinc-500">{(log as any).designation}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="py-12 flex flex-col items-center justify-center border border-dashed border-white/5 rounded-2xl opacity-30 gap-4">
                                        <Database className="h-8 w-8 text-zinc-600" />
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">No activity history available</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
}

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
        completed: { label: "ARCHIVED", color: "text-zinc-500", bg: "bg-zinc-500/5", border: "border-zinc-500/20" },
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
