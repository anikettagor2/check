"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  FolderOpen,
  Settings,
  Users,
  LogOut,
  PlusSquare,
  FileText,
  Briefcase,
  Film,
  CircleHelp,
  Activity,
  Layers,
  Cpu,
  Upload,
  Loader2,
} from "lucide-react";
import { useAuth } from "@/lib/context/auth-context";
import { motion } from "framer-motion";

import Image from "next/image";
import { useBranding } from "@/lib/context/branding-context";
import { storage, db } from "@/lib/firebase/config";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { doc, setDoc } from "firebase/firestore";
import { toast } from "sonner";

export function DashboardSidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { logoUrl } = useBranding();
  const role = user?.role || 'client';
  
  const [isAvatarUploading, setIsAvatarUploading] = useState(false);

  const compressImage = (file: File): Promise<Blob> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (event) => {
                const img = new (window as any).Image();
                img.src = event.target?.result as string;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const MAX_WIDTH = 400;
                    const MAX_HEIGHT = 400;
                    let width = img.width;
                    let height = img.height;

                    if (width > height) {
                        if (width > MAX_WIDTH) {
                            height *= MAX_WIDTH / width;
                            width = MAX_WIDTH;
                        }
                    } else {
                        if (height > MAX_HEIGHT) {
                            width *= MAX_HEIGHT / height;
                            height = MAX_HEIGHT;
                        }
                    }

                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx?.drawImage(img, 0, 0, width, height);
                    canvas.toBlob((blob) => {
                        if (blob) resolve(blob);
                        else reject(new Error('Canvas to Blob failed'));
                    }, 'image/jpeg', 0.8);
                };
            };
            reader.onerror = (error) => reject(error);
        });
  };

  const handleProfilePictureUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!user) return;
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            toast.error("Please upload an image file.");
            return;
        }

        setIsAvatarUploading(true);
        const toastId = toast.loading("Updating profile picture...");

        try {
            const compressedBlob = await compressImage(file);
            const storageRef = ref(storage, `avatars/${user.uid}_${Date.now()}`);
            await uploadBytes(storageRef, compressedBlob);
            const downloadURL = await getDownloadURL(storageRef);

            await setDoc(doc(db, "users", user.uid), {
                photoURL: downloadURL,
                updatedAt: Date.now()
            }, { merge: true });

            toast.success("Profile picture updated", { id: toastId });
        } catch (error) {
            console.error(error);
            toast.error("Failed to upload profile picture", { id: toastId });
        } finally {
            setIsAvatarUploading(false);
        }
  };

  const getLinks = () => {
    switch(role) {
      case 'admin':
        return [
          { href: "/dashboard", label: "Admin Dashboard", icon: LayoutDashboard },
          { href: "/dashboard/users", label: "Users", icon: Users },
          { href: "/dashboard/invoices", label: "Invoices", icon: FileText },
          { href: "/dashboard/settings", label: "Settings", icon: Settings },
        ];
      case 'project_manager':
        return [
          { href: "/dashboard", label: "PM Dashboard", icon: Cpu },
          { href: "/dashboard/team", label: "Team Management", icon: Users },
          { href: "/dashboard/projects", label: "All Projects", icon: FolderOpen },
          { href: "/dashboard/invoices", label: "Invoices", icon: FileText },
          { href: "/dashboard/settings", label: "Settings", icon: Settings },
        ];
      case 'sales_executive':
        return [
          { href: "/dashboard", label: "Sales Dashboard", icon: Briefcase },
          { href: "/dashboard/invoices", label: "Invoices", icon: FileText },
          { href: "/dashboard/settings", label: "Settings", icon: Settings },
        ];
      case 'editor':
        return [
          { href: "/dashboard", label: "Editor Dashboard", icon: Film },
          { href: "/dashboard/history", label: "History", icon: Layers },
          { href: "/dashboard/settings", label: "Settings", icon: Settings },
        ];
      default: // Client
        return [
          { href: "/dashboard", label: "Client Dashboard", icon: LayoutDashboard },
          { href: "/dashboard/projects/new", label: "New Project", icon: PlusSquare },
          { href: "/dashboard/projects", label: "My Projects", icon: FolderOpen },
          { href: "/dashboard/invoices", label: "Invoices", icon: FileText },
          { href: "/dashboard/settings", label: "Settings", icon: Settings },
        ];
    }
  };

  const links = getLinks();

  return (
    <aside className="h-full w-72 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground flex shrink-0 relative z-50">
      {/* Brand Header */}
      <div className="flex h-24 items-center px-8 mb-4 border-b border-sidebar-border bg-white/[0.02]">
        <Link href="/dashboard" className="flex items-center gap-3 group w-full">
          <div className="relative h-12 w-full flex items-center rounded-xl overflow-hidden text-white">
            {logoUrl ? (
              <Image 
                src={logoUrl} 
                alt="EditoHub Logo" 
                fill 
                className="object-contain object-left"
                priority
              />
            ) : (
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center font-bold text-black italic">E</div>
                    <span className="text-xl font-heading font-black tracking-tighter">EDITO_HUB</span>
                </div>
            )}
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto px-4 space-y-8 py-6 scrollbar-none">
        <div className="space-y-2">
          <div className="px-4 flex items-center justify-between mb-2">
              <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-[0.25em]">Operational</span>
              <Activity className="h-3 w-3 text-muted-foreground/50" />
          </div>
          <nav className="space-y-0.5">
            {links.map((link) => {
              const Icon = link.icon;
              const isActive = pathname === link.href;
              
              return (
                <Link
                  key={link.label}
                  href={link.href}
                  className={cn(
                    "relative flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium transition-all duration-200 group active:scale-[0.98]",
                    isActive ? "text-sidebar-accent-foreground bg-sidebar-accent border border-sidebar-border shadow-sm font-bold" : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 border border-transparent"
                  )}
                >
                  <Icon className={cn("h-4 w-4 transition-colors", isActive ? "text-sidebar-primary" : "text-sidebar-foreground/50 group-hover:text-sidebar-foreground/70")} />
                  <span className="tracking-tight">{link.label}</span>
                  
                  {isActive && (
                    <motion.div 
                        layoutId="active-nav-dot"
                        className="absolute right-3 h-1 w-1 rounded-xl bg-sidebar-primary shadow-[0_0_8px_rgba(var(--sidebar-primary),1)]"
                    />
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="space-y-2">
          <div className="px-4 flex items-center justify-between mb-2">
              <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-[0.25em]">Support</span>
              <CircleHelp className="h-3 w-3 text-muted-foreground/50" />
          </div>
          <nav className="space-y-0.5">
            <Link href="#" className="flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent border border-transparent hover:border-sidebar-border transition-all duration-200 group active:scale-[0.98]">
              <CircleHelp className="h-4 w-4 text-sidebar-foreground/50 group-hover:text-sidebar-foreground/70" />
              <span className="tracking-tight">System Intel</span>
            </Link>
          </nav>
        </div>
      </div>

      {/* Footer Profile */}
      <div className="p-4 border-t border-sidebar-border">
         <div className="p-4 rounded-xl bg-sidebar-accent/30 border border-sidebar-border space-y-4">
            <div className="flex items-center gap-3">
               <div className="relative group shrink-0">
                   <div className="h-10 w-10 rounded-xl bg-sidebar-primary/10 border border-sidebar-primary/20 flex items-center justify-center font-bold text-sidebar-primary overflow-hidden">
                      {user?.photoURL ? (
                          <Image src={user.photoURL} alt="Profile" width={40} height={40} className="w-full h-full object-cover" />
                      ) : (
                          user?.displayName?.[0] || "U"
                      )}
                   </div>
                   <label className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl cursor-pointer">
                        {isAvatarUploading ? <Loader2 className="w-4 h-4 animate-spin text-sidebar-primary" /> : <Upload className="w-4 h-4 text-white" />}
                        <input 
                            type="file" 
                            className="hidden" 
                            accept="image/*" 
                            onChange={handleProfilePictureUpload}
                            disabled={isAvatarUploading}
                        />
                   </label>
               </div>
               <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-sidebar-foreground tracking-tight">
                    {user?.displayName || "User"}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.3)]" />
                    <p className="truncate text-[9px] text-zinc-400 uppercase font-black tracking-widest leading-none">
                      {role?.replace('_', ' ')}
                    </p>
                  </div>
               </div>
            </div>

            <button
              onClick={() => logout()}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-sidebar-border bg-sidebar-accent/50 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-sidebar-foreground/60 transition-all duration-200 hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/20 active:scale-95"
            >
              <LogOut className="h-3.5 w-3.5" />
              Disconnect
            </button>
         </div>
      </div>
    </aside>
  );
}
