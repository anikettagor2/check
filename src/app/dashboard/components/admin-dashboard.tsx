"use client";

import { useState, useEffect } from "react";
import { 
    collection, 
    query, 
    orderBy, 
    onSnapshot,
    updateDoc,
    doc
} from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { Project, User } from "@/types/schema";
import { motion, AnimatePresence } from "framer-motion";
import { 
    Users, 
    Search, 
    Filter, 
    Trash2, 
    UserPlus, 
    AlertCircle, 
    RefreshCw,
    Edit,
    MoreHorizontal,
    ArrowUpRight,
    ArrowDownLeft,
    CheckCircle2,
    ChevronDown,
    Plus,
    Calendar,
    Briefcase,
    Shield,
    IndianRupee,
    Copy,
    User as UserIcon,
    Terminal,
    Zap,
    Activity,
    Cpu,
    Database,
    Globe,
    Layers,
    Monitor,
    LayoutDashboard,
    Mail,
    Star,
    MonitorPlay,
    ExternalLink,
    LayoutGrid,
    TrendingUp,
    FolderOpen,
    Save,
    MessageSquare
} from "lucide-react";

import { cn } from "@/lib/utils";
import Link from "next/link";
import Image from "next/image";
import { toast } from "sonner";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button"; 
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
    DropdownMenu, 
    DropdownMenuContent, 
    DropdownMenuItem, 
    DropdownMenuTrigger,
    DropdownMenuSeparator, 
    DropdownMenuLabel
} from "@/components/ui/dropdown-menu";

import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/context/auth-context";
import { assignEditor, updateProject, togglePayLater, deleteProject, deleteUser, toggleUserStatus, rejectDeletionRequest, verifyEditor, getWhatsAppTemplates, updateWhatsAppTemplates, settleProjectPayment } from "@/app/actions/admin-actions";
import { AdminOverviewGraphs } from "./admin-overview-graphs";

