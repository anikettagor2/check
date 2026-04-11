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
  Activity,
  Layers,
  Cpu,
  IndianRupee,
  Upload,
  Loader2,
  Zap,
  ReceiptText,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useAuth } from "@/lib/context/auth-context";
import { motion } from "framer-motion";
import { ModeToggle } from "@/components/mode-toggle";

import Image from "next/image";
import { useBranding } from "@/lib/context/branding-context";
import { storage, db } from "@/lib/firebase/config";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { doc, setDoc } from "firebase/firestore";
import { toast } from "sonner";

interface DashboardSidebarProps {
  collapsed?: boolean;
  onToggle?: () => void;
}

export function DashboardSidebar({ collapsed = false, onToggle }: DashboardSidebarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { logoUrl } = useBranding();
  const role = user?.role || 'client';
  
  const [isAvatarUploading, setIsAvatarUploading] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const effectiveCollapsed = collapsed && !isHovered;

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
          { href: "/dashboard/auto-assign", label: "Auto Assign", icon: Zap },
          { href: "/dashboard/invoices", label: "Invoices", icon: FileText },
          { href: "/dashboard/invoice-settings", label: "Invoice Settings", icon: ReceiptText },
          { href: "/dashboard/settings", label: "Settings", icon: Settings },
        ];
      case 'project_manager':
        return [
          { href: "/dashboard", label: "PM Dashboard", icon: Cpu },
          { href: "/dashboard/team", label: "Team Management", icon: Users },
          { href: "/dashboard/finance", label: "Finance", icon: IndianRupee },
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
    <aside
      onMouseEnter={() => collapsed && setIsHovered(true)}
      onMouseLeave={() => collapsed && setIsHovered(false)}
      className={cn(
      "h-full flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground flex shrink-0 relative z-50 transition-all duration-500 ease-out",
      effectiveCollapsed ? "w-20" : "w-full md:w-80"
    )}>
      {/* Collapse Toggle Button (Desktop) */}
      <button
        onClick={onToggle}
        className="hidden md:flex absolute -right-3 top-10 z-[60] h-6 w-6 items-center justify-center rounded-full border border-sidebar-border bg-sidebar text-sidebar-foreground shadow-sm hover:bg-sidebar-accent transition-all duration-300"
      >
        {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
      </button>

      {/* Brand Header */}
      <div className={cn("flex h-24 items-center mb-4 border-b border-sidebar-border bg-white/2", effectiveCollapsed ? "px-3 justify-center" : "px-6")}> 
        <Link href="/dashboard" className={cn("group flex items-center overflow-hidden", effectiveCollapsed ? "justify-center" : "w-full")}> 
          <div className={cn("relative h-10 overflow-hidden transition-all duration-500 ease-out", effectiveCollapsed ? "w-10" : "w-40")}>
            {logoUrl ? (
              <Image 
                src={logoUrl} 
                alt="EditoHub Logo" 
                fill 
                className={cn("object-contain transition-all duration-500 ease-out", effectiveCollapsed ? "object-center scale-95" : "object-left scale-100")}
                priority
              />
            ) : (
              <div className="flex items-center h-full overflow-hidden">
                <span className="text-xl font-heading font-black tracking-tighter text-white">EDITO_HUB</span>
              </div>
            )}
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <div className={cn("flex-1 overflow-y-auto space-y-8 py-6 scrollbar-none", effectiveCollapsed ? "px-2" : "px-4") }>
        <div className="space-y-2">
          <div className={cn("px-4 flex items-center justify-between transition-all duration-200", effectiveCollapsed ? "h-0 opacity-0 mb-0 overflow-hidden" : "h-4 opacity-100 mb-2")}>
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
                    "relative flex items-center gap-3 rounded-lg py-2.5 text-sm font-medium transition-all duration-300 group active:scale-[0.98]",
                    effectiveCollapsed ? "px-0 justify-center" : "px-4",
                    isActive ? "text-sidebar-accent-foreground bg-sidebar-accent border border-sidebar-border shadow-sm font-bold" : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 border border-transparent"
                  )}
                  title={effectiveCollapsed ? link.label : undefined}
                >
                  <span className="w-4 h-4 flex items-center justify-center shrink-0">
                    <Icon className={cn("h-4 w-4 transition-colors", isActive ? "text-sidebar-primary" : "text-sidebar-foreground/50 group-hover:text-sidebar-foreground/70")} />
                  </span>
                  <span className={cn(
                    "tracking-tight whitespace-nowrap overflow-hidden transition-all duration-300 ease-out",
                    effectiveCollapsed ? "max-w-0 opacity-0" : "max-w-45 opacity-100"
                  )}>{link.label}</span>
                  
                  {isActive && !effectiveCollapsed && (
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

      </div>

      {/* Footer Profile */}
      <div className={cn("border-t border-sidebar-border", effectiveCollapsed ? "p-2" : "p-4")}>
         <div className={cn("rounded-xl bg-sidebar-accent/30 border border-sidebar-border", effectiveCollapsed ? "p-2 space-y-2" : "p-4 space-y-4")}>
            <div className={cn("flex items-center", effectiveCollapsed ? "justify-center" : "gap-3")}>
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
               <div className={cn(
                 "min-w-0 overflow-hidden transition-all duration-200",
                 effectiveCollapsed ? "max-w-0 opacity-0" : "max-w-45 opacity-100"
               )}>
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
              className={cn(
                "flex w-full items-center justify-center rounded-lg border border-sidebar-border bg-sidebar-accent/50 text-[10px] font-bold uppercase tracking-widest text-sidebar-foreground/60 transition-all duration-200 hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/20 active:scale-95",
                effectiveCollapsed ? "h-10 px-0" : "gap-2 px-3 py-2"
              )}
              title={effectiveCollapsed ? "Disconnect" : undefined}
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className={cn(
                "overflow-hidden whitespace-nowrap transition-all duration-200",
                effectiveCollapsed ? "max-w-0 opacity-0" : "max-w-30 opacity-100"
              )}>Disconnect</span>
            </button>

            <div className={cn(
              "flex items-center rounded-lg border border-sidebar-border bg-sidebar-accent/50",
              effectiveCollapsed ? "justify-center py-2" : "justify-between px-3 py-2"
            )} title={effectiveCollapsed ? "Theme" : undefined}>
              {!effectiveCollapsed && (
                <span className="text-[10px] font-bold uppercase tracking-widest text-sidebar-foreground/60">
                  Theme
                </span>
              )}
              <ModeToggle />
            </div>
         </div>
      </div>
    </aside>
  );
}
