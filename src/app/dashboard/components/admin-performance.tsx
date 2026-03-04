"use client";

import { useState, useEffect } from "react";
import { collection, query, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { Project, User, Revision } from "@/types/schema";
import { motion } from "framer-motion";
import { Activity, Clock, Layers, Star, TrendingUp, AlertTriangle, RefreshCw, BarChart } from "lucide-react";
import { cn } from "@/lib/utils";
import Image from "next/image";

function IndicatorCard({ label, value, subtext, icon, alert }: any) {
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
            </div>
            
            <div className="space-y-1.5">
                <span className="text-[11px] uppercase font-bold tracking-widest text-muted-foreground group-hover:text-foreground transition-colors">{label}</span>
                <div className="flex items-end gap-3">
                    <span className="text-3xl font-black tracking-tight text-foreground font-heading tabular-nums">{value}</span>
                </div>
                
                <div className="flex items-center gap-3 pt-4 border-t border-border mt-4">
                    <span className="text-muted-foreground/60 text-[10px] font-bold uppercase tracking-wider">{subtext}</span>
                </div>
            </div>
        </motion.div>
    );
}

export function AdminPerformanceTab({ projects, users }: { projects: Project[], users: User[] }) {
    const [revisions, setRevisions] = useState<Revision[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let isMounted = true;
        const fetchRevisions = async () => {
            try {
                const snap = await getDocs(collection(db, "revisions"));
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
    }, []);

    const completedProjects = projects.filter(p => p.status === 'completed');
    const totalCompleted = completedProjects.length;

    // Avg Delivery Time
    const avgDeliveryHours = totalCompleted > 0 
        ? completedProjects.reduce((acc, p) => {
            const ms = Math.min((p.updatedAt || Date.now()) - p.createdAt, 30 * 24 * 60 * 60 * 1000); // cap to 30 days
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
        const finishTime = p.status === 'completed' ? p.updatedAt : Date.now();
        return finishTime > deadlineMs;
    });
    const delayCount = delayedProjects.length;

    // On Time %
    const ratedForTime = projects.filter(p => !!p.deadline);
    const onTimePercentage = ratedForTime.length > 0 
        ? Math.round(((ratedForTime.length - delayCount) / ratedForTime.length) * 100)
        : 100;

    // Client Rating
    const ratedProjects = projects.filter(p => p.editorRating && p.editorRating > 0);
    const avgClientRating = ratedProjects.length > 0 
        ? (ratedProjects.reduce((acc, p) => acc + (p.editorRating || 0), 0) / ratedProjects.length).toFixed(1)
        : "N/A";

    const editors = users.filter(u => u.role === 'editor' || u.role === 'admin' || u.role === 'manager'); // Any role that can be assigned a project

    if (loading) {
        return (
            <div className="flex h-64 items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <RefreshCw className="h-6 w-6 text-primary animate-spin" />
                    <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Compiling Performance Metrics...</p>
                </div>
            </div>
        );
    }

    return (
        <motion.div
            key="performance"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="p-8 space-y-6"
        >
            <div className="flex flex-col gap-2 mb-6">
                <h2 className="text-xl font-bold tracking-tight text-foreground mb-1 flex items-center gap-2">
                    <BarChart className="h-5 w-5 text-primary" />
                    Performance Analytics
                </h2>
                <p className="text-xs font-medium text-muted-foreground leading-relaxed max-w-2xl">
                    Detailed performance metrics across all operational units, including delivery timelines, revision cycles, and client satisfaction scores.
                </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-10">
                <IndicatorCard 
                    label="Completed Projects" 
                    value={totalCompleted} 
                    icon={<Layers className="h-4 w-4" />}
                    subtext="Total lifetime completions"
                />
                <IndicatorCard 
                    label="Avg Delivery Time" 
                    value={totalCompleted === 0 ? "N/A" : avgDeliveryTimeStr} 
                    icon={<Clock className="h-4 w-4" />}
                    subtext="Creation to delivery"
                />
                <IndicatorCard 
                    label="Total Revisions" 
                    value={revisions.length} 
                    icon={<Activity className="h-4 w-4" />}
                    subtext="All file versions"
                />
                <IndicatorCard 
                    label="Delay Count" 
                    value={delayCount} 
                    alert={delayCount > 5}
                    icon={<AlertTriangle className={cn("h-4 w-4", delayCount > 5 ? "text-red-500" : "")} />}
                    subtext="Projects missing deadlines"
                />
                <IndicatorCard 
                    label="Client Rating" 
                    value={avgClientRating} 
                    icon={<Star className="h-4 w-4 text-amber-400 fill-amber-400" />}
                    subtext="Average satisfaction"
                />
                <IndicatorCard 
                    label="On-Time %" 
                    value={`${onTimePercentage}%`} 
                    icon={<TrendingUp className="h-4 w-4 text-emerald-500" />}
                    subtext="Deadline hit rate"
                />
            </div>

            <div className="space-y-4">
                <h3 className="text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground pl-1">Editor Performance Matrix</h3>
                <div className="enterprise-card bg-card overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="bg-muted/30">
                                    <th className="px-6 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest border-b border-border">Editor Profile</th>
                                    <th className="px-6 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest border-b border-border text-center">Projects Done</th>
                                    <th className="px-6 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest border-b border-border text-center">Avg Delivery</th>
                                    <th className="px-6 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest border-b border-border text-center">Delays</th>
                                    <th className="px-6 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest border-b border-border text-center">Rating</th>
                                    <th className="px-6 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest border-b border-border text-center">On-Time %</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {editors.map(editor => {
                                    const assigned = projects.filter(p => p.assignedEditorId === editor.uid);
                                    if (assigned.length === 0) return null;

                                    const done = assigned.filter(p => p.status === 'completed');
                                    
                                    const eAvgHrs = done.length > 0
                                        ? done.reduce((acc, p) => acc + (Math.min((p.updatedAt || Date.now()) - p.createdAt, 30*24*60*60*1000) / (1000*60*60)), 0) / done.length
                                        : 0;
                                    const eAvgTime = eAvgHrs > 24 ? `${(eAvgHrs/24).toFixed(1)}d` : `${eAvgHrs.toFixed(1)}h`;

                                    const eDelayed = assigned.filter(p => {
                                        if (!p.deadline) return false;
                                        const d = new Date(p.deadline).getTime();
                                        const end = p.status === 'completed' ? p.updatedAt : Date.now();
                                        return end > d;
                                    }).length;

                                    const eRatedForTime = assigned.filter(p => !!p.deadline).length;
                                    const eOnTime = eRatedForTime > 0 ? Math.round(((eRatedForTime - eDelayed) / eRatedForTime) * 100) : 100;

                                    const eRated = assigned.filter(p => p.editorRating && p.editorRating > 0);
                                    const eRating = eRated.length > 0 ? (eRated.reduce((acc, p) => acc + p.editorRating!, 0) / eRated.length).toFixed(1) : "N/A";

                                    return (
                                        <tr key={editor.uid} className="hover:bg-muted/30 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="h-8 w-8 rounded bg-primary/10 border border-primary/20 flex items-center justify-center font-bold text-[10px] uppercase text-primary overflow-hidden shrink-0">
                                                        {editor.photoURL ? (
                                                            <Image src={editor.photoURL} alt="" width={32} height={32} className="w-full h-full object-cover" />
                                                        ) : (
                                                            editor.displayName?.[0] || '?'
                                                        )}
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="text-sm font-bold text-foreground">{editor.displayName || 'Unknown Editor'}</span>
                                                        <span className="text-[9px] font-bold text-muted-foreground uppercase opacity-80">{editor.email}</span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-center text-sm font-black tabular-nums">{done.length}</td>
                                            <td className="px-6 py-4 text-center text-xs font-bold text-muted-foreground">{done.length === 0 ? "-" : eAvgTime}</td>
                                            <td className="px-6 py-4 text-center">
                                                <span className={cn("text-xs font-bold px-2 py-0.5 rounded", eDelayed > 0 ? "bg-red-500/10 text-red-500" : "text-muted-foreground")}>
                                                    {eDelayed}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <div className="flex items-center justify-center gap-1">
                                                    <Star className={cn("h-3 w-3", eRating !== "N/A" ? "text-amber-400 fill-amber-400" : "text-muted-foreground")} />
                                                    <span className="text-sm font-bold tabular-nums">{eRating}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <span className={cn("text-xs font-black tabular-nums", eOnTime >= 90 ? "text-emerald-500" : eOnTime >= 70 ? "text-amber-500" : "text-red-500")}>
                                                    {eOnTime}%
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}