export function AdminDashboard() {
  const { user: currentUser } = useAuth();
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get('tab') as 'overview' | 'projects' | 'users' | 'team' | 'terminations' | 'requests' | 'whatsapp') || 'overview';
  const [activeTab, setActiveTab] = useState<'overview' | 'projects' | 'users' | 'team' | 'terminations' | 'requests' | 'whatsapp'>(initialTab);
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [assignEditorPrice, setAssignEditorPrice] = useState<string>("");
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  // User Detail Modal State
  const [isUserDetailModalOpen, setIsUserDetailModalOpen] = useState(false);
  const [selectedUserDetail, setSelectedUserDetail] = useState<User | null>(null);

  // Project Details/Audit Modal
  const [isProjectDetailModalOpen, setIsProjectDetailModalOpen] = useState(false);
  const [inspectProject, setInspectProject] = useState<Project | null>(null);

  // User Creation State
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: 'sales_executive', phoneNumber: '' });

  // Add Editor State
  const [isAddEditorModalOpen, setIsAddEditorModalOpen] = useState(false);
  const [isCreatingEditor, setIsCreatingEditor] = useState(false);
  const [newEditor, setNewEditor] = useState({ name: '', email: '', password: '', whatsapp: '', portfolio: '' });

  const [editForm, setEditForm] = useState({
      totalCost: 0,
      status: ''
  });

  const [stats, setStats] = useState({
    revenue: 0,
    activeProjects: 0,
    pendingAssignment: 0,
    totalClients: 0
  });

  const [whatsappTemplates, setWhatsappTemplates] = useState<any>({});
  const [isUpdatingTemplates, setIsUpdatingTemplates] = useState(false);



  useEffect(() => {
    setLoading(true);

    const projectsQ = query(collection(db, "projects"), orderBy("updatedAt", "desc"));
    const unsubProjects = onSnapshot(projectsQ, (snapshot) => {
        const fetchedProjects = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Project));
        setProjects(fetchedProjects);
    });

    const usersQ = collection(db, "users");
    const unsubUsers = onSnapshot(usersQ, (snapshot) => {
        const fetchedUsers = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as User));
        setUsers(fetchedUsers);
    });

    getWhatsAppTemplates().then(res => {
        if (res.success && res.data) {
            setWhatsappTemplates(res.data);
        }
    });



    return () => {
        unsubProjects();
        unsubUsers();
    };
  }, []);

  useEffect(() => {
    if(projects.length > 0 || users.length > 0) {
        setLoading(false);
        setStats({
          revenue: projects.reduce((acc, curr) => acc + (curr.amountPaid || 0), 0),
          activeProjects: projects.filter(p => !['completed', 'approved'].includes(p.status)).length,
          pendingAssignment: projects.filter(p => p.status === 'pending_assignment').length,
          totalClients: users.filter(u => u.role === 'client').length
      });
    }
  }, [projects, users]);

   const handleCreateUser = async (e: React.FormEvent) => {
      e.preventDefault();
      setIsCreatingUser(true);
      try {
          const res = await fetch('/api/admin/create-user', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  email: newUser.email,
                  password: newUser.password,
                   displayName: newUser.name,
                   role: newUser.role,
                   phoneNumber: newUser.phoneNumber,
                   createdBy: 'admin'
               })
          });
          
          if (!res.ok) {
              const data = await res.json();
              throw new Error(data.error || "Failed");
          }

           toast.success(`Account created: ${newUser.role}`);
           setNewUser({ name: '', email: '', password: '', role: 'sales_executive', phoneNumber: '' });
       } catch (err: any) {
          toast.error(err.message);
      } finally {
          setIsCreatingUser(false);
      }
  };

  const handleAddEditor = async (e: React.FormEvent) => {
      e.preventDefault();
      setIsCreatingEditor(true);
      try {
          const res = await fetch('/api/admin/create-user', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  email: newEditor.email,
                  password: newEditor.password,
                  displayName: newEditor.name,
                  role: 'editor',
                  phoneNumber: newEditor.whatsapp,
                  createdBy: currentUser?.uid || 'admin'
              })
          });
          
          const responseData = await res.json();
          if (!res.ok) {
              throw new Error(responseData.error || "Failed");
          }

          if (responseData.uid) {
              await updateDoc(doc(db, "users", responseData.uid), {
                 whatsappNumber: newEditor.whatsapp,
                 portfolio: newEditor.portfolio ? [{ name: "Main Portfolio", url: newEditor.portfolio, date: Date.now() }] : [],
                 onboardingStatus: 'approved'
              });
          }

          toast.success(`Editor account created successfully`);
          setNewEditor({ name: '', email: '', password: '', whatsapp: '', portfolio: '' });
          setIsAddEditorModalOpen(false);
       } catch (err: any) {
          toast.error(err.message);
      } finally {
          setIsCreatingEditor(false);
      }
  };

  const handleSettlePayment = async (projectId: string) => {
    if(!confirm("Are you sure you want to mark this Pay Later project as Settled (fully paid)?")) return;
    const res = await settleProjectPayment(projectId, currentUser!.uid, currentUser!.displayName || "Admin", currentUser?.role || 'admin');
    if(res.success) toast.success("Payment settled successfully");
    else toast.error("Failed to settle payment");
  };

  const handleDeleteProject = async (projectId: string) => {
    if(!confirm("Proceed with permanent deletion of this project?")) return;
    const result = await deleteProject(projectId);
    if (result.success) toast.success("Project purged.");
    else toast.error("Purge failed.");
  };

  const handleDeleteUser = async (uid: string) => {
    if (uid === currentUser?.uid) {
        toast.error("You cannot delete your own admin account.");
        return;
    }
    if(!confirm("Are you sure you want to delete this user?")) return;
    const result = await deleteUser(uid);
    if (result.success) toast.success("User deleted successfully.");
    else toast.error("Failed to delete user.");
  };

  const handleRejectDeletion = async (uid: string) => {
      const res = await rejectDeletionRequest(uid);
      if (res.success) toast.success("Termination request overridden.");
      else toast.error("Override failed.");
  };

   const handleAssignEditor = async (editorId: string) => {
    if (!selectedProject) return;
    if (!assignEditorPrice) {
        toast.error("Please enter a revenue share amount for the editor.");
        return;
    }
    const price = Number(assignEditorPrice);

    // Prevent negative platform revenue
    if (price > (selectedProject.totalCost || 0)) {
        toast.error(`Editor revenue cannot exceed project cost (₹${selectedProject.totalCost || 0}). Negative platform margin is not allowed.`);
        return;
    }

    try {
        const res = await assignEditor(selectedProject.id, editorId, price);
        if (res.success) {
            toast.success("Editor assigned successfully. Pending their acceptance.");
            setIsAssignModalOpen(false);
            setAssignEditorPrice("");
        } else {
            toast.error(res.error || "Assignment failed.");
        }
    } catch (err) { toast.error("Assignment failed."); }
  };

  const handleReimburseEditor = async (projectId: string) => {
      try {
          await updateDoc(doc(db, "projects", projectId), {
              editorPaid: true,
              editorPaidAt: Date.now()
          });
          toast.success("Editor payment marked as cleared.");
      } catch (error) {
          toast.error("Failed to clear payment.");
          console.error(error);
      }
  };

   const handleUpdateProject = async () => {
      if (!selectedProject) return;
      try {
          const res = await updateProject(selectedProject.id, {
              totalCost: Number(editForm.totalCost),
              status: editForm.status
          });
          if (res.success) {
              toast.success("Status updated.");
              setIsEditModalOpen(false);
          } else {
              toast.error(res.error || "Something went wrong.");
          }
      } catch (err) { toast.error("Something went wrong."); }
  };

  const handleVerifyEditor = async (uid: string) => {
      const res = await verifyEditor(uid);
      if (res.success) toast.success("Editor protocol authorized. Welcome to the team.");
      else toast.error("Verification protocol failed.");
  };

  const handleToggleUserStatus = async (uid: string, disabled: boolean) => {
      const res = await toggleUserStatus(uid, disabled);
      if (res.success) toast.success(disabled ? "Access suspended" : "Access restored");
      else toast.error("Status error");
  }

  const handleUpdateWhatsAppTemplates = async () => {
      setIsUpdatingTemplates(true);
      try {
          const res = await updateWhatsAppTemplates(whatsappTemplates);
          if (res.success) toast.success("Notification protocols updated globally");
          else toast.error(res.error || "Update failed");
      } catch (e: any) {
          toast.error(e.message);
      } finally {
          setIsUpdatingTemplates(false);
      }
  };



  const filteredProjects = projects.filter(p => 
      !searchQuery || 
      p.name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
      p.clientName?.toLowerCase().includes(searchQuery.toLowerCase()) || 
      p.id?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredUsers = users.filter(u => {
      const q = searchQuery.toLowerCase();
      return !q || 
             u.displayName?.toLowerCase().includes(q) || 
             u.email?.toLowerCase().includes(q) || 
             u.role?.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-10 max-w-[1600px] mx-auto pb-20 pt-4">
       
       {/* Dashboard Header */}
       <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8 pb-8 border-b border-white/10">
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-2"
            >
                <div className="flex items-center gap-2 mb-2">
                    <div className="px-2 py-0.5 rounded bg-primary/10 border border-primary/20">
                        <span className="text-[10px] font-bold text-primary uppercase tracking-widest">Management Hub</span>
                    </div>
                    <div className="flex items-center gap-2 ml-2">
                         <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                         <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Live Updates</span>
                    </div>
                </div>
                <h1 className="text-4xl md:text-5xl font-heading font-bold tracking-tight text-foreground leading-tight">Admin <span className="text-muted-foreground">Dashboard</span></h1>
                <div className="flex items-center gap-6 pt-2">
                    <div className="flex items-center gap-2 text-muted-foreground">
                        <Shield className="h-3.5 w-3.5" />
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Administrator</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                        <RefreshCw className="h-3.5 w-3.5" />
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Data Updated</span>
                    </div>
                </div>
            </motion.div>
            
            <motion.div 
               initial={{ opacity: 0, x: 20 }}
               animate={{ opacity: 1, x: 0 }}
               className="flex flex-wrap items-center gap-3"
            >
                <div className="flex bg-muted/50 border border-border rounded-lg p-1">
                    {['overview', 'projects', 'users', 'team', 'terminations', 'requests', 'whatsapp'].map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab as any)}
                            className={cn(
                                "px-5 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-md transition-all",
                                activeTab === tab 
                                    ? "bg-background text-foreground shadow-sm" 
                                    : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            {tab}
                        </button>
                    ))}
                </div>
            </motion.div>
       </div>

       {/* Graphs - Shown above numbers on overview */}
       {activeTab === 'overview' && (
           <div className="mb-4">
               <AdminOverviewGraphs projects={projects} users={users} />
           </div>
       )}

       {/* Statistics Grid */}
       {activeTab === 'overview' && (
           <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <IndicatorCard 
                    label="Total Revenue" 
                    value={`₹${stats.revenue.toLocaleString()}`} 
                    trend="+15.2%" 
                    trendUp={true}
                    icon={<IndianRupee className="h-4 w-4" />}
                    subtext="Total earnings to date"
                />
                <IndicatorCard 
                    label="Active Projects" 
                    value={stats.activeProjects} 
                    icon={<Cpu className="h-4 w-4" />}
                    subtext="Currently being edited"
                />
                <IndicatorCard 
                    label="New Requests" 
                    value={stats.pendingAssignment} 
                    alert={stats.pendingAssignment > 0}
                    icon={<Database className="h-4 w-4" />}
                    subtext="Waiting for an editor"
                />
                <IndicatorCard 
                    label="Total Clients" 
                    value={stats.totalClients} 
                    icon={<Users className="h-4 w-4" />}
                    subtext="Registered clients"
                />
           </div>
       )}

       {/* Main Content Area */}
       <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="enterprise-card bg-muted backdrop-blur-sm overflow-hidden"
       >
            {/* Toolbar */}
            <div className="p-6 border-b border-white/5 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6 w-full lg:w-auto">
                    {(activeTab === 'projects' || activeTab === 'overview' || activeTab === 'users') && (
                        <div className="relative w-full sm:w-80">
                             <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground transition-colors" />
                             <input 
                                type="text" 
                                placeholder={`Global search: ${activeTab}...`} 
                                className="h-10 w-full rounded-lg border border-border bg-muted/30 pl-11 pr-4 text-xs font-medium text-foreground focus:bg-background focus:border-primary/50 focus:outline-none transition-all placeholder:text-muted-foreground"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                             />
                        </div>
                    )}
                    
                    <div className="hidden lg:flex items-center gap-2">
                         <LayoutDashboard className="h-3.5 w-3.5 text-zinc-600" />
                         <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Viewing: {activeTab.replace('_', ' ')}</span>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {activeTab === 'users' && (
                         <div className="flex bg-muted/50 border border-border rounded-lg p-1">
                            {['all', 'admin', 'editor', 'client'].map(r => (
                                <button
                                    key={r}
                                    onClick={() => setSearchQuery(r === 'all' ? '' : r)}
                                    className={cn(
                                        "px-3 py-1 text-[9px] font-bold uppercase tracking-widest rounded transition-all",
                                        (searchQuery === r || (r === 'all' && searchQuery === '')) 
                                            ? "bg-background text-foreground shadow-sm" 
                                            : "text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    {r}
                                </button>
                            ))}
                        </div>
                    )}
                    <DropdownMenu>
                         <DropdownMenuTrigger asChild>
                             <button className="h-10 px-4 rounded-lg border border-white/10 bg-white/[0.03] text-[11px] font-bold uppercase tracking-widest text-zinc-400 hover:text-white transition-all flex items-center gap-2">
                                 <Filter className="h-3.5 w-3.5" />
                                 Export Data
                                 <ChevronDown className="h-3 w-3 ml-1 opacity-50" />
                             </button>
                         </DropdownMenuTrigger>
                         <DropdownMenuContent align="end" className="w-52 bg-[#161920] border-white/10 p-1.5 rounded-xl shadow-2xl">
                             <DropdownMenuLabel className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest px-3 py-2">Download Options</DropdownMenuLabel>
                             <DropdownMenuSeparator className="my-1 bg-white/5" />
                             <DropdownMenuItem className="p-2.5 text-xs text-zinc-300 hover:text-white hover:bg-white/5 transition-colors cursor-pointer rounded-lg">Export as JSON</DropdownMenuItem>
                             <DropdownMenuItem className="p-2.5 text-xs text-zinc-300 hover:text-white hover:bg-white/5 transition-colors cursor-pointer rounded-lg">Export as CSV</DropdownMenuItem>
                         </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

            <div className="overflow-x-auto">
                <AnimatePresence mode="wait">
                
                {activeTab === 'overview' && (
                    <motion.table 
                        key="overview"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="w-full text-left"
                    >
                         <thead>
                            <tr className="bg-muted/30">
                                <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-widest border-b border-border">Project Name</th>
                                <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-widest border-b border-border">Status</th>
                                <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-widest border-b border-border">Last Updated</th>
                                <th className="px-6 py-4 border-b border-border w-[80px]"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {projects.slice(0, 10).map((project, idx) => (
                                <motion.tr 
                                    key={project.id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: idx * 0.05 }}
                                    className="hover:bg-white/[0.02] transition-colors group"
                                >
                                    <td className="px-6 py-5">
                                        <div className="text-sm font-bold text-foreground tracking-tight">{project.name}</div>
                                        <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mt-0.5">ID: {project.id.slice(0,12)}</div>
                                    </td>
                                    <td className="px-6 py-5">
                                        <ProjectStatusBadges project={project} />
                                    </td>
                                    <td className="px-6 py-5 text-zinc-400 text-[11px] font-medium uppercase tracking-tight" suppressHydrationWarning>
                                        {new Date(project.updatedAt).toLocaleDateString()} — {new Date(project.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </td>
                                    <td className="px-6 py-5 text-right">
                                        <button 
                                            onClick={() => { setSelectedProject(project); setEditForm({totalCost: project.totalCost||0, status: project.status}); setIsEditModalOpen(true); }}
                                            className="h-9 w-9 flex items-center justify-center rounded-lg hover:bg-white/[0.05] text-zinc-500 hover:text-white transition-all active:scale-[0.98]"
                                        >
                                            <Edit className="h-3.5 w-3.5" />
                                        </button>
                                    </td>
                                </motion.tr>
                            ))}
                        </tbody>
                    </motion.table>
                )}

                {activeTab === 'projects' && (
                     <motion.table 
                        key="projects"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="w-full text-left"
                     >
                        <thead>
                           <tr className="bg-muted/30">
                               <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-widest border-b border-border">Project Name</th>
                               <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-widest border-b border-border">Client Name</th>
                               <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-widest border-b border-border">Status</th>
                               <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-widest border-b border-border">Price</th>
                               <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-widest border-b border-border">Editor</th>
                               <th className="px-6 py-4 border-b border-border w-[80px]"></th>
                           </tr>
                       </thead>
                       <tbody className="divide-y divide-white/5">
                           {filteredProjects.map((project, idx) => (
                               <motion.tr 
                                    key={project.id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: idx * 0.05 }}
                                    className="hover:bg-white/[0.02] transition-colors group"
                               >
                                    <td className="px-6 py-6 border-b border-transparent group-hover:border-border">
                                        <div className="text-base font-bold text-foreground tracking-tight leading-tight">{project.name}</div>
                                         <div className="flex items-center gap-2 mt-1">
                                             <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">ID: {project.id.slice(0,12)}</span>
                                             {(project as any).isPayLaterRequest && (
                                                <span className="text-[8px] bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 px-1.5 py-0.5 rounded uppercase font-bold tracking-widest">Deferred Pay</span>
                                             )}
                                         </div>
                                    </td>
                                    <td className="px-6 py-6 border-b border-transparent group-hover:border-border">
                                         <div className="flex items-center gap-2">
                                             <div className="h-6 w-6 rounded bg-muted border border-border flex items-center justify-center text-[10px] text-muted-foreground font-bold uppercase">{project.clientName?.[0]}</div>
                                             <span className="text-xs text-foreground font-bold truncate max-w-[100px]">{project.clientName}</span>
                                         </div>
                                    </td>
                                    <td className="px-6 py-6 border-b border-transparent group-hover:border-border"><ProjectStatusBadges project={project} /></td>
                                    <td className="px-6 py-6 border-b border-transparent group-hover:border-border text-lg font-bold text-foreground tracking-tighter tabular-nums">₹{project.totalCost?.toLocaleString()}</td>
                                   <td className="px-6 py-6">
                                        {project.assignedEditorId ? (
                                            <div className="flex flex-col gap-1.5">
                                                <span className={cn(
                                                    "inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[9px] font-bold tracking-widest uppercase border w-fit transition-all",
                                                    project.assignmentStatus === 'accepted' ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.1)]" :
                                                    project.assignmentStatus === 'rejected' ? "bg-red-500/10 text-red-500 border-red-500/20 shadow-[0_0_10px_rgba(239,68,68,0.1)]" :
                                                    "bg-amber-500/10 text-amber-500 border-amber-500/20 shadow-[0_0_10px_rgba(245,158,11,0.1)]"
                                                )}>
                                                    <div className={cn("w-1 h-1 rounded-full bg-current", project.assignmentStatus === 'pending' && "animate-pulse")} />
                                                    {project.assignmentStatus || 'AUTHORIZED'}
                                                </span>
                                                {project.assignmentStatus === 'rejected' && project.editorDeclineReason && (
                                                    <span className="text-[9px] font-medium text-red-400/80 italic max-w-[120px] truncate" title={project.editorDeclineReason}>
                                                        “{project.editorDeclineReason}”
                                                    </span>
                                                )}
                                            </div>
                                        ) : (
                                            <button 
                                                onClick={() => { setSelectedProject(project); setIsAssignModalOpen(true); }}
                                                className="text-amber-500/70 hover:text-amber-400 text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5 transition-all group-hover:scale-105"
                                            >
                                                <AlertCircle className="w-3.5 h-3.5" /> NOT ASSIGNED
                                            </button>
                                        )}
                                   </td>
                                   <td className="px-6 py-6 text-right">
                                       <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <button className="h-9 w-9 flex items-center justify-center rounded-lg hover:bg-white/[0.05] text-zinc-500 hover:text-white transition-all active:scale-[0.98]"><MoreHorizontal className="h-3.5 w-3.5" /></button>
                                            </DropdownMenuTrigger>
                                             <DropdownMenuContent align="end" className="w-52 bg-popover border-border p-1.5 rounded-xl shadow-2xl">
                                                <DropdownMenuItem className="p-2.5 text-xs text-popover-foreground hover:bg-muted transition-colors cursor-pointer rounded-lg" onClick={() => { setSelectedProject(project); setEditForm({totalCost: project.totalCost||0, status: project.status}); setIsEditModalOpen(true); }}>
                                                    <Edit className="mr-2.5 h-3.5 w-3.5 text-muted-foreground" /> Edit Project
                                                </DropdownMenuItem>
                                                <DropdownMenuItem className="p-2.5 text-xs text-popover-foreground hover:bg-muted transition-colors cursor-pointer rounded-lg" onClick={() => { setSelectedProject(project); setIsAssignModalOpen(true); }}>
                                                    <UserPlus className="mr-2.5 h-3.5 w-3.5 text-muted-foreground" /> Assign Editor
                                                </DropdownMenuItem>
                                                {(project as any).paymentOption === 'pay_later' && project.paymentStatus !== 'full_paid' && (
                                                    <DropdownMenuItem className="p-2.5 text-xs text-emerald-500 hover:bg-emerald-500/10 transition-colors cursor-pointer rounded-lg font-bold" onClick={() => handleSettlePayment(project.id)}>
                                                        <IndianRupee className="mr-2.5 h-3.5 w-3.5" /> Settle Payment
                                                    </DropdownMenuItem>
                                                )}
                                                <DropdownMenuSeparator className="my-1 bg-border" />
                                                 <DropdownMenuItem className="p-2.5 text-xs text-popover-foreground hover:bg-muted transition-colors cursor-pointer rounded-lg" onClick={() => { setInspectProject(project); setIsProjectDetailModalOpen(true); }}>
                                                    <Search className="mr-2.5 h-3.5 w-3.5 text-muted-foreground" /> Inspect History
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator className="my-1 bg-border" />
                                                <DropdownMenuItem onClick={() => handleDeleteProject(project.id)} className="p-2.5 text-xs text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer rounded-lg">
                                                    <Trash2 className="mr-2.5 h-3.5 w-3.5" /> Delete Project
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                       </DropdownMenu>
                                   </td>
                               </motion.tr>
                           ))}
                       </tbody>
                     </motion.table>
                )}

                {activeTab === 'users' && (
                    <motion.table 
                        key="users"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="w-full text-left"
                    >
                         <thead>
                            <tr className="bg-muted/30">
                                <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-widest border-b border-border">User</th>
                                <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-widest border-b border-border">Email Address</th>
                                <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-widest border-b border-border">User Role</th>
                                <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-widest border-b border-border">Access Key</th>
                                <th className="px-6 py-4 border-b border-border w-[80px]"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {filteredUsers.map((u, idx) => (
                                <motion.tr 
                                    key={u.uid}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: idx * 0.05 }}
                                    className={cn("group hover:bg-white/[0.02] transition-colors", (u as any).status === 'inactive' && "opacity-40 grayscale")}
                                >
                                    <td className="px-6 py-4 cursor-pointer group/profile" onClick={() => { setSelectedUserDetail(u); setIsUserDetailModalOpen(true); }}>
                                        <div className="flex items-center gap-3">
                                            <Avatar className="h-8 w-8 border border-border rounded-md bg-muted/50 group-hover/profile:border-primary/50 transition-all">
                                                <AvatarImage src={u.photoURL || undefined} className="object-cover" />
                                                <AvatarFallback className="text-muted-foreground font-bold text-xs uppercase group-hover/profile:text-primary">{u.displayName?.[0]}</AvatarFallback>
                                            </Avatar>
                                            <div>
                                                <div className="text-sm font-bold text-foreground tracking-tight leading-tight group-hover/profile:text-primary transition-colors">{u.displayName}</div>
                                                <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mt-0.5">UID: {u.uid.slice(0,8)}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="text-sm text-zinc-200 font-medium tracking-tight truncate max-w-[150px]">{u.email}</div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={cn(
                                            "inline-flex px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest border w-fit",
                                            u.role === 'admin' ? "bg-red-500/10 text-red-500 border-red-500/20" :
                                            u.role === 'client' ? "bg-blue-500/10 text-blue-500 border-blue-500/20" :
                                            u.role === 'editor' ? "bg-primary/10 text-primary border-primary/20" :
                                            "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                                        )}>
                                            {u.role?.replace('_', ' ') || 'UNLINKED'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        {u.initialPassword ? (
                                            <div className="flex items-center gap-2 group/copy cursor-pointer w-fit" onClick={() => { navigator.clipboard.writeText(u.initialPassword!); toast.success("Access key copied"); }}>
                                                <span className="font-mono text-xs text-zinc-100 bg-white/[0.05] px-2.5 py-1 rounded border border-white/10 group-hover/copy:border-primary/50 group-hover/copy:text-white transition-all shadow-sm">{u.initialPassword}</span>
                                                <Copy className="h-3.5 w-3.5 text-zinc-400 opacity-0 group-hover/copy:opacity-100 transition-opacity" />
                                            </div>
                                        ) : (
                                            <span className="text-muted-foreground/40 text-[9px] font-bold uppercase tracking-widest">ENCRYPTED</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <button 
                                                className={cn(
                                                    "h-8 px-3 rounded-md text-[9px] font-bold uppercase tracking-widest transition-all border",
                                                    (u as any).status === 'inactive' 
                                                        ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20 shadow-lg hover:bg-emerald-500/20" 
                                                        : "bg-muted/50 text-muted-foreground border-border hover:text-foreground hover:border-muted-foreground"
                                                )}
                                                onClick={() => handleToggleUserStatus(u.uid, (u as any).status !== 'inactive')}
                                            >
                                                {(u as any).status === 'inactive' ? "Restore" : "Lock"}
                                            </button>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <button className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-white/[0.05] text-zinc-600 hover:text-white transition-all active:scale-[0.98]"><MoreHorizontal className="h-3.5 w-3.5" /></button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="w-52 bg-popover border-border p-1.5 rounded-xl shadow-2xl">
                                                    {u.role === 'client' && (
                                                        <DropdownMenuItem className="p-2.5 text-xs text-popover-foreground hover:bg-muted transition-colors cursor-pointer rounded-lg" onClick={async () => {
                                                            const res = await togglePayLater(u.uid, !u.payLater);
                                                            if(res.success) toast.success(`Payment protocol adjusted`);
                                                        }}>
                                                            <IndianRupee className="mr-2.5 h-3.5 w-3.5 text-muted-foreground" /> {u.payLater ? "Revoke Pay Later" : "Allow Pay Later"}
                                                        </DropdownMenuItem>
                                                    )}
                                                    <DropdownMenuItem className="p-2.5 text-xs text-popover-foreground hover:bg-muted transition-colors cursor-pointer rounded-lg" onClick={() => handleToggleUserStatus(u.uid, (u as any).status !== 'inactive')}>
                                                        <Shield className="mr-2.5 h-3.5 w-3.5 text-muted-foreground" /> {(u as any).status === 'inactive' ? "Restore Integrity" : "Suspend Auth"}
                                                    </DropdownMenuItem>
                                                    <DropdownMenuSeparator className="my-1 bg-border" />
                                                    <DropdownMenuItem onClick={() => handleDeleteUser(u.uid)} className="p-2.5 text-xs text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer rounded-lg">
                                                        <Trash2 className="mr-2.5 h-3.5 w-3.5" /> Revoke Access
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                    </td>
                                </motion.tr>
                            ))}
                        </tbody>
                    </motion.table>
                )}
                
                {activeTab === 'team' && (
                    <motion.div 
                        key="team"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="p-8"
                    >
                         <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
                             <div className="lg:col-span-5 bg-white/[0.02] border border-white/10 p-8 rounded-2xl relative overflow-hidden group/form">
                                 <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none group-hover/form:opacity-10 transition-opacity">
                                     <UserPlus className="h-24 w-24 text-primary blur-xl" />
                                 </div>
                                 <h3 className="text-[11px] font-bold text-zinc-200 flex items-center gap-2.5 mb-8 uppercase tracking-widest">
                                     <div className="p-1.5 rounded bg-primary/20 border border-primary/30">
                                        <Zap className="h-3.5 w-3.5 text-primary" />
                                     </div>
                                     Add Team Member
                                 </h3>
                                 <form onSubmit={handleCreateUser} className="space-y-6 relative z-10">
                                     <div className="space-y-2">
                                         <Label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 ml-1">Full Name</Label>
                                         <input 
                                            value={newUser.name} 
                                            onChange={e => setNewUser({...newUser, name: e.target.value})} 
                                            required 
                                            className="w-full h-11 px-4 rounded-lg border border-white/10 bg-white/[0.02] text-sm text-white focus:border-primary/50 focus:outline-none transition-all placeholder:text-zinc-700 font-medium"
                                            placeholder="John Doe" 
                                        />
                                     </div>
                                     <div className="space-y-2">
                                         <Label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 ml-1">Email Address</Label>
                                         <input 
                                            value={newUser.email} 
                                            onChange={e => setNewUser({...newUser, email: e.target.value})} 
                                            required 
                                            className="w-full h-11 px-4 rounded-lg border border-white/10 bg-white/[0.02] text-sm text-white focus:border-primary/50 focus:outline-none transition-all placeholder:text-zinc-700 font-medium"
                                            type="email" 
                                            placeholder="example@email.com" 
                                        />
                                     </div>
                                     <div className="space-y-2">
                                         <Label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 ml-1">Password</Label>
                                         <input 
                                            value={newUser.password} 
                                            onChange={e => setNewUser({...newUser, password: e.target.value})} 
                                            required 
                                            className="w-full h-11 px-4 rounded-lg border border-white/10 bg-white/[0.02] text-sm text-white focus:border-primary/50 focus:outline-none transition-all placeholder:text-zinc-700 font-mono"
                                            type="text" 
                                            minLength={6} 
                                            placeholder="Enter password" 
                                        />
                                     </div>
                                     <div className="space-y-2">
                                         <Label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 ml-1">WhatsApp Number</Label>
                                         <input 
                                            value={newUser.phoneNumber} 
                                            onChange={e => setNewUser({...newUser, phoneNumber: e.target.value})} 
                                            required 
                                            className="w-full h-11 px-4 rounded-lg border border-white/10 bg-white/[0.02] text-sm text-white focus:border-primary/50 focus:outline-none transition-all placeholder:text-zinc-700 font-medium"
                                            type="tel" 
                                            placeholder="+91 00000 00000" 
                                        />
                                     </div>
                                     <div className="space-y-2">
                                         <Label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 ml-1">Department</Label>
                                         <select 
                                            className="w-full h-11 px-4 rounded-lg border border-white/10 bg-white/[0.02] text-sm text-white focus:border-primary/50 focus:outline-none transition-all appearance-none cursor-pointer font-medium" 
                                            value={newUser.role} 
                                            onChange={e => setNewUser({...newUser, role: e.target.value})}
                                        >
                                             <option value="sales_executive" className="bg-[#0F1115]">Sales Executive</option>
                                             <option value="project_manager" className="bg-[#0F1115]">Project Manager</option>
                                         </select>
                                     </div>
                                     <button 
                                        type="submit"
                                        className="w-full h-12 bg-white text-black text-[11px] font-bold uppercase tracking-widest rounded-lg shadow-xl hover:bg-zinc-200 transition-all active:scale-[0.98] disabled:opacity-30 flex items-center justify-center gap-2"
                                        disabled={isCreatingUser}
                                     >
                                         {isCreatingUser ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                                         {isCreatingUser ? "CREATING..." : "ADD MEMBER"}
                                     </button>
                                 </form>
                             </div>
                             
                             <div className="lg:col-span-7 space-y-10">
                                 <div className="bg-white/[0.01] border border-white/10 overflow-hidden rounded-2xl">
                                    <div className="bg-white/[0.03] px-6 py-4 border-b border-white/10 flex items-center justify-between">
                                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Department: Sales Executive</span>
                                        <span className="text-[9px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 px-2 py-0.5 rounded">Active</span>
                                    </div>
                                    <div className="divide-y divide-white/5">
                                        {users.filter(u => u.role === 'sales_executive').map(u => (
                                            <div key={u.uid} className="px-6 py-4 flex justify-between items-center hover:bg-white/[0.02] transition-colors group">
                                                 <div className="flex items-center gap-4">
                                                     <div className="h-10 w-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.1)] flex items-center justify-center text-emerald-500 font-bold text-xs uppercase group-hover:scale-110 transition-transform overflow-hidden">
                                                         {u.photoURL ? <Image src={u.photoURL} alt={u.displayName || "User"} width={40} height={40} className="w-full h-full object-cover" /> : u.displayName?.[0]}
                                                     </div>
                                                     <div>
                                                         <div className="text-sm font-bold text-white tracking-tight leading-tight">{u.displayName}</div>
                                                         <div className="text-xs text-zinc-300 font-semibold tracking-tight truncate max-w-[180px]">{u.email}</div>
                                                     </div>
                                                 </div>
                                                 <div className="flex items-center gap-3">
                                                     {u.initialPassword && <span className="text-xs font-mono font-bold bg-white/10 text-white px-2.5 py-1 rounded border border-white/20 shadow-md">KEY: {u.initialPassword}</span>}
                                                     <button className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-red-500/10 text-zinc-800 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100" onClick={() => handleDeleteUser(u.uid)}>
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </button>
                                                 </div>
                                            </div>
                                        ))}
                                    </div>
                                 </div>

                                 <div className="bg-white/[0.01] border border-white/10 overflow-hidden rounded-2xl">
                                    <div className="bg-white/[0.03] px-6 py-4 border-b border-white/10 flex items-center justify-between">
                                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Department: Project Manager</span>
                                        <span className="text-[9px] font-bold bg-blue-500/10 text-blue-500 border border-blue-500/20 px-2 py-0.5 rounded">Active</span>
                                    </div>
                                    <div className="divide-y divide-white/5">
                                        {users.filter(u => u.role === 'project_manager').map(u => (
                                            <div key={u.uid} className="px-6 py-4 flex justify-between items-center hover:bg-white/[0.02] transition-colors group">
                                                 <div className="flex items-center gap-4">
                                                      <div className="h-10 w-10 rounded-lg bg-blue-500/10 border border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.1)] flex items-center justify-center text-blue-500 font-bold text-xs uppercase group-hover:scale-110 transition-transform overflow-hidden">
                                                          {u.photoURL ? <Image src={u.photoURL} alt={u.displayName || "User"} width={40} height={40} className="w-full h-full object-cover" /> : u.displayName?.[0]}
                                                      </div>
                                                     <div>
                                                         <div className="text-sm font-bold text-white tracking-tight leading-tight">{u.displayName}</div>
                                                         <div className="text-xs text-zinc-300 font-semibold tracking-tight truncate max-w-[180px]">{u.email}</div>
                                                     </div>
                                                 </div>
                                                 <div className="flex items-center gap-3">
                                                     {u.initialPassword && <span className="text-xs font-mono font-bold bg-white/10 text-white px-2.5 py-1 rounded border border-white/20 shadow-md">KEY: {u.initialPassword}</span>}
                                                     <button className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-red-500/10 text-zinc-800 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100" onClick={() => handleDeleteUser(u.uid)}>
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </button>
                                                 </div>
                                            </div>
                                        ))}
                                    </div>
                                 </div>
                             </div>
                         </div>
                    </motion.div>
                )}
                
                {activeTab === 'terminations' && (
                    <motion.div 
                        key="terminations"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="p-8"
                    >
                        <div className="flex items-center gap-3 mb-8">
                            <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20">
                                <Trash2 className="h-5 w-5 text-red-500" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-foreground">Pending Terminations</h3>
                                <p className="text-xs text-muted-foreground uppercase tracking-widest font-bold">Pending Deletions</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {users.filter(u => (u as any).deletionRequested).length === 0 ? (
                                <div className="col-span-full py-20 flex flex-col items-center justify-center border-2 border-dashed border-border rounded-3xl">
                                    <Shield className="h-10 w-10 text-muted-foreground opacity-20 mb-4" />
                                    <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest text-center">No pending deletion requests<br/><span className="text-[10px] opacity-50">Everything looks good</span></p>
                                </div>
                            ) : (
                                users.filter(u => (u as any).deletionRequested).map(u => (
                                    <motion.div 
                                        key={u.uid}
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        className="bg-muted/50 border border-red-500/10 rounded-2xl p-6 space-y-6 hover:border-red-500/30 transition-all relative overflow-hidden group"
                                    >
                                        <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                                            <AlertCircle className="h-12 w-12 text-red-500" />
                                        </div>

                                        <div className="flex items-center gap-4">
                                            <Avatar className="h-12 w-12 border border-red-500/20 rounded-xl bg-red-500/5">
                                                <AvatarImage src={u.photoURL || undefined} className="object-cover" />
                                                <AvatarFallback className="text-red-500 font-bold text-sm uppercase">{u.displayName?.[0]}</AvatarFallback>
                                            </Avatar>
                                            <div>
                                                <div className="text-base font-bold text-foreground tracking-tight leading-tight">{u.displayName}</div>
                                                <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mt-0.5">{u.role} — UID: {u.uid.slice(0,8)}</div>
                                            </div>
                                        </div>

                                        <div className="space-y-1.5">
                                            <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Requested On</div>
                                            <div className="text-xs font-mono text-foreground bg-background/50 p-2 rounded border border-border">
                                                {(u as any).deletionRequestedAt ? new Date((u as any).deletionRequestedAt).toLocaleString() : 'AUTH_RECOVERY_REQUIRED'}
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-3 pt-2">
                                            <button 
                                                onClick={() => handleDeleteUser(u.uid)}
                                                className="flex-1 h-10 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white border border-red-500/20 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all"
                                            >
                                                Confirm Deletion
                                            </button>
                                            <button 
                                                onClick={() => handleRejectDeletion(u.uid)}
                                                className="flex-1 h-10 bg-muted border border-border hover:border-primary/50 text-muted-foreground hover:text-foreground text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all"
                                            >
                                                Cancel Deletion Request
                                            </button>
                                        </div>
                                    </motion.div>
                                ))
                            )}
                        </div>
                    </motion.div>
                )}

                {activeTab === 'requests' && (
                    <motion.div 
                        key="requests"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="p-8"
                    >
                         <div className="flex items-center gap-3 mb-8">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
                                    <UserPlus className="h-5 w-5 text-primary" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-foreground">Editor Onboarding</h3>
                                    <p className="text-xs text-muted-foreground uppercase tracking-widest font-bold">Pending Verification & Creation</p>
                                </div>
                            </div>
                            <div className="ml-auto">
                                <button 
                                    onClick={() => setIsAddEditorModalOpen(true)}
                                    className="flex items-center gap-2 h-10 px-4 bg-primary text-black text-[10px] font-bold uppercase tracking-widest rounded-xl hover:bg-primary/90 transition-all shadow-[0_0_20px_rgba(var(--primary),0.2)]"
                                >
                                    <Plus className="h-4 w-4" /> Add New Editor
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {users.filter(u => u.role === 'editor' && u.onboardingStatus === 'pending').length === 0 ? (
                                <div className="col-span-full py-20 flex flex-col items-center justify-center border-2 border-dashed border-border rounded-3xl">
                                    <CheckCircle2 className="h-10 w-10 text-muted-foreground opacity-20 mb-4" />
                                    <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest text-center">Protocol Synchronized<br/><span className="text-[10px] opacity-50">No pending editor requests</span></p>
                                </div>
                            ) : (
                                users.filter(u => u.role === 'editor' && u.onboardingStatus === 'pending').map(u => (
                                    <motion.div 
                                        key={u.uid}
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        className="bg-muted/50 border border-border rounded-2xl p-6 space-y-6 hover:border-primary/30 transition-all relative overflow-hidden group"
                                    >
                                        <div className="flex items-center gap-4">
                                            <Avatar className="h-12 w-12 border border-border rounded-xl bg-muted">
                                                <AvatarImage src={u.photoURL || undefined} className="object-cover" />
                                                <AvatarFallback className="text-muted-foreground font-bold text-sm uppercase">{u.displayName?.[0]}</AvatarFallback>
                                            </Avatar>
                                            <div>
                                                <div className="text-base font-bold text-foreground tracking-tight leading-tight">{u.displayName}</div>
                                                <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mt-0.5">Editor Request — {new Date(u.createdAt).toLocaleDateString()}</div>
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            <div className="space-y-1">
                                                <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Contact Protocol</div>
                                                <div className="text-xs font-medium text-foreground">{u.email}</div>
                                                <div className="text-xs font-mono text-primary">{u.whatsappNumber || 'NO_PH_DATA'}</div>
                                            </div>

                                            <div className="space-y-2">
                                                <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Credentials & Portfolio</div>
                                                {u.portfolio && u.portfolio.length > 0 ? (
                                                    <a 
                                                        href={u.portfolio[0].url} 
                                                        target="_blank" 
                                                        rel="noopener noreferrer"
                                                        className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/5 hover:border-primary/50 group/link transition-all"
                                                    >
                                                        <span className="text-[10px] font-bold text-zinc-300 uppercase truncate max-w-[150px]">{u.portfolio[0].name}</span>
                                                        <ExternalLink className="h-3 w-3 text-zinc-500 group-hover/link:text-primary transition-colors" />
                                                    </a>
                                                ) : (
                                                    <div className="p-3 text-center border border-dashed border-white/5 rounded-xl text-[9px] font-bold text-zinc-600 uppercase">No Portfolio Data</div>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-3 pt-2">
                                            <button 
                                                onClick={() => handleVerifyEditor(u.uid)}
                                                className="flex-1 h-11 bg-primary text-black text-[10px] font-bold uppercase tracking-widest rounded-xl hover:bg-primary/90 transition-all shadow-[0_0_20px_rgba(var(--primary),0.2)]"
                                            >
                                                Authorize Entry
                                            </button>
                                            <button 
                                                onClick={() => handleDeleteUser(u.uid)}
                                                className="h-11 px-4 bg-muted border border-border hover:bg-red-500/10 hover:border-red-500 hover:text-red-500 text-muted-foreground rounded-xl transition-all"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </motion.div>
                                ))
                            )}
                        </div>
                    </motion.div>
                )}

                {activeTab === 'whatsapp' && (
                    <motion.div
                        key="whatsapp"
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.98 }}
                        className="p-8 space-y-6 max-w-4xl"
                    >
                        <div className="flex flex-col gap-2">
                            <h2 className="text-xl font-bold tracking-tight text-white mb-1 flex items-center gap-2">
                                <Monitor className="h-5 w-5 text-primary" />
                                Notifications Configuration
                            </h2>
                            <p className="text-xs font-medium text-zinc-400 leading-relaxed max-w-2xl">
                                Manage automated WhatsApp messages sent to users based on triggers. Customize the text here. Dynamic variables like <code className="text-[10px] text-primary bg-primary/10 px-1 py-0.5 rounded font-mono">{`{{reviewLink}}`}</code> will be automatically replaced with the actual link when sending 'First Draft Ready'.
                            </p>
                        </div>
                        
                        <div className="space-y-4 pt-4">
                            {[
                                { key: 'PROJECT_RECEIVED', label: '1. Project Uploaded (To Client)' },
                                { key: 'EDITOR_ASSIGNED', label: '2. Editor Assigned (To Client)' },
                                { key: 'EDITOR_ACCEPTED', label: '3. Editor Accepted/Active (To Client)' },
                                { key: 'PROPOSAL_UPLOADED', label: '4. First Draft Ready (To Client)' },
                                { key: 'PROJECT_COMPLETED', label: '5. Project Finalized/Completed (To Client)' }
                            ].map((topic) => (
                                <div key={topic.key} className="p-5 border border-white/5 bg-white/[0.01] rounded-2xl flex flex-col gap-3">
                                    <div className="flex justify-between items-center">
                                        <Label className="text-white text-[10px] font-bold uppercase tracking-widest">{topic.label}</Label>
                                        <span className="text-[9px] font-mono text-zinc-600 bg-white/5 py-1 px-2 rounded flex items-center gap-2">
                                            <Terminal className="h-3 w-3" />
                                            {topic.key}
                                        </span>
                                    </div>
                                    <textarea
                                      className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-sm text-zinc-300 font-medium placeholder:text-zinc-600 focus:outline-none focus:border-primary/50 transition-colors resize-none"
                                      rows={2}
                                      value={whatsappTemplates[topic.key] || ''}
                                      onChange={(e) => setWhatsappTemplates({ ...whatsappTemplates, [topic.key]: e.target.value })}
                                      placeholder="Leave blank to use default template..."
                                    />
                                </div>
                            ))}
                        </div>
                        
                        <button
                            onClick={handleUpdateWhatsAppTemplates}
                            disabled={isUpdatingTemplates}
                            className="mt-6 flex h-14 w-full items-center justify-center rounded-xl bg-primary text-[11px] font-black uppercase tracking-widest text-[#161920] shadow-[0_0_20px_rgba(var(--primary),0.2)] hover:shadow-[0_0_30px_rgba(var(--primary),0.4)] disabled:opacity-50 transition-all gap-2"
                        >
                            {isUpdatingTemplates ? (
                                <>
                                    <RefreshCw className="h-4 w-4 animate-spin" />
                                    Synchronizing Nodes...
                                </>
                            ) : (
                                <>
                                    <Save className="h-4 w-4" />
                                    Save Configuration
                                </>
                            )}
                        </button>
                    </motion.div>
                )}


                </AnimatePresence>
            </div>

            <div className="p-6 border-t border-border bg-muted/30 flex items-center justify-between">
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
                    Operational Scope: {activeTab === 'users' ? filteredUsers.length : filteredProjects.length} units indexed
                </span>
                <div className="flex items-center gap-2">
                    <button className="h-9 px-4 rounded-lg border border-border bg-muted/50 text-[10px] font-bold text-muted-foreground uppercase tracking-widest hover:text-foreground hover:bg-muted disabled:opacity-30 transition-all active:scale-[0.98]" disabled>Back</button>
                    <button className="h-9 px-4 rounded-lg border border-border bg-muted/50 text-[10px] font-bold text-muted-foreground uppercase tracking-widest hover:text-foreground hover:bg-muted disabled:opacity-30 transition-all active:scale-[0.98]" disabled>Next</button>
                </div>
            </div>
       </motion.div>

       {/* Modals */}
       <Modal isOpen={isAssignModalOpen} onClose={() => setIsAssignModalOpen(false)} title="Assign an Editor">
             <div className="space-y-4 mb-4">
                 <div className="space-y-1.5">
                     <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Editor Revenue Share (₹)</label>
                     <input 
                         type="number"
                         value={assignEditorPrice}
                         onChange={(e) => setAssignEditorPrice(e.target.value)}
                         placeholder="e.g. 5000"
                         className="w-full h-11 bg-black/20 border border-white/10 rounded-lg px-4 text-sm text-white focus:outline-none focus:border-primary/50 transition-colors"
                     />
                 </div>
             </div>
             <div className="space-y-3 mt-6 max-h-[450px] overflow-y-auto pr-2 custom-scrollbar">
                 {users.filter(u => u.role === 'editor' && u.onboardingStatus === 'approved').map(ed => {
                     const currentActiveCount = projects.filter(p => p.assignedEditorId === ed.uid && !['completed', 'approved'].includes(p.status)).length;
                     const isFull = currentActiveCount >= 5;
                     
                     return (
                     <button 
                        key={ed.uid} 
                        disabled={isFull}
                        onClick={() => handleAssignEditor(ed.uid)} 
                        className={cn(
                            "w-full flex items-center justify-between p-4 rounded-xl bg-white/[0.02] border border-white/10 hover:bg-white/[0.05] hover:border-primary/40 transition-all group/ed",
                            isFull && "opacity-30 grayscale pointer-events-none"
                        )}
                    >
                         <div className="flex items-center gap-4 text-left">
                             <Avatar className="h-10 w-10 border border-white/10 rounded-lg bg-white/[0.03]">
                                 <AvatarImage src={ed.photoURL || undefined} className="object-cover" />
                                 <AvatarFallback className="text-primary font-bold text-xs uppercase">{ed.displayName?.[0]}</AvatarFallback>
                             </Avatar>
                             <div>
                                 <div className="text-sm font-bold text-white group-hover/ed:text-primary transition-colors">{ed.displayName}</div>
                                 <div className="text-xs text-zinc-300 font-semibold mt-0.5 truncate max-w-[180px]">{ed.email}</div>
                                 <div className="flex items-center gap-2 mt-2">
                                     <div className="h-1 w-16 bg-white/5 rounded-full overflow-hidden">
                                        <div className="h-full bg-primary" style={{ width: `${(currentActiveCount/5)*100}%` }} />
                                     </div>
                                     <span className="text-[8px] font-bold uppercase tracking-widest text-zinc-500">{currentActiveCount} / 5 Active Projects</span>
                                 </div>
                             </div>
                         </div>
                         <div className="flex flex-col items-end">
                             {isFull ? (
                                 <span className="text-[8px] font-bold uppercase tracking-widest bg-red-500/10 text-red-500 border border-red-500/20 px-1.5 py-0.5 rounded">Fully Booked</span>
                             ) : (
                                <div className="h-8 w-8 rounded-lg bg-white/[0.03] border border-white/10 flex items-center justify-center group-hover/ed:bg-primary/20 group-hover/ed:border-primary/50 transition-all">
                                    <ArrowUpRight className="h-3.5 w-3.5 text-zinc-600 group-hover/ed:text-primary" />
                                </div>
                             )}
                         </div>
                     </button>
                     );
                  })}
             </div>
       </Modal>

       <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title="Edit Project Details">
             <div className="space-y-6 mt-8">
                 <div className="space-y-2">
                     <Label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 ml-1">Project Price (₹)</Label>
                     <input 
                        className="w-full h-12 bg-white/[0.02] border border-white/10 rounded-lg px-4 text-white focus:outline-none focus:border-primary/50 transition-all font-bold text-lg tabular-nums"
                        type="number"
                        value={editForm.totalCost}
                        onChange={e => setEditForm({...editForm, totalCost: Number(e.target.value)})}
                    />
                 </div>
                 <div className="space-y-2">
                     <Label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 ml-1">Project Status</Label>
                     <select 
                        className="w-full h-12 bg-white/[0.02] border border-white/10 rounded-lg px-4 text-white focus:outline-none focus:border-primary/50 transition-all appearance-none cursor-pointer font-bold uppercase text-xs tracking-widest"
                        value={editForm.status}
                        onChange={e => setEditForm({...editForm, status: e.target.value})}
                    >
                         <option value="pending_assignment" className="bg-[#0F1115]">QUEUE: AWAITING_EDITOR</option>
                         <option value="active" className="bg-[#0F1115]">STATE: PRODUCTION_IN_PROGRESS</option>
                         <option value="in_review" className="bg-[#0F1115]">STATE: QA_REVIEW_CYCLE</option>
                         <option value="approved" className="bg-[#0F1115]">STATE: DELIVERABLE_AUTHORIZED</option>
                         <option value="completed" className="bg-[#0F1115]">STATE: ARCHIVE_FULFILLED</option>
                     </select>
                 </div>
                 
                 <div className="pt-4 flex gap-3">
                     <button 
                        className="flex-1 h-12 bg-white text-black font-bold uppercase text-[11px] tracking-widest rounded-lg hover:bg-zinc-200 transition-all active:scale-[0.98]"
                        onClick={handleUpdateProject}
                    >
                         Save Changes
                     </button>
                     <button 
                        className="h-12 px-6 bg-white/[0.03] border border-white/10 text-zinc-500 hover:text-white transition-all rounded-lg text-[11px] font-bold uppercase tracking-widest"
                        onClick={() => setIsEditModalOpen(false)}
                    >
                         Abort
                     </button>
                 </div>
             </div>
       </Modal>

        {/* User Details Modal */}
        <Modal 
            isOpen={isUserDetailModalOpen} 
            onClose={() => setIsUserDetailModalOpen(false)} 
            title="User Profile Details"
            maxWidth="max-w-3xl"
        >
            {selectedUserDetail && (
                <div className="mt-8 space-y-8 max-h-[70vh] overflow-y-auto pr-4 custom-scrollbar">
                    {/* Profile Header */}
                    <div className="flex flex-col md:flex-row items-center md:items-start gap-8">
                         <div className="relative">
                            <div className="h-32 w-32 relative rounded-[2rem] overflow-hidden border-4 border-white/5 bg-white/[0.02] shadow-2xl">
                                {selectedUserDetail.photoURL ? (
                                    <Image 
                                        src={selectedUserDetail.photoURL} 
                                        alt={selectedUserDetail.displayName || ""} 
                                        fill 
                                        className="object-cover"
                                    />
                                ) : (
                                    <div className="h-full w-full flex items-center justify-center bg-primary/10 text-primary text-4xl font-heading font-black">
                                        {selectedUserDetail.displayName?.[0] || "U"}
                                    </div>
                                )}
                            </div>
                         </div>

                         <div className="flex-1 text-center md:text-left space-y-3">
                            <div>
                                <h2 className="text-3xl font-heading font-black tracking-tight text-white">{selectedUserDetail.displayName}</h2>
                                <p className="text-zinc-500 font-mono text-[10px] uppercase tracking-[0.2em] mt-1">User ID: {selectedUserDetail.uid}</p>
                            </div>

                            <div className="flex flex-wrap items-center justify-center md:justify-start gap-3">
                                <span className={cn(
                                    "px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-widest border transition-all",
                                    selectedUserDetail.role === 'admin' ? "bg-red-500/10 text-red-500 border-red-500/20" :
                                    selectedUserDetail.role === 'client' ? "bg-blue-500/10 text-blue-500 border-blue-500/20" :
                                    "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                                )}>
                                    {selectedUserDetail.role?.replace('_', ' ')}
                                </span>
                                <span className={cn(
                                    "px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-widest border transition-all",
                                    (selectedUserDetail as any).status !== 'inactive' 
                                        ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" 
                                        : "bg-red-500/10 text-red-500 border-red-500/20"
                                )}>
                                    Status: {(selectedUserDetail as any).status?.toUpperCase() || 'ACTIVE'}
                                </span>
                            </div>
                         </div>
                    </div>

                    {/* Contact & Auth Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-4">
                            <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2 px-1">
                                <Mail className="h-3 w-3 text-primary" /> Contact Details
                            </h4>
                            <div className="enterprise-card p-6 bg-white/[0.01] border-white/5 space-y-4">
                                <div className="space-y-1.5">
                                    <Label className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest ml-1">Email</Label>
                                    <div className="p-3 bg-white/[0.03] border border-white/10 rounded-lg text-sm font-medium text-white flex items-center justify-between group/email">
                                        <span className="truncate">{selectedUserDetail.email}</span>
                                        <button onClick={() => { navigator.clipboard.writeText(selectedUserDetail.email!); toast.success("Copied"); }} className="opacity-0 group-hover/email:opacity-100 transition-opacity">
                                            <Copy className="h-3 w-3 text-zinc-600 hover:text-white" />
                                        </button>
                                    </div>
                                </div>
                                {selectedUserDetail.phoneNumber && (
                                    <div className="space-y-1.5">
                                        <Label className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest ml-1">Phone</Label>
                                        <div className="p-3 bg-white/[0.03] border border-white/10 rounded-lg text-sm text-white">
                                            {selectedUserDetail.phoneNumber}
                                        </div>
                                    </div>
                                )}
                                {selectedUserDetail.whatsappNumber && (
                                    <div className="space-y-1.5 pt-2 border-t border-white/5">
                                        <Label className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest ml-1 flex items-center gap-1.5"><MessageSquare className="h-3 w-3 text-emerald-500" /> WhatsApp</Label>
                                        <div className="p-3 bg-white/[0.03] border border-white/10 rounded-lg text-sm font-medium text-white flex items-center justify-between group/wa">
                                            <span className="truncate">{selectedUserDetail.whatsappNumber}</span>
                                            <a href={`https://wa.me/${selectedUserDetail.whatsappNumber.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer" className="opacity-0 group-hover/wa:opacity-100 transition-opacity">
                                                <ExternalLink className="h-4 w-4 text-emerald-400 hover:text-emerald-300" />
                                            </a>
                                        </div>
                                    </div>
                                )}
                                {selectedUserDetail.portfolio && Array.isArray(selectedUserDetail.portfolio) && selectedUserDetail.portfolio.length > 0 ? (
                                    <div className="space-y-2 pt-2 border-t border-white/5">
                                        <Label className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest ml-1">Portfolio Links</Label>
                                        <div className="space-y-2">
                                            {selectedUserDetail.portfolio.map((port: any, idx: number) => (
                                                <a key={idx} href={port.url || port} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-3 bg-white/[0.03] border border-white/10 rounded-lg text-sm text-blue-400 hover:text-blue-300 hover:bg-white/[0.05] transition-all truncate">
                                                    <Globe className="h-3.5 w-3.5 flex-shrink-0 text-blue-500/70" />
                                                    <span className="truncate">{port.name || port.url || port}</span>
                                                </a>
                                            ))}
                                        </div>
                                    </div>
                                ) : selectedUserDetail.portfolio && typeof selectedUserDetail.portfolio === 'string' ? (
                                    <div className="space-y-1.5 pt-2 border-t border-white/5">
                                        <Label className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest ml-1">Portfolio Link</Label>
                                        <a href={selectedUserDetail.portfolio as string} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-3 bg-white/[0.03] border border-white/10 rounded-lg text-sm text-blue-400 hover:text-blue-300 hover:bg-white/[0.05] transition-all truncate">
                                            <Globe className="h-3.5 w-3.5 flex-shrink-0 text-blue-500/70" />
                                            <span className="truncate">{selectedUserDetail.portfolio}</span>
                                        </a>
                                    </div>
                                ) : null}
                            </div>
                        </div>

                        {selectedUserDetail.initialPassword && (
                            <div className="space-y-4">
                                <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2 px-1">
                                    <Shield className="h-3 w-3 text-primary" /> System Access
                                </h4>
                                <div className="enterprise-card p-6 bg-white/[0.01] border-white/5">
                                    <Label className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest ml-1">Default Key</Label>
                                    <div className="p-3 bg-white/[0.03] border border-white/10 rounded-lg text-sm font-mono text-primary flex items-center justify-between group/key mt-1.5">
                                        <span>{selectedUserDetail.initialPassword}</span>
                                        <button onClick={() => { navigator.clipboard.writeText(selectedUserDetail!.initialPassword!); toast.success("Copied"); }} className="opacity-0 group-hover/key:opacity-100 transition-opacity">
                                            <Copy className="h-3 w-3 text-zinc-600 hover:text-white" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Role Metrics */}
                    <div className="pt-6 border-t border-white/5">
                        {selectedUserDetail.role === 'editor' && (
                            <div className="space-y-8">
                                <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2 px-1">
                                    <Star className="h-3 w-3 text-primary" /> Performance metrics
                                </h4>
                                {(() => {
                                    const editorProjects = projects.filter(p => p.assignedEditorId === selectedUserDetail.uid);
                                    const completedEditorProjects = editorProjects.filter(p => p.status === 'completed' || p.status === 'approved');
                                    const totalEarnings = completedEditorProjects.reduce((acc, p) => acc + (p.editorPrice || 0), 0);
                                    const totalPaid = completedEditorProjects.filter(p => p.editorPaid).reduce((acc, p) => acc + (p.editorPrice || 0), 0);
                                    const pendingDues = totalEarnings - totalPaid;

                                    return (
                                        <>
                                            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                                                <div className="enterprise-card p-4 bg-white/[0.01] border-white/5 text-center">
                                                    <div className="text-xl font-black text-white">{completedEditorProjects.length}</div>
                                                    <div className="text-[8px] font-bold text-zinc-600 uppercase tracking-widest mt-1">Completed</div>
                                                </div>
                                                <div className="enterprise-card p-4 bg-white/[0.01] border-white/5 text-center">
                                                    <div className="text-xl font-black text-white">₹{totalEarnings.toLocaleString()}</div>
                                                    <div className="text-[8px] font-bold text-zinc-600 uppercase tracking-widest mt-1">Total Earned</div>
                                                </div>
                                                <div className="enterprise-card p-4 bg-white/[0.01] border-white/5 text-center">
                                                    <div className="text-xl font-black text-red-400">₹{pendingDues.toLocaleString()}</div>
                                                    <div className="text-[8px] font-bold text-red-500/50 uppercase tracking-widest mt-1">Pending Dues</div>
                                                </div>
                                                <div className="enterprise-card p-4 bg-white/[0.01] border-white/5 text-center">
                                                    <div className="text-xl font-black text-white">{editorProjects.filter(p => !['completed', 'approved', 'archived'].includes(p.status)).length}</div>
                                                    <div className="text-[8px] font-bold text-zinc-600 uppercase tracking-widest mt-1">Active</div>
                                                </div>
                                                <div className="enterprise-card p-4 bg-white/[0.01] border-white/5 text-center">
                                                    <div className="text-xl font-black text-amber-500">{selectedUserDetail.rating || 'N/A'}</div>
                                                    <div className="text-[8px] font-bold text-zinc-600 uppercase tracking-widest mt-1">Rating</div>
                                                </div>
                                            </div>
                                            <div className="space-y-6 pt-4">
                                                {/* Pending Dues Section */}
                                                <div className="space-y-4">
                                                    <Label className="text-[9px] font-bold text-red-500/80 uppercase tracking-widest ml-1 flex items-center gap-2">
                                                        <AlertCircle className="h-3 w-3 text-red-500" /> Pending Dues History
                                                    </Label>
                                                    <div className="bg-red-500/[0.02] border border-red-500/10 rounded-2xl divide-y divide-red-500/10 overflow-hidden">
                                                        {completedEditorProjects.filter(p => !p.editorPaid && (p.editorPrice || 0) > 0).length === 0 ? (
                                                            <div className="p-8 text-center text-zinc-600 text-[10px] font-bold uppercase tracking-widest">No pending dues</div>
                                                        ) : (
                                                            completedEditorProjects.filter(p => !p.editorPaid && (p.editorPrice || 0) > 0).map(p => {
                                                                const pm = users.find(u => u.uid === p.assignedPMId);
                                                                const isCompleted = p.status === 'completed' || p.status === 'approved';
                                                                return (
                                                                    <div key={p.id} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 group hover:bg-red-500/[0.02] transition-colors">
                                                                        <div>
                                                                            <div className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
                                                                                {p.name}
                                                                                <span className="text-[9px] bg-white/5 px-2 py-0.5 rounded text-zinc-400 border border-white/5">
                                                                                    PM: {pm ? pm.displayName : 'Unassigned'}
                                                                                </span>
                                                                            </div>
                                                                            <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mt-1 flex items-center gap-2">
                                                                                <span>{p.status.replace('_', ' ')}</span>
                                                                                <span>&bull;</span>
                                                                                <span>Due: ₹{(p.editorPrice || 0).toLocaleString()}</span>
                                                                            </div>
                                                                        </div>
                                                                        <div className="flex items-center gap-4 align-middle">
                                                                            <div className="text-right flex flex-col items-end">
                                                                                <div className="text-xs font-black text-red-400">₹{(p.editorPrice || 0).toLocaleString()}</div>
                                                                                <div className="text-[8px] font-bold text-red-500/50 uppercase tracking-widest leading-none mt-1">Unpaid Balance</div>
                                                                            </div>
                                                                            {isCompleted && (
                                                                                <button 
                                                                                    onClick={() => handleReimburseEditor(p.id)}
                                                                                    className="h-8 text-[9px] font-bold bg-primary hover:bg-white hover:text-black text-primary-foreground px-4 rounded transition-all uppercase tracking-widest whitespace-nowrap"
                                                                                >
                                                                                    Reimburse
                                                                                </button>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Associated Projects Section */}
                                                <div className="space-y-4 pt-4 border-t border-white/5">
                                                    <Label className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest ml-1 flex items-center gap-2">
                                                        <FolderOpen className="h-3 w-3 text-primary" /> Associated Projects
                                                    </Label>
                                                    <div className="bg-white/[0.01] border border-white/10 rounded-2xl divide-y divide-white/5 overflow-hidden">
                                                        {editorProjects.length === 0 ? (
                                                            <div className="p-8 text-center text-zinc-600 text-[10px] font-bold uppercase tracking-widest">No projects found</div>
                                                        ) : (
                                                            editorProjects.map(p => {
                                                                const pm = users.find(u => u.uid === p.assignedPMId);
                                                                const isCompleted = p.status === 'completed' || p.status === 'approved';
                                                                return (
                                                                    <div key={p.id} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                                                        <div>
                                                                            <div className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
                                                                                {p.name}
                                                                                <span className="text-[9px] bg-white/5 px-2 py-0.5 rounded text-zinc-400 border border-white/5">
                                                                                    PM: {pm ? pm.displayName : 'Unassigned'}
                                                                                </span>
                                                                            </div>
                                                                            <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mt-1">{p.status.replace('_', ' ')}</div>
                                                                        </div>
                                                                        <div className="flex items-center gap-4 align-middle">
                                                                            <div className="text-right flex flex-col items-end">
                                                                                <div className="text-xs font-black text-white">₹{(p.editorPrice || 0).toLocaleString()}</div>
                                                                                <div className="text-[8px] font-bold text-zinc-500 uppercase tracking-widest leading-none mt-1">Revenue Assigned</div>
                                                                            </div>
                                                                            {isCompleted && p.editorPaid && (
                                                                                <span className="h-8 flex items-center text-[9px] font-bold text-emerald-400 border border-emerald-500/20 bg-emerald-500/10 px-4 rounded uppercase tracking-widest whitespace-nowrap">
                                                                                    Reimbursed
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </>
                                    );
                                })()}
                            </div>
                        )}

                        {selectedUserDetail.role === 'project_manager' && (
                            <div className="space-y-8">
                                <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2 px-1">
                                    <LayoutGrid className="h-3 w-3 text-primary" /> Operations Managed
                                </h4>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                    <div className="enterprise-card p-4 bg-white/[0.01] border-white/5 text-center">
                                        <div className="text-xl font-black text-white">{projects.filter(p => p.assignedPMId === selectedUserDetail.uid).length}</div>
                                        <div className="text-[8px] font-bold text-zinc-600 uppercase tracking-widest mt-1">Projects</div>
                                    </div>
                                    <div className="enterprise-card p-4 bg-white/[0.01] border-white/5 text-center col-span-2">
                                        <div className="text-xl font-black text-emerald-500">₹{projects.filter(p => p.assignedPMId === selectedUserDetail.uid).reduce((acc, p) => acc + (p.totalCost || 0), 0).toLocaleString()}</div>
                                        <div className="text-[8px] font-bold text-zinc-600 uppercase tracking-widest mt-1">Volume Managed</div>
                                    </div>
                                </div>
                                <div className="space-y-3 pt-6 border-t border-white/5">
                                    <Label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Auto-Assign Cap (Max Projects)</Label>
                                    <div className="flex items-center gap-4">
                                        <input 
                                            type="number" 
                                            className="w-32 h-10 px-4 rounded-lg bg-white/[0.02] border border-white/10 text-white focus:border-primary/50 focus:outline-none transition-all font-medium text-sm" 
                                            value={selectedUserDetail.maxProjectLimit || 10}
                                            onChange={async (e) => {
                                                const val = parseInt(e.target.value) || 10;
                                                setSelectedUserDetail({...selectedUserDetail, maxProjectLimit: val});
                                                try {
                                                    await updateDoc(doc(db, "users", selectedUserDetail.uid), {
                                                        maxProjectLimit: val,
                                                        updatedAt: Date.now()
                                                    });
                                                } catch(err) {
                                                    console.error(err);
                                                }
                                            }}
                                        />
                                        <span className="text-[11px] font-medium text-zinc-500">Max active requests handler</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {selectedUserDetail.role === 'sales_executive' && (
                            <div className="space-y-8">
                                <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2 px-1">
                                    <TrendingUp className="h-3 w-3 text-primary" /> Acquisition Metrics
                                </h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="enterprise-card p-4 bg-white/[0.01] border-white/5 text-center">
                                        <div className="text-2xl font-black text-white">{users.filter(u => u.role === 'client' && (u.managedBy === selectedUserDetail.uid || u.createdBy === selectedUserDetail.uid)).length}</div>
                                        <div className="text-[8px] font-bold text-zinc-600 uppercase tracking-widest mt-1">Clients Generated</div>
                                    </div>
                                    <div className="enterprise-card p-4 bg-white/[0.01] border-white/5 text-center">
                                        <div className="text-2xl font-black text-emerald-500">
                                            ₹{projects.filter(p => users.some(u => u.uid === p.clientId && (u.managedBy === selectedUserDetail.uid || u.createdBy === selectedUserDetail.uid))).reduce((acc, p) => acc + (p.amountPaid || 0), 0).toLocaleString()}
                                        </div>
                                        <div className="text-[8px] font-bold text-zinc-600 uppercase tracking-widest mt-1">Attributed Revenue</div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="pt-8 flex flex-col sm:flex-row gap-4">
                        <button 
                            onClick={() => { handleToggleUserStatus(selectedUserDetail.uid, (selectedUserDetail as any).status !== 'inactive'); setIsUserDetailModalOpen(false); }}
                            className={cn(
                                "flex-1 h-12 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all border flex items-center justify-center gap-2",
                                (selectedUserDetail as any).status === 'inactive' 
                                    ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" 
                                    : "bg-white/[0.02] text-zinc-400 border-white/10 hover:text-white"
                            )}
                        >
                            <Shield className="h-4 w-4" />
                            {(selectedUserDetail as any).status === 'inactive' ? "Reactivate" : "Suspend"}
                        </button>
                        <button 
                            onClick={() => { handleDeleteUser(selectedUserDetail.uid); setIsUserDetailModalOpen(false); }}
                            className="flex-1 h-12 bg-red-500 text-white font-bold uppercase text-[10px] tracking-widest rounded-xl hover:bg-red-600 transition-all flex items-center justify-center gap-2"
                        >
                            <Trash2 className="h-4 w-4" /> Delete Account
                        </button>
                    </div>
                </div>
            )}
        </Modal>

        {/* Project Audit Inspector */}
        <Modal 
            isOpen={isProjectDetailModalOpen} 
            onClose={() => setIsProjectDetailModalOpen(false)} 
            title={`Project status dashboard for Admin: ${inspectProject?.name}`}
            maxWidth="max-w-4xl"
        >
            {inspectProject && (
                <div className="mt-8 space-y-10 max-h-[75vh] overflow-y-auto pr-4 custom-scrollbar">
                    {/* Header Spec */}
                    <div className="flex flex-col gap-6">
                        <div className="flex flex-col gap-4 border-b border-white/5 pb-6">
                            <div className="flex items-center gap-4">
                                <div className="h-12 w-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                                    <MonitorPlay className="h-6 w-6" />
                                </div>
                                <div>
                                    <h4 className="text-xl font-bold text-white tracking-tight">{inspectProject.name}</h4>
                                    <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mt-1">Management Overview // Ref: {inspectProject.id}</p>
                                </div>
                            </div>
                            <div className="mt-2">
                                <ProjectStatusBadges project={inspectProject} />
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
                                    {users.find(u => u.uid === inspectProject.assignedPMId)?.displayName || 'Unassigned'}
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
                                [...inspectProject.logs].reverse().map((log, i) => (
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

        {/* Add Editor Modal */}
        <Modal 
            isOpen={isAddEditorModalOpen} 
            onClose={() => setIsAddEditorModalOpen(false)} 
            title="Create Editor Account"
            maxWidth="max-w-md"
        >
            <form onSubmit={handleAddEditor} className="space-y-4 mt-6">
                 <div className="space-y-1.5">
                     <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Full Name</label>
                     <input 
                         required
                         type="text"
                         value={newEditor.name}
                         onChange={(e) => setNewEditor({...newEditor, name: e.target.value})}
                         className="w-full h-11 bg-black/20 border border-white/10 rounded-lg px-4 text-sm text-white focus:outline-none focus:border-primary/50 transition-colors"
                     />
                 </div>
                 <div className="space-y-1.5">
                     <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Email Address</label>
                     <input 
                         required
                         type="email"
                         value={newEditor.email}
                         onChange={(e) => setNewEditor({...newEditor, email: e.target.value})}
                         className="w-full h-11 bg-black/20 border border-white/10 rounded-lg px-4 text-sm text-white focus:outline-none focus:border-primary/50 transition-colors"
                     />
                 </div>
                 <div className="space-y-1.5">
                     <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Password</label>
                     <input 
                         required
                         type="text"
                         value={newEditor.password}
                         onChange={(e) => setNewEditor({...newEditor, password: e.target.value})}
                         className="w-full h-11 bg-black/20 border border-white/10 rounded-lg px-4 text-sm text-white focus:outline-none focus:border-primary/50 transition-colors"
                     />
                 </div>
                 <div className="space-y-1.5">
                     <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">WhatsApp Number (+91...)</label>
                     <input 
                         required
                         type="text"
                         value={newEditor.whatsapp}
                         onChange={(e) => setNewEditor({...newEditor, whatsapp: e.target.value})}
                         className="w-full h-11 bg-black/20 border border-white/10 rounded-lg px-4 text-sm text-white focus:outline-none focus:border-primary/50 transition-colors"
                     />
                 </div>
                 <div className="space-y-1.5">
                     <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Portfolio URL</label>
                     <input 
                         required
                         type="url"
                         value={newEditor.portfolio}
                         onChange={(e) => setNewEditor({...newEditor, portfolio: e.target.value})}
                         className="w-full h-11 bg-black/20 border border-white/10 rounded-lg px-4 text-sm text-white focus:outline-none focus:border-primary/50 transition-colors"
                     />
                 </div>
                 <button 
                     type="submit"
                     disabled={isCreatingEditor}
                     className="w-full h-12 mt-4 bg-primary text-black font-black uppercase text-[10px] tracking-widest rounded-xl hover:bg-primary/90 transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(var(--primary),0.2)] disabled:opacity-50"
                 >
                     {isCreatingEditor ? (
                         <><RefreshCw className="h-4 w-4 animate-spin" /> Creating Account...</>
                     ) : "Generate & Authorize"}
                 </button>
            </form>
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
                <div className="h-10 w-10 bg-white/[0.03] border border-white/10 rounded-lg flex items-center justify-center text-zinc-400 group-hover:text-primary group-hover:border-primary/30 transition-all duration-300">
                    {icon}
                </div>
                {alert && <div className="h-2 w-2 rounded-full bg-primary animate-pulse shadow-[0_0_10px_rgba(var(--primary),0.8)]" />}
            </div>
            
            <div className="space-y-1.5">
                <span className="text-[11px] uppercase font-bold tracking-widest text-zinc-500 group-hover:text-zinc-400 transition-colors">{label}</span>
                <div className="flex items-end gap-3">
                    <span className="text-3xl font-black tracking-tight text-white font-heading tabular-nums">{value}</span>
                </div>
                
                <div className="flex items-center gap-3 pt-4 border-t border-white/5 mt-4">
                    {trend && (
                        <span className={cn(
                            "flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest", 
                            trendUp ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20" : "bg-white/5 text-zinc-500 border border-white/5"
                        )}>
                            {trend}
                        </span>
                    )}
                    <span className="text-zinc-600 text-[10px] font-bold uppercase tracking-wider">{subtext}</span>
                </div>
            </div>
        </motion.div>
    );
}

function StatusIndicator({ status }: { status: string }) {
    const config: any = {
        active: { label: "Editing", color: "text-blue-400", bg: "bg-blue-400/5", border: "border-blue-400/20" },
        in_review: { label: "Review", color: "text-purple-400", bg: "bg-purple-400/5", border: "border-purple-400/20" },
        pending_assignment: { label: "Waiting", color: "text-amber-400", bg: "bg-amber-400/5", border: "border-amber-400/20" },
        approved: { label: "Approved", color: "text-emerald-400", bg: "bg-emerald-400/5", border: "border-emerald-400/20" },
        completed: { label: "Completed", color: "text-zinc-500", bg: "bg-zinc-500/5", border: "border-zinc-500/20" },
    };
    const s = config[status] || config.completed;
    return (
        <span className={cn(
            "inline-flex items-center gap-2 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest border transition-all", 
            s.bg, s.color, s.border
        )}>
            <div className={cn("w-1 h-1 rounded-full bg-current", status === 'active' && "animate-pulse shadow-[0_0_5px_currentColor]")} />
            {s.label}
        </span>
    );
}

function ProjectStatusBadges({ project }: { project: any }) {
    const badges = [];

    // Overall Status
    if (project.status === 'completed') {
        badges.push({ label: "Completed", color: "text-zinc-500", bg: "bg-zinc-500/10", border: "border-zinc-500/20" });
    } else if (project.status === 'in_review') {
        badges.push({ label: "In Review", color: "text-purple-400", bg: "bg-purple-400/10", border: "border-purple-400/20" });
    } else if (project.status === 'active') {
        badges.push({ label: "Editing", color: "text-blue-400", bg: "bg-blue-400/10", border: "border-blue-400/20", pulse: true });
    } else if (project.status === 'approved') {
        badges.push({ label: "Approved", color: "text-emerald-400", bg: "bg-emerald-400/10", border: "border-emerald-400/20" });
    } else if (project.status === 'pending_assignment') {
        if (!project.assignedEditorId) {
            badges.push({ label: "Editor Not Assigned", color: "text-amber-400", bg: "bg-amber-400/10", border: "border-amber-400/20" });
        } else {
            badges.push({ label: "Editor Assigned", color: "text-blue-400", bg: "bg-blue-400/10", border: "border-blue-400/20" });
        }
    } else {
        badges.push({ label: project.status, color: "text-zinc-400", bg: "bg-zinc-400/10", border: "border-zinc-400/20" });
    }

    // Client Payment
    if (project.paymentStatus === 'full_paid') {
        badges.push({ label: "Client Payment Done", color: "text-emerald-500", bg: "bg-emerald-500/10", border: "border-emerald-500/20" });
    } else if (project.paymentOption === 'pay_later' && project.paymentStatus !== 'full_paid') {
        badges.push({ label: "Client Payment Left", color: "text-red-400", bg: "bg-red-400/10", border: "border-red-400/20" });
    }

    // Editor Payment
    if (project.assignedEditorId && (project.editorPrice || 0) > 0) {
        if (project.editorPaid) {
            badges.push({ label: "Editor Payment Done", color: "text-emerald-500", bg: "bg-emerald-500/10", border: "border-emerald-500/20" });
        } else {
             badges.push({ label: "Editor Payment Left", color: "text-amber-500", bg: "bg-amber-500/10", border: "border-amber-500/20" });
        }
    }

    return (
        <div className="flex flex-wrap items-center gap-1.5">
            {badges.map((b, i) => (
                <span key={i} className={cn(
                    "inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest border transition-all whitespace-nowrap", 
                    b.bg, b.color, b.border
                )}>
                    {b.pulse && <div className="w-1 h-1 rounded-full bg-current animate-pulse shadow-[0_0_5px_currentColor]" />}
                    {b.label}
                </span>
            ))}
        </div>
    );
}



