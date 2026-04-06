"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/context/auth-context";
import { db } from "@/lib/firebase/config";
import { collection, query, where, onSnapshot, orderBy } from "firebase/firestore";
import { Project, User, Invoice } from "@/types/schema";
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
    X,
    IndianRupee,
    ShieldCheck,
    Download,
    Link as LinkIcon,
    ExternalLink,
    FileText,
    Copy,
    ImageIcon,
    Briefcase
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
import { toast } from "sonner";
import { ReviewSystemModal } from "./review-system-modal";
import { preloadVideosIntoMemory } from "@/lib/video-preload";
import { VideoPlayer } from "@/components/video-player";


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

const GST_RATE = 0.18;

function getGstInclusiveAmount(amount: number) {
    return amount * (1 + GST_RATE);
}

function formatInrWithGst(amount: number) {
    return `₹${getGstInclusiveAmount(amount).toLocaleString("en-IN", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    })}`;
}

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

function isVideoFile(file: any) {
    const type = file?.type || "";
    const name = file?.name || "";
    return type.startsWith("video/") || /\.(mp4|webm|mov|avi|mkv)$/i.test(name);
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
    const [isReviewSystemOpen, setIsReviewSystemOpen] = useState(false);
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [previewFile, setPreviewFile] = useState<{ url: string; type: string; name: string } | null>(null);
    const [draftProjectIds, setDraftProjectIds] = useState<string[]>([]);


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
        const projectIds = projects
            .map((project) => project.id)
            .filter((id): id is string => typeof id === "string" && id.length > 0);

        if (projectIds.length === 0) {
            setDraftProjectIds([]);
            return;
        }

        const unsubscribers: Array<() => void> = [];
        const draftSet = new Set<string>();
        const IN_QUERY_LIMIT = 10;

        for (let i = 0; i < projectIds.length; i += IN_QUERY_LIMIT) {
            const chunk = projectIds.slice(i, i + IN_QUERY_LIMIT);
            const revisionsQuery = query(
                collection(db, "revisions"),
                where("projectId", "in", chunk)
            );

            const unsubscribe = onSnapshot(revisionsQuery, (snapshot) => {
                // Refresh only this chunk to avoid stale values when revisions are removed.
                chunk.forEach((id) => draftSet.delete(id));
                snapshot.docs.forEach((docSnap) => {
                    const pid = docSnap.data()?.projectId;
                    if (typeof pid === "string" && pid.length > 0) {
                        draftSet.add(pid);
                    }
                });
                setDraftProjectIds(Array.from(draftSet));
            });

            unsubscribers.push(unsubscribe);
        }

        return () => {
            unsubscribers.forEach((unsubscribe) => unsubscribe());
        };
    }, [projects]);

    useEffect(() => {
        const urls = projects.flatMap((project) => {
            const raw = (project.rawFiles || []).filter(isVideoFile).map((file: any) => file?.url);
            const delivered = (project.deliveredFiles || []).filter(isVideoFile).map((file: any) => file?.url);
            const pmFiles = ((((project as any).pmFiles || []) as any[]).filter(isVideoFile).map((file) => file?.url));
            return [...raw, ...delivered, ...pmFiles];
        });

        preloadVideosIntoMemory(urls, 30);
    }, [projects]);

    useEffect(() => {
        const unsub = onSnapshot(collection(db, "users"), (snap) => {
            setAllUsers(snap.docs.map(doc => ({ uid: doc.id, ...doc.data() } as User)));
        });
        return () => unsub();
    }, []);

    // Fetch invoices for this client
    useEffect(() => {
        if (!user?.uid) return;

        const q = query(
            collection(db, "invoices"),
            where("clientId", "==", user.uid),
            orderBy("createdAt", "desc")
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const items = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Invoice));
            setInvoices(items);
        });

        return () => unsubscribe();
    }, [user]);

    // Show Project Manager in Account Manager card (not Sales Executive).
    const assignedPMId = user?.managedByPM || projects.find(p => p.assignedPMId)?.assignedPMId;
    const assignedPM = assignedPMId ? allUsers.find(u => u.uid === assignedPMId) : null;

    const filteredProjects = projects.filter(project => {
        if (statusFilter !== 'all' && project.status !== statusFilter) return false;
        if (searchQuery && !project.name.toLowerCase().includes(searchQuery.toLowerCase()) && !project.id.includes(searchQuery)) return false;
        return true;
    });

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
    const selectedProjectPmFiles = selectedProject
        ? ((((selectedProject as any).pmFiles || []) as any[]).length > 0
            ? (((selectedProject as any).pmFiles || []) as any[])
            : (selectedProject.referenceFiles || []).filter((file: any) => Boolean(file?.uploadedBy)))
        : [];
    const selectedProjectStyleReferenceFiles = selectedProject
        ? (selectedProject.referenceFiles || []).filter((file: any) => !file?.uploadedBy)
        : [];

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

    const handleReviewClick = (project: Project) => {
        setSelectedProject(project);
        setIsReviewSystemOpen(true);
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
                            <p className="text-xs text-red-400/80">Your outstanding balance ({formatInrWithGst(pendingPayment)}) exceeds your credit limit. Please clear your dues to continue.</p>
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
                    label="Pending Payments"
                    value={formatInrWithGst(pendingPayment)}
                    icon={<Wallet className="h-5 w-5" />}
                    color="purple"
                />
            </div>

            {/* Main Content Grid */}
            <div className="grid lg:grid-cols-1 gap-6">
                {/* Projects List - Full Width */}
                <div className="space-y-4">
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
                                            <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3 w-12">SR.No</th>
                                            <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">Project Name</th>
                                            <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3 hidden sm:table-cell">Cost</th>
                                            <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3 hidden md:table-cell">Project Manager</th>
                                            <th className="text-center text-xs font-medium text-muted-foreground px-4 py-3">Status</th>
                                            <th className="text-center text-xs font-medium text-muted-foreground px-4 py-3 hidden sm:table-cell">Payment</th>
                                            <th className="text-center text-xs font-medium text-muted-foreground px-4 py-3 w-20">Action</th>
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
                                                    <td className="px-4 py-3 text-sm font-medium text-muted-foreground">
                                                        {idx + 1}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <p className="font-medium text-foreground group-hover:text-primary transition-colors line-clamp-1">
                                                            {project.name}
                                                        </p>
                                                        <p className="text-xs text-muted-foreground mt-1">
                                                            {project.videoType || 'Video'} • {project.createdAt ? new Date(project.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                                                        </p>
                                                    </td>
                                                    <td className="px-4 py-3 hidden sm:table-cell">
                                                        <span className="font-semibold text-foreground">
                                                            {formatInrWithGst(project.totalCost || 0)}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 hidden md:table-cell">
                                                        <span className="text-sm text-foreground">
                                                            {project.assignedPMId
                                                                ? allUsers.find(u => u.uid === project.assignedPMId)?.displayName || 'Project Manager'
                                                                : assignedPM?.displayName || 'Not Assigned'}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-center">
                                                        <ProjectStatus status={project.status} />
                                                    </td>
                                                    <td className="px-4 py-3 text-center hidden sm:table-cell">
                                                        <span className={cn(
                                                            "inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold border",
                                                            project.paymentStatus === 'full_paid' 
                                                                ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                                                                : project.paymentStatus === 'half_paid'
                                                                    ? "bg-amber-500/10 text-amber-600 border-amber-500/20"
                                                                    : "bg-red-500/10 text-red-600 border-red-500/20"
                                                        )}>
                                                            {project.paymentStatus === 'full_paid' ? 'Paid' : project.paymentStatus === 'half_paid' ? 'Partial' : 'Pending'}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-center space-x-1.5 flex items-center justify-center">
                                                        {draftProjectIds.includes(project.id || "") && (
                                                            <button
                                                                onClick={() => handleReviewClick(project)}
                                                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 text-xs font-medium hover:bg-emerald-500/20 transition-colors"
                                                                title="Review draft video"
                                                            >
                                                                <FileVideo className="h-3.5 w-3.5" />
                                                                Review
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() => {
                                                                setSelectedProject(project);
                                                                setIsProjectModalOpen(true);
                                                            }}
                                                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors"
                                                        >
                                                            <Eye className="h-3.5 w-3.5" />
                                                            Details
                                                        </button>
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
            </div>

            <Modal
                isOpen={isProjectModalOpen}
                onClose={() => setIsProjectModalOpen(false)}
                title="Project Details"
                maxWidth="max-w-5xl"
            >
                {selectedProject && (
                    <>
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
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => setPreviewFile({ url: file.url, type: file.type || 'video/mp4', name: file.name })}
                                                        className="h-8 px-2.5 rounded text-xs font-bold uppercase tracking-widest bg-muted hover:bg-primary/20 hover:text-primary text-muted-foreground transition-all"
                                                        title="Preview"
                                                    >
                                                        Preview
                                                    </button>
                                                    <button
                                                        onClick={() => triggerDirectDownload(file.url, file.name)}
                                                        className="h-8 w-8 rounded-md bg-muted hover:bg-primary/20 hover:text-primary text-muted-foreground flex items-center justify-center transition-all"
                                                        title="Download"
                                                    >
                                                        <Download className="h-3.5 w-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-xs text-muted-foreground">No client raw files available.</p>
                                )}

                                {selectedProjectPmFiles.length > 0 && (
                                    <div className="space-y-2 pt-2 border-t border-border">
                                        <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Project Manager Uploads</p>
                                        {selectedProjectPmFiles.map((file: any, idx: number) => (
                                            <div key={`ref-${idx}`} className="flex items-center justify-between gap-3 p-2 rounded-md bg-card border border-border">
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-xs font-medium truncate">{file.name}</p>
                                                    <p className="text-[10px] text-muted-foreground">Uploaded by Project Manager</p>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => setPreviewFile({ url: file.url, type: file.type || 'application/octet-stream', name: file.name })}
                                                        className="h-8 px-2.5 rounded text-xs font-bold uppercase tracking-widest bg-muted hover:bg-primary/20 hover:text-primary text-muted-foreground transition-all"
                                                        title="Preview"
                                                    >
                                                        Preview
                                                    </button>
                                                    <button
                                                        onClick={() => triggerDirectDownload(file.url, file.name)}
                                                        className="h-8 w-8 rounded-md bg-muted hover:bg-primary/20 hover:text-primary text-muted-foreground flex items-center justify-center transition-all"
                                                        title="Download"
                                                    >
                                                        <Download className="h-3.5 w-3.5" />
                                                    </button>
                                                </div>
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
                                    {selectedProject.footageLink ? (
                                        <a 
                                            href={selectedProject.footageLink.startsWith('http') ? selectedProject.footageLink : `https://${selectedProject.footageLink}`} 
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
                                    {selectedProject.rawFiles && selectedProject.rawFiles.length > 0 ? (
                                        <div className="grid gap-2 max-h-56 overflow-y-auto pr-1">
                                            {selectedProject.rawFiles.map((file: any, idx: number) => (
                                                <div key={idx} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border/30 hover:bg-muted/30 transition-all group">
                                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                                        <FileVideo className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                                        <div className="min-w-0">
                                                            <p className="text-xs font-semibold text-foreground truncate">{file.name}</p>
                                                            {file.size && <p className="text-[9px] text-muted-foreground">{(file.size / (1024*1024)).toFixed(1)} MB</p>}
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2 flex-shrink-0">
                                                        <button 
                                                            onClick={() => setPreviewFile({ url: file.url, type: file.type || 'video/mp4', name: file.name })}
                                                            className="h-8 px-2.5 rounded text-xs font-bold uppercase tracking-widest bg-muted/50 hover:bg-primary/20 text-muted-foreground hover:text-primary transition-all"
                                                        >
                                                            Preview
                                                        </button>
                                                        <button
                                                            onClick={() => triggerDirectDownload(file.url, file.name)}
                                                            className="h-8 w-8 rounded-lg bg-muted/50 group-hover:bg-primary/20 group-hover:text-primary text-muted-foreground flex items-center justify-center transition-all flex-shrink-0"
                                                        >
                                                            <Download className="h-3.5 w-3.5" />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
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
                                    {selectedProject.scripts && selectedProject.scripts.length > 0 && (
                                        <div className="grid gap-2 max-h-56 overflow-y-auto pr-1">
                                            {selectedProject.scripts.map((file: any, idx: number) => (
                                                <div key={idx} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border/30 hover:bg-muted/30 transition-all group">
                                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                                        <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                                        <p className="text-xs font-semibold text-foreground truncate">{file.name}</p>
                                                    </div>
                                                    <div className="flex items-center gap-2 flex-shrink-0">
                                                        <button 
                                                            onClick={() => setPreviewFile({ url: file.url, type: file.type || 'text/plain', name: file.name })}
                                                            className="h-8 px-2.5 rounded text-xs font-bold uppercase tracking-widest bg-muted/50 hover:bg-primary/20 text-muted-foreground hover:text-primary transition-all"
                                                        >
                                                            Preview
                                                        </button>
                                                        <button
                                                            onClick={() => triggerDirectDownload(file.url, file.name)}
                                                            className="h-8 w-8 rounded-lg bg-muted/50 group-hover:bg-primary/20 group-hover:text-primary text-muted-foreground flex items-center justify-center transition-all flex-shrink-0"
                                                        >
                                                            <Download className="h-3.5 w-3.5" />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Pasted Script Text */}
                                    {(selectedProject as any).scriptText && (
                                        <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                                            <div className="flex items-center justify-between gap-2 mb-3">
                                                <p className="text-[10px] font-bold uppercase tracking-widest text-primary">✍️ Pasted Script</p>
                                                <button 
                                                    onClick={() => {
                                                        navigator.clipboard.writeText((selectedProject as any).scriptText);
                                                        toast.success("Script copied to clipboard");
                                                    }}
                                                    className="h-7 px-2.5 rounded text-[9px] font-bold uppercase tracking-widest bg-primary/10 hover:bg-primary/20 text-primary transition-all flex items-center gap-1.5"
                                                >
                                                    <Copy className="h-3 w-3" /> Copy
                                                </button>
                                            </div>
                                            <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap font-medium max-h-[120px] overflow-y-auto">
                                                {(selectedProject as any).scriptText}
                                            </p>
                                        </div>
                                    )}

                                    {/* Empty State */}
                                    {!((selectedProject as any).scriptText) && (!selectedProject.scripts || selectedProject.scripts.length === 0) && (
                                        <div className="p-3 rounded-lg border border-border/30 bg-muted/20">
                                            <p className="text-xs text-muted-foreground">Not uploaded yet</p>
                                        </div>
                                    )}
                                </div>

                                {/* 4. Audio Files */}
                                <div className="space-y-3 pt-3 border-t border-border/30">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">🎧 Audio Files</span>
                                    </div>
                                    {selectedProject.audioFiles && selectedProject.audioFiles.length > 0 ? (
                                        <div className="grid gap-2 max-h-56 overflow-y-auto pr-1">
                                            {selectedProject.audioFiles.map((file: any, idx: number) => (
                                                <div key={`${file.url}-${idx}`} className="p-3 rounded-lg border border-border/30 hover:bg-muted/30 transition-all group space-y-2 overflow-hidden">
                                                    <div className="flex items-center justify-between gap-3 min-w-0">
                                                        <div className="flex items-center gap-2 min-w-0 flex-1">
                                                            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                                                            <p className="text-xs font-semibold text-foreground truncate min-w-0 block">{file.name}</p>
                                                        </div>
                                                        <button
                                                            onClick={() => triggerDirectDownload(file.url, file.name)}
                                                            className="h-8 w-8 rounded-lg bg-muted/50 group-hover:bg-primary/20 group-hover:text-primary text-muted-foreground flex items-center justify-center transition-all shrink-0"
                                                        >
                                                            <Download className="h-3.5 w-3.5" />
                                                        </button>
                                                    </div>
                                                    <audio controls className="w-full max-w-full h-8" src={file.url} preload="metadata" />
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="p-3 rounded-lg border border-border/30 bg-muted/20">
                                            <p className="text-xs text-muted-foreground">Not uploaded yet</p>
                                        </div>
                                    )}
                                </div>

                                {/* 5. B-Roll Assets */}
                                <div className="space-y-3 pt-3 border-t border-border/30">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">🎞️ B-Roll Assets</span>
                                    </div>
                                    {(selectedProject as any).bRoleFiles && (selectedProject as any).bRoleFiles.length > 0 ? (
                                        <div className="grid gap-2 max-h-56 overflow-y-auto pr-1">
                                            {(selectedProject as any).bRoleFiles.map((file: any, idx: number) => (
                                                <div key={idx} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border/30 hover:bg-muted/30 transition-all group">
                                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                                        {file.type?.includes('image') ? (
                                                            <ImageIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                                        ) : (
                                                            <FileVideo className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                                        )}
                                                        <p className="text-xs font-semibold text-foreground truncate">{file.name}</p>
                                                    </div>
                                                    <div className="flex items-center gap-2 flex-shrink-0">
                                                        <button 
                                                            onClick={() => setPreviewFile({ url: file.url, type: file.type || 'image', name: file.name })}
                                                            className="h-8 px-2.5 rounded text-xs font-bold uppercase tracking-widest bg-muted/50 hover:bg-primary/20 text-muted-foreground hover:text-primary transition-all"
                                                        >
                                                            Preview
                                                        </button>
                                                        <button
                                                            onClick={() => triggerDirectDownload(file.url, file.name)}
                                                            className="h-8 w-8 rounded-lg bg-muted/50 group-hover:bg-primary/20 group-hover:text-primary text-muted-foreground flex items-center justify-center transition-all flex-shrink-0"
                                                        >
                                                            <Download className="h-3.5 w-3.5" />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
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
                                    {(selectedProject as any).referenceLink && (
                                        <a 
                                            href={(selectedProject as any).referenceLink.startsWith('http') ? (selectedProject as any).referenceLink : `https://${(selectedProject as any).referenceLink}`}
                                            target="_blank"
                                            className="flex items-center gap-3 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20 hover:border-emerald-500/40 hover:bg-emerald-500/10 transition-all group"
                                        >
                                            <LinkIcon className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                                            <span className="text-sm font-semibold text-foreground group-hover:text-emerald-600 transition-colors">Open Style Reference</span>
                                        </a>
                                    )}

                                    {/* Reference Files */}
                                    {selectedProjectStyleReferenceFiles.length > 0 && (
                                        <div className="grid gap-2 max-h-56 overflow-y-auto pr-1">
                                            {selectedProjectStyleReferenceFiles.map((file: any, idx: number) => (
                                                <div key={idx} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border/30 hover:bg-muted/30 transition-all group">
                                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                                        {file.type?.includes('image') ? (
                                                            <ImageIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                                        ) : (
                                                            <FileVideo className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                                        )}
                                                        <p className="text-xs font-semibold text-foreground truncate">{file.name}</p>
                                                    </div>
                                                    <div className="flex items-center gap-2 flex-shrink-0">
                                                        <button 
                                                            onClick={() => setPreviewFile({ url: file.url, type: file.type || 'image', name: file.name })}
                                                            className="h-8 px-2.5 rounded text-xs font-bold uppercase tracking-widest bg-muted/50 hover:bg-primary/20 text-muted-foreground hover:text-primary transition-all"
                                                        >
                                                            Preview
                                                        </button>
                                                        <button
                                                            onClick={() => triggerDirectDownload(file.url, file.name)}
                                                            className="h-8 w-8 rounded-lg bg-muted/50 group-hover:bg-primary/20 group-hover:text-primary text-muted-foreground flex items-center justify-center transition-all flex-shrink-0"
                                                        >
                                                            <Download className="h-3.5 w-3.5" />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Empty State */}
                                    {!(selectedProject as any).referenceLink && selectedProjectStyleReferenceFiles.length === 0 && (
                                        <div className="p-3 rounded-lg border border-border/30 bg-muted/20">
                                            <p className="text-xs text-muted-foreground">Not uploaded yet</p>
                                        </div>
                                    )}
                                </div>

                                {/* 6. PM Uploaded Files */}
                                <div className="space-y-3 pt-3 border-t border-border/30">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">📤 PM Uploaded Files</span>
                                    </div>
                                    {selectedProjectPmFiles.length > 0 ? (
                                        <div className="grid gap-2 max-h-56 overflow-y-auto pr-1">
                                            {selectedProjectPmFiles.map((file: any, idx: number) => (
                                                <div key={`${file.url}-${idx}`} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border/30 hover:bg-muted/30 transition-all group">
                                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                                        {file.type?.includes('image') ? (
                                                            <ImageIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                                        ) : (
                                                            <FileVideo className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                                        )}
                                                        <p className="text-xs font-semibold text-foreground truncate">{file.name}</p>
                                                    </div>
                                                    <div className="flex items-center gap-2 flex-shrink-0">
                                                        <button
                                                            onClick={() => setPreviewFile({ url: file.url, type: file.type || 'application/octet-stream', name: file.name })}
                                                            className="h-8 px-2.5 rounded text-xs font-bold uppercase tracking-widest bg-muted/50 hover:bg-primary/20 text-muted-foreground hover:text-primary transition-all"
                                                        >
                                                            Preview
                                                        </button>
                                                        <button
                                                            onClick={() => triggerDirectDownload(file.url, file.name)}
                                                            className="h-8 w-8 rounded-lg bg-muted/50 group-hover:bg-primary/20 group-hover:text-primary text-muted-foreground flex items-center justify-center transition-all flex-shrink-0"
                                                        >
                                                            <Download className="h-3.5 w-3.5" />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="p-3 rounded-lg border border-border/30 bg-muted/20">
                                            <p className="text-xs text-muted-foreground">No PM uploads yet</p>
                                        </div>
                                    )}
                                </div>
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
                                    <span className="font-semibold text-foreground">{formatInrWithGst(selectedProject.totalCost || 0)}</span>
                                </div>
                            </div>

                            {selectedProject.status === 'completed' && (
                                <div className="bg-emerald-500/[0.05] border border-emerald-500/20 rounded-lg p-4 space-y-3">
                                    <div className="flex items-center gap-2">
                                        <FileText className="h-4 w-4 text-emerald-500" />
                                        <p className="text-xs text-emerald-600 font-bold uppercase tracking-widest">Invoice</p>
                                    </div>
                                    {invoices.filter(inv => inv.projectId === selectedProject.id).length > 0 ? (
                                        <div className="space-y-2">
                                            {invoices.filter(inv => inv.projectId === selectedProject.id).map((invoice) => (
                                                <Link key={invoice.id} href={`/dashboard/invoices/${invoice.id}`}>
                                                    <motion.button
                                                        whileHover={{ scale: 1.02 }}
                                                        className="w-full flex items-center justify-between p-2.5 rounded-lg bg-emerald-500/5 border border-emerald-500/20 hover:bg-emerald-500/10 hover:border-emerald-500/30 transition-all group"
                                                    >
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            <FileText className="h-3.5 w-3.5 text-emerald-600 group-hover:text-emerald-500 transition-colors flex-shrink-0" />
                                                            <div className="text-left min-w-0">
                                                                <p className="text-xs font-semibold text-foreground group-hover:text-emerald-600 transition-colors truncate">{invoice.invoiceNumber}</p>
                                                                <p className="text-[10px] text-muted-foreground">₹{invoice.total.toLocaleString()}</p>
                                                            </div>
                                                        </div>
                                                        <Download className="h-3.5 w-3.5 text-muted-foreground group-hover:text-emerald-600 transition-colors flex-shrink-0" />
                                                    </motion.button>
                                                </Link>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-xs text-muted-foreground text-center py-2">Invoice generation in progress...</p>
                                    )}
                                </div>
                            )}
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
                                    <VideoPlayer videoPath={previewFile.url} title={previewFile.name} className="w-full h-full" />
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
                project={selectedProject ? { 
                    id: selectedProject.id, 
                    name: selectedProject.name,
                    clientName: selectedProject.clientName || user?.displayName || selectedProject.name,
                    totalCost: selectedProject.totalCost,
                    amountPaid: selectedProject.amountPaid,
                    paymentStatus: selectedProject.paymentStatus,
                    editorRating: selectedProject.editorRating,
                    editorReview: selectedProject.editorReview
                } : null}
            />

        </div>
    );
}

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
        project_created: { label: 'Project Created', className: 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20' },
        editor_not_assigned: { label: 'Editor Not Assigned', className: 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20' },
        pending_assignment: { label: 'Editor Not Assigned', className: 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20' },
        editor_assigned: { label: 'Editor Assigned', className: 'bg-blue-500/10 text-blue-500 border-blue-500/20' },
        in_production: { label: 'In Production', className: 'bg-amber-500/10 text-amber-500 border-amber-500/20' },
        review: { label: 'In Review', className: 'bg-purple-500/10 text-purple-500 border-purple-500/20' },
        completed: { label: 'Completed', className: 'bg-green-500/10 text-green-500 border-green-500/20' },
        completed_pending_payment: { label: 'Completed (Payment Due)', className: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' },
        // Legacy support
        pending: { label: 'Pending', className: 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20' },
        assigned: { label: 'Assigned', className: 'bg-blue-500/10 text-blue-500 border-blue-500/20' },
        active: { label: 'In Progress', className: 'bg-amber-500/10 text-amber-500 border-amber-500/20' },
        in_review: { label: 'In Review', className: 'bg-purple-500/10 text-purple-500 border-purple-500/20' },
        revision: { label: 'Revision', className: 'bg-orange-500/10 text-orange-500 border-orange-500/20' },
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
