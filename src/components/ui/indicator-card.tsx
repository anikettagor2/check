"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface IndicatorCardProps {
    label: string;
    value: string | number;
    subtext?: string;
    trend?: string;
    trendUp?: boolean;
    alert?: boolean;
    icon?: ReactNode;
    className?: string;
}

export function IndicatorCard({ 
    label, 
    value, 
    subtext, 
    trend, 
    trendUp, 
    alert, 
    icon, 
    className 
}: IndicatorCardProps) {
    return (
        <motion.div 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ y: -4, transition: { duration: 0.2 } }}
            className={cn(
                "group relative enterprise-card p-6 md:p-8 transition-all duration-300",
                alert && "after:absolute after:inset-0 after:rounded-xl after:ring-1 after:ring-primary/40 after:animate-pulse",
                className
            )}
        >
            <div className="flex justify-between items-start mb-6">
                <div className="h-10 w-10 bg-muted/50 border border-border rounded-lg flex items-center justify-center text-muted-foreground group-hover:text-primary group-hover:border-primary/30 transition-all duration-300">
                    {icon}
                </div>
                {alert && <div className="h-2 w-2 rounded-full bg-primary animate-pulse shadow-[0_0_10px_rgba(var(--primary),0.8)]" />}
            </div>
            
            <div className="space-y-1.5">
                <span className="text-[11px] uppercase font-bold tracking-widest text-muted-foreground group-hover:text-muted-foreground transition-colors">
                    {label}
                </span>
                <div className="flex items-end gap-3">
                    <span className="text-3xl font-black tracking-tight text-foreground font-heading tabular-nums">
                        {value}
                    </span>
                </div>
                
                {(subtext || trend) && (
                    <div className="flex items-center gap-3 pt-4 border-t border-border mt-4">
                        {trend && (
                            <span className={cn(
                                "flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest", 
                                trendUp ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20" : "bg-card text-muted-foreground border border-border"
                            )}>
                                {trend}
                            </span>
                        )}
                        {subtext && (
                            <span className="text-muted-foreground text-[10px] font-bold uppercase tracking-wider">
                                {subtext}
                            </span>
                        )}
                    </div>
                )}
            </div>
        </motion.div>
    );
}
