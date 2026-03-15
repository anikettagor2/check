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
    Clock,
    ChevronDown,
    Plus,
    Calendar,
    Briefcase,
    Shield,
    HardDrive,
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
    MessageSquare,
    FileText,
    ShieldCheck,
    MapPin,
    Bell,
    Film,
    Settings,
    Phone
} from "lucide-react";

import { cn } from "@/lib/utils";
import Link from "next/link";
import Image from "next/image";
import { toast } from "sonner";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button"; 
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import { assignEditor, updateProject, togglePayLater, deleteProject, deleteUser, toggleUserStatus, rejectDeletionRequest, verifyEditor, getWhatsAppTemplates, updateWhatsAppTemplates, getSystemSettings, updateSystemSettings, settleProjectPayment, addProjectLog, bulkSettleEditorDues } from "@/app/actions/admin-actions";
import { AdminOverviewGraphs } from "./admin-overview-graphs";
import { AdminPerformanceTab } from "./admin-performance";
import { ClientDocuments } from "./client-documents";


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
                <div className="h-10 w-10 bg-muted/50 border border-border rounded-lg flex items-center justify-center text-muted-foreground group-hover:text-primary group-hover:border-primary/30 transition-all duration-300">
                    {icon}
                </div>
                {alert && <div className="h-2 w-2 rounded-full bg-primary animate-pulse shadow-[0_0_10px_rgba(var(--primary),0.8)]" />}
            </div>
            
            <div className="space-y-1.5">
                <span className="text-[11px] uppercase font-bold tracking-widest text-muted-foreground group-hover:text-muted-foreground transition-colors">{label}</span>
                <div className="flex items-end gap-3">
                    <span className="text-3xl font-black tracking-tight text-foreground font-heading tabular-nums">{value}</span>
                </div>
                
                <div className="flex items-center gap-3 pt-4 border-t border-border mt-4">
                    {trend && (
                        <span className={cn(
                            "flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest", 
                            trendUp ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20" : "bg-card text-muted-foreground border border-border"
                        )}>
                            {trend}
                        </span>
                    )}
                    <span className="text-muted-foreground text-[10px] font-bold uppercase tracking-wider">{subtext}</span>
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
        completed: { label: "Completed", color: "text-muted-foreground", bg: "bg-zinc-500/5", border: "border-zinc-500/20" },
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
    if (project.status === 'completed' || project.status === 'archived') {
        badges.push({ label: "Completed", color: "text-emerald-400", bg: "bg-emerald-400/10", border: "border-emerald-400/20" });
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
        badges.push({ label: project.status, color: "text-muted-foreground", bg: "bg-zinc-400/10", border: "border-zinc-400/20" });
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

export function AdminDashboard() {
  const { user: currentUser } = useAuth();
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get('tab') as 'overview' | 'projects' | 'users' | 'team' | 'terminations' | 'requests' | 'whatsapp' | 'finance' | 'performance') || 'overview';
  const [activeTab, setActiveTab] = useState<'overview' | 'projects' | 'users' | 'team' | 'terminations' | 'requests' | 'whatsapp' | 'finance' | 'performance'>(initialTab);
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [projectFilter, setProjectFilter] = useState<'all' | 'completed' | 'active' | 'in_review' | 'pending' | 'pay_later' | 'payment_pending'>('all');
  
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [assignEditorPrice, setAssignEditorPrice] = useState<string>("");
  const [assignDeadline, setAssignDeadline] = useState<string>("");
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
  const [newEditor, setNewEditor] = useState<{name: string, email: string, password: string, whatsapp: string, portfolio: string, location: string, skills: string[], skillPrices: Record<string, string>}>({ name: '', email: '', password: '', whatsapp: '', portfolio: '', location: '', skills: [], skillPrices: {} });

  const [editForm, setEditForm] = useState({
      totalCost: 0,
      status: ''
  });

  const [stats, setStats] = useState({
    revenue: 0,
    activeProjects: 0,
    totalDuePending: 0,
    clientPending: 0,
    editorPending: 0,
    avgPayout: 0,
    profit: 0,
    totalClients: 0,
    lastPaymentDate: null as number | null
  });

  const [whatsappTemplates, setWhatsappTemplates] = useState<any>({});
  const [isUpdatingTemplates, setIsUpdatingTemplates] = useState(false);
  const [systemSettings, setSystemSettings] = useState<{ allowDuplicatePhone?: boolean }>({});



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

    getSystemSettings().then(res => {
        if (res.success && res.data) {
            setSystemSettings(res.data);
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
        const realizedRevenue = projects.reduce((acc, curr) => acc + (curr.amountPaid || 0), 0);
        const clientPending = projects.reduce((acc, curr) => acc + Math.max(0, (curr.totalCost || 0) - (curr.amountPaid || 0)), 0);
        
        const editorPending = projects.reduce((acc, curr) => {
            if (curr.assignedEditorId && !curr.editorPaid && curr.clientHasDownloaded) {
                return acc + (curr.editorPrice || 0);
            }
            return acc;
        }, 0);

        const totalEditorpayouts = projects.reduce((acc, curr) => acc + (curr.editorPrice || 0), 0);
        const projectsWithEditors = projects.filter(p => p.assignedEditorId).length;
        const avgPayout = projectsWithEditors > 0 ? totalEditorpayouts / projectsWithEditors : 0;

        const profit = projects.reduce((acc, curr) => {
            if (curr.totalCost && curr.assignedEditorId) {
                return acc + (curr.totalCost - (curr.editorPrice || 0));
            }
            return acc;
        }, 0);

        const projectsWithPayment = projects.filter(p => (p.amountPaid || 0) > 0);
        const lastPaymentDate = projectsWithPayment.length > 0 
            ? Math.max(...projectsWithPayment.map(p => p.updatedAt)) 
            : null;

        setStats({
          revenue: realizedRevenue,
          totalDuePending: clientPending,
          clientPending,
          editorPending,
          avgPayout,
          profit,
          activeProjects: projects.filter(p => !['completed', 'approved', 'archived'].includes(p.status)).length,
          totalClients: users.filter(u => u.role === 'client').length,
          lastPaymentDate
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
                 location: newEditor.location || '',
                 skills: newEditor.skills,
                 skillPrices: newEditor.skillPrices,
                 onboardingStatus: 'approved'
              });
          }

          toast.success(`Editor account created successfully`);
          setNewEditor({ name: '', email: '', password: '', whatsapp: '', portfolio: '', location: '', skills: [], skillPrices: {} });
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
        const res = await assignEditor(selectedProject.id, editorId, price, assignDeadline);
        if (res.success) {
            toast.success("Editor assigned successfully. Pending their acceptance.");
            setIsAssignModalOpen(false);
            setAssignEditorPrice("");
            setAssignDeadline("");
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
          await addProjectLog(projectId, 'PAYMENT_MARKED', { uid: currentUser?.uid || 'system', displayName: currentUser?.displayName || 'Admin' }, 'Editor payment marked as cleared.');
          toast.success("Editor payment marked as cleared.");
      } catch (error) {
          toast.error("Failed to clear payment.");
          console.error(error);
      }
  };

  const handleSettleAllDues = async (editorId: string) => {
    const editorProjects = projects.filter(p => p.assignedEditorId === editorId && p.clientHasDownloaded && !p.editorPaid);
    if (editorProjects.length === 0) return;
    
    if(!confirm(`Are you sure you want to settle all ${editorProjects.length} pending payouts for this editor?`)) return;
    
    const pids = editorProjects.map(p => p.id);
    const res = await bulkSettleEditorDues(pids, { 
        uid: currentUser!.uid, 
        displayName: currentUser!.displayName || "Admin", 
        designation: currentUser?.role === 'admin' ? 'Admin' : 'Project Manager' 
    });
    
    if(res.success) toast.success(`Settled all dues for editor.`);
    else toast.error("Failed to settle dues");
  };

   const handleUpdateProject = async () => {
      if (!selectedProject) return;
      try {
          const res = await updateProject(selectedProject.id, {
              totalCost: Number(editForm.totalCost),
              status: editForm.status
          });
          if (res.success) {
              await addProjectLog(selectedProject.id, 'PROFILE_UPDATED', { uid: currentUser?.uid || 'system', displayName: currentUser?.displayName || 'Admin' }, 'Project profile specifications updated.');
              if (editForm.status === 'completed' && selectedProject.status !== 'completed') {
                  await addProjectLog(selectedProject.id, 'COMPLETED', { uid: currentUser?.uid || 'system', displayName: currentUser?.displayName || 'Admin' }, 'Project validated and marked as completed.');
              }
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



  const filteredProjects = projects.filter(p => {
      // Text search filter
      const sq = searchQuery.toLowerCase();
      const matchesSearch = !sq || 
             p.name?.toLowerCase().includes(sq) || 
             p.clientName?.toLowerCase().includes(sq) || 
             p.id?.toLowerCase().includes(sq) ||
             users.find(u => u.uid === p.assignedEditorId)?.displayName?.toLowerCase().includes(sq) ||
             users.find(u => u.uid === p.assignedPMId)?.displayName?.toLowerCase().includes(sq);
      
      if (!matchesSearch) return false;
      
      // Status filter
      switch (projectFilter) {
          case 'completed':
              return p.status === 'completed' || p.status === 'archived';
          case 'active':
              return p.status === 'active';
          case 'in_review':
              return p.status === 'in_review';
          case 'pending':
              return p.status === 'pending_assignment' || !p.assignedEditorId;
          case 'pay_later':
              return (p as any).isPayLaterRequest === true || (p as any).paymentOption === 'pay_later';
          case 'payment_pending':
              return p.paymentStatus !== 'full_paid' && (p.totalCost || 0) > (p.amountPaid || 0);
          default:
              return true;
      }
  });

  const filteredUsers = users.filter(u => {
      const q = searchQuery.toLowerCase();
      return !q || 
             u.displayName?.toLowerCase().includes(q) || 
             u.email?.toLowerCase().includes(q) || 
             u.role?.toLowerCase().includes(q);
  });

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
               <button onClick={() => { setActiveTab('users'); setSearchQuery('client'); }} className="px-4 py-2 bg-red-500 text-white rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-red-600 transition-all active:scale-95">Review Clients</button>
           </motion.div>
       )}
       
       {/* Dashboard Header */}
       <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8 pb-8 border-b border-border">
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
                         <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Live Updates</span>
                    </div>
                </div>
                <h1 className="text-4xl md:text-5xl font-heading font-bold tracking-tight text-foreground leading-tight">
                    {currentUser?.role === 'admin' ? 'Admin' : 'Management'} <span className="text-muted-foreground">Dashboard</span>
                </h1>
                <div className="flex items-center gap-6 pt-2">
                    <div className="flex items-center gap-2 text-muted-foreground">
                        <Shield className="h-3.5 w-3.5" />
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            {currentUser?.role === 'admin' ? 'Administrator' : 'Project Manager'}
                        </span>
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
                    {['overview', 'projects', 'users', 'team', 'terminations', 'requests', 'whatsapp', 'finance', 'performance'].map(tab => (
                        <button
                            key={tab}
                            onClick={() => { setActiveTab(tab as any); setSearchQuery(""); }}
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
             <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
                  <IndicatorCard 
                      label="Total Earned" 
                      value={`₹${stats.revenue.toLocaleString()}`} 
                      icon={<IndianRupee className="h-4 w-4" />}
                      subtext="Total payments received"
                  />
                  <IndicatorCard 
                      label="Client Pending Dues" 
                      value={`₹${stats.clientPending.toLocaleString()}`} 
                      alert={stats.clientPending > 0}
                      icon={<Clock className="h-4 w-4" />}
                      subtext="Payments from clients"
                  />
                  <IndicatorCard 
                      label="Editor Pending Dues" 
                      value={`₹${stats.editorPending.toLocaleString()}`} 
                      alert={stats.editorPending > 0}
                      icon={<Clock className="h-4 w-4 text-amber-500" />}
                      subtext="Payouts to editors"
                  />
                  <IndicatorCard 
                      label="Profit Contribution" 
                      value={`₹${stats.profit.toLocaleString()}`} 
                      icon={<TrendingUp className="h-4 w-4" />}
                      subtext="Total realized margin"
                  />
                  <IndicatorCard 
                      label="Avg Payout / Project" 
                      value={`₹${Math.round(stats.avgPayout).toLocaleString()}`} 
                      icon={<ArrowUpRight className="h-4 w-4" />}
                      subtext="Average editor cost"
                  />
                  <IndicatorCard 
                      label="Last Payment Date" 
                      value={stats.lastPaymentDate ? new Date(stats.lastPaymentDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : 'N/A'} 
                      icon={<Calendar className="h-4 w-4" />}
                      subtext="Recent activity"
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
            <div className="p-6 border-b border-border flex flex-col lg:flex-row lg:items-center justify-between gap-6">
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
                         <LayoutDashboard className="h-3.5 w-3.5 text-muted-foreground" />
                         <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Viewing: {activeTab.replace('_', ' ')}</span>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {activeTab === 'projects' && (
                        <div className="flex bg-muted/50 border border-border rounded-lg p-1 flex-wrap">
                            {[
                                { key: 'all', label: 'All' },
                                { key: 'active', label: 'Editing' },
                                { key: 'in_review', label: 'In Review' },
                                { key: 'pending', label: 'Pending' },
                                { key: 'completed', label: 'Completed' },
                                { key: 'pay_later', label: 'Pay Later' },
                                { key: 'payment_pending', label: 'Payment Due' }
                            ].map(f => (
                                <button
                                    key={f.key}
                                    onClick={() => setProjectFilter(f.key as any)}
                                    className={cn(
                                        "px-3 py-1 text-[9px] font-bold uppercase tracking-widest rounded transition-all",
                                        projectFilter === f.key 
                                            ? "bg-background text-foreground shadow-sm" 
                                            : "text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    {f.label}
                                </button>
                            ))}
                        </div>
                    )}
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
                             <button className="h-10 px-4 rounded-lg border border-border bg-muted/50 text-[11px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-all flex items-center gap-2">
                                 <Filter className="h-3.5 w-3.5" />
                                 Export Data
                                 <ChevronDown className="h-3 w-3 ml-1 opacity-50" />
                             </button>
                         </DropdownMenuTrigger>
                         <DropdownMenuContent align="end" className="w-52 bg-card border-border p-1.5 rounded-xl shadow-2xl">
                             <DropdownMenuLabel className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest px-3 py-2">Download Options</DropdownMenuLabel>
                             <DropdownMenuSeparator className="my-1 bg-card" />
                             <DropdownMenuItem className="p-2.5 text-xs text-foreground/80 hover:text-foreground hover:bg-card transition-colors cursor-pointer rounded-lg">Export as JSON</DropdownMenuItem>
                             <DropdownMenuItem className="p-2.5 text-xs text-foreground/80 hover:text-foreground hover:bg-card transition-colors cursor-pointer rounded-lg">Export as CSV</DropdownMenuItem>
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
                        <tbody className="divide-y divide-border">
                            {projects.slice(0, 10).map((project, idx) => (
                                <motion.tr 
                                    key={project.id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: idx * 0.05 }}
                                    className="hover:bg-muted/50 transition-colors group"
                                >
                                    <td className="px-6 py-5">
                                        <Link href={`/dashboard/projects/${project.id}`} className="text-sm font-bold text-foreground tracking-tight hover:text-primary transition-colors cursor-pointer">{project.name}</Link>
                                        <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mt-0.5">ID: {project.id.slice(0,12)}</div>
                                    </td>
                                    <td className="px-6 py-5">
                                        <ProjectStatusBadges project={project} />
                                    </td>
                                    <td className="px-6 py-5 text-muted-foreground text-[11px] font-medium uppercase tracking-tight" suppressHydrationWarning>
                                        {new Date(project.updatedAt).toLocaleDateString()} â€” {new Date(project.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </td>
                                    <td className="px-6 py-5 text-right">
                                        <button 
                                            onClick={() => { setSelectedProject(project); setEditForm({totalCost: project.totalCost||0, status: project.status}); setIsEditModalOpen(true); }}
                                            className="h-9 w-9 flex items-center justify-center rounded-lg hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-all active:scale-[0.98]"
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
                               <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-widest border-b border-border">Assignment Flow</th>
                               <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-widest border-b border-border">Editor / Payout</th>
                               <th className="px-6 py-4 border-b border-border w-[80px]"></th>
                           </tr>
                       </thead>
                       <tbody className="divide-y divide-border">
                           {filteredProjects.map((project, idx) => (
                               <motion.tr 
                                    key={project.id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: idx * 0.05 }}
                                    className="hover:bg-muted/50 transition-colors group"
                               >
                                    <td className="px-6 py-6 border-b border-transparent group-hover:border-border">
                                        <Link href={`/dashboard/projects/${project.id}`} className="text-base font-bold text-foreground tracking-tight leading-tight hover:text-primary transition-colors cursor-pointer">{project.name}</Link>
                                         <div className="flex items-center gap-2 mt-1 flex-wrap">
                                             <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">ID: {project.id.slice(0,12)}</span>
                                             <span className={cn(
                                                "text-[8px] px-1.5 py-0.5 rounded uppercase font-bold tracking-widest border",
                                                (project as any).isPayLaterRequest
                                                    ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                                                    : "bg-zinc-500/10 text-muted-foreground border-zinc-500/20"
                                             )}>
                                                Pay Later {(project as any).isPayLaterRequest ? 'Enabled' : 'Disabled'}
                                             </span>
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
                                    <td className="px-6 py-6 border-b border-transparent group-hover:border-border">
                                        <div className="min-w-[190px] space-y-2 rounded-xl border border-border bg-muted/20 p-3">
                                            <div className="flex items-start justify-between gap-3">
                                                <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest">Sales Executive</span>
                                                <span className="text-[11px] text-foreground font-semibold text-right max-w-[120px] truncate">
                                                    {users.find(u => u.uid === project.assignedSEId)?.displayName || 'Not linked'}
                                                </span>
                                            </div>
                                            <div className="h-px bg-border" />
                                            <div className="flex items-start justify-between gap-3">
                                                <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest">Project Manager</span>
                                                <span className="text-[11px] text-foreground font-semibold text-right max-w-[120px] truncate">
                                                    {project.assignedPMId ? (users.find(u => u.uid === project.assignedPMId)?.displayName || 'Unknown PM') : 'Not assigned'}
                                                </span>
                                            </div>
                                        </div>
                                    </td>
                                   <td className="px-6 py-6">
                                        {project.assignedEditorId ? (
                                            <div className="min-w-[190px] space-y-2 rounded-xl border border-border bg-muted/20 p-3">
                                                <div className="flex items-center justify-between gap-3">
                                                    <span className="text-foreground/90 text-xs font-bold truncate max-w-[120px]">
                                                        {users.find(u => u.uid === project.assignedEditorId)?.displayName || 'Unknown Editor'}
                                                    </span>
                                                    <span className={cn(
                                                        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[9px] font-bold tracking-widest uppercase border w-fit transition-all",
                                                        project.assignmentStatus === 'accepted' ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.1)]" :
                                                        project.assignmentStatus === 'rejected' ? "bg-red-500/10 text-red-500 border-red-500/20 shadow-[0_0_10px_rgba(239,68,68,0.1)]" :
                                                        "bg-amber-500/10 text-amber-500 border-amber-500/20 shadow-[0_0_10px_rgba(245,158,11,0.1)]"
                                                    )}>
                                                        <div className={cn("w-1 h-1 rounded-full bg-current", project.assignmentStatus === 'pending' && "animate-pulse")} />
                                                        {project.assignmentStatus || 'AUTHORIZED'}
                                                    </span>
                                                </div>
                                                <div className="flex items-center justify-between gap-3">
                                                    <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest">Editor Payment</span>
                                                    <span className={cn(
                                                        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[9px] font-bold tracking-widest uppercase border",
                                                        project.editorPaid
                                                            ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                                                            : "bg-amber-500/10 text-amber-500 border-amber-500/20"
                                                    )}>
                                                        {project.editorPaid ? 'Paid' : 'Pending'}
                                                    </span>
                                                </div>
                                                <div className="flex items-center justify-between gap-3">
                                                    <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest">Payout</span>
                                                    <span className="text-[11px] font-semibold text-foreground tabular-nums">
                                                        ₹{(project.editorPrice || 0).toLocaleString()}
                                                    </span>
                                                </div>
                                                {project.assignmentStatus === 'rejected' && project.editorDeclineReason && (
                                                    <span className="text-[9px] font-medium text-red-400/80 italic max-w-[120px] truncate" title={project.editorDeclineReason}>
                                                        â€œ{project.editorDeclineReason}â€
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
                                                <button className="h-9 w-9 flex items-center justify-center rounded-lg hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-all active:scale-[0.98]"><MoreHorizontal className="h-3.5 w-3.5" /></button>
                                            </DropdownMenuTrigger>
                                             <DropdownMenuContent align="end" className="w-52 bg-popover border-border p-1.5 rounded-xl shadow-2xl">
                                                {!(project.status === 'completed' || project.status === 'archived') && (
                                                    <>
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
                                                    </>
                                                )}
                                                <DropdownMenuItem asChild className="p-2.5 text-xs text-popover-foreground hover:bg-muted transition-colors cursor-pointer rounded-lg">
                                                    <Link href={`/dashboard/projects/${project.id}`} className="flex items-center w-full">
                                                        <ExternalLink className="mr-2.5 h-3.5 w-3.5 text-muted-foreground" /> Open Project Hub
                                                    </Link>
                                                </DropdownMenuItem>
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
                                 <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-widest border-b border-border">Editor / User</th>
                                 <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-widest border-b border-border">Contact & Reach</th>
                                 <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-widest border-b border-border">Details & Tenure</th>
                                 <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-widest border-b border-border">Role & Specialization</th>
                                 <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-widest border-b border-border">Access Key</th>
                                 <th className="px-6 py-4 border-b border-border w-[80px]"></th>
                             </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {filteredUsers.map((u, idx) => (
                                <motion.tr 
                                    key={u.uid}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: idx * 0.05 }}
                                    className={cn("group hover:bg-muted/50 transition-colors", (u as any).status === 'inactive' && "opacity-40 grayscale")}
                                >
                                    <td className="px-6 py-4 cursor-pointer group/profile" onClick={() => { setSelectedUserDetail(u); setIsUserDetailModalOpen(true); }}>
                                        <div className="flex items-center gap-3">
                                            <Avatar className="h-8 w-8 border border-border rounded-md bg-muted/50 group-hover/profile:border-primary/50 transition-all">
                                                <AvatarImage src={u.photoURL || undefined} className="object-cover" />
                                                <AvatarFallback className="text-muted-foreground font-bold text-xs uppercase group-hover/profile:text-primary">{u.displayName?.[0]}</AvatarFallback>
                                            </Avatar>
                                            <div>
                                                <div className="text-sm font-bold text-foreground tracking-tight leading-tight group-hover/profile:text-primary transition-colors flex items-center gap-2">
                                                    {u.displayName}
                                                    {u.role === 'client' && u.payLater && (() => {
                                                        const uProjects = projects.filter(p => p.clientId === u.uid);
                                                        const uPending = uProjects.reduce((acc, p) => acc + ((p.totalCost || 0) - (p.amountPaid || 0)), 0);
                                                        if (uPending >= (u.creditLimit || 5000)) {
                                                            return <span className="flex items-center gap-1 text-[8px] bg-red-500 text-white px-1.5 py-0.5 rounded font-black uppercase lg:animate-pulse">Limit Exceeded</span>;
                                                        }
                                                        return null;
                                                    })()}
                                                </div>
                                                <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mt-0.5">UID: {u.uid.slice(0,8)}</div>
                                            </div>
                                        </div>
                                    </td>
                                     <td className="px-6 py-4">
                                         <div className="flex flex-col gap-0.5">
                                             <div className="text-sm text-foreground/90 font-medium tracking-tight truncate max-w-[180px]">{u.email}</div>
                                             {u.phoneNumber && (
                                                 <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">{u.phoneNumber}</div>
                                             )}
                                         </div>
                                     </td>
                                     <td className="px-6 py-4">
                                         <div className="flex flex-col gap-0.5">
                                             <div className="text-sm text-foreground/90 font-bold tracking-tight">{(u as any).location || 'Global'}</div>
                                             <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Joined {new Date(u.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
                                         </div>
                                     </td>
                                     <td className="px-6 py-4">
                                         <div className="flex flex-col gap-2">
                                             <span className={cn(
                                                 "inline-flex px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest border w-fit shadow-sm",
                                                 u.role === 'admin' ? "bg-red-500/10 text-red-500 border-red-500/20" :
                                                 u.role === 'client' ? "bg-blue-500/10 text-blue-500 border-blue-500/20" :
                                                 u.role === 'editor' ? "bg-primary/10 text-primary border-primary/20" :
                                                 "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                                             )}>
                                                 {u.role?.replace('_', ' ') || 'UNLINKED'}
                                             </span>
                                             {(u as any).skills && (u as any).skills.length > 0 && (
                                                 <div className="flex flex-wrap gap-1">
                                                     {(u as any).skills.map((skill: string, sidx: number) => (
                                                         <span key={sidx} className="bg-muted/50 text-muted-foreground border border-border px-1.5 py-0.5 rounded-[4px] text-[8px] font-bold uppercase tracking-tighter">
                                                             {skill}
                                                         </span>
                                                     ))}
                                                 </div>
                                             )}
                                             {(u as any).skillPrices && Object.keys((u as any).skillPrices).length > 0 && (
                                                 <div className="flex flex-col gap-1 mt-1">
                                                     {Object.entries((u as any).skillPrices).map(([skill, price]) => (
                                                         <div key={skill} className="text-[9px] text-muted-foreground font-bold tracking-widest flex items-center gap-1.5">
                                                             <span className="text-muted-foreground truncate max-w-[60px]">{skill}</span> 
                                                             <div className="flex items-center text-primary/80 bg-primary/5 px-1 rounded">
                                                                <IndianRupee className="h-2 w-2 mr-0.5" /> 
                                                                {price as string}
                                                             </div>
                                                         </div>
                                                     ))}
                                                 </div>
                                             )}
                                         </div>
                                     </td>
                                    <td className="px-6 py-4">
                                        {u.initialPassword ? (
                                            <div className="flex items-center gap-2 group/copy cursor-pointer w-fit" onClick={() => { navigator.clipboard.writeText(u.initialPassword!); toast.success("Access key copied"); }}>
                                                <span className="font-mono text-xs text-zinc-100 bg-muted/50 px-2.5 py-1 rounded border border-border group-hover/copy:border-primary/50 group-hover/copy:text-foreground transition-all shadow-sm">{u.initialPassword}</span>
                                                <Copy className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover/copy:opacity-100 transition-opacity" />
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
                                                    <button className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-all active:scale-[0.98]"><MoreHorizontal className="h-3.5 w-3.5" /></button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="w-52 bg-popover border-border p-1.5 rounded-xl shadow-2xl">
                                                    {u.role === 'client' && (
                                                        <DropdownMenuItem className="p-2.5 text-xs text-popover-foreground hover:bg-muted transition-colors cursor-pointer rounded-lg" onClick={async () => {
                                                            const res = await togglePayLater(u.uid, !u.payLater);
                                                            if(res.success) toast.success(`Pay later status updated`);
                                                        }}>
                                                            <IndianRupee className="mr-2.5 h-3.5 w-3.5 text-muted-foreground" /> {u.payLater ? "Revoke Pay Later" : "Allow Pay Later"}
                                                        </DropdownMenuItem>
                                                    )}
                                                    <DropdownMenuItem className="p-2.5 text-xs text-popover-foreground hover:bg-muted transition-colors cursor-pointer rounded-lg" onClick={() => handleToggleUserStatus(u.uid, (u as any).status !== 'inactive')}>
                                                        <Shield className="mr-2.5 h-3.5 w-3.5 text-muted-foreground" /> {(u as any).status === 'inactive' ? "Enable Account" : "Disable Account"}
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
                             <div className="lg:col-span-5 bg-muted/50 border border-border p-8 rounded-2xl relative overflow-hidden group/form">
                                 <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none group-hover/form:opacity-10 transition-opacity">
                                     <UserPlus className="h-24 w-24 text-primary blur-xl" />
                                 </div>
                                 <h3 className="text-[11px] font-bold text-foreground/90 flex items-center gap-2.5 mb-8 uppercase tracking-widest">
                                     <div className="p-1.5 rounded bg-primary/20 border border-primary/30">
                                        <Zap className="h-3.5 w-3.5 text-primary" />
                                     </div>
                                     Add Team Member
                                 </h3>
                                 <form onSubmit={handleCreateUser} className="space-y-6 relative z-10">
                                     <div className="space-y-2">
                                         <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Full Name</Label>
                                         <input 
                                            value={newUser.name} 
                                            onChange={e => setNewUser({...newUser, name: e.target.value})} 
                                            required 
                                            className="w-full h-11 px-4 rounded-lg border border-border bg-muted/50 text-sm text-foreground focus:border-primary/50 focus:outline-none transition-all placeholder:text-muted-foreground font-medium"
                                            placeholder="John Doe" 
                                        />
                                     </div>
                                     <div className="space-y-2">
                                         <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Email Address</Label>
                                         <input 
                                            value={newUser.email} 
                                            onChange={e => setNewUser({...newUser, email: e.target.value})} 
                                            required 
                                            className="w-full h-11 px-4 rounded-lg border border-border bg-muted/50 text-sm text-foreground focus:border-primary/50 focus:outline-none transition-all placeholder:text-muted-foreground font-medium"
                                            type="email" 
                                            placeholder="example@email.com" 
                                        />
                                     </div>
                                     <div className="space-y-2">
                                         <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Password</Label>
                                         <input 
                                            value={newUser.password} 
                                            onChange={e => setNewUser({...newUser, password: e.target.value})} 
                                            required 
                                            className="w-full h-11 px-4 rounded-lg border border-border bg-muted/50 text-sm text-foreground focus:border-primary/50 focus:outline-none transition-all placeholder:text-muted-foreground font-mono"
                                            type="text" 
                                            minLength={6} 
                                            placeholder="Enter password" 
                                        />
                                     </div>
                                     <div className="space-y-2">
                                         <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">WhatsApp Number</Label>
                                         <div className="flex gap-2">
                                             <div className="flex items-center justify-center h-11 px-3 bg-muted border border-border rounded-lg text-sm text-muted-foreground">+91</div>
                                             <input 
                                                value={newUser.phoneNumber} 
                                                onChange={e => setNewUser({...newUser, phoneNumber: e.target.value.replace(/\D/g, '').slice(0, 10)})} 
                                                required 
                                                className="flex-1 h-11 px-4 rounded-lg border border-border bg-muted/50 text-sm text-foreground focus:border-primary/50 focus:outline-none transition-all placeholder:text-muted-foreground font-medium"
                                                type="tel" 
                                                placeholder="9876543210"
                                                maxLength={10}
                                            />
                                         </div>
                                     </div>
                                     <div className="space-y-2">
                                         <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Department</Label>
                                         <select 
                                            className="w-full h-11 px-4 rounded-lg border border-border bg-muted/50 text-sm text-foreground focus:border-primary/50 focus:outline-none transition-all appearance-none cursor-pointer font-medium" 
                                            value={newUser.role} 
                                            onChange={e => setNewUser({...newUser, role: e.target.value})}
                                        >
                                             <option value="sales_executive" className="bg-background">Sales Executive</option>
                                             <option value="project_manager" className="bg-background">Project Manager</option>
                                         </select>
                                     </div>
                                     <button 
                                        type="submit"
                                        className="w-full h-12 bg-primary  text-primary-foreground text-[11px] font-bold uppercase tracking-widest rounded-lg shadow-xl hover:bg-zinc-200 transition-all active:scale-[0.98] disabled:opacity-30 flex items-center justify-center gap-2"
                                        disabled={isCreatingUser}
                                     >
                                         {isCreatingUser ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                                         {isCreatingUser ? "CREATING..." : "ADD MEMBER"}
                                     </button>
                                 </form>
                             </div>
                             
                             <div className="lg:col-span-7 space-y-10">
                                 <div className="bg-muted/50 border border-border overflow-hidden rounded-2xl">
                                    <div className="bg-muted/50 px-6 py-4 border-b border-border flex items-center justify-between">
                                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Department: Sales Executive</span>
                                        <span className="text-[9px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 px-2 py-0.5 rounded">Active</span>
                                    </div>
                                    <div className="divide-y divide-border">
                                        {users.filter(u => u.role === 'sales_executive').map(u => (
                                            <div key={u.uid} className="px-6 py-4 flex justify-between items-center hover:bg-muted/50 transition-colors group">
                                                 <div className="flex items-center gap-4">
                                                     <div className="h-10 w-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.1)] flex items-center justify-center text-emerald-500 font-bold text-xs uppercase group-hover:scale-110 transition-transform overflow-hidden">
                                                         {u.photoURL ? <Image src={u.photoURL} alt={u.displayName || "User"} width={40} height={40} className="w-full h-full object-cover" /> : u.displayName?.[0]}
                                                     </div>
                                                     <div>
                                                         <div className="text-sm font-bold text-foreground tracking-tight leading-tight">{u.displayName}</div>
                                                         <div className="text-xs text-foreground/80 font-semibold tracking-tight truncate max-w-[180px]">{u.email}</div>
                                                     </div>
                                                 </div>
                                                 <div className="flex items-center gap-3">
                                                     {u.initialPassword && <span className="text-xs font-mono font-bold bg-card text-foreground px-2.5 py-1 rounded border border-border shadow-md">KEY: {u.initialPassword}</span>}
                                                     <button className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-all opacity-0 group-hover:opacity-100" onClick={() => handleDeleteUser(u.uid)}>
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </button>
                                                 </div>
                                            </div>
                                        ))}
                                    </div>
                                 </div>

                                 <div className="bg-muted/50 border border-border overflow-hidden rounded-2xl">
                                    <div className="bg-muted/50 px-6 py-4 border-b border-border flex items-center justify-between">
                                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Department: Project Manager</span>
                                        <span className="text-[9px] font-bold bg-blue-500/10 text-blue-500 border border-blue-500/20 px-2 py-0.5 rounded">Active</span>
                                    </div>
                                    <div className="divide-y divide-border">
                                        {users.filter(u => u.role === 'project_manager').map(u => (
                                            <div key={u.uid} className="px-6 py-4 flex justify-between items-center hover:bg-muted/50 transition-colors group">
                                                 <div className="flex items-center gap-4">
                                                      <div className="h-10 w-10 rounded-lg bg-blue-500/10 border border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.1)] flex items-center justify-center text-blue-500 font-bold text-xs uppercase group-hover:scale-110 transition-transform overflow-hidden">
                                                          {u.photoURL ? <Image src={u.photoURL} alt={u.displayName || "User"} width={40} height={40} className="w-full h-full object-cover" /> : u.displayName?.[0]}
                                                      </div>
                                                     <div>
                                                         <div className="text-sm font-bold text-foreground tracking-tight leading-tight">{u.displayName}</div>
                                                         <div className="text-xs text-foreground/80 font-semibold tracking-tight truncate max-w-[180px]">{u.email}</div>
                                                     </div>
                                                 </div>
                                                 <div className="flex items-center gap-3">
                                                     {u.initialPassword && <span className="text-xs font-mono font-bold bg-card text-foreground px-2.5 py-1 rounded border border-border shadow-md">KEY: {u.initialPassword}</span>}
                                                     <button className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-all opacity-0 group-hover:opacity-100" onClick={() => handleDeleteUser(u.uid)}>
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
                                                <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mt-0.5">{u.role} â€” UID: {u.uid.slice(0,8)}</div>
                                            </div>
                                        </div>

                                        <div className="space-y-1.5">
                                            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Requested On</div>
                                            <div className="text-xs font-mono text-foreground bg-background/50 p-2 rounded border border-border">
                                                {(u as any).deletionRequestedAt ? new Date((u as any).deletionRequestedAt).toLocaleString() : 'AUTH_RECOVERY_REQUIRED'}
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-3 pt-2">
                                            <button 
                                                onClick={() => handleDeleteUser(u.uid)}
                                                className="flex-1 h-10 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-foreground border border-red-500/20 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all"
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
                                    className="flex items-center gap-2 h-10 px-4 bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-widest rounded-xl hover:bg-primary/90 transition-all shadow-[0_0_20px_rgba(var(--primary),0.2)]"
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
                                                <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mt-0.5">Editor Request â€” {new Date(u.createdAt).toLocaleDateString()}</div>
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            <div className="space-y-1">
                                                <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Contact Protocol</div>
                                                <div className="text-xs font-medium text-foreground">{u.email}</div>
                                                <div className="text-xs font-mono text-primary">{u.whatsappNumber || 'NO_PH_DATA'}</div>
                                            </div>

                                            <div className="space-y-2">
                                                <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Credentials & Portfolio</div>
                                                {u.portfolio && u.portfolio.length > 0 ? (
                                                    <a 
                                                        href={u.portfolio[0].url} 
                                                        target="_blank" 
                                                        rel="noopener noreferrer"
                                                        className="flex items-center justify-between p-3 rounded-xl bg-muted/50 border border-border hover:border-primary/50 group/link transition-all"
                                                    >
                                                        <span className="text-[10px] font-bold text-foreground/80 uppercase truncate max-w-[150px]">{u.portfolio[0].name}</span>
                                                        <ExternalLink className="h-3 w-3 text-muted-foreground group-hover/link:text-primary transition-colors" />
                                                    </a>
                                                ) : (
                                                    <div className="p-3 text-center border border-dashed border-border rounded-xl text-[9px] font-bold text-muted-foreground uppercase">No Portfolio Data</div>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-3 pt-2">
                                            <button 
                                                onClick={() => handleVerifyEditor(u.uid)}
                                                className="flex-1 h-11 bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-widest rounded-xl hover:bg-primary/90 transition-all shadow-[0_0_20px_rgba(var(--primary),0.2)]"
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
                            <h2 className="text-xl font-bold tracking-tight text-foreground mb-1 flex items-center gap-2">
                                <Monitor className="h-5 w-5 text-primary" />
                                WhatsApp Notifications Configuration
                            </h2>
                            <p className="text-xs font-medium text-muted-foreground leading-relaxed max-w-2xl">
                                Manage automated WhatsApp messages sent to users based on triggers. Leave fields blank to use default messages. Toggle switches to enable/disable specific notifications.
                            </p>
                        </div>

                        {/* Campaign Status Overview */}
                        {(() => {
                            const globalEnabled = whatsappTemplates.enabled !== false;
                            const notifs = whatsappTemplates.notifications || {};

                            const campaigns = [
                                {
                                    label: 'Client Campaign',
                                    role: 'Clients',
                                    icon: Users,
                                    color: 'blue',
                                    campaignKey: 'client',
                                    defaultName: 'CLIENT',
                                    keys: [
                                        'client_project_created', 'client_pm_assigned', 'client_editor_assigned',
                                        'client_editor_accepted', 'client_draft_submitted', 'client_new_comment', 'client_project_completed'
                                    ],
                                },
                                {
                                    label: 'Editor Campaign',
                                    role: 'Editors',
                                    icon: Film,
                                    color: 'green',
                                    campaignKey: 'editor',
                                    defaultName: 'EDITOR',
                                    keys: ['editor_project_assigned', 'editor_new_comment', 'editor_feedback_received'],
                                },
                                {
                                    label: 'PM Campaign',
                                    role: 'Project Managers',
                                    icon: Briefcase,
                                    color: 'purple',
                                    campaignKey: 'pm',
                                    defaultName: 'PROJECT_MANAGER',
                                    keys: ['pm_project_assigned', 'pm_editor_accepted', 'pm_editor_rejected', 'pm_new_comment', 'pm_project_completed'],
                                },
                            ];

                            const colorMap: Record<string, { bg: string; text: string; border: string; dot: string }> = {
                                blue:   { bg: 'bg-blue-500/10',   text: 'text-blue-400',   border: 'border-blue-500/20',   dot: 'bg-blue-400' },
                                green:  { bg: 'bg-emerald-500/10',text: 'text-emerald-400',border: 'border-emerald-500/20',dot: 'bg-emerald-400' },
                                purple: { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/20', dot: 'bg-purple-400' },
                            };

                            return (
                                <div className="space-y-3">
                                    <h3 className="text-sm font-bold text-foreground flex items-center gap-2 px-1">
                                        <Activity className="h-4 w-4 text-primary" />
                                        Campaign Status
                                        <span className={cn(
                                            "ml-auto inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full border",
                                            globalEnabled
                                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                                : "bg-red-500/10 text-red-400 border-red-500/20"
                                        )}>
                                            <span className={cn("w-1.5 h-1.5 rounded-full", globalEnabled ? "bg-emerald-400 animate-pulse" : "bg-red-400")} />
                                            {globalEnabled ? 'Service Active' : 'Service Paused'}
                                        </span>
                                    </h3>

                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                        {campaigns.map((c) => {
                                            const C = c.icon;
                                            const col = colorMap[c.color];
                                            const enabledCount = c.keys.filter(k => notifs[k]?.enabled !== false).length;
                                            const total = c.keys.length;
                                            const allOn = enabledCount === total;
                                            const noneOn = enabledCount === 0;
                                            const campaignName = whatsappTemplates.campaigns?.[c.campaignKey] || c.defaultName;

                                            return (
                                                <div key={c.label} className={cn(
                                                    "rounded-2xl border p-4 space-y-3 transition-all",
                                                    globalEnabled && enabledCount > 0
                                                        ? `${col.border} bg-muted/30`
                                                        : "border-border bg-muted/20 opacity-70"
                                                )}>
                                                    {/* Header */}
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-2">
                                                            <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center", col.bg)}>
                                                                <C className={cn("h-4 w-4", col.text)} />
                                                            </div>
                                                            <div>
                                                                <p className="text-xs font-bold text-foreground leading-tight">{c.label}</p>
                                                                <p className="text-[9px] text-muted-foreground">{c.role}</p>
                                                            </div>
                                                        </div>
                                                        <span className={cn(
                                                            "text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border",
                                                            globalEnabled && !noneOn
                                                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                                                : "bg-zinc-500/10 text-muted-foreground border-zinc-700"
                                                        )}>
                                                            {globalEnabled && !noneOn ? 'Active' : 'Inactive'}
                                                        </span>
                                                    </div>

                                                    {/* AiSensy Campaign Name */}
                                                    <div className="flex items-center gap-2 bg-black/20 rounded-lg px-2 py-1.5">
                                                        <span className="text-[9px] text-muted-foreground uppercase tracking-widest font-bold shrink-0">Campaign</span>
                                                        <input
                                                            className="flex-1 bg-transparent text-[10px] font-mono text-primary/80 outline-none min-w-0"
                                                            value={campaignName}
                                                            onChange={(e) => setWhatsappTemplates({
                                                                ...whatsappTemplates,
                                                                campaigns: {
                                                                    ...whatsappTemplates.campaigns,
                                                                    [c.campaignKey]: e.target.value
                                                                }
                                                            })}
                                                            placeholder={c.defaultName}
                                                        />
                                                    </div>

                                                    {/* Progress Bar */}
                                                    <div className="space-y-1.5">
                                                        <div className="flex items-center justify-between">
                                                            <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest">Messages Enabled</span>
                                                            <span className="text-[10px] font-bold text-foreground tabular-nums">{enabledCount}/{total}</span>
                                                        </div>
                                                        <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                                                            <div
                                                                className={cn("h-full rounded-full transition-all", col.dot)}
                                                                style={{ width: `${(enabledCount / total) * 100}%` }}
                                                            />
                                                        </div>
                                                    </div>

                                                    {/* Per-message status dots */}
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {c.keys.map((k) => {
                                                            const on = notifs[k]?.enabled !== false;
                                                            const label = k.replace(/^(client|editor|pm)_/, '').replace(/_/g, ' ');
                                                            return (
                                                                <span
                                                                    key={k}
                                                                    title={k}
                                                                    className={cn(
                                                                        "inline-flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded-md border capitalize",
                                                                        on
                                                                            ? `${col.bg} ${col.text} ${col.border}`
                                                                            : "bg-zinc-800/50 text-zinc-500 border-zinc-700/50"
                                                                    )}
                                                                >
                                                                    <span className={cn("w-1 h-1 rounded-full shrink-0", on ? col.dot : "bg-zinc-600")} />
                                                                    {label}
                                                                </span>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })()}

                        {/* Global Toggle */}
                        <div className="p-4 border border-border bg-muted/50 rounded-2xl flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                    <Bell className="h-5 w-5 text-primary" />
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-foreground">Global WhatsApp Notifications</p>
                                    <p className="text-[10px] text-muted-foreground">Master switch for all WhatsApp notifications</p>
                                </div>
                            </div>
                            <Switch 
                                checked={whatsappTemplates.enabled !== false}
                                onCheckedChange={(checked) => setWhatsappTemplates({ ...whatsappTemplates, enabled: checked })}
                            />
                        </div>

                        {/* System Settings Section */}
                        <div className="space-y-3 pt-4 border-t border-border">
                            <h3 className="text-sm font-bold text-foreground flex items-center gap-2 px-1">
                                <Settings className="h-4 w-4 text-orange-500" />
                                System Settings
                            </h3>
                            <div className="p-4 border border-border bg-muted/50 rounded-2xl flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 rounded-xl bg-orange-500/10 flex items-center justify-center">
                                        <Phone className="h-5 w-5 text-orange-500" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-foreground">Allow Duplicate Phone Numbers</p>
                                        <p className="text-[10px] text-muted-foreground">When enabled, same phone can be used for multiple accounts (different user types)</p>
                                    </div>
                                </div>
                                <Switch 
                                    checked={systemSettings.allowDuplicatePhone === true}
                                    onCheckedChange={async (checked) => {
                                        setSystemSettings({ ...systemSettings, allowDuplicatePhone: checked });
                                        await updateSystemSettings({ allowDuplicatePhone: checked });
                                        toast.success(checked ? "Duplicate phone numbers allowed" : "Phone numbers must be unique");
                                    }}
                                />
                            </div>
                        </div>

                        {/* Client Notifications */}
                        <div className="space-y-3">
                            <h3 className="text-sm font-bold text-foreground flex items-center gap-2 px-1">
                                <Users className="h-4 w-4 text-blue-500" />
                                Client Notifications (7)
                            </h3>
                            {[
                                { key: 'client_project_created', label: 'Project Created', desc: 'When client uploads a new project' },
                                { key: 'client_pm_assigned', label: 'PM Assigned', desc: 'When a Project Manager is assigned' },
                                { key: 'client_editor_assigned', label: 'Editor Assigned', desc: 'When PM assigns an editor' },
                                { key: 'client_editor_accepted', label: 'Production Started', desc: 'When editor accepts the project' },
                                { key: 'client_draft_submitted', label: 'Draft Ready', desc: 'When editor uploads a revision' },
                                { key: 'client_new_comment', label: 'New Comment', desc: 'When someone comments on the project' },
                                { key: 'client_project_completed', label: 'Project Completed', desc: 'When client downloads final files' }
                            ].map((topic) => (
                                <div key={topic.key} className="p-4 border border-border bg-muted/30 rounded-xl">
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                                <Label className="text-foreground text-xs font-bold">{topic.label}</Label>
                                                <span className="text-[9px] font-mono text-muted-foreground bg-card py-0.5 px-1.5 rounded">{topic.key}</span>
                                            </div>
                                            <p className="text-[10px] text-muted-foreground mt-0.5">{topic.desc}</p>
                                        </div>
                                        <Switch 
                                            checked={whatsappTemplates.notifications?.[topic.key]?.enabled !== false}
                                            onCheckedChange={(checked) => setWhatsappTemplates({ 
                                                ...whatsappTemplates, 
                                                notifications: { 
                                                    ...whatsappTemplates.notifications, 
                                                    [topic.key]: { ...whatsappTemplates.notifications?.[topic.key], enabled: checked } 
                                                } 
                                            })}
                                        />
                                    </div>
                                    <textarea
                                      className="w-full bg-black/5 dark:bg-black/40 border border-border rounded-lg p-3 text-xs text-foreground/80 font-medium placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 transition-colors resize-none"
                                      rows={1}
                                      value={whatsappTemplates.notifications?.[topic.key]?.message || ''}
                                      onChange={(e) => setWhatsappTemplates({ 
                                          ...whatsappTemplates, 
                                          notifications: { 
                                              ...whatsappTemplates.notifications, 
                                              [topic.key]: { ...whatsappTemplates.notifications?.[topic.key], message: e.target.value } 
                                          } 
                                      })}
                                      placeholder="Leave blank for default message..."
                                    />
                                </div>
                            ))}
                        </div>

                        {/* Editor Notifications */}
                        <div className="space-y-3">
                            <h3 className="text-sm font-bold text-foreground flex items-center gap-2 px-1">
                                <Film className="h-4 w-4 text-green-500" />
                                Editor Notifications (3)
                            </h3>
                            {[
                                { key: 'editor_project_assigned', label: 'New Assignment', desc: 'When PM assigns a project to editor' },
                                { key: 'editor_new_comment', label: 'New Comment', desc: 'When client comments on the project' },
                                { key: 'editor_feedback_received', label: 'Feedback Received', desc: 'When client rates the editor' }
                            ].map((topic) => (
                                <div key={topic.key} className="p-4 border border-border bg-muted/30 rounded-xl">
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                                <Label className="text-foreground text-xs font-bold">{topic.label}</Label>
                                                <span className="text-[9px] font-mono text-muted-foreground bg-card py-0.5 px-1.5 rounded">{topic.key}</span>
                                            </div>
                                            <p className="text-[10px] text-muted-foreground mt-0.5">{topic.desc}</p>
                                        </div>
                                        <Switch 
                                            checked={whatsappTemplates.notifications?.[topic.key]?.enabled !== false}
                                            onCheckedChange={(checked) => setWhatsappTemplates({ 
                                                ...whatsappTemplates, 
                                                notifications: { 
                                                    ...whatsappTemplates.notifications, 
                                                    [topic.key]: { ...whatsappTemplates.notifications?.[topic.key], enabled: checked } 
                                                } 
                                            })}
                                        />
                                    </div>
                                    <textarea
                                      className="w-full bg-black/5 dark:bg-black/40 border border-border rounded-lg p-3 text-xs text-foreground/80 font-medium placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 transition-colors resize-none"
                                      rows={1}
                                      value={whatsappTemplates.notifications?.[topic.key]?.message || ''}
                                      onChange={(e) => setWhatsappTemplates({ 
                                          ...whatsappTemplates, 
                                          notifications: { 
                                              ...whatsappTemplates.notifications, 
                                              [topic.key]: { ...whatsappTemplates.notifications?.[topic.key], message: e.target.value } 
                                          } 
                                      })}
                                      placeholder="Leave blank for default message..."
                                    />
                                </div>
                            ))}
                        </div>

                        {/* PM Notifications */}
                        <div className="space-y-3">
                            <h3 className="text-sm font-bold text-foreground flex items-center gap-2 px-1">
                                <Briefcase className="h-4 w-4 text-purple-500" />
                                Project Manager Notifications (5)
                            </h3>
                            {[
                                { key: 'pm_project_assigned', label: 'New Project', desc: 'When SE assigns a project to PM' },
                                { key: 'pm_editor_accepted', label: 'Editor Accepted', desc: 'When editor accepts assignment' },
                                { key: 'pm_editor_rejected', label: 'Editor Rejected', desc: 'When editor declines assignment' },
                                { key: 'pm_new_comment', label: 'New Comment', desc: 'When someone comments on managed project' },
                                { key: 'pm_project_completed', label: 'Project Completed', desc: 'When client downloads final files' }
                            ].map((topic) => (
                                <div key={topic.key} className="p-4 border border-border bg-muted/30 rounded-xl">
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                                <Label className="text-foreground text-xs font-bold">{topic.label}</Label>
                                                <span className="text-[9px] font-mono text-muted-foreground bg-card py-0.5 px-1.5 rounded">{topic.key}</span>
                                            </div>
                                            <p className="text-[10px] text-muted-foreground mt-0.5">{topic.desc}</p>
                                        </div>
                                        <Switch 
                                            checked={whatsappTemplates.notifications?.[topic.key]?.enabled !== false}
                                            onCheckedChange={(checked) => setWhatsappTemplates({ 
                                                ...whatsappTemplates, 
                                                notifications: { 
                                                    ...whatsappTemplates.notifications, 
                                                    [topic.key]: { ...whatsappTemplates.notifications?.[topic.key], enabled: checked } 
                                                } 
                                            })}
                                        />
                                    </div>
                                    <textarea
                                      className="w-full bg-black/5 dark:bg-black/40 border border-border rounded-lg p-3 text-xs text-foreground/80 font-medium placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 transition-colors resize-none"
                                      rows={1}
                                      value={whatsappTemplates.notifications?.[topic.key]?.message || ''}
                                      onChange={(e) => setWhatsappTemplates({ 
                                          ...whatsappTemplates, 
                                          notifications: { 
                                              ...whatsappTemplates.notifications, 
                                              [topic.key]: { ...whatsappTemplates.notifications?.[topic.key], message: e.target.value } 
                                          } 
                                      })}
                                      placeholder="Leave blank for default message..."
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

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
                            <IndicatorCard 
                                label="Total Earned" 
                                value={`₹${stats.revenue.toLocaleString()}`} 
                                icon={<IndianRupee className="h-4 w-4" />}
                                subtext="Total realized revenue"
                            />
                            <IndicatorCard 
                                label="Total Pending" 
                                value={`₹${(stats.clientPending + stats.editorPending).toLocaleString()}`} 
                                alert={(stats.clientPending + stats.editorPending) > 0}
                                icon={<Clock className="h-4 w-4 text-orange-500" />}
                                subtext="Unsettled ledgers"
                            />
                            <IndicatorCard 
                                label="Profit Contribution" 
                                value={`₹${stats.profit.toLocaleString()}`} 
                                icon={<TrendingUp className="h-4 w-4" />}
                                subtext="Total realized margin"
                            />
                            <IndicatorCard 
                                label="Avg Payout / Project" 
                                value={`₹${Math.round(stats.avgPayout).toLocaleString()}`} 
                                icon={<ArrowUpRight className="h-4 w-4" />}
                                subtext="Average editor cost"
                            />
                            <IndicatorCard 
                                label="Last Payment Date" 
                                value={stats.lastPaymentDate ? new Date(stats.lastPaymentDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : 'N/A'} 
                                icon={<Calendar className="h-4 w-4" />}
                                subtext="Recent activity"
                            />
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
                                                    <div className="flex flex-col md:items-end gap-3">
                                                        <div className="flex flex-col md:items-end gap-1 border border-orange-500/20 bg-orange-500/5 px-6 py-3 rounded-xl w-full">
                                                            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Total Pending Dues</span>
                                                            <span className="text-2xl font-black text-orange-400 tabular-nums">₹{totalDues.toLocaleString()}</span>
                                                        </div>
                                                        <button 
                                                            disabled
                                                            className="w-full md:w-auto h-9 px-4 rounded-lg bg-orange-500/50 text-foreground font-bold uppercase tracking-widest transition-all text-[10px] cursor-not-allowed opacity-50 flex items-center justify-center gap-2"
                                                        >
                                                            <CheckCircle2 className="h-3.5 w-3.5" />
                                                            Mark All Received
                                                        </button>
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
                                    {users.filter(u => u.role === 'editor' && projects.some(p => p.assignedEditorId === u.uid && p.clientHasDownloaded && !p.editorPaid)).map(editor => {
                                        const editorProjects = projects.filter(p => p.assignedEditorId === editor.uid && p.clientHasDownloaded && !p.editorPaid);
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
                                                            <p className="text-xs text-blue-400/80 font-bold uppercase tracking-widest mt-1">{editor.email}</p>
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-col md:items-end gap-3">
                                                        <div className="flex flex-col md:items-end gap-1 border border-blue-500/20 bg-blue-500/5 px-6 py-3 rounded-xl w-full">
                                                            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Total Payout Pending</span>
                                                            <span className="text-2xl font-black text-blue-400 tabular-nums">₹{totalEditorDues.toLocaleString()}</span>
                                                        </div>
                                                        <button 
                                                            onClick={() => handleSettleAllDues(editor.uid)}
                                                            className="w-full md:w-auto h-9 px-4 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 font-bold uppercase tracking-widest transition-all hover:bg-blue-500 hover:text-foreground text-[10px] flex items-center justify-center gap-2 active:scale-95"
                                                        >
                                                            <RefreshCw className="h-3.5 w-3.5" />
                                                            Settle All Dues
                                                        </button>
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
                                                                        <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-500">File Downloaded</span>
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

                                    {users.filter(u => u.role === 'editor' && projects.some(p => p.assignedEditorId === u.uid && p.clientHasDownloaded && !p.editorPaid)).length === 0 && (
                                        <div className="enterprise-card p-8 text-center flex flex-col items-center justify-center border-dashed border-2 border-border opacity-60">
                                            <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest">All editor payouts settled</h3>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}

                {activeTab === 'performance' && (
                    <AdminPerformanceTab projects={projects} users={users} />
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
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                 <div className="space-y-1.5">
                     <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Editor Revenue (₹)</label>
                     <input 
                         type="number"
                         value={assignEditorPrice}
                         onChange={(e) => setAssignEditorPrice(e.target.value)}
                         placeholder="e.g. 5000"
                         className="w-full h-11 bg-black/5 dark:bg-black/40 border border-border rounded-lg px-4 text-sm text-foreground focus:outline-none focus:border-primary/50 transition-colors"
                     />
                 </div>
                 <div className="space-y-1.5">
                     <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Optional Deadline</label>
                     <input 
                         type="datetime-local"
                         value={assignDeadline}
                         onChange={(e) => setAssignDeadline(e.target.value)}
                         className="w-full h-11 bg-black/5 dark:bg-black/40 border border-border rounded-lg px-4 text-sm text-foreground focus:outline-none focus:border-primary/50 transition-colors"
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
                            "w-full flex items-center justify-between p-4 rounded-xl bg-muted/50 border border-border hover:bg-muted/50 hover:border-primary/40 transition-all group/ed",
                            isFull && "opacity-30 grayscale pointer-events-none"
                        )}
                    >
                         <div className="flex items-center gap-4 text-left">
                             <Avatar className="h-10 w-10 border border-border rounded-lg bg-muted/50">
                                 <AvatarImage src={ed.photoURL || undefined} className="object-cover" />
                                 <AvatarFallback className="text-primary font-bold text-xs uppercase">{ed.displayName?.[0]}</AvatarFallback>
                             </Avatar>
                             <div>
                                 <div className="text-sm font-bold text-foreground group-hover/ed:text-primary transition-colors">{ed.displayName}</div>
                                 <div className="text-xs text-foreground/80 font-semibold mt-0.5 truncate max-w-[180px]">{ed.email}</div>
                                 {((ed as any).skills?.length > 0 || (ed as any).skillPrices) && (
                                     <div className="flex flex-col gap-1.5 mt-2">
                                        <div className="flex flex-wrap items-center gap-1">
                                            {(ed as any).skills?.map((s: string, idx: number) => (
                                                <div key={idx} className="flex items-center bg-card border border-border rounded pl-1 pr-1.5 py-0.5 group/skill">
                                                    <span className="text-[8px] font-bold text-muted-foreground uppercase tracking-tighter mr-1.5">{s}</span>
                                                    {((ed as any).skillPrices && (ed as any).skillPrices[s]) && (
                                                        <span className="text-[8px] font-bold text-emerald-400 bg-emerald-400/10 px-1 rounded flex items-center whitespace-nowrap">
                                                            <IndianRupee className="h-2 w-2 inline" /> {(ed as any).skillPrices[s]}
                                                        </span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                     </div>
                                 )}
                                 <div className="flex items-center gap-2 mt-2">
                                     <div className="h-1 w-16 bg-card rounded-full overflow-hidden">
                                        <div className="h-full bg-primary" style={{ width: `${(currentActiveCount/5)*100}%` }} />
                                     </div>
                                     <span className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground">{currentActiveCount} / 5 Active Projects</span>
                                 </div>
                             </div>
                         </div>
                         <div className="flex flex-col items-end">
                             {isFull ? (
                                 <span className="text-[8px] font-bold uppercase tracking-widest bg-red-500/10 text-red-500 border border-red-500/20 px-1.5 py-0.5 rounded">Fully Booked</span>
                             ) : (
                                <div className="h-8 w-8 rounded-lg bg-muted/50 border border-border flex items-center justify-center group-hover/ed:bg-primary/20 group-hover/ed:border-primary/50 transition-all">
                                    <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground group-hover/ed:text-primary" />
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
                     <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Project Price (₹)</Label>
                     <input 
                        className="w-full h-12 bg-muted/50 border border-border rounded-lg px-4 text-foreground focus:outline-none focus:border-primary/50 transition-all font-bold text-lg tabular-nums"
                        type="number"
                        value={editForm.totalCost}
                        onChange={e => setEditForm({...editForm, totalCost: Number(e.target.value)})}
                    />
                 </div>
                 <div className="space-y-2">
                     <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Project Status</Label>
                     <select 
                        className="w-full h-12 bg-muted/50 border border-border rounded-lg px-4 text-foreground focus:outline-none focus:border-primary/50 transition-all appearance-none cursor-pointer font-bold uppercase text-xs tracking-widest"
                        value={editForm.status}
                        onChange={e => setEditForm({...editForm, status: e.target.value})}
                    >
                         <option value="pending_assignment" className="bg-background">QUEUE: AWAITING_EDITOR</option>
                         <option value="active" className="bg-background">STATE: PRODUCTION_IN_PROGRESS</option>
                         <option value="in_review" className="bg-background">STATE: QA_REVIEW_CYCLE</option>
                         <option value="approved" className="bg-background">STATE: DELIVERABLE_AUTHORIZED</option>
                         <option value="completed" className="bg-background">STATE: COMPLETED</option>
                     </select>
                 </div>
                 
                 <div className="pt-4 flex gap-3">
                     <button 
                        className="flex-1 h-12 bg-primary  text-primary-foreground font-bold uppercase text-[11px] tracking-widest rounded-lg hover:bg-zinc-200 transition-all active:scale-[0.98]"
                        onClick={handleUpdateProject}
                    >
                         Save Changes
                     </button>
                     <button 
                        className="h-12 px-6 bg-muted/50 border border-border text-muted-foreground hover:text-foreground transition-all rounded-lg text-[11px] font-bold uppercase tracking-widest"
                        onClick={() => setIsEditModalOpen(false)}
                    >
                         Abort
                     </button>
                 </div>
             </div>
       </Modal>

        <Modal 
            isOpen={isUserDetailModalOpen} 
            onClose={() => setIsUserDetailModalOpen(false)} 
            title={`Infrastructure Node // ${selectedUserDetail?.displayName}`}
            maxWidth="max-w-7xl"
        >
            {selectedUserDetail && (
                <div className="mt-6 space-y-6 max-h-[85vh] overflow-y-auto pr-2 custom-scrollbar pb-6 text-left">
                    {/* Header Identity Box */}
                    <div className="bg-muted/30 border border-border rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none group-hover:opacity-10 transition-opacity">
                            <Cpu className="h-24 w-24 text-primary" />
                        </div>
                        <div className="absolute -left-12 -top-12 h-40 w-40 bg-primary/10 blur-[100px] pointer-events-none" />
                        <div className="flex items-center gap-5 relative z-10 text-left">
                            <div className="h-20 w-20 rounded-2xl bg-primary/10 border border-primary/20 p-1 relative">
                                {selectedUserDetail.photoURL ? (
                                    <Image src={selectedUserDetail.photoURL} alt="" fill className="object-cover rounded-xl" />
                                ) : (
                                    <div className="h-full w-full rounded-xl bg-muted flex items-center justify-center text-muted-foreground text-2xl font-black">
                                        {selectedUserDetail.displayName?.[0]}
                                    </div>
                                )}
                            </div>
                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    <h4 className="text-2xl font-black text-foreground tracking-tight">{selectedUserDetail.displayName}</h4>
                                    <span className={cn(
                                        "text-[9px] border px-2 py-0.5 rounded-full font-black uppercase tracking-widest",
                                        (selectedUserDetail as any).status === 'inactive' ? "bg-red-500/10 text-red-500 border-red-500/20" : "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                                    )}>
                                        {(selectedUserDetail as any).status === 'inactive' ? "DEACTIVATED" : "ACTIVE_OPERATIVE"}
                                    </span>
                                </div>
                                <div className="flex flex-wrap items-center gap-3 text-muted-foreground">
                                    <span className="text-[10px] font-bold uppercase tracking-[0.2em] flex items-center gap-1.5 text-primary">
                                        <Shield className="h-3 w-3" /> {selectedUserDetail.role?.replace('_', ' ')} 
                                    </span>
                                    <span className="h-1 w-1 rounded-full bg-border" />
                                    <span className="text-[10px] font-bold uppercase tracking-[0.2em]">{selectedUserDetail.email}</span>
                                    {selectedUserDetail.contact && (
                                        <>
                                            <span className="h-1 w-1 rounded-full bg-border" />
                                            <span className="text-[10px] font-bold uppercase tracking-[0.2em]">{selectedUserDetail.contact}</span>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="relative z-10 flex flex-col items-end gap-3 text-right">
                             <div className="flex items-center gap-2">
                                <Button 
                                    variant="outline" 
                                    size="sm" 
                                    className={cn(
                                        "h-8 text-[10px] font-black uppercase tracking-widest border-2",
                                        (selectedUserDetail as any).status === 'inactive' ? "border-emerald-500/40 hover:bg-emerald-500/10 text-emerald-500" : "border-red-500/40 hover:bg-red-500/10 text-red-500"
                                    )}
                                    onClick={() => { handleToggleUserStatus(selectedUserDetail.uid, (selectedUserDetail as any).status !== 'inactive'); setIsUserDetailModalOpen(false); }}
                                >
                                    {(selectedUserDetail as any).status === 'inactive' ? "Restore Protocol" : "Suspend Citizen"}
                                </Button>
                                <Button 
                                    variant="destructive" 
                                    size="sm" 
                                    className="h-8 text-[10px] font-black uppercase tracking-widest"
                                    onClick={() => { handleDeleteUser(selectedUserDetail.uid); setIsUserDetailModalOpen(false); }}
                                >
                                    Erase Node
                                </Button>
                             </div>
                             <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest bg-card px-3 py-1 rounded-md border border-border">
                                Joined: {new Date(selectedUserDetail.createdAt || Date.now()).toLocaleDateString()}
                            </div>
                        </div>
                    </div>

                    {/* Bento Grid */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                        {/* LEFT COLUMN: Role Specific Intelligence (8 Units) */}
                        <div className="lg:col-span-8 space-y-6">
                            {/* Role-Specific Boxes */}
                            {selectedUserDetail.role === 'client' && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="bg-muted/30 border border-border rounded-2xl p-6 space-y-6 relative overflow-hidden group/card">
                                        <div className="absolute top-0 right-0 p-4 opacity-[0.03] group-hover/card:opacity-[0.08] transition-opacity">
                                            <Layers className="h-12 w-12" />
                                        </div>
                                        <h5 className="text-[11px] font-black uppercase tracking-widest text-primary flex items-center gap-2">
                                            <IndianRupee className="h-4 w-4" /> Financial Credibility
                                        </h5>
                                        <div className="space-y-4 relative z-10">
                                            <div className="p-4 bg-card border border-border rounded-xl flex items-center justify-between hover:border-primary/30 transition-colors">
                                                <div className="flex flex-col">
                                                    <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Lifetime Investment</span>
                                                    <span className="text-2xl font-black text-foreground tracking-tighter">₹{(selectedUserDetail.lifetimeTotal || 0).toLocaleString()}</span>
                                                </div>
                                                <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                                                    <TrendingUp className="h-5 w-5" />
                                                </div>
                                            </div>
                                            <div className="p-4 bg-card border border-border rounded-xl flex items-center justify-between hover:border-red-500/30 transition-colors">
                                                <div className="flex flex-col">
                                                    <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Outstanding Liability</span>
                                                    <span className="text-2xl font-black text-red-500 tracking-tighter">₹{(selectedUserDetail.pendingOutstanding || 0).toLocaleString()}</span>
                                                </div>
                                                <div className="h-10 w-10 rounded-xl bg-red-500/10 flex items-center justify-center text-red-500">
                                                    <AlertCircle className="h-5 w-5" />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="bg-muted/30 border border-border rounded-2xl p-6 space-y-6">
                                        <h5 className="text-[11px] font-black uppercase tracking-widest text-emerald-500 flex items-center gap-2">
                                            <Zap className="h-4 w-4" /> Credit Parameters
                                        </h5>
                                        <div className="space-y-4">
                                            <div className="p-4 bg-card border border-border rounded-xl space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[9px] font-bold text-muted-foreground uppercase">Credit Ceiling</span>
                                                    <span className="text-[10px] font-black text-primary">₹{(selectedUserDetail.creditLimit || 5000).toLocaleString()}</span>
                                                </div>
                                                <input 
                                                    type="number" 
                                                    defaultValue={selectedUserDetail.creditLimit || 5000}
                                                    onBlur={async (e) => {
                                                        const val = parseInt(e.target.value) || 0;
                                                        try {
                                                            await updateDoc(doc(db, "users", selectedUserDetail.uid), { payLater: selectedUserDetail.payLater, creditLimit: val, updatedAt: Date.now() });
                                                            toast.success("Limit Updated");
                                                        } catch (err) { toast.error("Failed"); }
                                                    }}
                                                    className="w-full h-10 bg-muted border border-border rounded-xl px-4 text-xs font-bold focus:outline-none focus:border-primary/50 transition-colors"
                                                />
                                            </div>
                                            <div className="flex items-center justify-between p-4 bg-card border border-border rounded-xl">
                                                <div className="flex flex-col">
                                                    <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Post-Payment Rights</span>
                                                    <span className="text-[10px] font-black text-primary uppercase mt-1">
                                                        {selectedUserDetail.payLater ? "Authorized" : "Revoked"}
                                                    </span>
                                                </div>
                                                <button 
                                                    onClick={async () => {
                                                        const newVal = !selectedUserDetail.payLater;
                                                        setSelectedUserDetail({ ...selectedUserDetail, payLater: newVal });
                                                        try {
                                                            await updateDoc(doc(db, "users", selectedUserDetail.uid), { payLater: newVal, updatedAt: Date.now() });
                                                            toast.success(`Pay Later ${newVal ? 'Enabled' : 'Disabled'}`);
                                                        } catch (err) { toast.error("Update Failed"); }
                                                    }}
                                                    className={cn("h-6 w-12 rounded-full border transition-all relative p-1", selectedUserDetail.payLater ? "bg-primary border-primary/50" : "bg-muted border-border")}
                                                >
                                                    <div className={cn("h-3.5 w-3.5 rounded-full bg-white transition-all shadow-sm", selectedUserDetail.payLater ? "translate-x-6" : "translate-x-0")} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {selectedUserDetail.role === 'editor' && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="bg-muted/30 border border-border rounded-2xl p-6 space-y-6">
                                        <h5 className="text-[11px] font-black uppercase tracking-widest text-primary flex items-center gap-2">
                                            <Activity className="h-4 w-4" /> Performance Metrics
                                        </h5>
                                        <div className="grid grid-cols-3 gap-4">
                                            <div className="p-4 bg-card border border-border rounded-xl text-center">
                                                <div className="text-xl font-black text-foreground">{(selectedUserDetail as any).accuracy || "98%"}</div>
                                                <div className="text-[8px] font-black text-muted-foreground uppercase tracking-widest">Accuracy</div>
                                            </div>
                                            <div className="p-4 bg-card border border-border rounded-xl text-center">
                                                <div className="text-xl font-black text-emerald-500">₹{((selectedUserDetail as any).totalEarned || 0).toLocaleString()}</div>
                                                <div className="text-[8px] font-black text-muted-foreground uppercase tracking-widest">Earned</div>
                                            </div>
                                            <div className="p-4 bg-card border border-border rounded-xl text-center">
                                                <div className="text-xl font-black text-red-500">₹{((selectedUserDetail as any).pendingDues || 0).toLocaleString()}</div>
                                                <div className="text-[8px] font-black text-muted-foreground uppercase tracking-widest">Pending</div>
                                            </div>
                                        </div>
                                        {(selectedUserDetail as any).onboardingStatus === 'pending' && (
                                            <Button 
                                                className="w-full bg-primary/20 text-primary border border-primary/30 hover:bg-primary hover:text-white transition-all text-xs font-black uppercase"
                                                onClick={async () => {
                                                    try {
                                                        await verifyEditor(selectedUserDetail.uid);
                                                        toast.success("Editor Verified");
                                                        setIsUserDetailModalOpen(false);
                                                    } catch (err) { toast.error("Failed"); }
                                                }}
                                            >
                                                Verifiy Account Node
                                            </Button>
                                        )}
                                    </div>
                                    <div className="bg-muted/30 border border-border rounded-2xl p-6 space-y-6">
                                        <h5 className="text-[11px] font-black uppercase tracking-widest text-amber-500 flex items-center gap-2">
                                            <Star className="h-4 w-4" /> Skillset & Pricing
                                        </h5>
                                        <div className="grid grid-cols-2 gap-3">
                                            {selectedUserDetail.skills?.map((skill: string, i: number) => (
                                                <div key={i} className="p-3 bg-card border border-border rounded-xl flex flex-col hover:border-primary/20 transition-all">
                                                    <span className="text-[8px] font-black text-muted-foreground uppercase tracking-widest mb-1">{skill}</span>
                                                    <span className="text-xs font-black text-foreground">₹{((selectedUserDetail as any).skillPrices?.[skill] || 0).toLocaleString()}</span>
                                                </div>
                                            )) || (
                                                <div className="col-span-full py-8 text-center text-muted-foreground text-[10px] uppercase font-bold tracking-widest bg-card border border-dashed border-border rounded-xl">NO_SKILLS_CATALOGED</div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {selectedUserDetail.role === 'project_manager' && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="bg-muted/30 border border-border rounded-2xl p-6 space-y-6">
                                        <h5 className="text-[11px] font-black uppercase tracking-widest text-blue-500 flex items-center gap-2">
                                            <Activity className="h-4 w-4" /> Operational Load
                                        </h5>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="p-4 bg-card border border-border rounded-xl text-center">
                                                <div className="text-2xl font-black text-foreground">{projects.filter(p => p.assignedPMId === selectedUserDetail.uid).length}</div>
                                                <div className="text-[8px] font-black text-muted-foreground uppercase tracking-widest">Managed Stacks</div>
                                            </div>
                                            <div className="p-4 bg-card border border-border rounded-xl text-center">
                                                <div className="text-xl font-black text-emerald-500 truncate">₹{projects.filter(p => p.assignedPMId === selectedUserDetail.uid).reduce((acc, p) => acc + (p.totalCost || 0), 0).toLocaleString()}</div>
                                                <div className="text-[8px] font-black text-muted-foreground uppercase tracking-widest">Revenue Node</div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="bg-muted/30 border border-border rounded-2xl p-6 space-y-6">
                                        <h5 className="text-[11px] font-black uppercase tracking-widest text-blue-500 flex items-center gap-2">
                                            <ShieldCheck className="h-4 w-4" /> Governor Settings
                                        </h5>
                                        <div className="bg-card p-5 border border-border rounded-xl space-y-4">
                                            <div className="space-y-1">
                                                <Label className="text-[9px] font-black text-muted-foreground uppercase tracking-[0.2em]">Flow Governor (Max Load)</Label>
                                            </div>
                                            <input 
                                                type="number" 
                                                className="w-full h-11 bg-muted border border-border rounded-lg px-4 text-sm font-bold focus:border-primary/50 transition-colors"
                                                value={selectedUserDetail.maxProjectLimit || 10}
                                                onChange={async (e) => {
                                                    const val = parseInt(e.target.value) || 10;
                                                    try { await updateDoc(doc(db, "users", selectedUserDetail.uid), { maxProjectLimit: val, updatedAt: Date.now() }); } catch(err){}
                                                }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {selectedUserDetail.role === 'sales_executive' && (
                                <div className="bg-muted/30 border border-border rounded-2xl p-6 space-y-6">
                                    <h5 className="text-[11px] font-black uppercase tracking-widest text-primary flex items-center gap-2">
                                        <TrendingUp className="h-4 w-4" /> Acquisition Pipeline
                                    </h5>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="p-5 bg-card border border-border rounded-xl">
                                            <div className="text-3xl font-black text-foreground">
                                                {users.filter(u => u.role === 'client' && (u.managedBy === selectedUserDetail.uid || u.createdBy === selectedUserDetail.uid)).length}
                                            </div>
                                            <div className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest mt-1">Converted Leads</div>
                                        </div>
                                        <div className="p-5 bg-card border border-border rounded-xl">
                                            <div className="text-3xl font-black text-emerald-500">
                                                ₹{projects.filter(p => users.some(u => u.uid === p.clientId && (u.managedBy === selectedUserDetail.uid || u.createdBy === selectedUserDetail.uid))).reduce((acc, p) => acc + (p.amountPaid || 0), 0).toLocaleString()}
                                            </div>
                                            <div className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest mt-1">Attributed Flow</div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Bio / Internal Intelligence (Large Rectangle) */}
                            <div className="bg-muted/30 border border-border rounded-2xl p-6 space-y-3 relative overflow-hidden group">
                                <div className="absolute -bottom-6 -right-6 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity">
                                    <Database className="h-24 w-24" />
                                </div>
                                <h5 className="text-[11px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                                    <Database className="h-4 w-4" /> Internal Intelligence
                                </h5>
                                <div className="bg-card border border-border rounded-xl p-4 min-h-[100px] relative z-10 transition-colors group-hover:border-primary/20">
                                    <p className="text-xs leading-relaxed text-foreground/80 font-medium whitespace-pre-wrap">
                                        {selectedUserDetail.bio || "NO_BIOMETRIC_DATA_AVAILABLE // SYSTEM_DEFAULT_STATE"}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* RIGHT COLUMN: Logistics & Geography (4 Units) */}
                        <div className="lg:col-span-4 space-y-6">
                            <div className="bg-muted/30 border border-border rounded-2xl p-6 space-y-6 relative overflow-hidden group">
                                <div className="absolute top-0 right-0 p-4 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity">
                                    <Globe className="h-10 w-10" />
                                </div>
                                <h5 className="text-[11px] font-black uppercase tracking-widest text-primary border-b border-border pb-3 flex items-center gap-2">
                                    <Monitor className="h-4 w-4" /> Geographic Node
                                </h5>
                                <div className="space-y-4 relative z-10">
                                    <div className="p-4 bg-card border border-border rounded-xl flex items-center gap-4 group/item hover:border-primary/20 transition-colors">
                                        <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center group-hover/item:text-primary transition-colors">
                                            <MapPin className="h-5 w-5" />
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-[8px] font-black text-muted-foreground uppercase tracking-widest">Current Location</span>
                                            <span className="text-sm font-black text-foreground">{selectedUserDetail.location || "Remote Link"}</span>
                                        </div>
                                    </div>
                                    <div className="p-4 bg-card border border-border rounded-xl flex items-center gap-4 group/item hover:border-primary/20 transition-colors">
                                        <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center group-hover/item:text-primary transition-colors">
                                            <Activity className="h-5 w-5" />
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-[8px] font-black text-muted-foreground uppercase tracking-widest">System Link</span>
                                            <span className="text-sm font-black text-foreground">
                                                {selectedUserDetail.lastSignInTime ? new Date(selectedUserDetail.lastSignInTime).toLocaleDateString() : "Active"}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-muted/30 border border-border rounded-2xl p-6 space-y-6">
                                <h5 className="text-[11px] font-black uppercase tracking-widest text-emerald-500 border-b border-border pb-3 flex items-center gap-2">
                                    <Briefcase className="h-4 w-4" /> Logistics Summary
                                </h5>
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between text-[11px]">
                                        <span className="font-bold text-muted-foreground">Verification Status</span>
                                        <span className={cn("font-black", selectedUserDetail.verified ? "text-emerald-500" : "text-amber-500")}>
                                            {selectedUserDetail.verified ? "VERIFIED" : "PENDING"}
                                        </span>
                                    </div>
                                     <div className="flex items-center justify-between text-[11px]">
                                        <span className="font-bold text-muted-foreground">Portfolio Status</span>
                                        <span className="font-black text-foreground">
                                            {selectedUserDetail.portfolio && selectedUserDetail.portfolio.length > 0 ? "CATALOGED" : "UNAVAILABLE"}
                                        </span>
                                    </div>
                                    {selectedUserDetail.portfolio && selectedUserDetail.portfolio.length > 0 && (
                                        <a href={selectedUserDetail.portfolio[0].url} target="_blank" className="block text-center py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-[9px] font-black uppercase tracking-widest text-emerald-500 hover:bg-emerald-500/20 transition-all">
                                            Review External Link
                                        </a>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </Modal>

        <Modal 
            isOpen={isProjectDetailModalOpen} 
            onClose={() => setIsProjectDetailModalOpen(false)} 
            title={`Infrastructure Audit // ${inspectProject?.name}`}
            maxWidth="max-w-7xl"
        >
            {inspectProject && (
                <div className="mt-6 space-y-6 max-h-[85vh] overflow-y-auto pr-2 custom-scrollbar pb-6 text-left">
                    {/* Top Identity bar */}
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

                    {/* Bento Grid Layout */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                        {/* LEFT COLUMN: 8 Units */}
                        <div className="lg:col-span-8 space-y-6">
                            {/* Row 1: Technical & Metrics */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                {[
                                    { label: 'Video Type', value: inspectProject.videoType || 'N/A', icon: <Layers className="h-3.5 w-3.5" /> },
                                    { label: 'Format', value: inspectProject.videoFormat || 'N/A', icon: <Monitor className="h-3.5 w-3.5" /> },
                                    { label: 'Ratio', value: inspectProject.aspectRatio || 'N/A', icon: <Cpu className="h-3.5 w-3.5" /> },
                                    { label: 'Duration', value: inspectProject.duration ? `${inspectProject.duration}m` : 'N/A', icon: <Calendar className="h-3.5 w-3.5" /> },
                                ].map((spec, i) => (
                                    <div key={i} className="bg-card border border-border rounded-xl p-4 space-y-2 hover:border-primary/30 transition-all shadow-sm">
                                        <div className="flex items-center gap-2 text-muted-foreground">
                                            {spec.icon}
                                            <span className="text-[9px] font-bold uppercase tracking-widest">{spec.label}</span>
                                        </div>
                                        <div className="text-sm font-black text-foreground tracking-tight">{spec.value}</div>
                                    </div>
                                ))}
                            </div>

                            {/* Section: Infrastructure & Assignments (Dense Row) */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Source Assets */}
                                <div className="bg-muted/30 border border-border rounded-2xl p-5 space-y-4">
                                    <h5 className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-2">
                                        <HardDrive className="h-3.5 w-3.5" /> Source Infrastructure
                                    </h5>
                                    <div className="space-y-3">
                                        <div className="p-3 bg-card border border-border rounded-xl flex items-center justify-between group/link hover:border-primary/20 transition-all">
                                            <div className="flex flex-col min-w-0">
                                                <span className="text-[8px] font-black text-muted-foreground uppercase tracking-tight">Main Footage</span>
                                                <span className="text-xs font-bold text-foreground truncate max-w-[200px]">{inspectProject.footageLink || 'N/A'}</span>
                                            </div>
                                            {inspectProject.footageLink && (
                                                <a href={inspectProject.footageLink} target="_blank" className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center text-muted-foreground hover:text-primary transition-all">
                                                    <ExternalLink className="h-4 w-4" />
                                                </a>
                                            )}
                                        </div>
                                        <div className="grid grid-cols-3 gap-3">
                                            {[
                                                { label: 'Raw Files', count: inspectProject.rawFiles?.length || 0 },
                                                { label: 'Scripts', count: inspectProject.scripts?.length || 0 },
                                                { label: 'Refs', count: inspectProject.referenceFiles?.length || 0 }
                                            ].map((item, i) => (
                                                <div key={i} className="p-3 bg-card border border-border rounded-xl text-center">
                                                    <div className="text-sm font-black text-foreground">{item.count}</div>
                                                    <div className="text-[7px] font-black text-muted-foreground uppercase tracking-widest">{item.label}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* Stakeholders */}
                                <div className="bg-muted/30 border border-border rounded-2xl p-5 space-y-4">
                                    <h5 className="text-[10px] font-black uppercase tracking-widest text-emerald-500 flex items-center gap-2">
                                        <Activity className="h-3.5 w-3.5" /> Resource Assignment
                                    </h5>
                                    <div className="space-y-3">
                                        <div className="p-3 bg-card border border-border rounded-xl flex items-center gap-3 hover:border-primary/20 transition-all">
                                            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                                                <UserIcon className="h-4 w-4 text-primary" />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-[8px] font-black text-muted-foreground uppercase tracking-tight">Success Manager (PM)</span>
                                                <span className="text-xs font-black text-foreground leading-tight">
                                                    {users.find(u => u.uid === inspectProject.assignedPMId)?.displayName || 'Infrastructure Unmanaged'}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="p-3 bg-card border border-border rounded-xl flex items-center gap-3 hover:border-primary/20 transition-all">
                                            <div className="h-9 w-9 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                                                <Briefcase className="h-4 w-4 text-emerald-500" />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-[8px] font-black text-muted-foreground uppercase tracking-tight">Assigned Creative (Editor)</span>
                                                <span className="text-xs font-black text-foreground leading-tight">
                                                    {users.find(u => u.uid === inspectProject.assignedEditorId)?.displayName || 'Awaiting Allocation'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Brief / Description (Large Rectangle) */}
                            <div className="bg-muted/30 border border-border rounded-2xl p-6 space-y-3">
                                <div className="flex items-center justify-between">
                                    <h5 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                                        <Shield className="h-3.5 w-3.5" /> Internal Brief & Metadata
                                    </h5>
                                    <span className="text-[8px] font-bold text-muted-foreground/60 uppercase">CLASSIFIED_ACCESS</span>
                                </div>
                                <div className="bg-card border border-border rounded-xl p-4 min-h-[100px]">
                                    <p className="text-xs leading-relaxed text-foreground/80 font-medium whitespace-pre-wrap">
                                        {inspectProject.description || "No project brief has been cataloged for this resource phase."}
                                    </p>
                                </div>
                                {inspectProject.assignmentStatus === 'rejected' && inspectProject.editorDeclineReason && (
                                    <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 space-y-1">
                                        <div className="text-[9px] font-black uppercase tracking-[0.2em] flex items-center gap-2">
                                            <AlertCircle className="h-3.5 w-3.5" /> REJECTION_INCIDENT
                                        </div>
                                        <p className="text-xs text-red-400 font-bold italic">â€œ{inspectProject.editorDeclineReason}â€</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* RIGHT COLUMN: 4 Units (Financials & Logs) */}
                        <div className="lg:col-span-4 space-y-6">
                            {/* Treasury Ledger (Rectangle) */}
                            <div className="bg-muted/30 border border-border rounded-2xl p-6 space-y-6 relative overflow-hidden group">
                                <div className="absolute -top-4 -right-4 opacity-5 group-hover:opacity-10 transition-opacity">
                                    <IndianRupee className="h-24 w-24" />
                                </div>
                                <h5 className="text-[11px] font-black uppercase tracking-widest text-primary border-b border-border pb-3 flex items-center gap-2">
                                    <IndianRupee className="h-4 w-4" /> Treasury Ledger
                                </h5>
                                <div className="space-y-5">
                                    <div className="flex flex-col bg-card/40 p-4 rounded-xl border border-border">
                                        <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Global Order Value</span>
                                        <div className="text-3xl font-black text-foreground tabular-nums tracking-tighter mt-1">₹{inspectProject.totalCost?.toLocaleString()}</div>
                                    </div>
                                    
                                    <div className="grid grid-cols-1 gap-3">
                                        <div className="p-4 bg-emerald-500/5 border border-emerald-500/10 rounded-xl flex items-center justify-between">
                                            <div className="flex flex-col">
                                                <span className="text-[8px] font-black text-emerald-500/60 uppercase tracking-widest">Editor Revenue</span>
                                                <span className="text-lg font-black text-emerald-500 tabular-nums">₹{inspectProject.editorPrice?.toLocaleString() || '0'}</span>
                                            </div>
                                            <ArrowUpRight className="h-5 w-5 text-emerald-500" />
                                        </div>
                                        <div className="p-4 bg-primary/5 border border-primary/10 rounded-xl flex items-center justify-between">
                                            <div className="flex flex-col">
                                                <span className="text-[8px] font-black text-primary/60 uppercase tracking-widest">Platform Margin</span>
                                                <span className="text-lg font-black text-primary tabular-nums">₹{((inspectProject.totalCost || 0) - (inspectProject.editorPrice || 0)).toLocaleString()}</span>
                                            </div>
                                            <Zap className="h-5 w-5 text-primary" />
                                        </div>
                                    </div>
                                    
                                    <div className="pt-2 flex items-center justify-between px-1">
                                        <div className="flex flex-col">
                                            <span className="text-[8px] font-black text-muted-foreground uppercase tracking-widest">Auto-Settlement</span>
                                            <span className={cn("text-[10px] font-black uppercase mt-0.5", inspectProject.autoPay ? "text-primary" : "text-muted-foreground")}>
                                                {inspectProject.autoPay ? 'AUTHORIZED' : 'DISABLED'}
                                            </span>
                                        </div>
                                        <div className={cn("h-6 w-10 rounded-lg border flex items-center justify-center", inspectProject.autoPay ? "bg-primary shadow-[0_0_10px_rgba(var(--primary),0.3)] border-primary" : "bg-muted border-border")}>
                                            <ShieldCheck className={cn("h-3.5 w-3.5", inspectProject.autoPay ? "text-primary-foreground" : "text-muted-foreground")} />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Project History / Incident Logs (Rectangle) */}
                            <div className="bg-muted/30 border border-border rounded-2xl p-6 flex flex-col min-h-[400px]">
                                <h5 className="text-[11px] font-black uppercase tracking-widest text-primary border-b border-border pb-3 flex items-center gap-2">
                                    <Activity className="h-4 w-4" /> Project History
                                </h5>
                                <div className="flex-1 overflow-y-auto mt-6 space-y-6 pr-2 custom-scrollbar">
                                    {inspectProject.logs && inspectProject.logs.length > 0 ? (
                                        [...inspectProject.logs].reverse().map((log: any, i) => (
                                            <div key={i} className="relative pl-6 before:absolute before:left-1 before:top-2 before:w-px before:h-[calc(100%+1.5rem)] before:bg-border last:before:hidden text-left">
                                                <div className="absolute left-[-2px] top-2 h-2 w-2 rounded-full bg-border border border-muted ring-2 ring-muted group-hover:bg-primary transition-all" />
                                                <div className="space-y-1.5 pb-2 border-b border-border/20">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <span className="text-[10px] font-black text-foreground uppercase tracking-tight">{log.event.replace('_', ' ')}</span>
                                                        <span className="text-[8px] font-bold text-muted-foreground tabular-nums">
                                                            {new Date(log.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                                                        </span>
                                                    </div>
                                                    <p className="text-[11px] text-muted-foreground/90 font-medium leading-relaxed">{log.details}</p>
                                                    <div className="flex items-center gap-1.5 pt-1">
                                                        <span className="text-[9px] font-black text-primary uppercase">{log.userName}</span>
                                                        {log.designation && <span className="text-[8px] font-bold text-muted-foreground italic truncate lowercase text-opacity-70">/ {log.designation}</span>}
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="py-12 flex flex-col items-center justify-center opacity-30 gap-3">
                                            <Database className="h-6 w-6 text-muted-foreground" />
                                            <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">No History cataloged</p>
                                        </div>
                                    )}
                                </div>
                            </div>
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
                     <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Full Name</label>
                     <input 
                         required
                         type="text"
                         value={newEditor.name}
                         onChange={(e) => setNewEditor({...newEditor, name: e.target.value})}
                         className="w-full h-11 bg-black/5 dark:bg-black/40 border border-border rounded-lg px-4 text-sm text-foreground focus:outline-none focus:border-primary/50 transition-colors"
                     />
                 </div>
                 <div className="space-y-1.5">
                     <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Email Address</label>
                     <input 
                         required
                         type="email"
                         value={newEditor.email}
                         onChange={(e) => setNewEditor({...newEditor, email: e.target.value})}
                         className="w-full h-11 bg-black/5 dark:bg-black/40 border border-border rounded-lg px-4 text-sm text-foreground focus:outline-none focus:border-primary/50 transition-colors"
                     />
                 </div>
                 <div className="space-y-1.5">
                     <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Password</label>
                     <input 
                         required
                         type="text"
                         value={newEditor.password}
                         onChange={(e) => setNewEditor({...newEditor, password: e.target.value})}
                         className="w-full h-11 bg-black/5 dark:bg-black/40 border border-border rounded-lg px-4 text-sm text-foreground focus:outline-none focus:border-primary/50 transition-colors"
                     />
                 </div>
                 <div className="space-y-1.5">
                     <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">WhatsApp Number</label>
                     <div className="flex gap-2">
                         <div className="flex items-center justify-center h-11 px-3 bg-muted border border-border rounded-lg text-sm text-muted-foreground">+91</div>
                         <input 
                             required
                             type="tel"
                             value={newEditor.whatsapp}
                             onChange={(e) => setNewEditor({...newEditor, whatsapp: e.target.value.replace(/\D/g, '').slice(0, 10)})}
                             className="flex-1 h-11 bg-black/5 dark:bg-black/40 border border-border rounded-lg px-4 text-sm text-foreground focus:outline-none focus:border-primary/50 transition-colors"
                             placeholder="9876543210"
                             maxLength={10}
                         />
                     </div>
                 </div>
                  <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Portfolio URL</label>
                      <input 
                          required
                          type="url"
                          value={newEditor.portfolio}
                          onChange={(e) => setNewEditor({...newEditor, portfolio: e.target.value})}
                          className="w-full h-11 bg-black/5 dark:bg-black/40 border border-border rounded-lg px-4 text-sm text-foreground focus:outline-none focus:border-primary/50 transition-colors"
                      />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Location (Optional)</label>
                          <input 
                              type="text"
                              value={newEditor.location}
                              onChange={(e) => setNewEditor({...newEditor, location: e.target.value})}
                              placeholder="e.g. Mumbai, IN"
                              className="w-full h-11 bg-black/5 dark:bg-black/40 border border-border rounded-lg px-4 text-sm text-foreground focus:outline-none focus:border-primary/50 transition-colors"
                          />
                      </div>
                      <div className="space-y-4 col-span-2">
                          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Specialization & Assigned Pricing</label>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1">
                              {['YouTube', 'Reels', 'Ads', 'Color Grading', 'Motion Graphics', 'Subtitles'].map((skill) => {
                                  const isSelected = newEditor.skills.includes(skill);
                                  return (
                                  <div key={skill} className={cn("flex flex-col gap-2 p-3 rounded-lg border transition-colors", isSelected ? "bg-primary/5 border-primary/30" : "bg-muted/50 border-border")}>
                                      <label className="flex items-center gap-2 text-sm text-foreground/80 font-medium cursor-pointer">
                                          <input 
                                              type="checkbox" 
                                              className="accent-primary w-4 h-4 cursor-pointer"
                                              checked={isSelected}
                                              onChange={(e) => {
                                                  if (e.target.checked) {
                                                      setNewEditor({...newEditor, skills: [...newEditor.skills, skill]});
                                                  } else {
                                                      const updatedPrices = { ...newEditor.skillPrices };
                                                      delete updatedPrices[skill];
                                                      setNewEditor({...newEditor, skills: newEditor.skills.filter(s => s !== skill), skillPrices: updatedPrices });
                                                  }
                                              }}
                                          />
                                          {skill}
                                      </label>
                                      {isSelected && (
                                          <div className="pl-6">
                                              <input 
                                                  type="text"
                                                  placeholder="Price (e.g. ₹500 - ₹1000)"
                                                  value={newEditor.skillPrices[skill] || ''}
                                                  onChange={(e) => setNewEditor({
                                                      ...newEditor, 
                                                      skillPrices: { ...newEditor.skillPrices, [skill]: e.target.value }
                                                  })}
                                                  className="w-full h-8 bg-black/5 dark:bg-black/40 border border-border rounded px-3 text-xs text-foreground focus:outline-none focus:border-primary/50"
                                              />
                                          </div>
                                      )}
                                  </div>
                              )})}
                          </div>
                      </div>
                  </div>
                 <button 
                     type="submit"
                     disabled={isCreatingEditor}
                     className="w-full h-12 mt-4 bg-primary text-primary-foreground font-black uppercase text-[10px] tracking-widest rounded-xl hover:bg-primary/90 transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(var(--primary),0.2)] disabled:opacity-50"
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




