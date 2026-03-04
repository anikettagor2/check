
"use client";

import { useAuth } from "@/lib/context/auth-context";
import { ClientDashboard } from "@/app/dashboard/components/client-dashboard";
import { EditorDashboard } from "@/app/dashboard/components/editor-dashboard";
import { AdminDashboard } from "@/app/dashboard/components/admin-dashboard";
import { Loader2 } from "lucide-react";

export default function ProjectsPage() {
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

  if (!user) return null;

  return (
    <div>
        {user.role === 'client' && <ClientDashboard />}
        {user.role === 'editor' && <EditorDashboard />}
        {user.role === 'admin' && <AdminDashboard />}
    </div>
  );
}
