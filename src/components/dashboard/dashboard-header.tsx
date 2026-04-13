"use client";

import { useAuth } from "@/lib/context/auth-context";
import { Bell, Search, Command, Activity, Zap, Terminal, Menu } from "lucide-react";
import { ModeToggle } from "@/components/mode-toggle";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

import Image from "next/image";
import { useBranding } from "@/lib/context/branding-context";

interface DashboardHeaderProps {
  onMenuClick?: () => void;
}

export function DashboardHeader({ onMenuClick }: DashboardHeaderProps) {
  const { user } = useAuth();
  const { logoUrl } = useBranding();
  
  return (
    <header className="sticky top-0 z-30 flex h-20 w-full items-center justify-between border-b border-border bg-background/80 px-6 md:px-10 backdrop-blur-xl transition-all shrink-0">
       <div className="flex items-center gap-4 md:gap-6">
          {/* Mobile Menu Toggle */}
          <button 
            onClick={onMenuClick}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-border text-foreground md:hidden active:scale-95 transition-all"
            aria-label="Toggle sidebar"
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Logo for mobile */}
          <div className="md:hidden relative h-8 w-24 rounded-xl overflow-hidden">
            {logoUrl ? (
              <Image 
                src={logoUrl} 
                alt="EditoHub Logo" 
                fill 
                className="object-contain object-left"
                priority
              />
            ) : (
                <div className="relative h-8 w-24">
                  <Image 
                    src="/logo.png" 
                    alt="EditoHub Logo" 
                    fill 
                    className="object-contain object-left"
                    priority
                  />
                </div>
            )}
          </div>

          <div className="hidden md:flex items-center gap-6">
            <div className="flex items-center gap-3 px-3 py-1.5 rounded-lg bg-muted/50 border border-border group hover:border-primary/40 transition-all duration-300">
              <div className="relative">
                  <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <div className="absolute inset-0 h-1.5 w-1.5 rounded-full bg-emerald-500 blur-[2px] animate-pulse" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground group-hover:text-foreground transition-colors">Node Status: Active</span>
            </div>
            
            <div className="h-4 w-px bg-border" />
            
            <div className="flex items-center gap-3">
               <div className="h-8 w-8 rounded-lg bg-muted/50 border border-border flex items-center justify-center text-muted-foreground transition-all hover:bg-accent hover:text-foreground overflow-hidden">
                  {user?.photoURL ? (
                      <Image src={user.photoURL} alt="Profile" width={32} height={32} className="w-full h-full object-cover" />
                  ) : (
                      <Terminal className="h-3.5 w-3.5" />
                  )}
               </div>
               <div className="flex flex-col">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground leading-none mb-1">Secure Protocol</span>
                  <span className="text-[10px] font-black text-foreground tracking-widest uppercase truncate max-w-[140px] leading-none">
                      {user?.role?.replace('_', ' ')}: {user?.displayName?.split(' ')[0]}
                  </span>
               </div>
            </div>
          </div>
       </div>

       <div className="flex items-center gap-6 ml-auto">
         {/* Search Interface */}
          <div className="relative hidden xl:block group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
            <input 
              type="text" 
              placeholder="Search anything..." 
              className="h-10 w-80 rounded-lg border border-border bg-muted/30 pl-11 pr-4 text-sm font-medium text-foreground focus:bg-background focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/10 transition-all duration-300 placeholder:text-muted-foreground"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 px-1.5 py-0.5 rounded border border-border bg-muted/50 text-[10px] font-bold text-muted-foreground">
                <Command className="h-2.5 w-2.5" />
                <span>K</span>
            </div>
          </div>

         {/* Meta Actions */}
          <div className="flex items-center gap-3">
            <button className="relative flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-muted/30 text-muted-foreground transition-all hover:bg-accent hover:text-foreground group duration-300 hover:border-primary/40 active:scale-95">
                <Bell className="h-4 w-4 relative z-10 transition-transform group-hover:rotate-12" />
                <span className="absolute top-2.5 right-2.5 h-1.5 w-1.5 rounded-full bg-primary z-20 border-2 border-background" />
                <div className="absolute inset-0 bg-primary/5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>

            <div className="h-6 w-px bg-border mx-2" />
            
            <ModeToggle />
          </div>
       </div>
    </header>
  );
}
