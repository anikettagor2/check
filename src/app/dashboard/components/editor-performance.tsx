"use client";

import { useState, useEffect } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { Project, User, Revision } from "@/types/schema";
import { motion } from "framer-motion";
import { Activity, Clock, Layers, Star, TrendingUp, AlertTriangle, RefreshCw, BarChart, User as UserIcon, MapPin, Mail, Phone, Calendar, IndianRupee, Briefcase, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import Image from "next/image";

function IndicatorCard({ label, value, subtext, icon, alert, trend, trendUp }: any) {
    return (
        <motion.div 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ y: -4, transition: { duration: 0.2 } }}
            className={cn(
                "group relative bg-card shadow-lg border border-border p-6 rounded-2xl transition-all duration-300",
                alert && "after:absolute after:inset-0 after:rounded-2xl after:ring-2 after:ring-red-500/40 after:animate-pulse"
            )}
        >
            <div className="flex justify-between items-start mb-6">
                <div className="h-10 w-10 bg-muted border border-border rounded-xl flex items-center justify-center text-muted-foreground group-hover:text-primary group-hover:border-primary/30 transition-all duration-500 shadow-inner">
                    {icon}
                </div>
            </div>
            
            <div className="space-y-1">
                <span className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground group-hover:text-foreground transition-colors">{label}</span>
                <div className="flex flex-col">
                    <span className="text-3xl font-black tracking-tighter text-foreground font-heading tabular-nums leading-none">{value}</span>
                </div>
                
                <div className="flex items-center gap-3 pt-4 border-t border-border mt-4">
                    <span className="text-muted-foreground text-[10px] font-bold uppercase tracking-wider">{subtext}</span>
                </div>
            </div>
        </motion.div>
    );
}

