"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { useAuth } from "@/lib/context/auth-context";
import { db } from "@/lib/firebase/config";
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc } from "firebase/firestore";
import { Project } from "@/types/schema";
import { cn } from "@/lib/utils";
import { 
    Clock, 
    CheckCircle2, 
    AlertCircle, 
    Search, 
    Filter, 
    Zap,
    IndianRupee,
    ArrowUpRight,
    ArrowDownLeft,
    MoreHorizontal,
    FileText,
    Upload,
    Eye,
    Briefcase,
    Calendar,
    RefreshCw,
    Plus,
    User as UserIcon,
    ChevronDown,
    Activity,
    Monitor,
    Layers,
    Play,
    Cpu,
    Terminal,
    Star
} from "lucide-react";
import { 
    DropdownMenu, 
    DropdownMenuContent, 
    DropdownMenuItem, 
    DropdownMenuTrigger,
    DropdownMenuSeparator,
    DropdownMenuLabel 
} from "@/components/ui/dropdown-menu";

import { toast } from "sonner";
import { respondToAssignment } from "@/app/actions/admin-actions";
import { motion, AnimatePresence } from "framer-motion";
import { EditorPerformance } from "./editor-performance";

export function EditorDashboard() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [mainTab, setMainTab] = useState<'tasks' | 'performance'>('tasks');
  const [activeTab, setActiveTab] = useState<'all' | 'todo' | 'review' | 'completed'>('all');
  const [searchQuery, setSearchQuery] = useState("");
  const [userData, setUserData] = useState<any>(null);

  // Timer logic for assignments
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000); 
    return () => clearInterval(interval);
  }, []);

  const handleResponse = async (projectId: string, response: 'accepted' | 'rejected') => {
      let reason: string | undefined;
      if (response === 'rejected') {
          const promptReason = window.prompt("Why are you declining this project? (Required)");
          if (!promptReason) {
              toast.error("Declination cancelled: A reason is required.");
              return;
          }
          reason = promptReason;
      }
      const res = await respondToAssignment(projectId, response, reason);
      if (res.success) toast.success(`Assignment: ${response}`);
      else toast.error(res.error);
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
    }, (error) => {
        setLoading(false);
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
  const todoProjects = projects.filter(p => p.status === 'active' || (p.status === 'pending_assignment' && p.assignedEditorId === user?.uid));
  const reviewProjects = projects.filter(p => p.status === 'in_review');
  const completedProjects = projects.filter(p => ['completed', 'approved'].includes(p.status));
  const totalEarnings = completedProjects.reduce((acc, curr) => acc + (curr.editorPrice || 0), 0);
  const ratedProjects = projects.filter(p => p.editorRating);
  const averageRating = ratedProjects.length > 0
    ? ratedProjects.reduce((acc, curr) => acc + (curr.editorRating || 0), 0) / ratedProjects.length
    : 0;

  const filteredProjects = projects.filter(project => {
      if (activeTab === 'todo' && !['active', 'pending_assignment'].includes(project.status)) return false;
      if (activeTab === 'review' && project.status !== 'in_review') return false;
      if (activeTab === 'completed' && !['completed', 'approved'].includes(project.status)) return false;
      if (searchQuery && !project.name.toLowerCase().includes(searchQuery.toLowerCase()) && !project.id.includes(searchQuery)) return false;
      return true;
  });

  const editorStatus = userData?.availabilityStatus || 'offline';

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

  // Advanced Stats Calculation
  const isToday = (timestamp: number) => {
      const d = new Date(timestamp);
      const today = new Date();
      return d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
  };

  const isWithinDays = (timestamp: number, days: number) => {
      const ms = days * 24 * 60 * 60 * 1000;
      return Date.now() - timestamp < ms;
  };

  const earningsToday = completedProjects.filter(p => p.completedAt && isToday(p.completedAt)).reduce((acc, p) => acc + (p.editorPrice || 0), 0);
  const earnings7Days = completedProjects.filter(p => p.completedAt && isWithinDays(p.completedAt, 7)).reduce((acc, p) => acc + (p.editorPrice || 0), 0);
  const earnings30Days = completedProjects.filter(p => p.completedAt && isWithinDays(p.completedAt, 30)).reduce((acc, p) => acc + (p.editorPrice || 0), 0);
  const pendingEarnings = projects.filter(p => ['completed', 'approved'].includes(p.status) && !p.editorPaid).reduce((acc, p) => acc + (p.editorPrice || 0), 0);

  const projectsToday = projects.filter(p => isToday(p.createdAt)).length;
  const projects7Days = projects.filter(p => isWithinDays(p.createdAt, 7)).length;
  const projects30Days = projects.filter(p => isWithinDays(p.createdAt, 30)).length;
  const totalRevisions = projects.reduce((acc, p) => acc + (p.revisionsCount || 0), 0);
  
  const completedWithTime = completedProjects.filter(p => p.completedAt && p.assignmentAt);
  const avgDeliveryTimeMs = completedWithTime.length > 0
    ? completedWithTime.reduce((acc, p) => acc + (p.completedAt! - p.assignmentAt!), 0) / completedWithTime.length
    : 0;
  const avgDeliveryTimeHrs = Math.round(avgDeliveryTimeMs / (1000 * 60 * 60));

  return (
    <div className="space-y-10 max-w-[1600px] mx-auto pb-20 pt-4">
       {/* Header Section */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8 pb-10 border-b border-border relative">
            <div className="absolute -bottom-px left-0 w-32 h-px bg-primary shadow-[0_0_15px_rgba(99,102,241,0.5)]" />
            
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-4"
            >
                <div className="flex items-center gap-3">
                    <div className={cn("flex flex-col md:flex-row md:items-center gap-6 pt-2")}>
                         <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                             <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                             <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">Network Node: Active</span>
                         </div>
                         <div className="hidden md:block h-4 w-px bg-card" />
                         <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest font-mono hidden md:inline">Editor Protocol v4.2.0</span>
                         
                         <div className="relative md:border-l md:border-border md:pl-6 flex items-center">
                             <div className={cn(
                                 "h-2 w-2 rounded-full mr-2",
                                 editorStatus === 'online' ? "bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]" :
                                 editorStatus === 'sleep' ? "bg-yellow-500" : "bg-red-500"
                             )} />
                             <select 
                                 value={editorStatus}
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
                </div>
                
                <div className="space-y-1">
                    <h1 className="text-5xl md:text-6xl font-heading font-black tracking-tighter text-foreground leading-none">
                        Editor <span className="text-muted-foreground">Dashboard</span>
                    </h1>
                    <p className="text-muted-foreground text-sm font-medium tracking-tight">System synchronization complete. Welcome back, {user?.displayName}.</p>
                </div>
            </motion.div>
            
            <motion.div 
               initial={{ opacity: 0, x: 20 }}
               animate={{ opacity: 1, x: 0 }}
               className="flex flex-wrap items-center gap-3"
            >
                 <div className="flex bg-muted/50 border border-border rounded-lg p-1">
                     <button
                         onClick={() => setMainTab('tasks')}
                         className={cn(
                             "px-5 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-md transition-all",
                             mainTab === 'tasks' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                         )}
                     >
                         Tasks
                     </button>
                     <button
                         onClick={() => setMainTab('performance')}
                         className={cn(
                             "px-5 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-md transition-all",
                             mainTab === 'performance' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                         )}
                     >
                         Performance & Profile
                     </button>
                 </div>
                 <button className="h-10 px-5 rounded-lg bg-muted border border-border flex items-center gap-2.5 text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-all active:scale-95 text-[11px] font-bold uppercase tracking-widest ml-2">
                    <FileText className="h-3.5 w-3.5" />
                    Guidelines
                </button>
            </motion.div>
       </div>

       {mainTab === 'tasks' ? (
        <>
            {/* Statistics Grid */}
       <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
             <IndicatorCard 
                label="Project Invitations" 
                value={todoProjects.filter(p => p.assignmentStatus === 'pending').length} 
                alert={todoProjects.filter(p => p.assignmentStatus === 'pending').length > 0}
                icon={<Cpu className="h-4 w-4" />}
                subtext="Needs your response"
            />
            <IndicatorCard 
                label="Pending Payment" 
                value={`₹${pendingEarnings.toLocaleString()}`} 
                icon={<Clock className="h-4 w-4" />}
                subtext="Unlocked earnings"
                alert={pendingEarnings > 0}
            />
            <IndicatorCard 
                label="Total Earnings" 
                value={`₹${totalEarnings.toLocaleString()}`} 
                icon={<IndianRupee className="h-4 w-4" />}
                subtext="All time income"
            />
             <IndicatorCard 
                label="Today's Yield" 
                value={`₹${earningsToday.toLocaleString()}`} 
                icon={<Zap className="h-4 w-4 text-amber-500" />}
                subtext={`Projects Today: ${projectsToday}`}
                trend={`7d: ₹${earnings7Days.toLocaleString()}`}
                trendUp={earningsToday > 0}
            />
            <IndicatorCard 
                label="Workflow Stats" 
                value={`${completedProjects.length}`} 
                icon={<Layers className="h-4 w-4" />}
                subtext={`Avg Time: ${avgDeliveryTimeHrs}h`}
                trend={`Revs: ${totalRevisions}`}
                trendUp={true}
            />
       </div>

       {/* Task Matrix */}
        <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="enterprise-card bg-zinc-900/40 backdrop-blur-md overflow-hidden border-border shadow-2xl"
       >
            <div className="p-8 border-b border-border flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6 w-full lg:w-auto">
                    <div className="relative w-full sm:w-80">
                         <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                         <input 
                            type="text" 
                            placeholder="Filter by Project Name or ID..." 
                            className="h-11 w-full rounded-xl border border-border bg-black/5 dark:bg-black/40 pl-11 pr-4 text-sm font-medium text-foreground focus:bg-black/5 dark:bg-black/40 focus:border-primary/50 focus:outline-none transition-all placeholder:text-muted-foreground shadow-inner"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                         />
                    </div>
                    
                    <div className="flex bg-black/5 dark:bg-black/40 border border-border rounded-xl p-1 shadow-inner">
                        {[
                            { id: 'all', label: 'Global' },
                            { id: 'todo', label: 'Active' },
                            { id: 'review', label: 'Review' },
                            { id: 'completed', label: 'Archive' }
                        ].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as any)}
                                className={cn(
                                    "px-6 py-2 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all",
                                    activeTab === tab.id 
                                        ? "bg-primary  text-primary-foreground shadow-[0_0_20px_rgba(255,255,255,0.15)] scale-[1.02]" 
                                        : "text-muted-foreground hover:text-foreground/80"
                                )}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mr-2">{filteredProjects.length} Tasks Found</div>
                    <button className="h-11 px-5 rounded-xl border border-border bg-muted/50 text-[11px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all flex items-center gap-2.5">
                        <Filter className="h-4 w-4" />
                        Advanced Sort
                    </button>
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-black/5 dark:bg-black/40">
                            <th className="px-8 py-5 text-[11px] font-black text-muted-foreground uppercase tracking-[0.2em] border-b border-border">Project Specifications</th>
                            <th className="px-8 py-5 text-[11px] font-black text-muted-foreground uppercase tracking-[0.2em] border-b border-border">Operation Status</th>
                            <th className="px-8 py-5 text-[11px] font-black text-muted-foreground uppercase tracking-[0.2em] border-b border-border">Client Entity</th>
                            <th className="px-8 py-5 text-[11px] font-black text-muted-foreground uppercase tracking-[0.2em] border-b border-border">Timeline Target</th>
                            <th className="px-8 py-5 text-[11px] font-black text-muted-foreground uppercase tracking-[0.2em] border-b border-border text-right">Revenue Share</th>
                            <th className="px-8 py-5 border-b border-border w-[100px]"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                         <AnimatePresence mode="wait">
                         {loading ? (
                            <tr key="loading">
                                <td colSpan={6} className="px-6 py-24 text-center">
                                    <div className="flex flex-col items-center gap-4">
                                        <RefreshCw className="h-6 w-6 text-primary animate-spin" />
                                        <p className="text-xs font-medium text-muted-foreground animate-pulse">Updating your tasks...</p>
                                    </div>
                                </td>
                            </tr>
                        ) : filteredProjects.length === 0 ? (
                            <tr key="empty">
                                <td colSpan={6} className="px-6 py-24 text-center">
                                    <div className="flex flex-col items-center gap-4 opacity-40">
                                        <Layers className="h-12 w-12 text-muted-foreground" />
                                        <p className="text-sm font-medium text-muted-foreground">No projects found in this category.</p>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            filteredProjects.map((project, idx) => {
                                // @ts-ignore
                                const deadline = project.deadline ? new Date(project.deadline) : null;
                                const isUrgent = deadline ? (deadline.getTime() - Date.now() < 172800000) : false;

                                return (
                                    <motion.tr 
                                        key={project.id}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: idx * 0.03 }}
                                        className="group hover:bg-muted/50 transition-colors"
                                    >
                                        <td className="px-8 py-6">
                                            <div className="flex flex-col gap-1.5">
                                                <div className="flex items-center gap-3">
                                                    <span className="text-sm font-black text-foreground group-hover:text-primary transition-colors tracking-tight">
                                                        {project.name}
                                                    </span>
                                                    {isUrgent && (
                                                        <span className="px-2 py-0.5 rounded-md bg-red-500/10 border border-red-500/20 text-[8px] font-black text-red-500 uppercase tracking-widest animate-pulse">
                                                            CRITICAL_TIMELINE
                                                        </span>
                                                    )}
                                                </div>
                                                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                                                    ID: {project.id.slice(0, 8)}...
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-8 py-6">
                                            <div className="flex items-center gap-4">
                                                {project.assignmentStatus === 'pending' ? (
                                                    <div className="flex flex-col gap-3">
                                                       <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.1)] animate-pulse">
                                                          <div className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                                                          <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest">Action Required</span>
                                                       </div>
                                                       <div className="flex gap-2">
                                                            <button 
                                                                onClick={(e) => { e.stopPropagation(); handleResponse(project.id, 'accepted'); }}
                                                                className="h-8 px-4 rounded-lg bg-primary  text-primary-foreground text-[9px] font-black uppercase tracking-widest hover:bg-zinc-200 transition-all shadow-lg"
                                                            >
                                                                Accept
                                                            </button>
                                                            <button 
                                                                onClick={(e) => { e.stopPropagation(); handleResponse(project.id, 'rejected'); }}
                                                                className="h-8 px-4 rounded-lg bg-zinc-800 text-zinc-400 text-[9px] font-black uppercase tracking-widest hover:bg-red-500/10 hover:text-red-500 transition-all border border-border"
                                                            >
                                                                Decline
                                                            </button>
                                                       </div>
                                                    </div>
                                                ) : (
                                                    <StatusIndicator status={project.status} />
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-8 py-6">
                                            <div className="flex items-center gap-3">
                                                <div className="h-9 w-9 rounded-xl bg-card border border-border flex items-center justify-center text-muted-foreground font-bold group-hover:border-primary/30 group-hover:text-primary transition-all">
                                                    {(project.clientName || project.brand || 'U')[0]}
                                                </div>
                                                <span className="text-[11px] font-black text-foreground/80 group-hover:text-foreground transition-colors uppercase tracking-widest">
                                                    {project.clientName || project.brand || 'Unknown Client'}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-8 py-6">
                                            <div className="flex items-center gap-3">
                                                <div className={cn(
                                                    "h-8 w-8 rounded-lg flex items-center justify-center border",
                                                    isUrgent ? "bg-red-500/10 border-red-500/20 text-red-500" : "bg-card border-border text-muted-foreground"
                                                )}>
                                                    <Calendar className="h-3.5 w-3.5" />
                                                </div>
                                                <span className={cn(
                                                    "text-[11px] font-black uppercase tracking-widest",
                                                    isUrgent ? "text-red-400" : "text-muted-foreground"
                                                )}>
                                                    {project.deadline || 'NO_LIMIT'}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-8 py-6 text-right">
                                            <div className="flex flex-col items-end gap-1">
                                                <span className="text-lg font-black font-heading text-foreground tracking-tighter leading-none">
                                                    ₹{project.editorPrice?.toLocaleString() || '0'}
                                                </span>
                                                <span className="text-[9px] font-bold text-emerald-500/70 uppercase tracking-widest">Secured</span>
                                            </div>
                                        </td>
                                        <td className="px-8 py-6 text-right">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <button className="h-10 w-10 flex items-center justify-center rounded-xl hover:bg-card text-muted-foreground transition-all">
                                                        <MoreHorizontal className="h-5 w-5" />
                                                    </button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="w-56 bg-zinc-900 border-border p-2 shadow-2xl rounded-2xl">
                                                    <DropdownMenuLabel className="text-[9px] font-black text-muted-foreground uppercase tracking-[0.2em] px-3 py-2">Operation Menu</DropdownMenuLabel>
                                                    <DropdownMenuSeparator className="bg-card" />
                                                    <Link href={`/dashboard/projects/${project.id}`}>
                                                        <DropdownMenuItem className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer focus:bg-primary/10 transition-colors">
                                                            <div className="h-8 w-8 rounded-lg bg-card flex items-center justify-center">
                                                                <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                                                            </div>
                                                            <span className="text-[11px] font-bold text-foreground/80 uppercase tracking-widest">
                                                                {['completed', 'approved'].includes(project.status) ? "Inspect History" : "View Work"}
                                                            </span>
                                                        </DropdownMenuItem>
                                                    </Link>
                                                    {!['completed', 'approved'].includes(project.status) && (
                                                        <Link href={`/dashboard/projects/${project.id}/upload`}>
                                                            <DropdownMenuItem className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer focus:bg-primary/10 transition-colors">
                                                                <div className="h-8 w-8 rounded-lg bg-card flex items-center justify-center">
                                                                    <Upload className="h-3.5 w-3.5 text-muted-foreground" />
                                                                </div>
                                                                <span className="text-[11px] font-bold text-foreground/80 uppercase tracking-widest">Handover Draft</span>
                                                            </DropdownMenuItem>
                                                        </Link>
                                                    )}
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </td>
                                    </motion.tr>
                                );
                            })
                        )}
                         </AnimatePresence>
                    </tbody>
                </table>
            </div>

            <div className="p-6 border-t border-border bg-muted/30 flex items-center justify-between">
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
                    Showing {filteredProjects.length} projects
                </span>
                <div className="flex items-center gap-2">
                    <button className="h-9 px-4 rounded-lg border border-border bg-muted/50 text-[10px] font-bold text-muted-foreground uppercase tracking-widest hover:text-foreground hover:bg-muted disabled:opacity-30 transition-all active:scale-[0.98]" disabled>Previous</button>
                    <button className="h-9 px-4 rounded-lg border border-border bg-muted/50 text-[10px] font-bold text-muted-foreground uppercase tracking-widest hover:text-foreground hover:bg-muted disabled:opacity-30 transition-all active:scale-[0.98]" disabled>Next</button>
                </div>
            </div>
       </motion.div>
       </>
       ) : (
           user && <EditorPerformance user={user} projects={completedProjects} />
       )}
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
                "group relative bg-zinc-900 shadow-2xl border border-border p-8 rounded-[2rem] transition-all duration-300",
                alert && "after:absolute after:inset-0 after:rounded-[2rem] after:ring-2 after:ring-primary/40 after:animate-pulse"
            )}
        >
            <div className="flex justify-between items-start mb-8">
                <div className="h-12 w-12 bg-background border border-border rounded-2xl flex items-center justify-center text-muted-foreground group-hover:text-primary group-hover:border-primary/30 transition-all duration-500 shadow-inner">
                    {icon}
                </div>
                {alert ? (
                    <div className="flex items-center gap-2 bg-primary/10 px-2 py-1 rounded-full border border-primary/20">
                        <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                        <span className="text-[9px] font-black text-primary uppercase tracking-tighter">Priority</span>
                    </div>
                ) : (
                    <div className="h-8 w-8 rounded-full bg-muted/50 border border-border flex items-center justify-center">
                        <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-muted-foreground transition-colors" />
                    </div>
                )}
            </div>
            
            <div className="space-y-2">
                <span className="text-[11px] uppercase font-black tracking-[0.2em] text-muted-foreground group-hover:text-foreground/80 transition-colors">{label}</span>
                <div className="flex flex-col">
                    <span className="text-4xl font-black tracking-tighter text-foreground font-heading tabular-nums leading-none">{value}</span>
                    <span className="text-muted-foreground text-[11px] font-bold uppercase tracking-wider mt-2 group-hover:text-muted-foreground transition-colors">{subtext}</span>
                </div>
                
                {trend && (
                    <div className="pt-6 mt-6 border-t border-border flex flex-col items-end gap-2">
                        <div className={cn(
                            "flex items-center gap-1.5 px-3 py-1.5 rounded-xl shadow-sm border",
                            trendUp ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : "bg-muted/10 border-border text-muted-foreground"
                        )}>
                             {trendUp ? <ArrowUpRight className="h-3.5 w-3.5" /> : <Zap className="h-3.5 w-3.5" />}
                             <span className="text-[11px] font-black uppercase tracking-tight">{trend}</span>
                        </div>
                        <span className="text-[9px] font-black text-muted-foreground uppercase tracking-[0.2em] px-1 group-hover:text-muted-foreground transition-colors">Performance Trend</span>
                    </div>
                )}
            </div>
        </motion.div>
    );
}

