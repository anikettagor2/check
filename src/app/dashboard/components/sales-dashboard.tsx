"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/context/auth-context";
import { 
    Loader2, 
    UserPlus, 
    Mail, 
    Lock, 
    User as UserIcon, 
    LogOut, 
    RefreshCw, 
    Copy, 
    ExternalLink, 
    Shield,
    Search,
    Filter,
    CheckCircle2,
    Clock,
    MoreHorizontal,
    ArrowUpRight,
    ArrowDownLeft,
    AlertCircle,
    Briefcase,
    Plus,
    ChevronDown,
    IndianRupee,
    Zap,
    Monitor,
    Globe,
    Activity,
    Database,
    ShieldCheck,
    Users,
    Key,
    Smartphone,
    Terminal,
    Cpu
} from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/firebase/config";
import { collection, query, where, onSnapshot, orderBy, doc, updateDoc, getDocs } from "firebase/firestore";
import { User } from "@/types/schema";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
    DropdownMenuLabel
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";

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
        "Short Videos": 500,
        "Long Videos": 1000,
        "Reels": 500,
        "Graphics Videos": 1500,
        "Ads/UGC Videos": 2000
    });
    const [allowedFormats, setAllowedFormats] = useState<Record<string, boolean>>({
        "Short Videos": false,
        "Long Videos": false,
        "Reels": false,
        "Graphics Videos": false,
        "Ads/UGC Videos": false
    });
    const [pendingClients, setPendingClients] = useState<any[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [projectManagers, setProjectManagers] = useState<User[]>([]);
    const [assignedPM, setAssignedPM] = useState<string>("automatic");

    const VIDEO_TYPES_LABELS = [
        "Short Videos", "Long Videos", "Reels", "Graphics Videos", "Ads/UGC Videos"
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
        toast.info("Secure access key generated");
    };

    const handleCreateClient = async (e: React.FormEvent) => {
        e.preventDefault();
        const backup = { name, email, password, customRates, allowedFormats, payLaterEligible, assignedPM };
        const tempId = `temp-${Date.now()}`;
        
        let finalPMId = backup.assignedPM;
        
        setIsLoading(true);
        
        if (finalPMId === "automatic") {
            try {
                // Find all online PMs
                const onlinePMs = projectManagers.filter(pm => pm.availabilityStatus === 'online');
                
                if (onlinePMs.length > 0) {
                    // Get all active projects to calculate load
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
                    
                    // Filter PMs who are below their maxProjectLimit (default to 10 if not set)
                    const availablePMs = onlinePMs.filter(pm => {
                        const limit = pm.maxProjectLimit || 10; // Default limit
                        return pmLoad[pm.uid] < limit;
                    });
                    
                    if (availablePMs.length > 0) {
                        // Pick the one with the lowest load
                        availablePMs.sort((a, b) => pmLoad[a.uid] - pmLoad[b.uid]);
                        finalPMId = availablePMs[0].uid;
                    } else {
                        toast.error("No online Project Managers have available capacity. Proceeding without PM assignment.");
                        finalPMId = "";
                    }
                } else {
                    toast.error("No Project Managers are currently online. Proceeding without PM assignment.");
                    finalPMId = "";
                }
            } catch (err) {
                console.error("Auto PM assignment error:", err);
                toast.error("Failed to automatically assign PM. Proceeding without PM.");
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
            
            // Assign PM explicitly after creation
            if (finalPMId && finalPMId !== "automatic") {
                await updateDoc(doc(db, "users", data.user.uid), {
                    managedByPM: finalPMId,
                    updatedAt: Date.now()
                });
            }

            toast.success(`Client initialized: ${backup.name}`);
            setIsCreateOpen(false);

        } catch (error: any) {
            toast.error(error.message);
            setPendingClients(prev => prev.filter(c => c.id !== tempId));
        } finally {
            setIsLoading(false);
        }
    };

    const handleAssignPM = async (clientId: string, pmId: string) => {
        try {
            const clientRef = doc(db, "users", clientId);
            await updateDoc(clientRef, {
                managedByPM: pmId,
                updatedAt: Date.now()
            });
            toast.success("Project Manager assigned successfully");
        } catch (error: any) {
            toast.error("Assignment failed: " + error.message);
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
            toast.success("Deletion request sent to admin.");
        } catch (err: any) {
            toast.error("Failed to request deletion: " + err.message);
        }
    };

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
                            <span className="text-[10px] font-bold text-primary uppercase tracking-widest">Sales Dashboard</span>
                        </div>
                    </div>
                    <h1 className="text-4xl md:text-5xl font-heading font-bold tracking-tight text-foreground leading-tight">Sales <span className="text-muted-foreground">Portfolio</span></h1>
                    <div className="flex items-center gap-6 pt-2">
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <UserIcon className="h-3.5 w-3.5" />
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Executive: {user?.displayName?.split(' ')[0]}</span>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground">
                            <ShieldCheck className="h-3.5 w-3.5" />
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Sales Auth: Level 3</span>
                        </div>
                    </div>
                </motion.div>

                <motion.div
                   initial={{ opacity: 0, x: 20 }}
                   animate={{ opacity: 1, x: 0 }}
                   className="flex items-center gap-3"
                >
                    <button
                        onClick={() => setIsCreateOpen(!isCreateOpen)}
                        className={cn(
                            "flex items-center gap-2.5 h-10 px-5 rounded-lg text-[11px] font-bold uppercase tracking-widest transition-all",
                            isCreateOpen 
                                ? "bg-muted text-foreground border border-border hover:bg-muted/80" 
                                : "bg-primary text-primary-foreground shadow-lg hover:opacity-90 active:scale-[0.98]"
                        )}
                    >
                        {isCreateOpen ? (
                            <>Abort Initialization</>
                        ) : (
                            <>
                                <UserPlus className="h-4 w-4" />
                                Add Client
                            </>
                        )}
                    </button>
                </motion.div>
            </div>

            {/* Statistics Row */}
            {!isCreateOpen && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <IndicatorCard 
                        label="Portfolio Index" 
                        value={myClients.length} 
                        icon={<Users className="h-4 w-4" />}
                        subtext="Assigned entities"
                    />
                    <IndicatorCard 
                        label="Pending Authorization" 
                        value={pendingClients.length} 
                        alert={pendingClients.length > 0}
                        icon={<Database className="h-4 w-4" />}
                        subtext="Gathering data"
                    />
                    <IndicatorCard 
                        label="Acquisition Revenue" 
                        value="₹0" 
                        icon={<IndianRupee className="h-4 w-4" />}
                        subtext="LTV verified"
                    />
                    <IndicatorCard 
                        label="Ecosystem Reach" 
                        value="Global" 
                        icon={<Globe className="h-4 w-4" />}
                        subtext="Multi-node distribution"
                    />
                </div>
            )}

            <div className="grid lg:grid-cols-12 gap-8 items-start">
                 <AnimatePresence mode="popLayout">
                 {/* Initialization Form */}
                 {isCreateOpen && (
                     <motion.div 
                        key="creation-form"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="lg:col-span-5 bg-card/40 backdrop-blur-sm border border-border p-8 rounded-2xl relative overflow-hidden group/form"
                    >
                        <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none group-hover/form:opacity-10 transition-opacity">
                            <Zap className="h-32 w-32 text-primary blur-2xl" />
                        </div>
                        
                        <div className="flex items-center gap-2.5 mb-8">
                            <div className="p-1.5 rounded bg-primary/20 border border-primary/30">
                                <ShieldCheck className="h-4 w-4 text-primary" />
                            </div>
                            <h3 className="text-[11px] font-bold text-foreground/90 uppercase tracking-widest">Initialize Entity</h3>
                        </div>
                        
                        <form onSubmit={handleCreateClient} className="space-y-6 relative z-10">
                            <div className="space-y-2">
                                <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Client Identity</Label>
                                <input 
                                    placeholder="Entity Full Name" 
                                    value={name} 
                                    onChange={e => setName(e.target.value)} 
                                    required 
                                    className="w-full h-11 px-4 rounded-lg border border-border bg-muted/50 text-sm text-foreground focus:border-primary/50 focus:outline-none transition-all placeholder:text-muted-foreground font-medium"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Auth Endpoint (Email)</Label>
                                <input 
                                    type="email" 
                                    placeholder="endpoint@client.hub" 
                                    value={email} 
                                    onChange={e => setEmail(e.target.value)} 
                                    required 
                                    className="w-full h-11 px-4 rounded-lg border border-border bg-muted/50 text-sm text-foreground focus:border-primary/50 focus:outline-none transition-all placeholder:text-muted-foreground font-medium"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Network Contact (Phone)</Label>
                                <div className="flex gap-3">
                                    <div className="flex items-center justify-center h-11 px-3 bg-muted/50 border border-border rounded-lg text-[10px] font-bold text-muted-foreground tracking-widest">+91</div>
                                    <input 
                                        type="tel" 
                                        placeholder="Operational Mobile" 
                                        value={phone} 
                                        onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} 
                                        required 
                                        className="w-full h-11 px-4 rounded-lg border border-border bg-muted/50 text-sm text-foreground focus:border-primary/50 focus:outline-none transition-all placeholder:text-muted-foreground font-medium"
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Access Key</Label>
                                <div className="flex gap-2">
                                    <input 
                                        type="text" 
                                        placeholder="Min 6 characters" 
                                        value={password} 
                                        onChange={e => setPassword(e.target.value)} 
                                        required 
                                        className="w-full h-11 px-4 rounded-lg border border-border bg-muted/50 text-sm text-foreground font-mono focus:border-primary/50 focus:outline-none transition-all placeholder:text-muted-foreground"
                                    />
                                    <button type="button" onClick={generatePassword} className="h-11 w-11 flex items-center justify-center rounded-lg bg-muted/50 border border-border hover:bg-muted/50 transition-all group active:scale-[0.95]">
                                        <Key className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                                    </button>
                                </div>
                            </div>
                            
                            <div className="pt-6 border-t border-border">
                                <Label className="mb-4 block text-[10px] uppercase text-muted-foreground font-bold tracking-widest ml-1">Asset Pricing Matrix</Label>
                                <div className="grid gap-3">
                                    {VIDEO_TYPES_LABELS.map((type) => (
                                        <div key={type} className={cn(
                                            "flex items-center justify-between p-3.5 rounded-xl border transition-all", 
                                            allowedFormats[type] 
                                                ? "bg-primary/[0.05] border-primary/30" 
                                                : "bg-muted/50 border-border opacity-40 grayscale"
                                        )}>
                                            <div className="flex items-center gap-3">
                                                <input 
                                                    type="checkbox" 
                                                    checked={allowedFormats[type]} 
                                                    onChange={(e) => setAllowedFormats({...allowedFormats, [type]: e.target.checked})}
                                                    className="h-4 w-4 rounded border-border bg-card text-primary focus:ring-primary/40 transition-all cursor-pointer"
                                                />
                                                <span className="text-[11px] font-bold text-foreground/80 uppercase tracking-widest">{type}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] text-muted-foreground font-bold">₹</span>
                                                <input 
                                                    disabled={!allowedFormats[type]}
                                                    className="h-8 w-20 text-xs font-bold bg-transparent border-none text-foreground focus:ring-0 text-right pr-0 disabled:opacity-30 tabular-nums" 
                                                    value={customRates[type]} 
                                                    onChange={(e) => setCustomRates({...customRates, [type]: parseInt(e.target.value) || 0})}
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="pt-6 border-t border-border flex items-center justify-between">
                                <div className="space-y-1">
                                    <Label className="text-[10px] uppercase text-muted-foreground font-bold tracking-widest ml-1">Pay Later Authority</Label>
                                    <p className="text-[10px] text-muted-foreground font-medium ml-1">Enable deferred payment options for this client.</p>
                                </div>
                                <input 
                                    type="checkbox" 
                                    checked={payLaterEligible} 
                                    onChange={(e) => setPayLaterEligible(e.target.checked)}
                                    className="h-5 w-5 rounded border-border bg-card text-primary focus:ring-primary/40 transition-all cursor-pointer"
                                />
                            </div>

                            <div className="pt-6 border-t border-border">
                                <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground ml-1">Project Manager Assignment</Label>
                                <p className="text-[10px] text-muted-foreground font-medium ml-1 mb-3">Assign a Project Manager to automatically handle projects from this client.</p>
                                <div className="relative">
                                    <select
                                        value={assignedPM}
                                        onChange={(e) => setAssignedPM(e.target.value)}
                                        className="w-full h-11 px-4 rounded-lg border border-border bg-muted/50 text-sm text-foreground focus:border-primary/50 focus:outline-none transition-all font-medium appearance-none"
                                    >
                                        <option value="automatic" className="bg-card">Auto-Assign (Based on availability & load)</option>
                                        {projectManagers.map(pm => (
                                            <option key={pm.uid} value={pm.uid} className="bg-card">
                                                {pm.displayName} 
                                                {pm.availabilityStatus === 'online' ? ' (Online)' : pm.availabilityStatus === 'sleep' ? ' (Away)' : ' (Offline)'}
                                            </option>
                                        ))}
                                    </select>
                                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                                </div>
                            </div>

                            <button 
                                type="submit" 
                                className="w-full h-12 bg-primary  text-primary-foreground text-[11px] font-bold uppercase tracking-widest rounded-lg shadow-xl hover:bg-zinc-200 transition-all active:scale-[0.98] disabled:opacity-20 flex items-center justify-center gap-2" 
                                disabled={isLoading}
                            >
                                {isLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                                {isLoading ? "INITIALIZING..." : "COMMIT INITIALIZATION"}
                            </button>
                        </form>
                     </motion.div>
                 )}

                 {/* Operational Client Database */}
                 <motion.div 
                    layout
                    className={cn(
                        "enterprise-card bg-card/40 backdrop-blur-sm overflow-hidden", 
                        isCreateOpen ? "lg:col-span-7" : "lg:col-span-12"
                    )}
                 >
                      {/* Search & Tool Layer */}
                      <div className="p-6 border-b border-border flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                        <div className="relative w-full sm:w-96">
                             <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground transition-colors" />
                             <input 
                                type="text"
                                placeholder="Locate entity in database..." 
                                className="h-10 w-full rounded-lg border border-border bg-muted/50 pl-11 pr-4 text-xs font-medium text-foreground focus:bg-muted/50 focus:border-primary/50 focus:outline-none transition-all placeholder:text-muted-foreground"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <div className="flex items-center gap-4">
                             <div className="hidden sm:flex items-center gap-2.5">
                                 <Monitor className="h-3.5 w-3.5 text-muted-foreground" />
                                 <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Index Scale: {displayedClients.length} Units</span>
                             </div>
                             <div className="h-4 w-px bg-card" />
                             <button className="h-10 px-5 rounded-lg border border-border bg-muted/50 text-[11px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-all flex items-center gap-2">
                                 <Filter className="h-3.5 w-3.5" /> Operations Filter
                             </button>
                        </div>
                      </div>

                      <div className="overflow-x-auto">
                           <table className="w-full text-left">
                                 <thead>
                                     <tr className="bg-muted/30">
                                         <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-widest border-b border-border">Entity Identity</th>
                                         <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-widest border-b border-border">Auth Endpoint</th>
                                         <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-widest border-b border-border">Primary Key</th>
                                         <th className="px-6 py-4 border-b border-border w-[80px]"></th>
                                     </tr>
                                 </thead>
                                 <tbody className="divide-y divide-border">
                                     {displayedClients.length === 0 ? (
                                         <tr>
                                             <td colSpan={4} className="px-6 py-24 text-center">
                                                 <div className="flex flex-col items-center gap-4 opacity-30">
                                                     <Globe className="h-12 w-12 text-muted-foreground" />
                                                     <p className="text-sm font-medium text-muted-foreground uppercase tracking-widest">Index Null: No Entities found</p>
                                                 </div>
                                             </td>
                                         </tr>
                                     ) : (
                                         displayedClients.map((client, idx) => (
                                             <motion.tr 
                                                 key={client.id}
                                                 initial={{ opacity: 0, y: 10 }}
                                                 animate={{ opacity: 1, y: 0 }}
                                                 transition={{ delay: idx * 0.05 }}
                                                 className={cn(
                                                     "group hover:bg-muted/10 transition-colors relative", 
                                                     client.isPending && "bg-primary/5"
                                                 )}
                                             >
                                                 <td className="px-6 py-6 transition-all duration-300 group-hover:pl-8">
                                                     <div className="flex items-center gap-4">
                                                         <div className="w-10 h-10 rounded bg-muted border border-border text-primary flex items-center justify-center font-bold text-xs uppercase shadow-2xl group-hover:scale-105 transition-transform overflow-hidden">
                                                             {client.photoURL ? <Image src={client.photoURL} alt={client.displayName || "User"} width={40} height={40} className="w-full h-full object-cover" /> : client.displayName?.[0]}
                                                         </div>
                                                         <div>
                                                             <div className="text-base font-bold text-foreground tracking-tight leading-tight">{client.displayName}</div>
                                                             <div className="flex items-center gap-2 mt-1">
                                                                  {client.isPending ? (
                                                                      <span className="text-[9px] text-primary font-bold uppercase tracking-widest animate-pulse">Initializing...</span>
                                                                  ) : (
                                                                      <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest">Auth Authorized</span>
                                                                  )}
                                                             </div>
                                                         </div>
                                                     </div>
                                                 </td>
                                                 <td className="px-6 py-6">
                                                      <div className="flex items-center gap-2 group/copy cursor-pointer w-fit" onClick={() => { navigator.clipboard.writeText(client.email); toast.success("Endpoint copied"); }}>
                                                         <span className="text-sm font-medium text-muted-foreground group-hover:text-foreground/90 transition-colors">{client.email}</span>
                                                         <Copy className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover/copy:opacity-100 transition-opacity" />
                                                      </div>
                                                 </td>
                                                 <td className="px-6 py-6">
                                                     {client.initialPassword ? (
                                                         <div className="flex items-center gap-3 group/pass cursor-pointer w-fit" onClick={() => { navigator.clipboard.writeText(client.initialPassword); toast.success("Access key copied"); }}>
                                                             <span className="font-mono text-[11px] text-primary bg-primary/10 px-2.5 py-1 rounded border border-primary/20 transition-all group-hover:shadow-[0_0_10px_rgba(var(--primary),0.3)]">{client.initialPassword}</span>
                                                             <Copy className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover/pass:opacity-100 transition-opacity" />
                                                         </div>
                                                     ) : (
                                                         <span className="text-muted-foreground text-[9px] font-bold uppercase tracking-widest">ENCRYPTED_KEY</span>
                                                     )}
                                                 </td>
                                                 <td className="px-6 py-6 text-right">
                                                     <DropdownMenu>
                                                         <DropdownMenuTrigger asChild>
                                                             <button className="h-9 w-9 flex items-center justify-center rounded-lg hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-all active:scale-[0.98]"><MoreHorizontal className="h-4 w-4" /></button>
                                                         </DropdownMenuTrigger>
                                                         <DropdownMenuContent align="end" className="w-56 bg-popover border-border p-1.5 rounded-xl shadow-2xl">
                                                             <DropdownMenuLabel className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest px-3 py-2">Operational Actions</DropdownMenuLabel>
                                                             <DropdownMenuSeparator className="my-1 bg-border" />
                                                             <DropdownMenuItem className="p-2.5 text-xs text-popover-foreground hover:bg-muted transition-colors cursor-pointer rounded-lg"><Briefcase className="mr-2.5 h-3.5 w-3.5 text-muted-foreground" /> Inspect History</DropdownMenuItem>
                                                             <DropdownMenuSeparator className="my-1 bg-border" />
                                                             <DropdownMenuItem onClick={() => handleRequestDeletion(client.id)} className="p-2.5 text-xs text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer rounded-lg"><LogOut className="mr-2.5 h-3.5 w-3.5" /> Request Delete Authorization</DropdownMenuItem>
                                                         </DropdownMenuContent>
                                                     </DropdownMenu>
                                                 </td>
                                             </motion.tr>
                                         ))
                                     )}
                                 </tbody>
                           </table>
                      </div>

                       <div className="p-6 border-t border-border bg-muted/30 flex items-center justify-between">
                             <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
                                 Ecosystem State: {displayedClients.length} assigned units
                             </span>
                             <div className="flex items-center gap-2">
                                 <button className="h-9 px-4 rounded-lg border border-border bg-muted/50 text-[10px] font-bold text-muted-foreground uppercase tracking-widest hover:text-foreground disabled:opacity-30 transition-all active:scale-[0.98]" disabled>Back</button>
                                 <button className="h-9 px-4 rounded-lg border border-border bg-muted/50 text-[10px] font-bold text-muted-foreground uppercase tracking-widest hover:text-foreground disabled:opacity-30 transition-all active:scale-[0.98]" disabled>Next</button>
                             </div>
                       </div>
                 </motion.div>
                 </AnimatePresence>
            </div>
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