export function EditorPerformance({ user, projects }: { user: User, projects: Project[] }) {
    const [revisions, setRevisions] = useState<Revision[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let isMounted = true;
        const fetchRevisions = async () => {
            if (!user?.uid) return;
            try {
                // Fetch revisions uploaded by this editor
                const q = query(collection(db, "revisions"), where("uploadedBy", "==", user.uid));
                const snap = await getDocs(q);
                if (isMounted) {
                    setRevisions(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Revision)));
                    setLoading(false);
                }
            } catch (err) {
                console.error("Failed to fetch revisions", err);
                if (isMounted) setLoading(false);
            }
        };
        fetchRevisions();
        return () => { isMounted = false; };
    }, [user]);

    const completedProjects = projects.filter(p => ['completed', 'approved'].includes(p.status));
    const totalCompleted = completedProjects.length;

    // Avg Delivery Time
    const avgDeliveryHours = totalCompleted > 0 
        ? completedProjects.reduce((acc, p) => {
            const ms = Math.min((p.updatedAt || Date.now()) - p.createdAt, 30 * 24 * 60 * 60 * 1000); 
            return acc + (ms / (1000 * 60 * 60));
        }, 0) / totalCompleted 
        : 0;

    const avgDeliveryTimeStr = avgDeliveryHours > 24 
        ? `${(avgDeliveryHours / 24).toFixed(1)} Days` 
        : `${avgDeliveryHours.toFixed(1)} Hours`;

    // Delays
    const delayedProjects = projects.filter(p => {
        if (!p.deadline) return false;
        const deadlineMs = new Date(p.deadline).getTime();
        const finishTime = ['completed', 'approved'].includes(p.status) ? p.updatedAt : Date.now();
        return finishTime > deadlineMs;
    });
    const delayCount = delayedProjects.length;

    // On Time %
    const ratedForTime = completedProjects.filter(p => !!p.deadline);
    const onTimePercentage = ratedForTime.length > 0 
        ? Math.round(((ratedForTime.length - delayCount) / ratedForTime.length) * 100)
        : 100;

    // Client Rating
    const ratedProjects = projects.filter(p => p.editorRating && p.editorRating > 0);
    const avgClientRating = ratedProjects.length > 0 
        ? (ratedProjects.reduce((acc, p) => acc + (p.editorRating || 0), 0) / ratedProjects.length).toFixed(1)
        : "N/A";

    if (loading) {
        return (
            <div className="flex h-64 items-center justify-center">
                <RefreshCw className="h-6 w-6 text-primary animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-500 pt-8">
            
            {/* Editor Detail Header */}
            <div className="bg-card border border-border rounded-3xl p-8 shadow-xl flex flex-col md:flex-row gap-8 items-start relative overflow-hidden">
                <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none">
                    <UserIcon className="h-40 w-40 text-primary" />
                </div>
                
                <div className="h-32 w-32 rounded-2xl bg-muted border-2 border-border overflow-hidden shrink-0 flex items-center justify-center text-4xl font-bold text-muted-foreground shadow-inner">
                    {user.photoURL ? (
                        <Image src={user.photoURL} alt={user.displayName || "User"} width={128} height={128} className="w-full h-full object-cover" />
                    ) : (
                        user.displayName?.[0] || '?'
                    )}
                </div>
                
                <div className="flex-1 space-y-6 relative z-10 w-full">
                    <div>
                        <h2 className="text-3xl font-black font-heading text-foreground tracking-tight">{user.displayName || 'Editor Profile'}</h2>
                        <div className="flex flex-wrap items-center gap-4 mt-2">
                            <span className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground uppercase tracking-widest bg-muted px-2.5 py-1 rounded-md border border-border">
                                <Mail className="h-3.5 w-3.5" />
                                {user.email || 'N/A'}
                            </span>
                            <span className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground uppercase tracking-widest bg-muted px-2.5 py-1 rounded-md border border-border">
                                <Phone className="h-3.5 w-3.5" />
                                {user.phoneNumber || user.whatsappNumber || 'N/A'}
                            </span>
                            <span className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground uppercase tracking-widest bg-muted px-2.5 py-1 rounded-md border border-border">
                                <MapPin className="h-3.5 w-3.5" />
                                {user.location || 'Global'}
                            </span>
                            <span className="flex items-center gap-1.5 text-[10px] font-black text-primary uppercase tracking-widest bg-primary/10 px-2.5 py-1 rounded-md border border-primary/20">
                                <Calendar className="h-3 w-3" />
                                Joined: {new Date(user.createdAt).toLocaleDateString()}
                            </span>
                        </div>
                    </div>
                    
                    <div className="space-y-3">
                        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Skill Vectors & Rates</h3>
                        <div className="flex flex-wrap gap-3">
                            {user.skills && user.skills.length > 0 ? (
                                user.skills.map(skill => (
                                    <div key={skill} className="flex flex-col bg-background border border-border rounded-lg p-2.5 shadow-sm">
                                        <span className="text-[10px] font-bold text-foreground uppercase tracking-widest flex items-center gap-1.5">
                                            <Zap className="h-3 w-3 text-amber-500" />
                                            {skill}
                                        </span>
                                        <span className="text-xs font-black text-emerald-500 mt-1">
                                            {user.skillPrices?.[skill] ? `₹${user.skillPrices[skill]}` : 'Negotiable'}
                                        </span>
                                    </div>
                                ))
                            ) : (
                                <span className="text-xs text-muted-foreground font-medium">No specialized skills listed.</span>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Performance KPIs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                <IndicatorCard 
                    label="Projects Done" 
                    value={totalCompleted} 
                    icon={<Layers className="h-4 w-4 text-blue-500" />}
                    subtext="All time completed"
                />
                <IndicatorCard 
                    label="Avg Delivery" 
                    value={totalCompleted === 0 ? "N/A" : avgDeliveryTimeStr} 
                    icon={<Clock className="h-4 w-4 text-purple-500" />}
                    subtext="Turnaround time"
                />
                <IndicatorCard 
                    label="Total Drafts" 
                    value={revisions.length} 
                    icon={<Activity className="h-4 w-4 text-orange-500" />}
                    subtext="Revisions uploaded"
                />
                <IndicatorCard 
                    label="Total Delays" 
                    value={delayCount} 
                    alert={delayCount > 3}
                    icon={<AlertTriangle className={cn("h-4 w-4", delayCount > 0 ? "text-red-500" : "text-zinc-500")} />}
                    subtext="Missed deadlines"
                />
                <IndicatorCard 
                    label="Avg Rating" 
                    value={avgClientRating} 
                    icon={<Star className="h-4 w-4 text-amber-400 fill-amber-400" />}
                    subtext="Client feedback"
                />
                <IndicatorCard 
                    label="On-Time Rate" 
                    value={`${onTimePercentage}%`} 
                    icon={<TrendingUp className="h-4 w-4 text-emerald-500" />}
                    subtext="Deadline hit rate"
                />
            </div>
            
            {/* Detailed Project History for this Editor */}
            <div className="space-y-4">
                <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground pl-1">Project History Log</h3>
                <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-lg">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="bg-muted/30">
                                    <th className="px-6 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest border-b border-border">Project</th>
                                    <th className="px-6 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest border-b border-border">Date</th>
                                    <th className="px-6 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest border-b border-border text-center">Status</th>
                                    <th className="px-6 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest border-b border-border text-center">Rating</th>
                                    <th className="px-6 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest border-b border-border text-right">Income</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {projects.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground font-medium text-sm">
                                            No projects assigned yet.
                                        </td>
                                    </tr>
                                ) : (
                                    projects.map(p => {
                                        const isDone = ['completed', 'approved'].includes(p.status);
                                        
                                        return (
                                            <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                                                <td className="px-6 py-4">
                                                    <div className="flex flex-col">
                                                        <span className="text-sm font-bold text-foreground">{p.name}</span>
                                                        <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">ID: {p.id.slice(0,8)}</span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-xs font-bold text-muted-foreground">
                                                    {new Date(p.createdAt).toLocaleDateString()}
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <span className={cn(
                                                        "text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded",
                                                        isDone ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20" : "bg-blue-500/10 text-blue-500 border border-blue-500/20"
                                                    )}>
                                                        {isDone ? "Delivered" : "In Progress"}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    {p.editorRating ? (
                                                        <div className="flex items-center justify-center gap-1">
                                                            <Star className="h-3 w-3 text-amber-400 fill-amber-400" />
                                                            <span className="text-sm font-bold tabular-nums">{p.editorRating}</span>
                                                        </div>
                                                    ) : (
                                                        <span className="text-xs text-muted-foreground">-</span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <span className="text-sm font-black tabular-nums">
                                                        ₹{p.editorPrice?.toLocaleString() || 0}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
            
        </div>
    );
}
