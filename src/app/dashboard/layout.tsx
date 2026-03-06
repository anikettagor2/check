"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/context/auth-context";
import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { Loader2, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  // Close mobile menu on navigation
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [router]);

  if (loading) {
    return (
       <div className="flex h-screen w-full items-center justify-center bg-background text-foreground">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
       </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background selection:bg-primary/20 selection:text-primary relative transition-colors duration-300">
      {/* Background Ambient Glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden opacity-20 z-0">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 blur-[120px] rounded-full" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-primary/5 blur-[120px] rounded-full" />
      </div>

      <div className="flex flex-1 overflow-hidden relative z-10">
        {/* Mobile Sidebar Overlay */}
        <AnimatePresence>
          {isMobileMenuOpen && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="fixed inset-0 bg-black/5 dark:bg-black/40 backdrop-blur-sm z-40 md:hidden"
            />
          )}
        </AnimatePresence>

        {/* Desktop Sidebar (Permanent) */}
        <div className="hidden md:block border-r border-border">
          <DashboardSidebar />
        </div>

        {/* Mobile Sidebar (Slide-in) */}
        <div className={cn(
          "fixed inset-y-0 left-0 w-72 z-50 transform transition-transform duration-300 ease-in-out md:hidden border-r border-border",
          isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        )}>
          <DashboardSidebar />
          {/* Close button for mobile sidebar */}
          <button 
            onClick={() => setIsMobileMenuOpen(false)}
            className="absolute top-6 right-[-48px] h-10 w-10 flex items-center justify-center rounded-xl bg-background border border-border text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-1 flex-col overflow-hidden relative">
          <DashboardHeader onMenuClick={() => setIsMobileMenuOpen(true)} />
          <main className="flex-1 overflow-y-auto relative flex flex-col scrollbar-thin scrollbar-thumb-white/5 scrollbar-track-transparent">
             <div className="flex-1 p-4 md:p-8 lg:p-10 max-w-[1920px] mx-auto w-full page-fade-in">
                {children}
             </div>
          </main>
        </div>
      </div>
    </div>
  );
}
