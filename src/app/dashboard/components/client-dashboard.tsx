"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/context/auth-context";
import { db } from "@/lib/firebase/config";
import { collection, query, where, onSnapshot, orderBy, doc, updateDoc, getDoc, setDoc } from "firebase/firestore";
import { Project, User, Invoice } from "@/types/schema";
import { cn } from "@/lib/utils";
import {
    Plus, Search, Eye, ChevronDown, CheckCircle2, AlertCircle, Clock,
    Video, Wallet, MessageCircle, FileVideo, X, IndianRupee, Download,
    Link as LinkIcon, ExternalLink, FileText, Copy, ImageIcon, Briefcase,
    Activity, RefreshCw, CreditCard, Receipt, TrendingUp, ArrowUpRight,
    MoreHorizontal
} from "lucide-react";
import Link from "next/link";
import { Modal } from "@/components/ui/modal";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem,
    DropdownMenuTrigger, DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { ReviewSystemModal } from "./review-system-modal";
import { preloadVideosIntoMemory } from "@/lib/video-preload";
import { IndicatorCard } from "@/components/ui/indicator-card";
import MuxPlayer from "@mux/mux-player-react";


const CLIENT_VIDEO_TYPE_ALIASES: Record<string, string[]> = {
    "Reel Format": ["Reel Format", "Reels", "Short Videos"],
    "Long Video": ["Long Video", "Long Videos"],
    "Documentary": ["Documentary", "Long Videos"],
    "Podcast Edit": ["Podcast Edit", "Long Videos"],
    "Motion Graphic": ["Motion Graphic", "Graphics Videos"],
    "Cinematic Event": ["Cinematic Event", "Ads/UGC Videos"]
};

const CLIENT_VIDEO_TYPES = ["Reel Format", "Long Video", "Documentary", "Podcast Edit", "Motion Graphic", "Cinematic Event"];
const GST_RATE = 0.18;

function withGst(amount: number) { return amount * (1 + GST_RATE); }
function formatInr(amount: number) {
    return `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}
function formatInrWithGst(amount: number) { return formatInr(withGst(amount)); }

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
    const normalized = digits.length === 10 ? `91${digits}` : digits;
    return `https://wa.me/${normalized}`;
}

function isVideoFile(file: any) {
    const type = file?.type || "";
    const name = file?.name || "";
    return type.startsWith("video/") || /\.(mp4|webm|mov|avi|mkv)$/i.test(name);
}

// ── Sub-components ──────────────────────────────────────────────────────────



