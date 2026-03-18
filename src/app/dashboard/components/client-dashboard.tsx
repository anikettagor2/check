"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/context/auth-context";
import { db } from "@/lib/firebase/config";
import { collection, query, where, onSnapshot, orderBy } from "firebase/firestore";
import { Project, User } from "@/types/schema";
import { cn } from "@/lib/utils";
import { 
    Plus, 
    Search, 
    Calendar,
    MoreHorizontal,
    Eye,
    ChevronDown,
    CheckCircle2,
    AlertCircle,
    Clock,
    User as UserIcon,
    Video,
    TrendingUp,
    Wallet,
    MessageCircle,
    ArrowRight,
    FileVideo,
    Sparkles,
    IndianRupee,
    ShieldCheck,
    Download,
    Link as LinkIcon,
    X
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { Modal } from "@/components/ui/modal";
import { 
    DropdownMenu, 
    DropdownMenuContent, 
    DropdownMenuItem, 
    DropdownMenuTrigger,
    DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import { motion, AnimatePresence } from "framer-motion";

const CLIENT_VIDEO_TYPE_ALIASES: Record<string, string[]> = {
    "Reel Format": ["Reel Format", "Reels", "Short Videos"],
    "Long Video": ["Long Video", "Long Videos"],
    "Documentary": ["Documentary", "Long Videos"],
    "Podcast Edit": ["Podcast Edit", "Long Videos"],
    "Motion Graphic": ["Motion Graphic", "Graphics Videos"],
    "Cinematic Event": ["Cinematic Event", "Ads/UGC Videos"]
};

const CLIENT_VIDEO_TYPES = [
    "Reel Format",
    "Long Video",
    "Documentary",
    "Podcast Edit",
    "Motion Graphic",
    "Cinematic Event"
];

function getClientVisibleRate(customRates: Record<string, number> | undefined, videoType: string) {
    const aliases = CLIENT_VIDEO_TYPE_ALIASES[videoType] || [videoType];
    for (const alias of aliases) {
        if (customRates?.[alias] !== undefined) return customRates[alias];
    }
    return 1000;
}

function isClientAllowedFormat(allowedFormats: Record<string, boolean> | undefined, videoType: string) {
    if (!allowedFormats || Object.keys(allowedFormats).length === 0) return true;
    const aliases = CLIENT_VIDEO_TYPE_ALIASES[videoType] || [videoType];
    return aliases.some((alias) => allowedFormats[alias] === true);
}

function buildWhatsAppLink(phone?: string) {
    if (!phone) return null;
    const digits = phone.replace(/\D/g, "");
    if (!digits) return null;

    // Treat 10-digit local numbers as Indian mobile numbers.
    const normalized = digits.length === 10 ? `91${digits}` : digits;
    return `https://wa.me/${normalized}`;
}

export function ClientDashboard() {
    const { user } = useAuth();
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState<string>("all");
    const [allUsers, setAllUsers] = useState<User[]>([]);
    const [selectedProject, setSelectedProject] = useState<Project | null>(null);
    const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);

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
        const unsub = onSnapshot(collection(db, "users"), (snap) => {
            setAllUsers(snap.docs.map(doc => ({ uid: doc.id, ...doc.data() } as User)));
        });
        return () => unsub();
    }, []);

    // Show Project Manager in Account Manager card (not Sales Executive).
    const assignedPMId = user?.managedByPM || projects.find(p => p.assignedPMId)?.assignedPMId;
    const assignedPM = assignedPMId ? allUsers.find(u => u.uid === assignedPMId) : null;

    const filteredProjects = projects.filter(project => {
        if (statusFilter !== 'all' && project.status !== statusFilter) return false;
        if (searchQuery && !project.name.toLowerCase().includes(searchQuery.toLowerCase()) && !project.id.includes(searchQuery)) return false;
        return true;
    });

    const totalSpent = projects.reduce((acc, curr) => acc + (curr.amountPaid || 0), 0);
    const pendingPayment = projects.reduce((acc, curr) => acc + ((curr.totalCost || 0) - (curr.amountPaid || 0)), 0);
    const activeProjects = projects.filter(p => !['completed', 'approved', 'archived', 'delivered'].includes(p.status)).length;
    const completedProjects = projects.filter(p => p.status === 'completed' || p.status === 'approved').length;

    const creditLimit = user?.creditLimit || 5000;
    const isOverLimit = pendingPayment >= creditLimit && (user?.payLater || false);
    const visiblePricing = CLIENT_VIDEO_TYPES
        .filter((videoType) => isClientAllowedFormat(user?.allowedFormats, videoType))
        .map((videoType) => ({
            videoType,
            price: getClientVisibleRate(user?.customRates, videoType)
        }));

    const pmWhatsAppLink = buildWhatsAppLink(assignedPM?.whatsappNumber || assignedPM?.phoneNumber);

    const selectedProjectPM = selectedProject?.assignedPMId
        ? allUsers.find(u => u.uid === selectedProject.assignedPMId)
        : null;

    const selectedProjectPMWhatsapp = buildWhatsAppLink(
        selectedProjectPM?.whatsappNumber || selectedProjectPM?.phoneNumber
    );

    const triggerDirectDownload = async (url: string, fileName?: string) => {
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

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
            {/* Credit Warning */}
            {isOverLimit && (
                <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-between gap-4"
                >
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-red-500/20 flex items-center justify-center">
                            <AlertCircle className="h-5 w-5 text-red-500" />
                        </div>
                        <div>
                            <p className="text-sm font-semibold text-red-500">Payment Required</p>
                            <p className="text-xs text-red-400/80">Your outstanding balance (₹{pendingPayment.toLocaleString()}) exceeds your credit limit. Please clear your dues to continue.</p>
                        </div>
                    </div>
                    <Link href="/dashboard/payments">
                        <button className="px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition-colors whitespace-nowrap">
                            Pay Now
                        </button>
                    </Link>
                </motion.div>
            )}

            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
                        Welcome back, {user?.displayName?.split(' ')[0] || 'there'}
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Here's what's happening with your projects
                    </p>
                </div>
                <Link href="/dashboard/projects/new">
                    <button className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors shadow-sm">
                        <Plus className="h-4 w-4" />
                        New Project
                    </button>
                </Link>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatsCard 
                    label="Total Projects"
                    value={projects.length}
                    icon={<Video className="h-5 w-5" />}
                    color="blue"
                />
                <StatsCard 
                    label="In Progress"
                    value={activeProjects}
                    icon={<Clock className="h-5 w-5" />}
                    color="amber"
                />
                <StatsCard 
                    label="Completed"
                    value={completedProjects}
                    icon={<CheckCircle2 className="h-5 w-5" />}
                    color="green"
                />
                <StatsCard 
                    label="Total Spent"
                    value={`₹${totalSpent.toLocaleString()}`}
                    icon={<Wallet className="h-5 w-5" />}
                    color="purple"
                />
            </div>

            {/* Main Content Grid */}
            <div className="grid lg:grid-cols-3 gap-6">
                {/* Projects List - Takes 2 columns */}
                <div className="lg:col-span-2 space-y-4">
                    <div className="bg-card border border-border rounded-xl overflow-hidden">
                        {/* Search & Filter Header */}
                        <div className="p-4 border-b border-border flex flex-col sm:flex-row gap-3">
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
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <button className="h-10 px-4 rounded-lg border border-border bg-background text-sm font-medium text-muted-foreground hover:text-foreground flex items-center gap-2 transition-colors">
                                        {statusFilter === 'all' ? 'All Status' : statusFilter.replace('_', ' ')}
                                        <ChevronDown className="h-4 w-4" />
                                    </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-40">
                                    <DropdownMenuItem onClick={() => setStatusFilter('all')}>All Status</DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={() => setStatusFilter('pending')}>Pending</DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => setStatusFilter('active')}>In Progress</DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => setStatusFilter('in_review')}>In Review</DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => setStatusFilter('completed')}>Completed</DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>

                        {/* Projects Table */}
                        <div className="overflow-x-auto">
                            {loading ? (
                                <div className="p-12 text-center">
                                    <div className="inline-flex items-center gap-2 text-muted-foreground">
                                        <div className="h-4 w-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                                        Loading your projects...
                                    </div>
                                </div>
                            ) : filteredProjects.length === 0 ? (
                                <div className="p-12 text-center">
                                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
                                        <FileVideo className="h-8 w-8 text-muted-foreground" />
                                    </div>
                                    <h3 className="font-semibold text-foreground mb-1">No projects yet</h3>
                                    <p className="text-sm text-muted-foreground mb-4">Start your first video project today</p>
                                    <Link href="/dashboard/projects/new">
                                        <button className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
                                            <Plus className="h-4 w-4" />
                                            Create Project
                                        </button>
                                    </Link>
                                </div>
                            ) : (
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b border-border bg-muted/30">
                                            <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Project</th>
                                            <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3 hidden sm:table-cell">Type</th>
                                            <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3 hidden md:table-cell">Editor</th>
                                            <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">Status</th>
                                            <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3 hidden sm:table-cell">Price</th>
                                            <th className="w-10"></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <AnimatePresence mode="popLayout">
                                            {filteredProjects.map((project, idx) => (
                                                <motion.tr 
                                                    key={project.id}
                                                    initial={{ opacity: 0 }}
                                                    animate={{ opacity: 1 }}
                                                    exit={{ opacity: 0 }}
                                                    transition={{ delay: idx * 0.03 }}
                                                    className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors group"
                                                >
                                                    <td className="px-4 py-3">
                                                        <Link href={`/dashboard/projects/${project.id}`} className="block">
                                                            <p className="font-medium text-foreground group-hover:text-primary transition-colors line-clamp-1">
                                                                {project.name}
                                                            </p>
                                                            <p className="text-xs text-muted-foreground mt-0.5">
                                                                {project.createdAt ? new Date(project.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                                                            </p>
                                                        </Link>
                                                    </td>
                                                    <td className="px-4 py-3 hidden sm:table-cell">
                                                        <span className="text-sm text-muted-foreground capitalize">
                                                            {project.videoType?.replace('_', ' ') || 'Video'}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 hidden md:table-cell">
                                                        {project.assignedEditorId ? (
                                                            <div className="flex items-center gap-2">
                                                                <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center">
                                                                    <span className="text-xs font-medium text-primary">
                                                                        {allUsers.find(u => u.uid === project.assignedEditorId)?.displayName?.[0] || 'E'}
                                                                    </span>
                                                                </div>
                                                                <span className="text-sm text-muted-foreground">
                                                                    {allUsers.find(u => u.uid === project.assignedEditorId)?.displayName?.split(' ')[0] || 'Editor'}
                                                                </span>
                                                            </div>
                                                        ) : (
                                                            <span className="text-sm text-muted-foreground">Assigning...</span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3 text-right">
                                                        <ProjectStatus status={project.status} />
                                                    </td>
                                                    <td className="px-4 py-3 text-right hidden sm:table-cell">
                                                        <span className="font-medium text-foreground">
                                                            ₹{(project.totalCost || 0).toLocaleString()}
                                                        </span>
                                                    </td>
                                                    <td className="px-2 py-3">
                                                        <DropdownMenu>
                                                            <DropdownMenuTrigger asChild>
                                                                <button className="h-8 w-8 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
                                                                    <MoreHorizontal className="h-4 w-4" />
                                                                </button>
                                                            </DropdownMenuTrigger>
                                                            <DropdownMenuContent align="end">
                                                                <DropdownMenuItem
                                                                    onClick={() => {
                                                                        setSelectedProject(project);
                                                                        setIsProjectModalOpen(true);
                                                                    }}
                                                                    className="flex items-center gap-2"
                                                                >
                                                                    <Eye className="h-4 w-4" />
                                                                    Project Details
                                                                </DropdownMenuItem>
                                                            </DropdownMenuContent>
                                                        </DropdownMenu>
                                                    </td>
                                                </motion.tr>
                                            ))}
                                        </AnimatePresence>
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </div>

                {/* Sidebar */}
                <div className="space-y-6">
                    {/* Account Manager Card */}
                    <div className="bg-card border border-border rounded-xl p-5">
                        <h3 className="font-semibold text-foreground mb-4">Your Account Manager</h3>
                        {assignedPM ? (
                            <div className="space-y-4">
                                <div className="flex items-center gap-3">
                                    <div className="h-12 w-12 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                                        <span className="text-lg font-semibold text-primary">
                                            {assignedPM.displayName?.[0]?.toUpperCase() || 'A'}
                                        </span>
                                    </div>
                                    <div>
                                        <p className="font-medium text-foreground">{assignedPM.displayName}</p>
                                        <p className="text-sm text-muted-foreground">Project Manager</p>
                                    </div>
                                </div>
                                <div className="pt-3 border-t border-border space-y-2">
                                    {assignedPM.email && (
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="text-muted-foreground">Email</span>
                                            <span className="text-foreground">{assignedPM.email}</span>
                                        </div>
                                    )}
                                    {assignedPM.phoneNumber && (
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="text-muted-foreground">Phone</span>
                                            <span className="text-foreground">{assignedPM.phoneNumber}</span>
                                        </div>
                                    )}
                                </div>
                                {pmWhatsAppLink ? (
                                    <a
                                        href={pmWhatsAppLink}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-muted text-foreground rounded-lg text-sm font-medium hover:bg-muted/80 transition-colors"
                                    >
                                        <MessageCircle className="h-4 w-4" />
                                        Send Message
                                    </a>
                                ) : (
                                    <button
                                        type="button"
                                        disabled
                                        className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-muted/40 text-muted-foreground rounded-lg text-sm font-medium cursor-not-allowed"
                                    >
                                        <MessageCircle className="h-4 w-4" />
                                        WhatsApp Not Available
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div className="text-center py-6">
                                <div className="h-12 w-12 mx-auto mb-3 rounded-full bg-muted flex items-center justify-center">
                                    <UserIcon className="h-6 w-6 text-muted-foreground" />
                                </div>
                                <p className="text-sm text-muted-foreground">
                                    A project manager will be assigned to you shortly
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Pricing Card */}
                    <div className="bg-card border border-border rounded-xl p-5">
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h3 className="font-semibold text-foreground">Your Agreed Pricing</h3>
                                <p className="text-xs text-muted-foreground mt-1">Prices fixed for your account by the sales executive.</p>
                            </div>
                            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                                <IndianRupee className="h-5 w-5 text-primary" />
                            </div>
                        </div>
                        <div className="space-y-2">
                            {visiblePricing.length === 0 ? (
                                <div className="text-sm text-muted-foreground">Pricing will be assigned soon.</div>
                            ) : (
                                visiblePricing.map((item) => (
                                    <div key={item.videoType} className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/40 border border-border">
                                        <div className="flex items-center gap-2">
                                            <ShieldCheck className="h-4 w-4 text-emerald-500" />
                                            <span className="text-sm font-medium text-foreground">{item.videoType}</span>
                                        </div>
                                        <span className="text-sm font-bold text-primary tabular-nums">₹{item.price.toLocaleString()}</span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Quick Actions */}
                    <div className="bg-card border border-border rounded-xl p-5">
                        <h3 className="font-semibold text-foreground mb-4">Quick Actions</h3>
                        <div className="space-y-2">
                            <Link href="/dashboard/projects/new" className="block">
                                <button className="w-full flex items-center justify-between px-4 py-3 rounded-lg bg-muted/50 hover:bg-muted text-left transition-colors group">
                                    <div className="flex items-center gap-3">
                                        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                                            <Plus className="h-4 w-4 text-primary" />
                                        </div>
                                        <span className="text-sm font-medium text-foreground">Start New Project</span>
                                    </div>
                                    <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                                </button>
                            </Link>
                            <Link href="/dashboard/payments" className="block">
                                <button className="w-full flex items-center justify-between px-4 py-3 rounded-lg bg-muted/50 hover:bg-muted text-left transition-colors group">
                                    <div className="flex items-center gap-3">
                                        <div className="h-8 w-8 rounded-lg bg-green-500/10 flex items-center justify-center">
                                            <Wallet className="h-4 w-4 text-green-500" />
                                        </div>
                                        <span className="text-sm font-medium text-foreground">View Payments</span>
                                    </div>
                                    <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                                </button>
                            </Link>
                            <Link href="/dashboard/invoices" className="block">
                                <button className="w-full flex items-center justify-between px-4 py-3 rounded-lg bg-muted/50 hover:bg-muted text-left transition-colors group">
                                    <div className="flex items-center gap-3">
                                        <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                                            <FileVideo className="h-4 w-4 text-blue-500" />
                                        </div>
                                        <span className="text-sm font-medium text-foreground">Download Invoices</span>
                                    </div>
                                    <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                                </button>
                            </Link>
                        </div>
                    </div>

                    {/* Pending Payment Notice */}
                    {pendingPayment > 0 && !isOverLimit && (
                        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-5">
                            <div className="flex items-start gap-3">
                                <div className="h-8 w-8 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                                    <Wallet className="h-4 w-4 text-amber-500" />
                                </div>
                                <div>
                                    <p className="font-medium text-amber-600 dark:text-amber-400">Outstanding Balance</p>
                                    <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">
                                        ₹{pendingPayment.toLocaleString()}
                                    </p>
                                    <Link href="/dashboard/payments">
                                        <button className="mt-3 text-sm text-amber-600 dark:text-amber-400 hover:underline inline-flex items-center gap-1">
                                            Make Payment <ArrowRight className="h-3 w-3" />
                                        </button>
                                    </Link>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <Modal
                isOpen={isProjectModalOpen}
                onClose={() => setIsProjectModalOpen(false)}
                title="Project Details"
                maxWidth="max-w-5xl"
            >
                {selectedProject && (
                    <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-6 max-h-[75vh] overflow-y-auto pr-2">
                        <div className="lg:col-span-2 space-y-5">
                            <div className="p-4 rounded-xl bg-muted/30 border border-border">
                                <h3 className="text-lg font-bold text-foreground">{selectedProject.name}</h3>
                                <div className="mt-2 flex items-center gap-3">
                                    <ProjectStatus status={selectedProject.status} />
                                    <span className="text-xs text-muted-foreground">
                                        Created {new Date(selectedProject.createdAt).toLocaleDateString()}
                                    </span>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <div className="p-3 rounded-lg border border-border bg-muted/20">
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Type</p>
                                    <p className="text-sm font-semibold mt-1">{selectedProject.videoType || 'Video'}</p>
                                </div>
                                <div className="p-3 rounded-lg border border-border bg-muted/20">
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Format</p>
                                    <p className="text-sm font-semibold mt-1">{selectedProject.videoFormat || '—'}</p>
                                </div>
                                <div className="p-3 rounded-lg border border-border bg-muted/20">
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Ratio</p>
                                    <p className="text-sm font-semibold mt-1">{selectedProject.aspectRatio || '—'}</p>
                                </div>
                                <div className="p-3 rounded-lg border border-border bg-muted/20">
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Duration</p>
                                    <p className="text-sm font-semibold mt-1">{selectedProject.duration ? `${selectedProject.duration}m` : '—'}</p>
                                </div>
                            </div>

                            <div className="bg-muted/30 border border-border rounded-lg p-4 space-y-3">
                                <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest">Project Files</p>

                                {selectedProject.rawFiles && selectedProject.rawFiles.length > 0 ? (
                                    <div className="space-y-2">
                                        {selectedProject.rawFiles.map((file: any, idx: number) => (
                                            <div key={`raw-${idx}`} className="flex items-center justify-between gap-3 p-2 rounded-md bg-card border border-border">
                                                <span className="text-xs font-medium truncate">{file.name}</span>
                                                <button
                                                    onClick={() => triggerDirectDownload(file.url, file.name)}
                                                    className="h-8 w-8 rounded-md bg-muted hover:bg-primary/20 hover:text-primary text-muted-foreground flex items-center justify-center transition-all"
                                                    title="Download"
                                                >
                                                    <Download className="h-3.5 w-3.5" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-xs text-muted-foreground">No client raw files available.</p>
                                )}

                                {selectedProject.referenceFiles && selectedProject.referenceFiles.length > 0 && (
                                    <div className="space-y-2 pt-2 border-t border-border">
                                        <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Manager References</p>
                                        {selectedProject.referenceFiles.map((file: any, idx: number) => (
                                            <div key={`ref-${idx}`} className="flex items-center justify-between gap-3 p-2 rounded-md bg-card border border-border">
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-xs font-medium truncate">{file.name}</p>
                                                    <p className="text-[10px] text-muted-foreground">Uploaded by Project Manager</p>
                                                </div>
                                                <button
                                                    onClick={() => triggerDirectDownload(file.url, file.name)}
                                                    className="h-8 w-8 rounded-md bg-muted hover:bg-primary/20 hover:text-primary text-muted-foreground flex items-center justify-center transition-all"
                                                    title="Download"
                                                >
                                                    <Download className="h-3.5 w-3.5" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {selectedProject.referenceLink && (
                                    <a
                                        href={selectedProject.referenceLink.startsWith('http') ? selectedProject.referenceLink : `https://${selectedProject.referenceLink}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-2 text-xs text-primary hover:underline"
                                    >
                                        <LinkIcon className="h-3.5 w-3.5" /> Open External Reference
                                    </a>
                                )}
                            </div>

                            <div className="bg-muted/30 border border-border rounded-lg p-4">
                                <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest mb-3">Project Timeline & Updates</p>
                                {selectedProject.logs && selectedProject.logs.length > 0 ? (
                                    <div className="space-y-3 max-h-[220px] overflow-y-auto">
                                        {[...selectedProject.logs].reverse().slice(0, 12).map((log: any, idx: number) => (
                                            <div key={idx} className="flex items-start gap-3 pb-3 border-b border-border last:border-0 last:pb-0">
                                                <div className="h-2 w-2 mt-1.5 rounded-full bg-primary" />
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-xs font-semibold text-foreground">{String(log.event || '').replace(/_/g, ' ')}</p>
                                                    {log.details && <p className="text-xs text-muted-foreground mt-0.5">{log.details}</p>}
                                                    <p className="text-[10px] text-muted-foreground mt-1">{log.userName || 'System'} • {new Date(log.timestamp).toLocaleString()}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-xs text-muted-foreground">No updates recorded yet.</p>
                                )}
                            </div>
                        </div>

                        <div className="space-y-5">
                            <div className="bg-muted/30 border border-border rounded-lg p-4">
                                <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest mb-4">Assigned Manager</p>
                                <div className="space-y-3">
                                    <p className="text-sm font-semibold text-foreground">{selectedProjectPM?.displayName || 'Not Assigned'}</p>
                                    {selectedProjectPM?.email && <p className="text-xs text-muted-foreground break-all">{selectedProjectPM.email}</p>}
                                    {(selectedProjectPM?.phoneNumber || selectedProjectPM?.whatsappNumber) && (
                                        <p className="text-xs text-muted-foreground">{selectedProjectPM.whatsappNumber || selectedProjectPM.phoneNumber}</p>
                                    )}
                                    {selectedProjectPMWhatsapp ? (
                                        <a
                                            href={selectedProjectPMWhatsapp}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 text-xs font-bold uppercase tracking-widest hover:bg-emerald-500/20 transition-all"
                                        >
                                            <MessageCircle className="h-3.5 w-3.5" /> Chat
                                        </a>
                                    ) : (
                                        <button
                                            type="button"
                                            disabled
                                            className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-muted text-muted-foreground text-xs font-bold uppercase tracking-widest cursor-not-allowed"
                                        >
                                            <MessageCircle className="h-3.5 w-3.5" /> Chat Unavailable
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="bg-muted/30 border border-border rounded-lg p-4 space-y-3">
                                <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest">Project Snapshot</p>
                                <div className="flex items-center justify-between text-xs">
                                    <span className="text-muted-foreground">Client</span>
                                    <span className="font-semibold text-foreground">{user?.displayName || 'Client'}</span>
                                </div>
                                <div className="flex items-center justify-between text-xs">
                                    <span className="text-muted-foreground">Primary Editor</span>
                                    <span className="font-semibold text-foreground">{allUsers.find(u => u.uid === selectedProject.assignedEditorId)?.displayName || 'Not Assigned'}</span>
                                </div>
                                <div className="flex items-center justify-between text-xs">
                                    <span className="text-muted-foreground">Budget</span>
                                    <span className="font-semibold text-foreground">₹{(selectedProject.totalCost || 0).toLocaleString()}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
}

// Stats Card Component
function StatsCard({ label, value, icon, color }: { label: string; value: string | number; icon: React.ReactNode; color: 'blue' | 'amber' | 'green' | 'purple' }) {
    const colorClasses = {
        blue: 'bg-blue-500/10 text-blue-500',
        amber: 'bg-amber-500/10 text-amber-500',
        green: 'bg-green-500/10 text-green-500',
        purple: 'bg-purple-500/10 text-purple-500'
    };

    return (
        <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-card border border-border rounded-xl p-4 sm:p-5"
        >
            <div className="flex items-center justify-between mb-3">
                <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center", colorClasses[color])}>
                    {icon}
                </div>
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-foreground">{value}</p>
            <p className="text-sm text-muted-foreground mt-1">{label}</p>
        </motion.div>
    );
}

// Project Status Badge Component
function ProjectStatus({ status }: { status: string }) {
    const config: Record<string, { label: string; className: string }> = {
        pending: { label: 'Pending', className: 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20' },
        assigned: { label: 'Assigned', className: 'bg-blue-500/10 text-blue-500 border-blue-500/20' },
        active: { label: 'In Progress', className: 'bg-amber-500/10 text-amber-500 border-amber-500/20' },
        in_review: { label: 'In Review', className: 'bg-purple-500/10 text-purple-500 border-purple-500/20' },
        revision: { label: 'Revision', className: 'bg-orange-500/10 text-orange-500 border-orange-500/20' },
        completed: { label: 'Completed', className: 'bg-green-500/10 text-green-500 border-green-500/20' },
        approved: { label: 'Approved', className: 'bg-green-500/10 text-green-500 border-green-500/20' },
        delivered: { label: 'Delivered', className: 'bg-green-500/10 text-green-500 border-green-500/20' }
    };

    const { label, className } = config[status] || { label: status, className: 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20' };

    return (
        <span className={cn("inline-flex px-2.5 py-1 text-xs font-medium rounded-full border", className)}>
            {label}
        </span>
    );
}
