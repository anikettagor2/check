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
    IndianRupee,
    MoreHorizontal,
    FileText,
    Upload,
    Eye,
    Calendar,
    ChevronDown,
    Video,
    TrendingUp,
    Wallet,
    Star,
    Timer,
    Award,
    Play,
    CircleDot
} from "lucide-react";
import { 
    DropdownMenu, 
    DropdownMenuContent, 
    DropdownMenuItem, 
    DropdownMenuTrigger,
    DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { respondToAssignment } from "@/app/actions/admin-actions";
import { motion, AnimatePresence } from "framer-motion";
import { EditorPerformance } from "./editor-performance";
import { IndicatorCard } from "@/components/ui/indicator-card";

export function EditorDashboard() {
    const { user } = useAuth();
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [mainTab, setMainTab] = useState<'tasks' | 'performance'>('tasks');
    const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'active' | 'completed'>('all');
    const [searchQuery, setSearchQuery] = useState("");
    const [userData, setUserData] = useState<any>(null);

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
            toast.success(response === 'accepted' ? "Project accepted! You can start working on it." : "Project declined.");
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
            where("assignedEditorId", "==", user.uid)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedProjects: Project[] = [];
            snapshot.forEach((doc) => {
                fetchedProjects.push({ id: doc.id, ...doc.data() } as Project);
            });
            fetchedProjects.sort((a, b) => {
                const aUpdated = typeof a.updatedAt === "number" ? a.updatedAt : 0;
                const bUpdated = typeof b.updatedAt === "number" ? b.updatedAt : 0;
                return bUpdated - aUpdated;
            });
            setProjects(fetchedProjects);
            setLoading(false);
        }, (error) => {
            console.error("[EditorDashboard] Failed to subscribe assigned projects", {
                code: (error as any)?.code,
                message: error?.message,
                uid: user.uid,
            });
            toast.error("Failed to load assigned projects. Please refresh.");
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
    const pendingInvitations = projects.filter(p => p.assignmentStatus === 'pending');
    const activeProjects = projects.filter(p => (p.status === 'in_production' || p.status === 'active') && p.assignmentStatus !== 'pending');
    const reviewProjects = projects.filter(p => (p.status === 'review' || p.status === 'in_review'));
    const completedProjects = projects.filter(p => ['completed', 'approved', 'completed_pending_payment'].includes(p.status));
    
    const totalEarnings = completedProjects.reduce((acc, curr) => acc + (curr.editorPrice || 0), 0);
    const pendingEarnings = projects.filter(p => ['completed', 'approved'].includes(p.status) && !p.editorPaid).reduce((acc, p) => acc + (p.editorPrice || 0), 0);
    
    const ratedProjects = projects.filter(p => p.editorRating);
    const averageRating = ratedProjects.length > 0
        ? ratedProjects.reduce((acc, curr) => acc + (curr.editorRating || 0), 0) / ratedProjects.length
        : 0;

    // Time calculations
    const completedWithTime = completedProjects.filter(p => p.completedAt && p.assignmentAt);
    const avgDeliveryTimeMs = completedWithTime.length > 0
        ? completedWithTime.reduce((acc, p) => acc + (p.completedAt! - p.assignmentAt!), 0) / completedWithTime.length
        : 0;
    const avgDeliveryTimeHrs = Math.round(avgDeliveryTimeMs / (1000 * 60 * 60));

    const filteredProjects = projects.filter(project => {
        if (activeTab === 'pending' && project.assignmentStatus !== 'pending') return false;
        if (activeTab === 'active' && !(['in_production', 'active', 'review', 'in_review'].includes(project.status) && project.assignmentStatus !== 'pending')) return false;
        if (activeTab === 'completed' && !['completed', 'approved', 'completed_pending_payment'].includes(project.status)) return false;
        if (searchQuery && !project.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
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
            toast.success(`Status updated to ${newStatus}`);
        } catch(err) {
            toast.error("Failed to update status");
        }
    };

    return (
        <div className="w-full space-y-8">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
                            Welcome, {user?.displayName?.split(' ')[0]}
                        </h1>
                        <div className="flex items-center gap-2">
                            <div className={cn(
                                "h-2.5 w-2.5 rounded-full",
                                editorStatus === 'online' ? "bg-green-500" :
                                editorStatus === 'sleep' ? "bg-amber-500" : "bg-zinc-500"
                            )} />
                            <select 
                                value={editorStatus}
                                onChange={(e) => handleStatusUpdate(e.target.value as any)}
                                className="bg-transparent border-none text-sm font-medium text-muted-foreground hover:text-foreground focus:ring-0 cursor-pointer capitalize"
                                style={{ colorScheme: "dark" }}
                            >
                                <option value="online" className="bg-card text-foreground">Online</option>
                                <option value="sleep" className="bg-card text-foreground">Away</option>
                                <option value="offline" className="bg-card text-foreground">Offline</option>
                            </select>
                        </div>
                    </div>
                    <p className="text-muted-foreground">
                        {pendingInvitations.length > 0 
                            ? `You have ${pendingInvitations.length} project invitation${pendingInvitations.length > 1 ? 's' : ''} waiting`
                            : "Here's an overview of your work"
                        }
                    </p>
                </div>

                {/* Tab Toggle */}
                <div className="flex bg-muted rounded-lg p-1">
                    <button
                        onClick={() => setMainTab('tasks')}
                        className={cn(
                            "px-4 py-2 text-sm font-medium rounded-md transition-colors",
                            mainTab === 'tasks' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        My Projects
                    </button>
                    <button
                        onClick={() => setMainTab('performance')}
                        className={cn(
                            "px-4 py-2 text-sm font-medium rounded-md transition-colors",
                            mainTab === 'performance' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        Performance
                    </button>
                </div>
            </div>

            {mainTab === 'tasks' ? (
                <>
                    {/* Stats Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                        <IndicatorCard 
                            label="Invitations"
                            value={pendingInvitations.length}
                            icon={<AlertCircle className="h-5 w-5" />}
                            alert={pendingInvitations.length > 0}
                            subtext="Action needed"
                        />
                        <IndicatorCard 
                            label="In Progress"
                            value={activeProjects.length + reviewProjects.length}
                            icon={<Play className="h-5 w-5" />}
                            subtext="Under active production"
                        />
                        <IndicatorCard 
                            label="Completed"
                            value={completedProjects.length}
                            icon={<CheckCircle2 className="h-5 w-5" />}
                            subtext="Finished deliverables"
                        />
                        <IndicatorCard 
                            label="Total Earned"
                            value={`₹${totalEarnings.toLocaleString()}`}
                            icon={<Wallet className="h-5 w-5" />}
                            subtext="Total payout amount"
                        />
                        <IndicatorCard 
                            label="Avg Rating"
                            value={averageRating > 0 ? averageRating.toFixed(1) : '—'}
                            icon={<Star className="h-5 w-5" />}
                            subtext={averageRating > 0 ? "Out of 5 stars" : "No ratings yet"}
                        />
                    </div>

                    {/* Pending Invitations Alert */}
                    {pendingInvitations.length > 0 && (
                        <motion.div 
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-5"
                        >
                            <div className="flex items-center gap-3 mb-4">
                                <div className="h-10 w-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                                    <AlertCircle className="h-5 w-5 text-amber-500" />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-amber-600 dark:text-amber-400">
                                        New Project Invitations
                                    </h3>
                                    <p className="text-sm text-amber-600/80 dark:text-amber-400/80">
                                        Accept or decline within 24 hours
                                    </p>
                                </div>
                            </div>
                            <div className="space-y-3">
                                {pendingInvitations.map((project) => (
                                    <div key={project.id} className="flex items-center justify-between bg-background/50 rounded-lg p-4">
                                        <div>
                                            <p className="font-medium text-foreground">{project.name}</p>
                                            <p className="text-sm text-muted-foreground">
                                                {project.videoType} • ₹{project.editorPrice?.toLocaleString() || 0}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button 
                                                onClick={() => handleResponse(project.id, 'accepted')}
                                                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
                                            >
                                                Accept
                                            </button>
                                            <button 
                                                onClick={() => handleResponse(project.id, 'rejected')}
                                                className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm font-medium hover:bg-muted/80 transition-colors"
                                            >
                                                Decline
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </motion.div>
                    )}

                    {/* Projects Table */}
                    <div className="bg-card border border-border rounded-xl overflow-hidden">
                        {/* Table Header */}
                        <div className="p-4 border-b border-border flex flex-col sm:flex-row gap-4">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <input 
                                    type="text"
                                    placeholder="Search projects..."
                                    className="w-full h-10 pl-10 pr-4 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                            </div>
                            <div className="flex bg-muted rounded-lg p-1">
                                {[
                                    { id: 'all', label: 'All', count: projects.length },
                                    { id: 'pending', label: 'Pending', count: pendingInvitations.length },
                                    { id: 'active', label: 'Active', count: activeProjects.length + reviewProjects.length },
                                    { id: 'completed', label: 'Done', count: completedProjects.length }
                                ].map(tab => (
                                    <button
                                        key={tab.id}
                                        onClick={() => setActiveTab(tab.id as any)}
                                        className={cn(
                                            "px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                                            activeTab === tab.id 
                                                ? "bg-background text-foreground shadow-sm" 
                                                : "text-muted-foreground hover:text-foreground"
                                        )}
                                    >
                                        {tab.label}
                                        {tab.count > 0 && (
                                            <span className="ml-1.5 text-xs text-muted-foreground">
                                                {tab.count}
                                            </span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Table Content */}
                        <div className="overflow-x-auto">
                            {loading ? (
                                <div className="p-12 text-center">
                                    <div className="inline-flex items-center gap-2 text-muted-foreground">
                                        <div className="h-4 w-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                                        Loading projects...
                                    </div>
                                </div>
                            ) : filteredProjects.length === 0 ? (
                                <div className="p-12 text-center">
                                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
                                        <Video className="h-8 w-8 text-muted-foreground" />
                                    </div>
                                    <h3 className="font-semibold text-foreground mb-1">No projects found</h3>
                                    <p className="text-sm text-muted-foreground">
                                        {activeTab === 'pending' 
                                            ? "No pending invitations at the moment" 
                                            : "Projects will appear here when assigned to you"
                                        }
                                    </p>
                                </div>
                            ) : (
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b border-border bg-muted/30">
                                            <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Project</th>
                                            <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3 hidden md:table-cell">Deadline</th>
                                            <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">Status</th>
                                            <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">Earnings</th>
                                            <th className="w-10"></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <AnimatePresence mode="popLayout">
                                            {filteredProjects.map((project, idx) => {
                                                const deadline = project.deadline ? new Date(project.deadline) : null;
                                                const isUrgent = deadline ? (deadline.getTime() - Date.now() < 172800000) : false;

                                                return (
                                                    <motion.tr 
                                                        key={project.id}
                                                        initial={{ opacity: 0 }}
                                                        animate={{ opacity: 1 }}
                                                        exit={{ opacity: 0 }}
                                                        transition={{ delay: idx * 0.03 }}
                                                        className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors group"
                                                    >
                                                        <td className="px-4 py-4">
                                                            <div>
                                                                <Link href={`/dashboard/projects/${project.id}`}>
                                                                    <p className="font-medium text-foreground group-hover:text-primary transition-colors line-clamp-1">
                                                                        {project.name}
                                                                    </p>
                                                                </Link>
                                                                <p className="text-xs text-muted-foreground capitalize mt-0.5">
                                                                    {project.videoType?.replace('_', ' ') || 'Video'}
                                                                </p>
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-4 hidden md:table-cell">
                                                            {project.deadline ? (
                                                                <div className={cn(
                                                                    "flex items-center gap-2 text-sm",
                                                                    isUrgent ? "text-red-500" : "text-muted-foreground"
                                                                )}>
                                                                    <Calendar className="h-4 w-4" />
                                                                    {project.deadline}
                                                                </div>
                                                            ) : (
                                                                <span className="text-sm text-muted-foreground">No deadline</span>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-4 text-right">
                                                            <ProjectStatus status={project.status} assignmentStatus={project.assignmentStatus} />
                                                        </td>
                                                        <td className="px-4 py-4 text-right">
                                                            <span className="font-semibold text-foreground">
                                                                ₹{(project.editorPrice || 0).toLocaleString()}
                                                            </span>
                                                        </td>
                                                        <td className="px-2 py-4">
                                                            <DropdownMenu>
                                                                <DropdownMenuTrigger asChild>
                                                                    <button className="h-8 w-8 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
                                                                        <MoreHorizontal className="h-4 w-4" />
                                                                    </button>
                                                                </DropdownMenuTrigger>
                                                                <DropdownMenuContent align="end">
                                                                    <DropdownMenuItem asChild>
                                                                        <Link href={`/dashboard/projects/${project.id}`} className="flex items-center gap-2">
                                                                            <Eye className="h-4 w-4" />
                                                                            View Project
                                                                        </Link>
                                                                    </DropdownMenuItem>
                                                                    {!['completed', 'approved'].includes(project.status) && project.assignmentStatus !== 'pending' && (
                                                                        <DropdownMenuItem asChild>
                                                                            <Link href={`/dashboard/projects/${project.id}/upload`} className="flex items-center gap-2">
                                                                                <Upload className="h-4 w-4" />
                                                                                Upload Draft
                                                                            </Link>
                                                                        </DropdownMenuItem>
                                                                    )}
                                                                </DropdownMenuContent>
                                                            </DropdownMenu>
                                                        </td>
                                                    </motion.tr>
                                                );
                                            })}
                                        </AnimatePresence>
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>

                    {/* Pending Earnings Notice */}
                    {pendingEarnings > 0 && (
                        <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-5">
                            <div className="flex items-start gap-4">
                                <div className="h-10 w-10 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
                                    <Wallet className="h-5 w-5 text-green-500" />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-green-600 dark:text-green-400">
                                        Pending Payout
                                    </h3>
                                    <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">
                                        ₹{pendingEarnings.toLocaleString()}
                                    </p>
                                    <p className="text-sm text-green-600/80 dark:text-green-400/80 mt-1">
                                        This amount will be processed once the client approves the work
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                </>
            ) : (
                user && <EditorPerformance user={user} projects={completedProjects} />
            )}
        </div>
    );
}

// Project Status Badge Component
function ProjectStatus({ status, assignmentStatus }: { status: string; assignmentStatus?: string }) {
    if (assignmentStatus === 'pending' || status === 'editor_assigned') {
        return (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full border bg-amber-500/10 text-amber-500 border-amber-500/20">
                <CircleDot className="h-3 w-3" />
                Awaiting Response
            </span>
        );
    }

    const config: Record<string, { label: string; className: string }> = {
        project_created: { label: 'Project Created', className: 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20' },
        editor_not_assigned: { label: 'Editor Not Assigned', className: 'bg-amber-500/10 text-amber-500 border-amber-500/20' },
        editor_assigned: { label: 'Awaiting Response', className: 'bg-amber-500/10 text-amber-500 border-amber-500/20' },
        in_production: { label: 'In Production', className: 'bg-blue-500/10 text-blue-500 border-blue-500/20' },
        active: { label: 'In Production', className: 'bg-blue-500/10 text-blue-500 border-blue-500/20' },
        review: { label: 'In Review', className: 'bg-purple-500/10 text-purple-500 border-purple-500/20' },
        in_review: { label: 'In Review', className: 'bg-purple-500/10 text-purple-500 border-purple-500/20' },
        revision: { label: 'Revision', className: 'bg-orange-500/10 text-orange-500 border-orange-500/20' },
        completed: { label: 'Completed', className: 'bg-green-500/10 text-green-500 border-green-500/20' },
        completed_pending_payment: { label: 'Payment Pending', className: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' },
        approved: { label: 'Approved', className: 'bg-green-500/10 text-green-500 border-green-500/20' }
    };

    const { label, className } = config[status] || { label: status.replace(/_/g, ' '), className: 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20' };

    return (
        <span className={cn("inline-flex px-2.5 py-1 text-xs font-medium rounded-full border capitalize", className)}>
            {label}
        </span>
    );
}
