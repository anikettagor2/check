"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/context/auth-context";
import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar";
import { Loader2, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, firebaseUser, loading } = useAuth();
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  useEffect(() => {
    // Only redirect when Firebase session is truly gone.
    // This avoids false logouts during transient profile sync states.
    if (!loading && !firebaseUser) {
      router.push("/login");
    }
  }, [firebaseUser, loading, router]);

  // Handle sidebar collapse preference from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("sidebar-collapsed");
    if (saved !== null) {
      setIsSidebarCollapsed(saved === "true");
    }
  }, []);

  const toggleSidebar = () => {
    const newState = !isSidebarCollapsed;
    setIsSidebarCollapsed(newState);
    localStorage.setItem("sidebar-collapsed", String(newState));
  };

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

  if (!user) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background text-foreground">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background selection:bg-primary/20 selection:text-primary relative transition-colors duration-300">
      {/* Background Ambient Glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden opacity-20 z-0">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 blur-[120px] rounded-full" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-primary/5 blur-[120px] rounded-full" />
      </div>

      <div className="flex flex-1 overflow-hidden relative z-10">
        {/* Mobile Sidebar Toggle (Header removed) */}
        {!isMobileMenuOpen && (
          <button
            onClick={() => setIsMobileMenuOpen(true)}
            className="md:hidden fixed top-5 left-5 z-50 h-11 w-11 rounded-xl border border-border bg-background/90 backdrop-blur text-foreground flex items-center justify-center"
            aria-label="Open sidebar"
          >
            <Menu className="h-5 w-5" />
          </button>
        )}

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
        <div className="hidden md:block">
          <DashboardSidebar 
            collapsed={isSidebarCollapsed} 
            onToggle={toggleSidebar}
          />
        </div>

        {/* Mobile Sidebar (Slide-in) */}
        <div className={cn(
          "fixed inset-y-0 left-0 w-72 z-50 transform transition-transform duration-300 ease-in-out md:hidden border-r border-border",
          isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        )}>
          <DashboardSidebar collapsed={false} />
          {/* Close button for mobile sidebar */}
          <button 
            onClick={() => setIsMobileMenuOpen(false)}
            className="absolute top-6 -right-12 h-10 w-10 flex items-center justify-center rounded-xl bg-background border border-border text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <main className="flex-1 overflow-y-auto relative flex flex-col scrollbar-thin scrollbar-thumb-primary/10 scrollbar-track-transparent p-4 md:p-6 lg:p-8">
          <div className="w-full flex-1 flex flex-col">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
