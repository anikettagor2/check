"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/context/auth-context";
import { 
    UserPlus, 
    User as UserIcon, 
    RefreshCw, 
    Copy, 
    Search,
    MoreHorizontal,
    Briefcase,
    Plus,
    ChevronDown,
    IndianRupee,
    Users,
    Key,
    Trash2,
    Clock,
    CheckCircle2,
    UserCog,
    Wifi,
    WifiOff,
    Moon,
    X,
    Loader2
} from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/firebase/config";
import { collection, query, where, onSnapshot, orderBy, doc, updateDoc, getDocs } from "firebase/firestore";
import { User } from "@/types/schema";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { assignClientPM } from "@/app/actions/admin-actions";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
    DropdownMenuLabel
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";

// Stats Card Component
function StatsCard({ icon, value, label, color = "blue", alert = false }: {
    icon: React.ReactNode;
    value: number | string;
    label: string;
    color?: "blue" | "amber" | "green" | "purple";
    alert?: boolean;
}) {
    const colorStyles = {
        blue: "bg-blue-500/10 text-blue-600 border-blue-500/20",
        amber: "bg-amber-500/10 text-amber-600 border-amber-500/20",
        green: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
        purple: "bg-purple-500/10 text-purple-600 border-purple-500/20"
    };

    return (
        <motion.div 
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ y: -2 }}
            className={cn(
                "relative bg-card border border-border rounded-xl p-5 hover:shadow-md transition-all duration-200",
                alert && "ring-2 ring-amber-500/30"
            )}
        >
            <div className="flex items-start justify-between">
                <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center border", colorStyles[color])}>
                    {icon}
                </div>
                {alert && (
                    <span className="flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-amber-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                    </span>
                )}
            </div>
            <div className="mt-4">
                <p className="text-3xl font-bold text-foreground tabular-nums">{value}</p>
                <p className="text-sm text-muted-foreground mt-1">{label}</p>
            </div>
        </motion.div>
    );
}