function StatusIndicator({ status }: { status: string }) {
    const config: any = {
        active: { label: "Production", color: "text-blue-400", bg: "bg-blue-400/10", border: "border-blue-400/20", glow: "shadow-[0_0_15px_rgba(96,165,250,0.3)]" },
        in_review: { label: "QA Cycle", color: "text-purple-400", bg: "bg-purple-400/10", border: "border-purple-400/20", glow: "shadow-[0_0_15px_rgba(192,132,252,0.3)]" },
        pending_assignment: { label: "Invitation", color: "text-amber-400", bg: "bg-amber-400/10", border: "border-amber-400/20", glow: "shadow-[0_0_15px_rgba(251,191,36,0.3)]" },
        approved: { label: "Authorized", color: "text-emerald-400", bg: "bg-emerald-400/10", border: "border-emerald-400/20", glow: "shadow-[0_0_15px_rgba(52,211,153,0.3)]" },
        completed: { label: "Completed", color: "text-muted-foreground", bg: "bg-muted/20", border: "border-border", glow: "" },
    };
    const s = config[status] || config.completed;
    return (
        <span className={cn(
            "inline-flex items-center gap-2.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.15em] border transition-all duration-300", 
            s.bg, s.color, s.border, s.glow
        )}>
            <div className={cn("w-1.5 h-1.5 rounded-full bg-current", (status === 'active' || status === 'in_review') && "animate-pulse")} />
            {s.label}
        </span>
    );
}
