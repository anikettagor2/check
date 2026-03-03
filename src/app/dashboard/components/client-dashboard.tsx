"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/context/auth-context";
import { db } from "@/lib/firebase/config";
import { collection, query, where, onSnapshot, orderBy } from "firebase/firestore";
import { Project } from "@/types/schema";
import { cn } from "@/lib/utils";
import { 
    Plus, 
    Search, 
    Filter,
    Calendar,
    Briefcase,
    IndianRupee,
    MoreHorizontal,
    FileText,
    Download,
    Eye,
    ChevronDown,
    ArrowUpRight,
    ArrowDownLeft,
    CheckCircle2,
    AlertCircle,
    Clock,
    User as UserIcon,
    RefreshCw,
    Activity,
    Monitor,
    Layers,
    Play,
    Terminal,
    Zap,
    Cpu
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { 
    DropdownMenu, 
    DropdownMenuContent, 
    DropdownMenuItem, 
    DropdownMenuTrigger,
    DropdownMenuSeparator, 
    DropdownMenuLabel 
} from "@/components/ui/dropdown-menu";
import { motion, AnimatePresence } from "framer-motion";

export function ClientDashboard() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  useEffect(() => {
    if (!user?.uid) return;
    setLoading(true);

    const q = query(
      collection(db, "projects"),
      where("clientId", "==", user.uid),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Project));
      setProjects(items);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const filteredProjects = projects.filter(project => {
      if (statusFilter !== 'all' && project.status !== statusFilter) return false;
      if (searchQuery && !project.name.toLowerCase().includes(searchQuery.toLowerCase()) && !project.id.includes(searchQuery)) return false;
      return true;
  });

  const activeCount = projects.filter(p => ['active', 'in_review'].includes(p.status)).length;
  const totalSpent = projects.reduce((acc, curr) => acc + (curr.totalCost || 0), 0);

  return (
    <div className="space-y-10 max-w-[1600px] mx-auto pb-20 pt-4">
       {/* Header Section */}
       <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8 pb-8 border-b border-border">
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-2"
            >
                <div className="flex items-center gap-2 mb-2">
                    <div className="px-2 py-0.5 rounded bg-primary/10 border border-primary/20">
                        <span className="text-[10px] font-bold text-primary uppercase tracking-widest">Customer Hub</span>
                    </div>
                </div>
                <h1 className="text-4xl md:text-5xl font-heading font-bold tracking-tight text-foreground leading-tight">My <span className="text-muted-foreground">Projects</span></h1>
                <div className="flex items-center gap-6 pt-2">
                    <div className="flex items-center gap-2 text-muted-foreground">
                        <UserIcon className="h-3.5 w-3.5" />
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Welcome, {user?.displayName?.split(' ')[0]}</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                        <Calendar className="h-3.5 w-3.5" />
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Account Active</span>
                    </div>
                </div>
            </motion.div>
            
            <motion.div 
               initial={{ opacity: 0, x: 20 }}
               animate={{ opacity: 1, x: 0 }}
               className="flex flex-wrap items-center gap-3"
            >
                <Link href="/dashboard/projects/new">
                    <button className="h-10 px-6 rounded-lg bg-white text-black text-[11px] font-bold uppercase tracking-widest hover:bg-zinc-200 transition-all active:scale-95 shadow-[0_0_20px_rgba(255,255,255,0.1)] flex items-center gap-2.5">
                        <Plus className="h-4 w-4" />
                        New Project
                    </button>
                </Link>
            </motion.div>
       </div>

       {/* Summary Cards */}
       <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <IndicatorCard 
                label="Active Projects" 
                value={activeCount} 
                icon={<Activity className="h-4 w-4" />}
                subtext="Work in progress"
                trend="+2 this month"
                trendUp={true}
            />
            <IndicatorCard 
                label="Total Investment" 
                value={`₹${totalSpent.toLocaleString()}`} 
                icon={<IndianRupee className="h-4 w-4" />}
                subtext="Investment in video content"
            />
            <IndicatorCard 
                label="Pending Review" 
                value={projects.filter(p => p.status === 'in_review').length} 
                icon={<Eye className="h-4 w-4" />}
                subtext="Editor is waiting for your thoughts"
                alert={projects.filter(p => p.status === 'in_review').length > 0}
            />
             <IndicatorCard 
                label="Total Projects" 
                value={projects.length} 
                icon={<Layers className="h-4 w-4" />}
                subtext="Project history"
            />
       </div>

       {/* Main Content Area */}
       <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="enterprise-card bg-muted/30 backdrop-blur-sm overflow-hidden"
       >
            <div className="p-6 border-b border-border/50 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full">
                    <div className="relative w-full sm:w-80">
                         <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground transition-colors" />
                         <input 
                            type="text" 
                            placeholder="Search projects..." 
                            className="h-10 w-full rounded-lg border border-border bg-muted/50 pl-11 pr-4 text-sm text-foreground focus:bg-background focus:border-primary/50 focus:outline-none transition-all placeholder:text-muted-foreground"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                         />
                    </div>
                    
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button className="h-10 px-5 rounded-lg bg-muted border border-border text-[11px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-all flex items-center gap-2.5">
                                <Filter className="h-3.5 w-3.5" />
                                {statusFilter === 'all' ? 'All Status' : statusFilter.replace('_', ' ').toUpperCase()}
                                <ChevronDown className="h-3 w-3 ml-1 opacity-50" />
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-56 bg-popover border-border p-1.5 rounded-xl shadow-2xl">
                            <DropdownMenuLabel className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-3 py-2">Filter Status</DropdownMenuLabel>
                            <DropdownMenuSeparator className="my-1 bg-border" />
                            <DropdownMenuItem className="p-2.5 text-xs text-popover-foreground hover:bg-muted transition-colors cursor-pointer rounded-lg" onClick={() => setStatusFilter('all')}>All Projects</DropdownMenuItem>
                            <DropdownMenuItem className="p-2.5 text-xs text-popover-foreground hover:bg-muted transition-colors cursor-pointer rounded-lg" onClick={() => setStatusFilter('active')}>Active</DropdownMenuItem>
                            <DropdownMenuItem className="p-2.5 text-xs text-popover-foreground hover:bg-muted transition-colors cursor-pointer rounded-lg" onClick={() => setStatusFilter('in_review')}>In Review</DropdownMenuItem>
                            <DropdownMenuItem className="p-2.5 text-xs text-popover-foreground hover:bg-muted transition-colors cursor-pointer rounded-lg" onClick={() => setStatusFilter('completed')}>Completed</DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

            <div className="overflow-x-auto overflow-y-hidden">
                <table className="w-full text-left">
                    <thead>
                        <tr className="bg-muted/30">
                            <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-widest border-b border-border">Project</th>
                            <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-widest border-b border-border">Status</th>
                            <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-widest border-b border-border">Due Date</th>
                            <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-widest border-b border-border text-right">Value</th>
                            <th className="px-6 py-4 border-b border-border w-[80px]"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                         <AnimatePresence mode="wait">
                         {loading ? (
                            <tr key="loading">
                                <td colSpan={5} className="px-6 py-24 text-center">
                                    <div className="flex flex-col items-center gap-4">
                                        <RefreshCw className="h-6 w-6 text-primary animate-spin" />
                                        <p className="text-xs font-medium text-zinc-500 animate-pulse">Updating your projects...</p>
                                    </div>
                                </td>
                            </tr>
                         ) : filteredProjects.length === 0 ? (
                            <tr key="empty">
                                <td colSpan={5} className="px-6 py-24 text-center">
                                    <div className="flex flex-col items-center gap-4 opacity-40">
                                        <Layers className="h-12 w-12 text-muted-foreground" />
                                        <p className="text-sm font-medium text-muted-foreground">You haven't started any projects yet.</p>
                                    </div>
                                </td>
                            </tr>
                         ) : (
                            filteredProjects.map((project, idx) => (
                                <motion.tr 
                                    key={project.id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: idx * 0.05 }}
                                    className="group hover:bg-muted/10 transition-all duration-200"
                                >
                                    <td className="px-6 py-6 transition-colors">
                                        <div className="flex flex-col">
                                            <Link href={`/dashboard/projects/${project.id}`} className="text-sm font-bold text-foreground hover:text-primary transition-colors tracking-tight leading-tight">
                                                {project.name}
                                            </Link>
                                            <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mt-1 opacity-60">ID: {project.id.slice(0,8)}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-6 transition-colors">
                                        <StatusIndicator status={project.status} />
                                    </td>
                                    <td className="px-6 py-6 transition-colors">
                                        <div className="flex items-center gap-2 text-muted-foreground">
                                            <Clock className="h-3.5 w-3.5" />
                                            <span className="text-[11px] font-bold uppercase tracking-tight">
                                                {project.deadline ? new Date(project.deadline).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }) : "Not Set"}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-6 text-right transition-colors">
                                        <span className="text-sm font-black text-foreground tracking-tighter tabular-nums">₹{project.totalCost?.toLocaleString() || '0'}</span>
                                    </td>
                                    <td className="px-6 py-6 text-right transition-colors">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <button className="h-8 w-8 rounded-lg bg-muted border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-all active:scale-90">
                                                    <MoreHorizontal className="h-4 w-4" />
                                                </button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="w-52 bg-popover border-border p-1.5 rounded-xl shadow-2xl">
                                                <DropdownMenuLabel className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-3 py-2">Options</DropdownMenuLabel>
                                                <DropdownMenuSeparator className="my-1 bg-border" />
                                                <DropdownMenuItem asChild className="p-2.5 text-xs text-popover-foreground hover:bg-muted transition-colors cursor-pointer rounded-lg">
                                                    <Link href={`/dashboard/projects/${project.id}`} className="flex items-center gap-3 w-full">
                                                        <Eye className="h-4 w-4" /> <span>View Details</span>
                                                    </Link>
                                                </DropdownMenuItem>
                                                <DropdownMenuItem className="p-2.5 text-xs text-muted-foreground cursor-not-allowed rounded-lg">
                                                    <FileText className="h-4 w-4" /> <span>Download Invoice (Coming Soon)</span>
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </td>
                                </motion.tr>
                            ))
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
                    <button className="h-9 px-4 rounded-lg border border-border bg-muted text-[10px] font-bold text-muted-foreground uppercase tracking-widest hover:text-foreground hover:bg-muted/80 disabled:opacity-30 transition-all active:scale-95" disabled>Previous</button>
                    <button className="h-9 px-4 rounded-lg border border-border bg-muted text-[10px] font-bold text-muted-foreground uppercase tracking-widest hover:text-foreground hover:bg-muted/80 disabled:opacity-30 transition-all active:scale-95" disabled>Next</button>
                </div>
            </div>
       </motion.div>
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
        active: { label: "Being Edited", color: "text-blue-400", bg: "bg-blue-400/5", border: "border-blue-400/20" },
        in_review: { label: "Ready for Review", color: "text-purple-400", bg: "bg-purple-400/5", border: "border-purple-400/20" },
        pending_assignment: { label: "Finding an Editor", color: "text-amber-400", bg: "bg-amber-400/5", border: "border-amber-400/20" },
        approved: { label: "Approved", color: "text-emerald-400", bg: "bg-emerald-400/5", border: "border-emerald-400/20" },
        completed: { label: "Completed", color: "text-zinc-500", bg: "bg-zinc-500/5", border: "border-zinc-500/20" },
    };
    const s = config[status] || config.completed;
    return (
        <span className={cn(
            "inline-flex items-center gap-2 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border shadow-sm transition-all", 
            s.bg, s.color, s.border
        )}>
            <div className={cn("w-1 h-1 rounded-full bg-current", status === 'active' && "animate-pulse shadow-[0_0_5px_currentColor]")} />
            {s.label}
        </span>
    );
}