export function SalesDashboard() {
    const { user } = useAuth();
    const [isLoading, setIsLoading] = useState(false);
    const [myClients, setMyClients] = useState<any[]>([]);
    
    // Form State
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [phone, setPhone] = useState("");
    const [payLaterEligible, setPayLaterEligible] = useState(false);
    const [customRates, setCustomRates] = useState<Record<string, number>>({
        "Reel Format": 500,
        "Long Video": 1000,
        "Documentary": 1200,
        "Podcast Edit": 1000,
        "Motion Graphic": 1500,
        "Cinematic Event": 2000
    });
    const [allowedFormats, setAllowedFormats] = useState<Record<string, boolean>>({
        "Reel Format": false,
        "Long Video": false,
        "Documentary": false,
        "Podcast Edit": false,
        "Motion Graphic": false,
        "Cinematic Event": false
    });
    const [pendingClients, setPendingClients] = useState<any[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [projectManagers, setProjectManagers] = useState<User[]>([]);
    const [assignedPM, setAssignedPM] = useState<string>("automatic");
    
    // Edit Pricing State
    const [editingClientId, setEditingClientId] = useState<string | null>(null);
    const [editingPrices, setEditingPrices] = useState<Record<string, number>>({});
    const [isEditingSaving, setIsEditingSaving] = useState(false);

    const VIDEO_TYPES_LABELS = [
        "Reel Format", "Long Video", "Documentary", "Podcast Edit", "Motion Graphic", "Cinematic Event"
    ];

    // Fetch Clients
    useEffect(() => {
        if (!user?.uid) return;

        const q = query(
            collection(db, "users"),
            where("managedBy", "==", user.uid),
            orderBy("createdAt", "desc")
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const clients = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setMyClients(clients);
        });

        return () => unsubscribe();
    }, [user]);

    // Fetch Project Managers
    useEffect(() => {
        const q = query(
            collection(db, "users"),
            where("role", "==", "project_manager")
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const pms = snapshot.docs.map(doc => ({
                uid: doc.id,
                ...doc.data()
            } as User));
            setProjectManagers(pms);
        });

        return () => unsubscribe();
    }, []);

    // Merge & Filter
    const displayedClients = [...myClients, ...pendingClients]
        .filter((client, index, self) => 
            index === self.findIndex(t => t.email === client.email)
        )
        .filter(c => !searchQuery || c.displayName?.toLowerCase().includes(searchQuery.toLowerCase()) || c.email?.toLowerCase().includes(searchQuery.toLowerCase()))
        .sort((a, b) => b.createdAt - a.createdAt);

    const generatePassword = () => {
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%";
        let pass = "";
        for (let i = 0; i < 10; i++) {
            pass += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        setPassword(pass);
        toast.info("Password generated");
    };

    const handleCreateClient = async (e: React.FormEvent) => {
        e.preventDefault();
        const backup = { name, email, password, customRates, allowedFormats, payLaterEligible, assignedPM };
        const tempId = `temp-${Date.now()}`;
        
        let finalPMId = backup.assignedPM;
        
        setIsLoading(true);
        
        if (finalPMId === "automatic") {
            try {
                const onlinePMs = projectManagers.filter(pm => pm.availabilityStatus === 'online');
                
                if (onlinePMs.length > 0) {
                    const projectsRef = collection(db, "projects");
                    const qActive = query(projectsRef, where("status", "not-in", ["completed", "approved"]));
                    const activeSnaps = await getDocs(qActive);
                    
                    const pmLoad: Record<string, number> = {};
                    onlinePMs.forEach(pm => pmLoad[pm.uid] = 0);
                    
                    activeSnaps.docs.forEach(d => {
                        const proj = d.data();
                        if (proj.assignedPMId && pmLoad[proj.assignedPMId] !== undefined) {
                            pmLoad[proj.assignedPMId]++;
                        }
                    });
                    
                    const availablePMs = onlinePMs.filter(pm => {
                        const limit = pm.maxProjectLimit || 10;
                        return pmLoad[pm.uid] < limit;
                    });
                    
                    if (availablePMs.length > 0) {
                        availablePMs.sort((a, b) => pmLoad[a.uid] - pmLoad[b.uid]);
                        finalPMId = availablePMs[0].uid;
                    } else {
                        toast.error("No available project managers. Client will be created without PM assignment.");
                        finalPMId = "";
                    }
                } else {
                    toast.error("No project managers online. Client will be created without PM assignment.");
                    finalPMId = "";
                }
            } catch (err) {
                console.error("Auto PM assignment error:", err);
                toast.error("Failed to auto-assign PM.");
                finalPMId = "";
            }
        }

        const tempClient = {
            id: tempId,
            displayName: name,
            email: email,
            phoneNumber: phone,
            initialPassword: password,
            createdAt: Date.now(),
            role: 'client',
            customRates,
            allowedFormats,
            payLaterEligible,
            managedByPM: finalPMId !== "automatic" ? finalPMId : undefined,
            isPending: true
        };
        setPendingClients(prev => [tempClient, ...prev]);

        setName("");
        setEmail("");
        setPassword("");
        setPhone("");
        setPayLaterEligible(false);
        
        try {
            const res = await fetch('/api/sales/create-client', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: backup.email,
                    password: backup.password,
                    displayName: backup.name,
                    phoneNumber: phone, 
                    createdBy: user?.uid,
                    customRates: backup.customRates, 
                    allowedFormats: backup.allowedFormats,
                    payLaterEligible: backup.payLaterEligible
                })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Creation failed");
            
            if (finalPMId && finalPMId !== "automatic") {
                await updateDoc(doc(db, "users", data.user.uid), {
                    managedByPM: finalPMId,
                    updatedAt: Date.now()
                });
            }

            toast.success(`Client "${backup.name}" created successfully`);
            setIsCreateOpen(false);

        } catch (error: any) {
            toast.error(error.message);
            setPendingClients(prev => prev.filter(c => c.id !== tempId));
        } finally {
            setIsLoading(false);
        }
    };

    const [assigningPM, setAssigningPM] = useState<string | null>(null);

    const handleAssignPM = async (clientId: string, pmId: string) => {
        if (!pmId) return;
        setAssigningPM(clientId);
        try {
            const res = await assignClientPM(clientId, pmId);
            if (!res.success) throw new Error(res.error);
            const pm = projectManagers.find(p => p.uid === pmId);
            toast.success(`Assigned ${pm?.displayName || 'PM'} to client`);
        } catch (err: any) {
            toast.error(err.message || "Failed to assign project manager");
        } finally {
            setAssigningPM(null);
        }
    };

    const handleRequestDeletion = async (uid: string) => {
        if (!confirm("Are you sure you want to request deletion of this client?")) return;
        try {
            const userRef = doc(db, "users", uid);
            await updateDoc(userRef, {
                deletionRequested: true,
                deletionRequestedAt: Date.now()
            });
            toast.success("Deletion request sent to admin");
        } catch (err: any) {
            toast.error("Failed to request deletion");
        }
    };

    // If editing pricing, show edit panel
    if (editingClientId) {
        const handleSavePricing = async () => {
            setIsEditingSaving(true);
            try {
                const res = await fetch('/api/sales/update-client-pricing', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        clientId: editingClientId,
                        customRates: editingPrices
                    })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || "Update failed");
                toast.success("Pricing updated successfully");
                setEditingClientId(null);
            } catch (err: any) {
                toast.error(err.message || "Failed to update pricing");
            } finally {
                setIsEditingSaving(false);
            }
        };
        const editingClient = [...myClients, ...pendingClients].find(c => c.id === editingClientId);
        return (
            <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
                <div className="bg-card border border-border rounded-xl p-6">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h2 className="text-2xl font-bold text-foreground">Edit Client Pricing</h2>
                            <p className="text-muted-foreground mt-1">{editingClient?.displayName || editingClient?.email}</p>
                        </div>
                        <button
                            onClick={() => setEditingClientId(null)}
                            className="h-10 w-10 rounded-lg hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                    <div className="space-y-4">
                        <p className="text-sm text-muted-foreground">Set custom pricing for each video format this client can order.</p>
                        {VIDEO_TYPES_LABELS.map((type) => (
                            <div key={type} className="flex items-center justify-between p-4 rounded-lg border border-border bg-muted/30">
                                <p className="text-sm font-semibold text-foreground">{type}</p>
                                <div className="flex items-center gap-2">
                                    <span className="text-sm text-muted-foreground">₹</span>
                                    <input
                                        type="number"
                                        min="0"
                                        value={editingPrices[type] || 0}
                                        onChange={(e) => setEditingPrices({...editingPrices, [type]: Number(e.target.value)})}
                                        className="h-10 w-24 px-3 text-right border border-border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 tabular-nums"
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="flex items-center gap-3 mt-8 pt-6 border-t border-border">
                        <button
                            onClick={() => setEditingClientId(null)}
                            className="flex-1 px-4 py-2.5 border border-border rounded-lg text-sm font-medium text-foreground hover:bg-muted transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSavePricing}
                            disabled={isEditingSaving}
                            className="flex-1 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                        >
                            {isEditingSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                            {isEditingSaving ? "Saving..." : "Save Pricing"}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8 max-w-[1600px] mx-auto pb-16">
            {/* Header */}
            <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col md:flex-row md:items-center md:justify-between gap-4"
            >
                <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-foreground">
                        Welcome back, {user?.displayName?.split(' ')[0]}
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Manage your clients and track your sales
                    </p>
                </div>
                
                <button
                    onClick={() => setIsCreateOpen(!isCreateOpen)}
                    className={cn(
                        "flex items-center gap-2 h-10 px-4 rounded-lg text-sm font-medium transition-all",
                        isCreateOpen 
                            ? "bg-muted text-foreground border border-border" 
                            : "bg-primary text-primary-foreground hover:bg-primary/90"
                    )}
                >
                    {isCreateOpen ? (
                        <>Cancel</>
                    ) : (
                        <>
                            <UserPlus className="h-4 w-4" />
                            Add Client
                        </>
                    )}
                </button>
            </motion.div>

            {/* Stats Grid - Only show when form is closed */}
            {!isCreateOpen && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <StatsCard 
                        icon={<Users className="h-5 w-5" />}
                        value={myClients.length}
                        label="Total Clients"
                        color="blue"
                    />
                    <StatsCard 
                        icon={<Clock className="h-5 w-5" />}
                        value={pendingClients.length}
                        label="Pending Setup"
                        color="amber"
                        alert={pendingClients.length > 0}
                    />
                    <StatsCard 
                        icon={<IndianRupee className="h-5 w-5" />}
                        value="₹0"
                        label="Revenue Generated"
                        color="green"
                    />
                    <StatsCard 
                        icon={<CheckCircle2 className="h-5 w-5" />}
                        value={myClients.filter(c => !c.deletionRequested).length}
                        label="Active Clients"
                        color="purple"
                    />
                </div>
            )}

            <div className="grid lg:grid-cols-12 gap-6 items-start">
                <AnimatePresence mode="popLayout">
                    {/* Create Client Form */}
                    {isCreateOpen && (
                        <motion.div 
                            key="creation-form"
                            initial={{ opacity: 0, scale: 0.98 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.98 }}
                            className="lg:col-span-5 bg-card border border-border p-6 rounded-xl"
                        >
                            <div className="flex items-center gap-3 mb-6">
                                <div className="h-10 w-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                                    <UserPlus className="h-5 w-5 text-primary" />
                                </div>
                                <div>
                                    <h3 className="text-base font-semibold text-foreground">New Client</h3>
                                    <p className="text-xs text-muted-foreground">Create a new client account</p>
                                </div>
                            </div>
                            
                            <form onSubmit={handleCreateClient} className="space-y-5">
                                {/* Name */}
                                <div className="space-y-1.5">
                                    <Label className="text-sm font-medium">Full Name</Label>
                                    <input 
                                        placeholder="John Doe" 
                                        value={name} 
                                        onChange={e => setName(e.target.value)} 
                                        required 
                                        className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:border-primary/50 focus:outline-none transition-colors"
                                    />
                                </div>
                                
                                {/* Email */}
                                <div className="space-y-1.5">
                                    <Label className="text-sm font-medium">Email Address</Label>
                                    <input 
                                        type="email" 
                                        placeholder="client@example.com" 
                                        value={email} 
                                        onChange={e => setEmail(e.target.value)} 
                                        required 
                                        className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:border-primary/50 focus:outline-none transition-colors"
                                    />
                                </div>
                                
                                {/* Phone */}
                                <div className="space-y-1.5">
                                    <Label className="text-sm font-medium">Phone Number</Label>
                                    <div className="flex gap-2">
                                        <div className="flex items-center justify-center h-10 px-3 bg-muted border border-border rounded-lg text-sm text-muted-foreground">+91</div>
                                        <input 
                                            type="tel" 
                                            placeholder="9876543210" 
                                            value={phone} 
                                            onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} 
                                            required 
                                            className="flex-1 h-10 px-3 rounded-lg border border-border bg-background text-sm focus:border-primary/50 focus:outline-none transition-colors"
                                        />
                                    </div>
                                </div>
                                
                                {/* Password */}
                                <div className="space-y-1.5">
                                    <Label className="text-sm font-medium">Password</Label>
                                    <div className="flex gap-2">
                                        <input 
                                            type="text" 
                                            placeholder="Min 6 characters" 
                                            value={password} 
                                            onChange={e => setPassword(e.target.value)} 
                                            required 
                                            className="flex-1 h-10 px-3 rounded-lg border border-border bg-background text-sm font-mono focus:border-primary/50 focus:outline-none transition-colors"
                                        />
                                        <button 
                                            type="button" 
                                            onClick={generatePassword} 
                                            className="h-10 w-10 flex items-center justify-center rounded-lg border border-border hover:bg-muted transition-colors"
                                        >
                                            <Key className="h-4 w-4 text-muted-foreground" />
                                        </button>
                                    </div>
                                </div>
                                
                                {/* Video Types & Pricing */}
                                <div className="pt-4 border-t border-border">
                                    <Label className="text-sm font-medium mb-3 block">Video Types & Pricing</Label>
                                    <div className="space-y-2">
                                        {VIDEO_TYPES_LABELS.map((type) => (
                                            <div key={type} className={cn(
                                                "flex items-center justify-between p-3 rounded-lg border transition-all", 
                                                allowedFormats[type] 
                                                    ? "bg-primary/5 border-primary/20" 
                                                    : "bg-muted/30 border-border opacity-60"
                                            )}>
                                                <div className="flex items-center gap-3">
                                                    <input 
                                                        type="checkbox" 
                                                        checked={allowedFormats[type]} 
                                                        onChange={(e) => setAllowedFormats({...allowedFormats, [type]: e.target.checked})}
                                                        className="h-4 w-4 rounded border-border text-primary focus:ring-primary/40 cursor-pointer"
                                                    />
                                                    <span className="text-sm text-foreground">{type}</span>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <span className="text-sm text-muted-foreground">₹</span>
                                                    <input 
                                                        disabled={!allowedFormats[type]}
                                                        className="h-8 w-20 text-sm text-right bg-transparent border-none focus:ring-0 disabled:opacity-40 tabular-nums" 
                                                        value={customRates[type]} 
                                                        onChange={(e) => setCustomRates({...customRates, [type]: parseInt(e.target.value) || 0})}
                                                    />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Pay Later */}
                                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border">
                                    <div>
                                        <p className="text-sm font-medium text-foreground">Allow Pay Later</p>
                                        <p className="text-xs text-muted-foreground">Client can pay after project completion</p>
                                    </div>
                                    <input 
                                        type="checkbox" 
                                        checked={payLaterEligible} 
                                        onChange={(e) => setPayLaterEligible(e.target.checked)}
                                        className="h-5 w-5 rounded border-border text-primary focus:ring-primary/40 cursor-pointer"
                                    />
                                </div>

                                {/* PM Assignment */}
                                <div className="space-y-1.5">
                                    <Label className="text-sm font-medium">Project Manager</Label>
                                    <p className="text-xs text-muted-foreground mb-2">Assign a PM to handle this client's projects</p>
                                    <div className="relative">
                                        <select
                                            value={assignedPM}
                                            onChange={(e) => setAssignedPM(e.target.value)}
                                            className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm focus:border-primary/50 focus:outline-none appearance-none"
                                        >
                                            <option value="automatic">Auto-assign based on availability</option>
                                            {projectManagers.map(pm => (
                                                <option key={pm.uid} value={pm.uid}>
                                                    {pm.displayName} 
                                                    {pm.availabilityStatus === 'online' ? ' (Online)' : pm.availabilityStatus === 'sleep' ? ' (Away)' : ' (Offline)'}
                                                </option>
                                            ))}
                                        </select>
                                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                                    </div>
                                </div>

                                <button 
                                    type="submit" 
                                    className="w-full h-10 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2" 
                                    disabled={isLoading}
                                >
                                    {isLoading ? (
                                        <>
                                            <RefreshCw className="h-4 w-4 animate-spin" />
                                            Creating...
                                        </>
                                    ) : (
                                        <>
                                            <Plus className="h-4 w-4" />
                                            Create Client
                                        </>
                                    )}
                                </button>
                            </form>
                        </motion.div>
                    )}

                    {/* Clients Table */}
                    <motion.div 
                        layout
                        className={cn(
                            "bg-card border border-border rounded-xl overflow-hidden", 
                            isCreateOpen ? "lg:col-span-7" : "lg:col-span-12"
                        )}
                    >
                        {/* Search Header */}
                        <div className="p-4 md:p-5 border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <h2 className="text-lg font-semibold text-foreground">My Clients</h2>
                                <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">
                                    {displayedClients.length} total
                                </span>
                            </div>
                            
                            <div className="relative w-full md:w-72">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <input 
                                    type="text"
                                    placeholder="Search by name or email..." 
                                    className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-4 text-sm focus:border-primary/50 focus:outline-none transition-colors"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                            </div>
                        </div>

                        {/* Table */}
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="bg-muted/50 border-b border-border">
                                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Client</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Email</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Password</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Project Manager</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                                        <th className="px-4 py-3 w-12"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {displayedClients.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} className="px-4 py-16 text-center">
                                                <div className="flex flex-col items-center gap-3">
                                                    <Users className="h-10 w-10 text-muted-foreground/30" />
                                                    <p className="text-sm text-muted-foreground">No clients yet</p>
                                                    <p className="text-xs text-muted-foreground">Click "Add Client" to create your first client</p>
                                                </div>
                                            </td>
                                        </tr>
                                    ) : (
                                        displayedClients.map((client, idx) => (
                                            <motion.tr 
                                                key={client.id}
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                transition={{ delay: idx * 0.02 }}
                                                className={cn(
                                                    "group hover:bg-muted/30 transition-colors", 
                                                    client.isPending && "bg-primary/5"
                                                )}
                                            >
                                                {/* Client Name */}
                                                <td className="px-4 py-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-9 h-9 rounded-full bg-muted border border-border flex items-center justify-center overflow-hidden">
                                                            {client.photoURL ? (
                                                                <Image src={client.photoURL} alt={client.displayName || "User"} width={36} height={36} className="w-full h-full object-cover" />
                                                            ) : (
                                                                <span className="text-sm font-semibold text-primary">{client.displayName?.[0]}</span>
                                                            )}
                                                        </div>
                                                        <div>
                                                            <p className="text-sm font-medium text-foreground">{client.displayName}</p>
                                                            {client.phoneNumber && (
                                                                <p className="text-xs text-muted-foreground">+91 {client.phoneNumber}</p>
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>
                                                
                                                {/* Email */}
                                                <td className="px-4 py-4">
                                                    <button 
                                                        onClick={() => { navigator.clipboard.writeText(client.email); toast.success("Email copied"); }}
                                                        className="flex items-center gap-2 group/copy"
                                                    >
                                                        <span className="text-sm text-muted-foreground group-hover/copy:text-foreground transition-colors">{client.email}</span>
                                                        <Copy className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover/copy:opacity-100 transition-opacity" />
                                                    </button>
                                                </td>
                                                
                                                {/* Password */}
                                                <td className="px-4 py-4">
                                                    {client.initialPassword ? (
                                                        <button 
                                                            onClick={() => { navigator.clipboard.writeText(client.initialPassword); toast.success("Password copied"); }}
                                                            className="flex items-center gap-2 group/pass"
                                                        >
                                                            <span className="font-mono text-xs bg-primary/10 text-primary px-2 py-1 rounded border border-primary/20">{client.initialPassword}</span>
                                                            <Copy className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover/pass:opacity-100 transition-opacity" />
                                                        </button>
                                                    ) : (
                                                        <span className="text-xs text-muted-foreground">Not available</span>
                                                    )}
                                                </td>
                                                
                                                {/* Project Manager */}
                                                <td className="px-4 py-4">
                                                    {(() => {
                                                        const pm = projectManagers.find(p => p.uid === client.managedByPM);
                                                        if (!pm) return client.isPending ? (
                                                            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium bg-muted text-muted-foreground border border-border">
                                                                <UserCog className="h-3 w-3" /> Pending...
                                                            </span>
                                                        ) : (
                                                            <div className="relative">
                                                                <select
                                                                    defaultValue=""
                                                                    disabled={assigningPM === client.id}
                                                                    onChange={(e) => handleAssignPM(client.id, e.target.value)}
                                                                    className="appearance-none h-8 pl-3 pr-8 rounded-lg border border-dashed border-amber-500/40 bg-amber-500/5 text-xs font-medium text-amber-500 focus:outline-none focus:border-amber-500/70 cursor-pointer disabled:opacity-50 transition-colors hover:border-amber-500/60"
                                                                >
                                                                    <option value="" disabled>
                                                                        {assigningPM === client.id ? 'Assigning...' : '+ Assign PM'}
                                                                    </option>
                                                                    {projectManagers.map(p => (
                                                                        <option key={p.uid} value={p.uid}>
                                                                            {p.displayName}{p.availabilityStatus === 'online' ? ' ●' : p.availabilityStatus === 'sleep' ? ' ◐' : ' ○'}
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-amber-500 pointer-events-none" />
                                                            </div>
                                                        );
                                                        const statusIcon = pm.availabilityStatus === 'online'
                                                            ? <Wifi className="h-3 w-3 text-emerald-500" />
                                                            : pm.availabilityStatus === 'sleep'
                                                            ? <Moon className="h-3 w-3 text-amber-400" />
                                                            : <WifiOff className="h-3 w-3 text-muted-foreground" />;
                                                        const dotColor = pm.availabilityStatus === 'online'
                                                            ? 'bg-emerald-500'
                                                            : pm.availabilityStatus === 'sleep'
                                                            ? 'bg-amber-400'
                                                            : 'bg-zinc-500';
                                                        return (
                                                            <div className="flex items-center gap-2">
                                                                <div className="relative flex-shrink-0">
                                                                    <div className="w-7 h-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                                                                        <span className="text-[10px] font-bold text-primary">{pm.displayName?.[0]?.toUpperCase()}</span>
                                                                    </div>
                                                                    <span className={cn("absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-background", dotColor)} />
                                                                </div>
                                                                <div>
                                                                    <p className="text-xs font-semibold text-foreground leading-tight">{pm.displayName}</p>
                                                                    <div className="flex items-center gap-1 mt-0.5">
                                                                        {statusIcon}
                                                                        <span className="text-[10px] text-muted-foreground capitalize">{pm.availabilityStatus || 'offline'}</span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })()}
                                                </td>

                                                {/* Status */}
                                                <td className="px-4 py-4">
                                                    {client.isPending ? (
                                                        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-600 border border-amber-500/20">
                                                            <RefreshCw className="h-3 w-3 animate-spin" />
                                                            Setting up...
                                                        </span>
                                                    ) : client.deletionRequested ? (
                                                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-500/10 text-red-600 border border-red-500/20">
                                                            Deletion Requested
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                                                            Active
                                                        </span>
                                                    )}
                                                </td>
                                                
                                                {/* Actions */}
                                                <td className="px-4 py-4">
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <button className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                                                                <MoreHorizontal className="h-4 w-4" />
                                                            </button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end" className="w-48">
                                                            <DropdownMenuLabel className="text-xs text-muted-foreground">Actions</DropdownMenuLabel>
                                                            <DropdownMenuSeparator />
                                                            <DropdownMenuItem className="text-sm cursor-pointer">
                                                                <Briefcase className="mr-2 h-4 w-4" /> View History
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem
                                                                onClick={() => {
                                                                    setEditingClientId(client.id);
                                                                    setEditingPrices(client.customRates || {
                                                                        "Reel Format": 500,
                                                                        "Long Video": 1000,
                                                                        "Documentary": 1200,
                                                                        "Podcast Edit": 1000,
                                                                        "Motion Graphic": 1500,
                                                                        "Cinematic Event": 2000
                                                                    });
                                                                }}
                                                                className="text-sm cursor-pointer"
                                                            >
                                                                <IndianRupee className="mr-2 h-4 w-4" /> Edit Pricing
                                                            </DropdownMenuItem>
                                                            <DropdownMenuSeparator />
                                                            <DropdownMenuItem 
                                                                onClick={() => handleRequestDeletion(client.id)}
                                                                className="text-sm cursor-pointer text-red-500"
                                                            >
                                                                <Trash2 className="mr-2 h-4 w-4" /> Request Deletion
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </td>
                                            </motion.tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Table Footer */}
                        <div className="px-4 py-3 border-t border-border bg-muted/30">
                            <span className="text-xs text-muted-foreground">
                                Showing {displayedClients.length} client{displayedClients.length !== 1 ? 's' : ''}
                            </span>
                        </div>
                    </motion.div>
                </AnimatePresence>
            </div>
        </div>
    );
}
