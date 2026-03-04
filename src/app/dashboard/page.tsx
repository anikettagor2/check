"use client";

import { useAuth } from "@/lib/context/auth-context";
import { Loader2 } from "lucide-react";
import { ClientDashboard } from "./components/client-dashboard";
import { EditorDashboard } from "./components/editor-dashboard";
import { AdminDashboard } from "./components/admin-dashboard";
import { SalesDashboard } from "./components/sales-dashboard";
import { ProjectManagerDashboard } from "./components/project-manager-dashboard";

export default function DashboardPage() {
  const { user, loading } = useAuth();

  if (loading) {
     return (
        <div className="flex h-[calc(100vh-12rem)] items-center justify-center">
            <div className="flex flex-col items-center gap-4">
                <div className="relative h-12 w-12">
                    <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
                    <div className="absolute inset-0 rounded-full border-t-2 border-primary animate-spin" />
                </div>
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest animate-pulse">Syncing Node...</span>
            </div>
        </div>
     );
  }

  if (!user) {
      return null;
  }

  if (user.onboardingStatus === 'pending') {
      return (
          <div className="flex h-[calc(100vh-20rem)] items-center justify-center p-6 text-center">
              <div className="max-w-md space-y-6">
                  <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 inline-block">
                      <Loader2 className="h-8 w-8 text-amber-500 animate-spin" />
                  </div>
                  <div className="space-y-2">
                       <h2 className="text-2xl font-bold text-foreground tracking-tight">Application Under Review</h2>
                       <p className="text-muted-foreground text-sm">Your application has been sent! Once approved, you will get access to your dashboard. Until the admin approves your account, you will not have access to any platform features or projects.</p>
                  </div>
                  <div className="pt-6 border-t border-border mt-6">
                      <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Manual verification is in progress</div>
                  </div>
              </div>
          </div>
      );
  }

  if (user.status === 'inactive') {
      return (
          <div className="flex h-[calc(100vh-20rem)] items-center justify-center p-6 text-center">
              <div className="max-w-md space-y-6">
                  <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 inline-block">
                      <div className="h-8 w-8 text-red-500 font-black italic text-2xl flex items-center justify-center">!</div>
                  </div>
                  <div className="space-y-2">
                       <h2 className="text-2xl font-bold text-foreground tracking-tight">Access Suspended</h2>
                       <p className="text-muted-foreground text-sm">Your account protocol has been locked by administration. If you believe this is a desynchronization error, please contact system support.</p>
                  </div>
              </div>
          </div>
      );
  }

  return (
    <div>
        {user.role === 'client' && <ClientDashboard />}
        {user.role === 'editor' && <EditorDashboard />}
        {user.role === 'admin' && <AdminDashboard />}
        {user.role === 'sales_executive' && <SalesDashboard />}
        {user.role === 'project_manager' && <ProjectManagerDashboard />}
        
        {!['client', 'editor', 'admin', 'sales_executive', 'project_manager'].includes(user.role) && (
            <div className="text-center py-20 text-muted-foreground">
                Unknown role: {user.role}. Please contact support.
            </div>
        )}
    </div>
  );
}
