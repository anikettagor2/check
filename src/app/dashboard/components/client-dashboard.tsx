"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/context/auth-context";
import { db } from "@/lib/firebase/config";
import { collection, query, where, onSnapshot, orderBy, doc, getDoc } from "firebase/firestore";
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
    Cpu,
    CreditCard,
    PieChart,
    BarChart3,
    Timer,
    ShieldCheck
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
    const [activeTab, setActiveTab] = useState<'overview' | 'finance'>('overview');
    const [assignedPM, setAssignedPM] = useState<any>(null);

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

    useEffect(() => {
        if (user?.managedBy) {
            const pmRef = doc(db, "users", user.managedBy);
            getDoc(pmRef).then(snap => {
                if (snap.exists()) setAssignedPM({ uid: snap.id, ...snap.data() });
            });
        }
    }, [user?.managedBy]);

    const filteredProjects = projects.filter(project => {
        if (statusFilter !== 'all' && project.status !== statusFilter) return false;
        if (searchQuery && !project.name.toLowerCase().includes(searchQuery.toLowerCase()) && !project.id.includes(searchQuery)) return false;
        return true;
    });

    const totalRevenueGenerated = projects.reduce((acc, curr) => acc + (curr.totalCost || 0), 0);
    const totalPaidAmount = projects.reduce((acc, curr) => acc + (curr.amountPaid || 0), 0);
    const totalPendingPayment = totalRevenueGenerated - totalPaidAmount;
    const lifetimeValue = totalRevenueGenerated;
    
    const paidProjects = projects.filter(p => (p.amountPaid || 0) > 0);
    let lastPaymentDate = "N/A";
    if (paidProjects.length > 0) {
        const maxTime = Math.max(...paidProjects.map(p => p.updatedAt || p.createdAt || 0));
        if (maxTime > 0) lastPaymentDate = new Date(maxTime).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    const overdueProjects = projects.filter(p => (p.status === 'completed' || p.status === 'approved') && ((p.totalCost || 0) > (p.amountPaid || 0)));
    const overdueCount = overdueProjects.length;
    const paymentDelayAverage = overdueCount > 0 ? "2.5 Days" : "On Time";

    const creditLimit = user?.creditLimit || 5000;
    const isOverLimit = totalPendingPayment >= creditLimit && (user?.payLater || false);

    return (
        <div className="space-y-10 max-w-[1600px] mx-auto pb-20 pt-4">
           {isOverLimit && (
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
                           <h4 className="text-sm font-bold uppercase tracking-tight">Credit Limit Exceeded</h4>
                           <p className="text-[11px] font-medium opacity-80 uppercase tracking-widest mt-0.5">Your outstanding dues (₹{totalPendingPayment.toLocaleString()}) have exceeded your credit limit of ₹{creditLimit.toLocaleString()}. Please clear pending payments to continue.</p>
                       </div>
                   </div>
                   <Link href="/dashboard/finance">
                       <button className="px-4 py-2 bg-red-500 text-white rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-red-600 transition-all active:scale-95">Settle Now</button>
                   </Link>
               </motion.div>
           )}
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
                    <h1 className="text-4xl md:text-5xl font-heading font-bold tracking-tight text-foreground leading-tight">My <span className="text-muted-foreground">Portfolio</span></h1>
                    <div className="flex items-center gap-6 pt-2">
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <UserIcon className="h-3.5 w-3.5" />
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Authenticated: {user?.displayName}</span>
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
                        <button className="h-10 px-6 rounded-lg bg-primary  text-primary-foreground text-[11px] font-bold uppercase tracking-widest hover:bg-zinc-200 transition-all active:scale-95 shadow-md shadow-primary/10 flex items-center gap-2.5">
                            <Plus className="h-4 w-4" />
                            Launch Project
                        </button>
                    </Link>
                </motion.div>
           </div>
    
           {/* Tabs Navigation */}
           <div className="flex items-center gap-2 border-b border-border/50 pb-4">
                <button 
                    onClick={() => setActiveTab('overview')}
                    className={cn(
                        "px-5 py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-widest transition-all",
                        activeTab === 'overview' ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                    )}
                >
                    Overview
                </button>
                <button 
                    onClick={() => setActiveTab('finance')}
                    className={cn(
                        "px-5 py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-widest transition-all flex items-center gap-2",
                        activeTab === 'finance' ? "bg-emerald-500 text-white shadow-sm" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                    )}
                >
                    <CreditCard className="h-3.5 w-3.5" /> Finance
                </button>
           </div>
    
           {activeTab === 'overview' ? (
            <>
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                    {/* Metrics Section */}
                    <div className="lg:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-6">
                         <IndicatorCard 
                             label="Total Projects" 
                             value={projects.length} 
                             icon={<PieChart className="h-4 w-4 text-emerald-500" />}
                             subtext="Lifetime Projects Volume"
                         />
                         <IndicatorCard 
                             label="Active Projects" 
                             value={projects.filter(p => !['completed', 'approved', 'archived', 'delivered'].includes(p.status)).length} 
                             icon={<Activity className="h-4 w-4 text-blue-500" />}
                             subtext="Currently in operational phase"
                         />
                         <IndicatorCard 
                             label="Completed" 
                             value={projects.filter(p => p.status === 'completed' || p.status === 'approved').length} 
                             icon={<CheckCircle2 className="h-4 w-4 text-primary" />}
                             subtext="Successfully delivered projects"
                         />
                    </div>

                    {/* Project Manager Card */}
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-muted/30 border border-border rounded-2xl p-6 ring-1 ring-primary/10 shadow-xl overflow-hidden relative group"
                    >
                        <div className="absolute top-0 right-0 p-6 opacity-5 pointer-events-none group-hover:opacity-10 transition-opacity">
                            <ShieldCheck className="h-16 w-16 text-primary" />
                        </div>
                        <h4 className="text-[10px] font-black uppercase tracking-widest text-primary mb-4 flex items-center gap-2">
                             <Briefcase className="h-3.5 w-3.5" /> Assigned Manager
                        </h4>
                        
                        {assignedPM ? (
                            <div className="space-y-4">
                                <div className="flex items-center gap-4">
                                    <div className="h-12 w-12 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center text-primary font-bold text-lg">
                                        {assignedPM.displayName?.[0].toUpperCase() || "M"}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-sm font-black text-foreground truncate">{assignedPM.displayName}</p>
                                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">Client Success Lead</p>
                                    </div>
                                </div>
                                <div className="pt-4 border-t border-border space-y-2">
                                    <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-tight">
                                        <span className="text-muted-foreground">Status</span>
                                        <span className="text-emerald-500 flex items-center gap-1.5"><div className="h-1 w-1 rounded-full bg-emerald-500 animate-pulse" /> Online</span>
                                    </div>
                                    <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-tight">
                                        <span className="text-muted-foreground">WhatsApp</span>
                                        <span className="text-foreground">{assignedPM.whatsapp || '+91 99999 99999'}</span>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="py-6 flex flex-col items-center justify-center opacity-40 text-center gap-2">
                                <Activity className="h-5 w-5 text-muted-foreground animate-pulse" />
                                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Assigning Success Lead...</p>
                            </div>
                        )}
                    </motion.div>
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
                                     <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-widest border-b border-border">Project Name</th>
                                     <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-widest border-b border-border">Type</th>
                                     <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-widest border-b border-border text-center">Editor</th>
                                     <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-widest border-b border-border text-right">Price</th>
                                     <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-widest border-b border-border text-right">Status</th>
                                     <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-widest border-b border-border text-right">Date</th>
                                     <th className="px-6 py-4 border-b border-border w-[80px]"></th>
                                 </tr>
                             </thead>
                             <tbody className="divide-y divide-border">
                                  <AnimatePresence mode="wait">
                                  {loading ? (
                                     <tr key="loading-overview">
                                         <td colSpan={7} className="px-6 py-24 text-center">
                                             <div className="flex flex-col items-center gap-4">
                                                 <RefreshCw className="h-6 w-6 text-emerald-500 animate-spin" />
                                                 <p className="text-xs font-medium text-muted-foreground animate-pulse">Loading projects...</p>
                                             </div>
                                         </td>
                                     </tr>
                                  ) : filteredProjects.length === 0 ? (
                                     <tr key="empty-overview">
                                         <td colSpan={7} className="px-6 py-24 text-center">
                                             <div className="flex flex-col items-center gap-4 opacity-40">
                                                 <Layers className="h-12 w-12 text-muted-foreground" />
                                                 <p className="text-sm font-medium text-muted-foreground">You haven't started any projects yet.</p>
                                             </div>
                                         </td>
                                     </tr>
                                  ) : (
                                     filteredProjects.map((project, idx) => (
                                         <motion.tr 
                                             key={`over-${project.id}`}
                                             initial={{ opacity: 0, y: 10 }}
                                             animate={{ opacity: 1, y: 0 }}
                                             transition={{ delay: idx * 0.05 }}
                                             className="group hover:bg-muted/10 transition-all duration-200"
                                         >
                                             <td className="px-6 py-5 transition-colors">
                                                 <div className="flex flex-col">
                                                     <Link href={`/dashboard/projects/${project.id}`} className="text-sm font-bold text-foreground hover:text-primary transition-colors tracking-tight leading-tight">
                                                         {project.name}
                                                     </Link>
                                                 </div>
                                             </td>
                                             <td className="px-6 py-5 transition-colors">
                                                 <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">{project.videoType || 'N/A'}</span>
                                             </td>
                                             <td className="px-6 py-5 text-center transition-colors">
                                                 <Badge variant="outline" className="text-[9px] uppercase tracking-widest font-bold">
                                                      {project.assignedEditorId ? "Assigned" : "Pending"}
                                                 </Badge>
                                             </td>
                                             <td className="px-6 py-5 text-right transition-colors">
                                                 <span className="text-sm font-black text-foreground tracking-tighter tabular-nums">₹{project.totalCost?.toLocaleString() || '0'}</span>
                                             </td>
                                             <td className="px-6 py-5 text-right transition-colors">
                                                 <StatusIndicator status={project.status} />
                                             </td>
                                             <td className="px-6 py-5 text-right transition-colors">
                                                 <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
                                                      {project.createdAt ? new Date(project.createdAt).toLocaleDateString() : 'N/A'}
                                                 </div>
                                             </td>
                                             <td className="px-6 py-5 text-right transition-colors">
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
            </>
           ) : activeTab === 'finance' ? (
            <>
                {/* Billing Section */}
                <div className="enterprise-card p-6 md:p-8 bg-muted/20 border-border mb-8 overflow-hidden relative">
                    <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
                        <CreditCard className="h-32 w-32 text-primary" />
                    </div>
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 relative z-10">
                        <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <span className="h-2 w-2 rounded-full bg-primary" />
                                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Account Billing Profile</h3>
                            </div>
                            <h2 className="text-2xl font-bold font-heading">Credit & Payment Status</h2>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 lg:gap-12 bg-muted/50 p-6 rounded-2xl border border-border">
                            <div className="space-y-1">
                                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest block">Pay Later Option</span>
                                <div className={cn("text-sm font-black uppercase tracking-widest flex items-center gap-1.5", user?.payLater ? "text-emerald-500" : "text-amber-500")}>
                                    {user?.payLater ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
                                    {user?.payLater ? "Active" : "Disabled"}
                                </div>
                            </div>
                            <div className="space-y-1">
                                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest block">Credit Limit</span>
                                <div className="text-lg font-black text-foreground tabular-nums">
                                    ₹{creditLimit.toLocaleString()}
                                </div>
                            </div>
                            <div className="space-y-1">
                                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest block">Current Due</span>
                                <div className={cn("text-lg font-black tabular-nums", isOverLimit ? "text-red-500" : "text-foreground")}>
                                    ₹{totalPendingPayment.toLocaleString()}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
    
                {/* Finance Tab Summary Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <IndicatorCard 
                          label="Pending Outstanding" 
                          value={`₹${totalPendingPayment.toLocaleString()}`} 
                          icon={<AlertCircle className="h-4 w-4 text-orange-500" />}
                          alert={isOverLimit}
                          subtext="Unsettled balance"
                      />
                      <IndicatorCard 
                          label="Credit Protocol" 
                          value={`₹${creditLimit.toLocaleString()}`} 
                          icon={<Zap className="h-4 w-4 text-primary" />}
                          subtext={user?.payLater ? "Pay Later: Active" : "Pay Later: Inactive"}
                          trend={user?.payLater ? "Authorized" : "Retail"}
                          trendUp={user?.payLater}
                      />
                      <IndicatorCard 
                          label="Lifetime Total" 
                          value={`₹${lifetimeValue.toLocaleString()}`} 
                          icon={<Activity className="h-4 w-4" />}
                          subtext="Total order volume"
                      />
                      <IndicatorCard 
                          label="Payment Health" 
                          value={paymentDelayAverage} 
                          icon={<Timer className="h-4 w-4" />}
                          subtext="Collection speed"
                      />
                 </div>
    
                {/* Finance Details Table */}
                <motion.div 
                     initial={{ opacity: 0, y: 20 }}
                     animate={{ opacity: 1, y: 0 }}
                     className="enterprise-card bg-muted/30 backdrop-blur-sm overflow-hidden"
                >
                     <div className="p-6 border-b border-border/50 flex flex-col sm:flex-row justify-between gap-4">
                         <div>
                             <h3 className="text-xl font-bold font-heading">Financial Overview History</h3>
                             <p className="text-sm text-muted-foreground mt-1">Review your invoices and ledger</p>
                         </div>
                     </div>
    
                     <div className="overflow-x-auto overflow-y-hidden">
                         <table className="w-full text-left">
                             <thead>
                                 <tr className="bg-muted/30">
                                     <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-widest border-b border-border">Invoice ID</th>
                                     <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-widest border-b border-border">Project Name</th>
                                     <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-widest border-b border-border text-right">Amount</th>
                                     <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-widest border-b border-border text-center">Payment Status</th>
                                     <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-widest border-b border-border text-right">Date</th>
                                 </tr>
                             </thead>
                             <tbody className="divide-y divide-border">
                                  <AnimatePresence mode="wait">
                                  {loading ? (
                                     <tr key="loading-finance">
                                         <td colSpan={5} className="px-6 py-24 text-center">
                                             <div className="flex flex-col items-center gap-4">
                                                 <RefreshCw className="h-6 w-6 text-emerald-500 animate-spin" />
                                                 <p className="text-xs font-medium text-muted-foreground animate-pulse">Loading financial records...</p>
                                             </div>
                                         </td>
                                     </tr>
                                  ) : projects.length === 0 ? (
                                     <tr key="empty-finance">
                                         <td colSpan={5} className="px-6 py-24 text-center">
                                             <div className="flex flex-col items-center gap-4 opacity-40">
                                                 <BarChart3 className="h-12 w-12 text-muted-foreground" />
                                                 <p className="text-sm font-medium text-muted-foreground">No financial data available yet.</p>
                                             </div>
                                         </td>
                                     </tr>
                                  ) : (
                                     projects.map((project, idx) => {
                                         const isPaid = (project.amountPaid || 0) >= (project.totalCost || 0) && (project.totalCost || 0) > 0;
                                         const isPartial = (project.amountPaid || 0) > 0 && (project.amountPaid || 0) < (project.totalCost || 0);
                                         
                                         return (
                                         <motion.tr 
                                             key={`fin-${project.id}`}
                                             initial={{ opacity: 0, y: 10 }}
                                             animate={{ opacity: 1, y: 0 }}
                                             transition={{ delay: idx * 0.05 }}
                                             className="group hover:bg-muted/10 transition-all duration-200"
                                         >
                                             <td className="px-6 py-5 transition-colors">
                                                <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
                                                    INV-{project.id.slice(0,6).toUpperCase()}
                                                </div>
                                             </td>
                                             <td className="px-6 py-5 transition-colors">
                                                 <div className="flex flex-col">
                                                     <Link href={`/dashboard/projects/${project.id}`} className="text-sm font-bold text-foreground hover:text-emerald-500 transition-colors tracking-tight leading-tight">
                                                         {project.name}
                                                     </Link>
                                                 </div>
                                             </td>
                                             <td className="px-6 py-5 text-right transition-colors">
                                                 <span className="text-sm font-black text-foreground tracking-tighter tabular-nums">₹{project.totalCost?.toLocaleString() || '0'}</span>
                                             </td>
                                             <td className="px-6 py-5 text-center transition-colors">
                                                {isPaid ? (
                                                    <Badge variant="outline" className="text-[9px] uppercase tracking-widest font-bold text-emerald-500 border-emerald-500/30 bg-emerald-500/10">Paid</Badge>
                                                ) : isPartial ? (
                                                    <Badge variant="outline" className="text-[9px] uppercase tracking-widest font-bold text-amber-500 border-amber-500/30 bg-amber-500/10">Partial</Badge>
                                                ) : (
                                                    <Badge variant="outline" className="text-[9px] uppercase tracking-widest font-bold text-red-500 border-red-500/30 bg-red-500/10">Pending</Badge>
                                                )}
                                             </td>
                                             <td className="px-6 py-5 text-right transition-colors">
                                                 <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
                                                      {project.createdAt ? new Date(project.createdAt).toLocaleDateString() : 'N/A'}
                                                 </div>
                                             </td>
                                         </motion.tr>
                                     )})
                                  )}
                                  </AnimatePresence>
                             </tbody>
                         </table>
                     </div>
                </motion.div>
            </>
           ) : null}
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
        completed: { label: "Completed", color: "text-muted-foreground", bg: "bg-zinc-500/5", border: "border-zinc-500/20" },
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