function StatusBadge({ status }: { status: string }) {
    const configs: Record<string, { label: string; className: string }> = {
        project_created:          { label: "Created",                className: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20" },
        editor_not_assigned:      { label: "Not Assigned",           className: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20" },
        pending_assignment:       { label: "Pending",                className: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20" },
        editor_assigned:          { label: "Assigned",               className: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
        in_production:            { label: "In Production",          className: "bg-amber-500/10 text-amber-500 border-amber-500/20" },
        active:                   { label: "In Progress",            className: "bg-amber-500/10 text-amber-500 border-amber-500/20" },
        review:                   { label: "In Review",              className: "bg-purple-500/10 text-purple-500 border-purple-500/20" },
        in_review:                { label: "In Review",              className: "bg-purple-500/10 text-purple-500 border-purple-500/20" },
        completed:                { label: "Completed",              className: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" },
        approved:                 { label: "Completed",              className: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" },
        delivered:                { label: "Delivered",              className: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" },
        completed_pending_payment:{ label: "Completed (Payment Due)",className: "bg-orange-500/10 text-orange-500 border-orange-500/20" },
    };
    const cfg = configs[status] || { label: status.replace(/_/g, " "), className: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20" };
    return (
        <span className={cn("inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-semibold border whitespace-nowrap", cfg.className)}>
            {cfg.label}
        </span>
    );
}

function PaymentBadge({ paid, partial }: { paid: boolean; partial?: boolean }) {
    if (paid) return <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold border bg-emerald-500/10 text-emerald-500 border-emerald-500/20">Paid</span>;
    if (partial) return <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold border bg-amber-500/10 text-amber-500 border-amber-500/20">Partial</span>;
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold border bg-red-500/10 text-red-500 border-red-500/20">Pending</span>;
}

// ── Main Component ───────────────────────────────────────────────────────────

export function ClientDashboard() {
    const { user } = useAuth();
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState<string>("all");
    const [allUsers, setAllUsers] = useState<User[]>([]);
    const [userData, setUserData] = useState<User | null>(null);
    const [selectedProject, setSelectedProject] = useState<Project | null>(null);
    const displayedProject = projects.find(p => p.id === selectedProject?.id) || selectedProject;
    const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
    const [isReviewSystemOpen, setIsReviewSystemOpen] = useState(false);
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [previewFile, setPreviewFile] = useState<{ url: string; type: string; name: string } | null>(null);
    const [draftProjectIds, setDraftProjectIds] = useState<string[]>([]);
    const [activeTab, setActiveTab] = useState<"projects" | "finance">("projects");

    const [isProcessingPayment, setIsProcessingPayment] = useState(false);

    // Initial Payment Logic Helper
    const loadRazorpay = () => {
        return new Promise((resolve) => {
            if (window.hasOwnProperty("Razorpay")) { resolve(true); return; }
            const script = document.createElement("script");
            script.src = "https://checkout.razorpay.com/v1/checkout.js";
            script.onload = () => resolve(true);
            script.onerror = () => resolve(false);
            document.body.appendChild(script);
        });
    };

    const handleInitiatePayment = async (project: Project) => {
        const baseAmount = Math.max(0, (project.totalCost || 0) - (project.amountPaid || 0));
        if (baseAmount <= 0) { toast.success("Project is already fully paid."); return; }
        const totalWithGst = withGst(baseAmount);
        
        setIsProcessingPayment(true);
        const loadingToast = toast.loading("Initiating payment...");

        try {
            // 1. Load SDK
            const loaded = await loadRazorpay();
            if (!loaded) throw new Error("Failed to load payment gateway. Check your connection.");

            // 2. Create Order
            const orderRes = await fetch("/api/create-order", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    amount: totalWithGst,
                    projectId: project.id
                })
            });

            if (!orderRes.ok) {
                const errData = await orderRes.json();
                throw new Error(errData.error || "Failed to create payment order.");
            }

            const order = await orderRes.json();

            // 3. Open Checkout
            const options = {
                key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || "",
                amount: order.amount,
                currency: order.currency,
                name: "EditoHub",
                description: `Final Settlement for ${project.name}`,
                order_id: order.id,
                prefill: {
                    name: user?.displayName || "",
                    email: user?.email || ""
                },
                theme: { color: "#3B82F6" },
                handler: async function (response: any) {
                    const verifyToast = toast.loading("Verifying payment...");
                    try {
                        const verifyRes = await fetch("/api/verify-payment", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                razorpay_order_id: response.razorpay_order_id,
                                razorpay_payment_id: response.razorpay_payment_id,
                                razorpay_signature: response.razorpay_signature,
                                projectId: project.id,
                                amount: totalWithGst, 
                                accountingAmount: baseAmount,
                                taxRate: 18,
                                paymentType: "final"
                            })
                        });

                        if (!verifyRes.ok) throw new Error("Verification failed. Please contact support if your amount was debited.");
                        
                        toast.dismiss(verifyToast);
                        toast.success("Payment successful! Your dashboard will update shortly.");
                        setIsProjectModalOpen(false);
                    } catch (err: any) {
                        toast.dismiss(verifyToast);
                        toast.error(err.message);
                    }
                },
                modal: { ondismiss: () => setIsProcessingPayment(false) }
            };

            const rzp = new (window as any).Razorpay(options);
            rzp.on("payment.failed", function (resp: any) {
                toast.error(`Payment failed: ${resp.error.description}`);
                setIsProcessingPayment(false);
            });
            rzp.open();
            toast.dismiss(loadingToast);
        } catch (err: any) {
            toast.dismiss(loadingToast);
            toast.error(err.message);
            setIsProcessingPayment(false);
        }
    };

    // Fetch projects
    useEffect(() => {
        if (!user?.uid) return;
        setLoading(true);
        const q = query(collection(db, "projects"), where("clientId", "==", user.uid), orderBy("createdAt", "desc"));
        const unsub = onSnapshot(q, (snap) => {
            setProjects(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Project)));
            setLoading(false);
        });
        return () => unsub();
    }, [user]);

    // Fetch draft revisions
    useEffect(() => {
        const ids = projects.map((p) => p.id).filter((id): id is string => typeof id === "string" && id.length > 0);
        if (ids.length === 0) { setDraftProjectIds([]); return; }
        const unsubs: Array<() => void> = [];
        const draftSet = new Set<string>();
        for (let i = 0; i < ids.length; i += 10) {
            const chunk = ids.slice(i, i + 10);
            const unsub = onSnapshot(query(collection(db, "revisions"), where("projectId", "in", chunk)), (snap) => {
                chunk.forEach((id) => draftSet.delete(id));
                snap.docs.forEach((dDoc) => { const pid = dDoc.data()?.projectId; if (pid) draftSet.add(pid); });
                setDraftProjectIds(Array.from(draftSet));
            });
            unsubs.push(unsub);
        }
        return () => unsubs.forEach((u) => u());
    }, [projects]);

    // Preload videos
    useEffect(() => {
        const urls = projects.flatMap((p) => {
            const raw = (p.rawFiles || []).filter(isVideoFile).map((f: any) => f?.url);
            const del = (p.deliveredFiles || []).filter(isVideoFile).map((f: any) => f?.url);
            const pm = (((p as any).pmFiles || []) as any[]).filter(isVideoFile).map((f) => f?.url);
            return [...raw, ...del, ...pm];
        });
        preloadVideosIntoMemory(urls, 30);
    }, [projects]);

    // Fetch current user data for reactivity (PM assigned to client)
    useEffect(() => {
        if (!user?.uid) return;
        const unsub = onSnapshot(doc(db, "users", user.uid), (snap) => {
            if (snap.exists()) setUserData(snap.data() as User);
        });
        return () => unsub();
    }, [user]);

    // Fetch users
    useEffect(() => {
        const unsub = onSnapshot(collection(db, "users"), (snap) => {
            setAllUsers(snap.docs.map((uDoc) => ({ uid: uDoc.id, ...uDoc.data() } as User)));
        });
        return () => unsub();
    }, []);

    // Fetch invoices
    useEffect(() => {
        if (!user?.uid) return;
        const q = query(collection(db, "invoices"), where("clientId", "==", user.uid), orderBy("createdAt", "desc"));
        const unsub = onSnapshot(q, (snap) => {
            setInvoices(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Invoice)));
        });
        return () => unsub();
    }, [user]);

    // Derived data
    const assignedPMId = userData?.managedByPM || user?.managedByPM || projects.find((p) => p.assignedPMId)?.assignedPMId;
    const assignedPM = assignedPMId ? allUsers.find((u) => u.uid === assignedPMId) : null;

    const selectedProjectPM = displayedProject?.assignedPMId 
        ? allUsers.find(u => u.uid === displayedProject.assignedPMId) 
        : assignedPM;

    const filteredProjects = projects.filter((p) => {
        if (statusFilter !== "all" && p.status !== statusFilter) return false;
        if (searchQuery && !p.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
        return true;
    });

    // Stats with GST
    const totalCostBase = projects.reduce((acc, p) => acc + (p.totalCost || 0), 0);
    const totalWithGst = withGst(totalCostBase);
    const totalPaid = projects.reduce((acc, p) => acc + (p.amountPaid || 0), 0);
    const pendingBase = projects.reduce((acc, p) => acc + Math.max(0, (p.totalCost || 0) * (1 + GST_RATE) - (p.amountPaid || 0)), 0);
    const activeCount = projects.filter((p) => !["completed", "approved", "archived", "delivered", "completed_pending_payment"].includes(p.status)).length;
    const completedCount = projects.filter((p) => ["completed", "approved", "completed_pending_payment"].includes(p.status)).length;
    const pendingPaymentCount = projects.filter((p) => (p.amountPaid || 0) < (p.totalCost || 0) * (1 + GST_RATE) && ["completed", "completed_pending_payment", "approved"].includes(p.status)).length;

    const creditLimit = user?.creditLimit || 5000;
    const isOverLimit = pendingBase > 0 && withGst(pendingBase) >= creditLimit && (user?.payLater || false);

    // Helper
    const triggerDirectDownload = async (url: string, fileName?: string) => {
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error("fetch failed");
            const blob = await res.blob();
            const blobUrl = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = blobUrl; a.download = fileName || "download";
            document.body.appendChild(a); a.click(); a.remove();
            window.URL.revokeObjectURL(blobUrl);
        } catch {
            const a = document.createElement("a");
            a.href = url; a.download = fileName || "download"; a.target = "_blank";
            document.body.appendChild(a); a.click(); a.remove();
        }
    };

    const selectedProjectPMWhatsapp = buildWhatsAppLink(selectedProjectPM?.whatsappNumber || selectedProjectPM?.phoneNumber);
    const selectedProjectPmFiles = selectedProject
        ? (((selectedProject as any).pmFiles || []) as any[]).length > 0
            ? (((selectedProject as any).pmFiles || []) as any[])
            : (selectedProject.referenceFiles || []).filter((f: any) => Boolean(f?.uploadedBy))
        : [];
    const selectedProjectStyleRef = selectedProject
        ? (selectedProject.referenceFiles || []).filter((f: any) => !f?.uploadedBy)
        : [];

    // ── Render ───────────────────────────────────────────────────────────────
    return (
        <div className="space-y-8 pb-16">

            {/* Credit Warning */}
            {isOverLimit && (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                    className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-red-500/20 flex items-center justify-center">
                            <AlertCircle className="h-5 w-5 text-red-500" />
                        </div>
                        <div>
                            <p className="text-sm font-semibold text-red-500">Payment Required</p>
                            <p className="text-xs text-red-400/80">Outstanding balance ({formatInrWithGst(pendingBase)}) exceeds your credit limit. Please clear dues to continue.</p>
                        </div>
                    </div>
                    <button onClick={() => setActiveTab("finance")}
                        className="px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition-colors whitespace-nowrap">
                        Pay Now
                    </button>
                </motion.div>
            )}

            {/* Header */}
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-foreground">
                        Welcome back, {user?.displayName?.split(" ")[0] || "there"}
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        {projects.length > 0 ? `Managing ${projects.length} project${projects.length !== 1 ? "s" : ""}` : "Here's what's happening with your projects"}
                    </p>
                </div>
                <Link href="/dashboard/projects/new">
                    <button className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors shadow-sm">
                        <Plus className="h-4 w-4" /> New Project
                    </button>
                </Link>
            </motion.div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <IndicatorCard 
                    label="Total Projects" 
                    value={projects.length} 
                    icon={<Video className="h-5 w-5" />}
                    subtext="All-time projects"
                />
                <IndicatorCard 
                    label="In Progress" 
                    value={activeCount} 
                    icon={<Activity className="h-5 w-5" />}
                    subtext="Under active production"
                />
                <IndicatorCard 
                    label="Completed" 
                    value={completedCount} 
                    icon={<CheckCircle2 className="h-5 w-5" />}
                    subtext="Ready for download"
                />
                <IndicatorCard 
                    label="Pending Payments" 
                    value={formatInrWithGst(pendingBase)} 
                    icon={<Wallet className="h-5 w-5" />}
                    alert={pendingBase > 0} 
                    subtext="Outstanding balance"
                />
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-1 border-b border-border">
                {(["projects", "finance"] as const).map((tab) => (
                    <button key={tab} onClick={() => setActiveTab(tab)}
                        className={cn("px-5 py-2.5 text-sm font-medium transition-all border-b-2 -mb-px",
                            activeTab === tab
                                ? "border-primary text-primary"
                                : "border-transparent text-muted-foreground hover:text-foreground")}>
                        {tab === "projects" ? "All Projects" : "Finance"}
                        {tab === "finance" && pendingPaymentCount > 0 && (
                            <span className="ml-2 inline-flex h-5 min-w-5 px-1 items-center justify-center rounded-full bg-red-500/15 text-red-500 text-[10px] font-bold">
                                {pendingPaymentCount}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* ── PROJECTS TAB ── */}
            {activeTab === "projects" && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    className="bg-card border border-border rounded-xl overflow-hidden">
                    {/* Table header */}
                    <div className="p-4 md:p-5 border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <h2 className="text-lg font-semibold text-foreground">All Projects</h2>
                            <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">
                                {filteredProjects.length} total
                            </span>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="relative flex-1 md:w-72">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <input type="text" placeholder="Search projects..."
                                    className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-4 text-sm focus:border-primary/50 focus:outline-none transition-colors"
                                    value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                            </div>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <button className="h-9 px-3 rounded-lg border border-border bg-background text-sm font-medium text-muted-foreground hover:text-foreground flex items-center gap-2 transition-colors">
                                        {statusFilter === "all" ? "All Status" : statusFilter.replace(/_/g, " ")}
                                        <ChevronDown className="h-4 w-4" />
                                    </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-44">
                                    {[["all", "All Status"], ["active", "In Progress"], ["in_review", "In Review"], ["completed", "Completed"], ["completed_pending_payment", "Payment Due"]].map(([val, lbl]) => (
                                        <DropdownMenuItem key={val} onClick={() => setStatusFilter(val)}>{lbl}</DropdownMenuItem>
                                    ))}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </div>

                    {/* Table */}
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="bg-muted/50 border-b border-border">
                                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground w-12">SR</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Project</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Cost (incl. GST)</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground hidden md:table-cell">Project Manager</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground hidden sm:table-cell">Payment</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {loading ? (
                                    <tr><td colSpan={7} className="px-4 py-16 text-center">
                                        <RefreshCw className="animate-spin h-5 w-5 mx-auto text-muted-foreground" />
                                    </td></tr>
                                ) : filteredProjects.length === 0 ? (
                                    <tr><td colSpan={7} className="px-4 py-16 text-center">
                                        <FileVideo className="h-8 w-8 mx-auto mb-3 text-muted-foreground/50" />
                                        <p className="text-sm text-muted-foreground">No projects found</p>
                                        <Link href="/dashboard/projects/new">
                                            <button className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
                                                <Plus className="h-4 w-4" /> Create Project
                                            </button>
                                        </Link>
                                    </td></tr>
                                ) : (
                                    <AnimatePresence mode="popLayout">
                                        {filteredProjects.map((project, idx) => {
                                            const costWithGst = withGst(project.totalCost || 0);
                                            const isPaid = project.paymentStatus === "full_paid";
                                            const isPartial = project.paymentStatus === "half_paid";
                                            const pmName = project.assignedPMId
                                                ? allUsers.find((u) => u.uid === project.assignedPMId)?.displayName || "PM"
                                                : assignedPM?.displayName || "—";
                                            const hasDraft = draftProjectIds.includes(project.id || "");
                                            return (
                                                <motion.tr key={project.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                                    transition={{ delay: idx * 0.02 }}
                                                    className="group hover:bg-muted/30 transition-colors">
                                                    <td className="px-4 py-3 text-sm text-muted-foreground">{idx + 1}</td>
                                                    <td className="px-4 py-3">
                                                        <div className="max-w-[180px]">
                                                            <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors truncate">{project.name}</p>
                                                            <p className="text-xs text-muted-foreground truncate mt-0.5">
                                                                {project.videoType || "Video"} • {project.createdAt ? new Date(project.createdAt).toLocaleDateString("en-IN", { month: "short", day: "numeric" }) : ""}
                                                            </p>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <div>
                                                            <span className="text-sm font-semibold text-foreground">{formatInr(costWithGst)}</span>
                                                            <p className="text-[10px] text-muted-foreground">Base: {formatInr(project.totalCost || 0)} + 18% GST</p>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3 hidden md:table-cell">
                                                        <span className="text-sm text-foreground">{pmName}</span>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <StatusBadge status={project.status} />
                                                    </td>
                                                    <td className="px-4 py-3 hidden sm:table-cell">
                                                        <div className="flex flex-col gap-1">
                                                            <PaymentBadge paid={isPaid} partial={!isPaid && isPartial} />
                                                            {!isPaid && (["completed", "completed_pending_payment", "approved"].includes(project.status)) && (
                                                                <button 
                                                                    disabled={isProcessingPayment}
                                                                    onClick={(e) => { e.stopPropagation(); handleInitiatePayment(project); }}
                                                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20 transition-colors whitespace-nowrap disabled:opacity-50"
                                                                >
                                                                    {isProcessingPayment ? <RefreshCw className="h-2.5 w-2.5 animate-spin" /> : <CreditCard className="h-2.5 w-2.5" />} 
                                                                    Pay Now
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center gap-1.5">
                                                            {hasDraft && (
                                                                <button onClick={() => { setSelectedProject(project); setIsReviewSystemOpen(true); }}
                                                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 text-xs font-medium hover:bg-emerald-500/20 transition-colors">
                                                                    <FileVideo className="h-3.5 w-3.5" /> Review
                                                                </button>
                                                            )}
                                                            <button onClick={() => { setSelectedProject(project); setIsProjectModalOpen(true); }}
                                                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors">
                                                                <Eye className="h-3.5 w-3.5" /> Details
                                                            </button>
                                                        </div>
                                                    </td>
                                                </motion.tr>
                                            );
                                        })}
                                    </AnimatePresence>
                                )}
                            </tbody>
                        </table>
                        {!loading && filteredProjects.length > 0 && (
                            <div className="px-4 py-3 border-t border-border text-xs text-muted-foreground">
                                Showing {filteredProjects.length} of {projects.length} projects
                            </div>
                        )}
                    </div>
                </motion.div>
            )}

            {/* ── FINANCE TAB ── */}
            {activeTab === "finance" && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                    {/* Finance summary cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="bg-card border border-border rounded-xl p-5">
                            <div className="flex items-center gap-3 mb-3">
                                <div className="h-9 w-9 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                                    <IndianRupee className="h-4 w-4 text-blue-500" />
                                </div>
                                <p className="text-xs text-muted-foreground font-medium uppercase tracking-widest">Total Billed</p>
                            </div>
                            <p className="text-2xl font-bold text-foreground">{formatInrWithGst(totalCostBase)}</p>
                            <p className="text-[10px] text-muted-foreground mt-1">Base: {formatInr(totalCostBase)} + 18% GST</p>
                        </div>
                        <div className="bg-card border border-border rounded-xl p-5">
                            <div className="flex items-center gap-3 mb-3">
                                <div className="h-9 w-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                </div>
                                <p className="text-xs text-muted-foreground font-medium uppercase tracking-widest">Total Paid</p>
                            </div>
                            <p className="text-2xl font-bold text-foreground">{formatInr(withGst(totalPaid))}</p>
                            <p className="text-[10px] text-muted-foreground mt-1">Base: {formatInr(totalPaid)} + 18% GST</p>
                        </div>
                        <div className={cn("bg-card border rounded-xl p-5", pendingBase > 0 ? "border-red-500/30 ring-1 ring-red-500/20" : "border-border")}>
                            <div className="flex items-center gap-3 mb-3">
                                <div className="h-9 w-9 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                                    <Wallet className="h-4 w-4 text-red-500" />
                                </div>
                                <p className="text-xs text-muted-foreground font-medium uppercase tracking-widest">Outstanding</p>
                            </div>
                            <p className={cn("text-2xl font-bold", pendingBase > 0 ? "text-red-500" : "text-foreground")}>{formatInrWithGst(pendingBase)}</p>
                            <p className="text-[10px] text-muted-foreground mt-1">Base: {formatInr(pendingBase)} + 18% GST</p>
                        </div>
                    </div>

                    {/* Finance table – projects with outstanding */}
                    <div className="bg-card border border-border rounded-xl overflow-hidden">
                        <div className="p-4 md:p-5 border-b border-border flex items-center gap-3">
                            <h2 className="text-lg font-semibold text-foreground">Project-wise Billing</h2>
                            <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">{projects.length} projects</span>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="bg-muted/50 border-b border-border">
                                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Project</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Base Cost</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">GST (18%)</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Total Payable</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Amount Paid</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Balance Due</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {projects.length === 0 ? (
                                        <tr><td colSpan={8} className="px-4 py-12 text-center text-sm text-muted-foreground">No projects found</td></tr>
                                    ) : projects.map((project, idx) => {
                                        const base = project.totalCost || 0;
                                        const gstAmt = base * GST_RATE;
                                        const total = base + gstAmt;
                                        const paid = project.amountPaid || 0;
                                        const paidWithGst = withGst(paid);
                                        const balance = Math.max(0, total - paidWithGst);
                                        const isPaid = project.paymentStatus === "full_paid";
                                        const isCompleted = ["completed", "completed_pending_payment", "approved"].includes(project.status);
                                        const projectInvoices = invoices.filter((inv) => inv.projectId === project.id);

                                        return (
                                            <motion.tr key={project.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                                transition={{ delay: idx * 0.02 }}
                                                className={cn("group hover:bg-muted/30 transition-colors", !isPaid && isCompleted && "bg-red-500/[0.03]")}>
                                                <td className="px-4 py-3">
                                                    <p className="text-sm font-medium text-foreground truncate max-w-[160px]">{project.name}</p>
                                                    <StatusBadge status={project.status} />
                                                </td>
                                                <td className="px-4 py-3 text-sm text-foreground">{formatInr(base)}</td>
                                                <td className="px-4 py-3 text-sm text-amber-500">{formatInr(gstAmt)}</td>
                                                <td className="px-4 py-3 text-sm font-semibold text-foreground">{formatInr(total)}</td>
                                                <td className="px-4 py-3 text-sm text-emerald-500">{formatInr(paidWithGst)}</td>
                                                <td className="px-4 py-3">
                                                    <span className={cn("text-sm font-bold", balance > 0 ? "text-red-500" : "text-emerald-500")}>
                                                        {balance > 0 ? formatInr(balance) : "—"}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <PaymentBadge paid={isPaid} partial={!isPaid && project.paymentStatus === "half_paid"} />
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-2">
                                                        {!isPaid && isCompleted && (
                                                            <button
                                                                disabled={isProcessingPayment}
                                                                onClick={() => handleInitiatePayment(project)}
                                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-500 text-xs font-bold border border-red-500/20 hover:bg-red-500/20 transition-colors whitespace-nowrap disabled:opacity-50"
                                                            >
                                                                {isProcessingPayment ? <RefreshCw className="h-3 w-3 animate-spin" /> : <CreditCard className="h-3.5 w-3.5" />} 
                                                                Pay Now
                                                            </button>
                                                        )}
                                                        {projectInvoices.length > 0 && (
                                                            <Link href={`/dashboard/invoices/${projectInvoices[0].id}`}>
                                                                <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors">
                                                                    <Receipt className="h-3.5 w-3.5" /> Invoice
                                                                </button>
                                                            </Link>
                                                        )}
                                                    </div>
                                                </td>
                                            </motion.tr>
                                        );
                                    })}
                                </tbody>
                                {/* Totals footer */}
                                {projects.length > 0 && (
                                    <tfoot>
                                        <tr className="bg-muted/50 border-t-2 border-border">
                                            <td className="px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-widest">Totals</td>
                                            <td className="px-4 py-3 text-sm font-bold text-foreground">{formatInr(totalCostBase)}</td>
                                            <td className="px-4 py-3 text-sm font-bold text-amber-500">{formatInr(totalCostBase * GST_RATE)}</td>
                                            <td className="px-4 py-3 text-sm font-bold text-foreground">{formatInr(withGst(totalCostBase))}</td>
                                            <td className="px-4 py-3 text-sm font-bold text-emerald-500">{formatInr(withGst(totalPaid))}</td>
                                            <td className="px-4 py-3 text-sm font-bold text-red-500">{pendingBase > 0 ? formatInrWithGst(pendingBase) : "—"}</td>
                                            <td colSpan={2} />
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        </div>
                    </div>

                    {/* Invoices */}
                    {invoices.length > 0 && (
                        <div className="bg-card border border-border rounded-xl overflow-hidden">
                            <div className="p-4 md:p-5 border-b border-border">
                                <h2 className="text-lg font-semibold text-foreground">Invoices</h2>
                            </div>
                            <div className="divide-y divide-border">
                                {invoices.map((invoice) => (
                                    <div key={invoice.id} className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors">
                                        <div className="flex items-center gap-3">
                                            <div className="h-9 w-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                                                <FileText className="h-4 w-4 text-primary" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-semibold text-foreground">{invoice.invoiceNumber}</p>
                                                <p className="text-xs text-muted-foreground">{new Date(invoice.issueDate).toLocaleDateString("en-IN")}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <div className="text-right">
                                                <p className="text-sm font-bold text-foreground">{formatInr(invoice.total)}</p>
                                                <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border",
                                                    invoice.status === "paid" ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" :
                                                    invoice.status === "overdue" ? "bg-red-500/10 text-red-500 border-red-500/20" :
                                                    "bg-amber-500/10 text-amber-500 border-amber-500/20")}>
                                                    {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                                                </span>
                                            </div>
                                            <Link href={`/dashboard/invoices/${invoice.id}`}>
                                                <button className="h-8 w-8 rounded-lg bg-muted hover:bg-primary/20 hover:text-primary text-muted-foreground flex items-center justify-center transition-all">
                                                    <Download className="h-3.5 w-3.5" />
                                                </button>
                                            </Link>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </motion.div>
            )}

            {/* ── Project Detail Modal ── */}
            <Modal isOpen={isProjectModalOpen} onClose={() => setIsProjectModalOpen(false)} title="Project Details" maxWidth="max-w-5xl">
                {selectedProject && (
                    <>
                        <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-6 max-h-[75vh] overflow-y-auto pr-2">
                            <div className="lg:col-span-2 space-y-5">
                                <div className="p-4 rounded-xl bg-muted/30 border border-border">
                                    <h3 className="text-lg font-bold text-foreground">{selectedProject.name}</h3>
                                    <div className="mt-2 flex items-center gap-3">
                                        <StatusBadge status={selectedProject.status} />
                                        <span className="text-xs text-muted-foreground">Created {new Date(selectedProject.createdAt).toLocaleDateString()}</span>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                                    {[["Type", selectedProject.videoType || "Video"], ["Format", selectedProject.videoFormat || "—"], ["Ratio", selectedProject.aspectRatio || "—"], ["Duration", selectedProject.duration ? `${selectedProject.duration}m` : "—"]].map(([lbl, val]) => (
                                        <div key={lbl} className="p-3 rounded-lg border border-border bg-muted/20">
                                            <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">{lbl}</p>
                                            <p className="text-sm font-semibold mt-1">{val}</p>
                                        </div>
                                    ))}
                                </div>

                                {/* Cost breakdown */}
                                <div className="p-4 rounded-xl border border-border bg-muted/20 space-y-2">
                                    <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Cost Breakdown</p>
                                    <div className="flex justify-between text-xs"><span className="text-muted-foreground">Base Cost</span><span className="font-semibold">{formatInr(selectedProject.totalCost || 0)}</span></div>
                                    <div className="flex justify-between text-xs"><span className="text-muted-foreground">GST (18%)</span><span className="font-semibold text-amber-500">{formatInr((selectedProject.totalCost || 0) * GST_RATE)}</span></div>
                                    <div className="flex justify-between text-sm border-t border-border pt-2"><span className="font-semibold">Total Payable</span><span className="font-bold text-foreground">{formatInrWithGst(selectedProject.totalCost || 0)}</span></div>
                                    <div className="flex justify-between text-xs"><span className="text-muted-foreground">Amount Paid</span><span className="font-semibold text-emerald-500">{formatInr(withGst(selectedProject.amountPaid || 0))}</span></div>
                                    {(selectedProject.totalCost || 0) > (selectedProject.amountPaid || 0) && (
                                        <div className="flex justify-between text-xs"><span className="text-muted-foreground">Balance Due</span><span className="font-bold text-red-500">{formatInrWithGst(Math.max(0, (selectedProject.totalCost || 0) - (selectedProject.amountPaid || 0)))}</span></div>
                                    )}
                                </div>

                                {/* Files */}
                                <div className="bg-muted/30 border border-border rounded-lg p-4 space-y-3">
                                    <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest">Project Files</p>
                                    {selectedProject.rawFiles && selectedProject.rawFiles.length > 0 ? (
                                        <div className="space-y-2 max-h-[200px] overflow-y-auto custom-scrollbar pr-1">
                                            {selectedProject.rawFiles.map((file: any, i: number) => (
                                                <div key={i} className="flex items-center justify-between gap-3 p-2 rounded-md bg-card border border-border">
                                                    <span className="text-xs font-medium truncate">{file.name}</span>
                                                    <div className="flex items-center gap-2">
                                                        <button onClick={() => setPreviewFile({ url: file.url, type: file.type || "video/mp4", name: file.name })} className="h-8 px-2.5 rounded text-xs font-bold bg-muted hover:bg-primary/20 hover:text-primary text-muted-foreground transition-all">Preview</button>
                                                        <button onClick={() => triggerDirectDownload(file.url, file.name)} className="h-8 w-8 rounded-md bg-muted hover:bg-primary/20 hover:text-primary text-muted-foreground flex items-center justify-center transition-all"><Download className="h-3.5 w-3.5" /></button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : <p className="text-xs text-muted-foreground">No files uploaded yet.</p>}
                                </div>

                                {/* Timeline */}
                                <div className="bg-muted/30 border border-border rounded-lg p-4">
                                    <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest mb-3">Project Timeline</p>
                                    {selectedProject.logs && selectedProject.logs.length > 0 ? (
                                        <div className="space-y-3 max-h-[200px] overflow-y-auto">
                                            {[...selectedProject.logs].reverse().slice(0, 12).map((log: any, i: number) => (
                                                <div key={i} className="flex items-start gap-3 pb-3 border-b border-border last:border-0 last:pb-0">
                                                    <div className="h-2 w-2 mt-1.5 rounded-full bg-primary" />
                                                    <div className="min-w-0 flex-1">
                                                        <p className="text-xs font-semibold text-foreground">{String(log.event || "").replace(/_/g, " ")}</p>
                                                        {log.details && <p className="text-xs text-muted-foreground mt-0.5">{log.details}</p>}
                                                        <p className="text-[10px] text-muted-foreground mt-1">{log.userName || "System"} • {new Date(log.timestamp).toLocaleString()}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : <p className="text-xs text-muted-foreground">No updates yet.</p>}
                                </div>
                            </div>

                            {/* Sidebar */}
                            <div className="space-y-5">
                                <div className="bg-muted/30 border border-border rounded-lg p-4">
                                    <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest mb-4">Assigned Manager</p>
                                    <p className="text-sm font-semibold text-foreground">{selectedProjectPM?.displayName || "Not Assigned"}</p>
                                    {selectedProjectPM?.email && <p className="text-xs text-muted-foreground mt-1 break-all">{selectedProjectPM.email}</p>}
                                    {(selectedProjectPM?.phoneNumber || selectedProjectPM?.whatsappNumber) && (
                                        <p className="text-xs text-muted-foreground mt-1">{selectedProjectPM?.whatsappNumber || selectedProjectPM?.phoneNumber}</p>
                                    )}
                                    <div className="mt-3">
                                        {selectedProjectPMWhatsapp ? (
                                            <a href={selectedProjectPMWhatsapp} target="_blank" rel="noreferrer" className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 text-xs font-bold hover:bg-emerald-500/20 transition-all">
                                                <MessageCircle className="h-3.5 w-3.5" /> Chat on WhatsApp
                                            </a>
                                        ) : (
                                            <button disabled className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-muted text-muted-foreground text-xs font-bold cursor-not-allowed">
                                                <MessageCircle className="h-3.5 w-3.5" /> Chat Unavailable
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div className="bg-muted/30 border border-border rounded-lg p-4 space-y-2">
                                    <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest">Project Snapshot</p>
                                    {[["Client", user?.displayName || "—"], ["Editor", allUsers.find((u) => u.uid === selectedProject.assignedEditorId)?.displayName || "Not Assigned"]].map(([lbl, val]) => (
                                        <div key={lbl} className="flex items-center justify-between text-xs">
                                            <span className="text-muted-foreground">{lbl}</span>
                                            <span className="font-semibold text-foreground">{val}</span>
                                        </div>
                                    ))}
                                </div>

                                {/* Invoice section for completed projects */}
                                {["completed", "completed_pending_payment", "approved"].includes(selectedProject.status) && (
                                    <div className="bg-emerald-500/[0.05] border border-emerald-500/20 rounded-lg p-4 space-y-3">
                                        <div className="flex items-center gap-2">
                                            <FileText className="h-4 w-4 text-emerald-500" />
                                            <p className="text-xs text-emerald-600 font-bold uppercase tracking-widest">Invoice</p>
                                        </div>
                                        {invoices.filter((inv) => inv.projectId === selectedProject.id).length > 0 ? (
                                            <div className="space-y-2">
                                                {invoices.filter((inv) => inv.projectId === selectedProject.id).map((invoice) => (
                                                    <Link key={invoice.id} href={`/dashboard/invoices/${invoice.id}`}>
                                                        <motion.button whileHover={{ scale: 1.02 }} className="w-full flex items-center justify-between p-2.5 rounded-lg bg-emerald-500/5 border border-emerald-500/20 hover:bg-emerald-500/10 transition-all group">
                                                            <div className="flex items-center gap-2 min-w-0">
                                                                <FileText className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0" />
                                                                <div className="text-left min-w-0">
                                                                    <p className="text-xs font-semibold text-foreground group-hover:text-emerald-600 truncate">{invoice.invoiceNumber}</p>
                                                                    <p className="text-[10px] text-muted-foreground">{formatInr(invoice.total)}</p>
                                                                </div>
                                                            </div>
                                                            <Download className="h-3.5 w-3.5 text-muted-foreground group-hover:text-emerald-600 flex-shrink-0" />
                                                        </motion.button>
                                                    </Link>
                                                ))}
                                            </div>
                                        ) : <p className="text-xs text-muted-foreground text-center py-2">Invoice generation in progress...</p>}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Preview Modal */}
                        {previewFile && (
                            <div className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-xl flex items-center justify-center p-4" onClick={() => setPreviewFile(null)}>
                                <div className="relative max-w-3xl w-full max-h-[80vh] bg-black rounded-xl overflow-hidden shadow-2xl flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                                    <button onClick={() => setPreviewFile(null)} className="absolute top-4 right-4 h-10 w-10 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center backdrop-blur-md z-10 transition-all">
                                        <X className="h-5 w-5" />
                                    </button>
                                    {previewFile.type.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp)$/i.test(previewFile.name) ? (
                                        <img src={previewFile.url} alt={previewFile.name} className="max-w-full max-h-full object-contain" />
                                    ) : previewFile.type.startsWith("video/") || /\.(mp4|webm|mov)$/i.test(previewFile.name) ? (
                                        <MuxPlayer
                                            src={previewFile.url}
                                            style={{ width: "100%", aspectRatio: "16/9" }}
                                            autoPlay
                                            playsInline
                                            streamType="on-demand"
                                        />
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

            {/* Review Modal */}
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
