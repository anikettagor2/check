"use client";

import { useAuth } from "@/lib/context/auth-context";
import { Button } from "@/components/ui/button";
import { Loader2, Trash2, User, Mail, Shield } from "lucide-react";
import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { storage, db } from "@/lib/firebase/config";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { doc, setDoc } from "firebase/firestore";
import { useBranding } from "@/lib/context/branding-context";
import Image from "next/image";
import { Upload } from "lucide-react";
import { toast } from "sonner";

export default function SettingsPage() {
    const { user, requestAccountDeletion } = useAuth();
    const { logoUrl } = useBranding();
    const [isDeleting, setIsDeleting] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
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

        // Basic validation
        if (!file.type.startsWith('image/')) {
            toast.error("Please upload an image file.");
            return;
        }

        setIsAvatarUploading(true);
        const toastId = toast.loading("Optimizing & uploading profile picture...");

        try {
            // Compress image to minimize storage footprint
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

    const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!user) return;
        const file = e.target.files?.[0];
        if (!file) return;

        // Validation
        if (file.size > 2 * 1024 * 1024) {
            toast.error("File too large. Max 2MB.");
            return;
        }

        setIsUploading(true);
        const toastId = toast.loading("Uploading agency logo...");

        try {
            const storageRef = ref(storage, `branding/logo_${Date.now()}`);
            await uploadBytes(storageRef, file);
            const downloadURL = await getDownloadURL(storageRef);

            await setDoc(doc(db, "settings", "branding"), {
                logoUrl: downloadURL,
                updatedAt: Date.now(),
                updatedBy: user?.uid
            }, { merge: true });

            toast.success("Agency logo updated successfully", { id: toastId });
        } catch (error) {
            console.error(error);
            toast.error("Failed to upload logo", { id: toastId });
        } finally {
            setIsUploading(false);
        }
    };

    const handleDelete = async () => {
        if (user?.deletionRequested) return;
        if (!confirm("Are you sure you want to request account deletion? This will be reviewed by an administrator before final termination.")) return;
        
        setIsDeleting(true);
        try {
            await requestAccountDeletion();
        } catch (error: any) {
            console.error(error);
            alert(error.message || "Failed to request deletion.");
        } finally {
            setIsDeleting(false);
        }
    };

    if (!user) return null;

    return (
        <div className="max-w-xl mx-auto py-12 px-6">
            <h1 className="text-3xl font-bold text-foreground mb-2">Account Settings</h1>
            <p className="text-muted-foreground mb-8">Manage your profile and preferences</p>

            <div className="bg-zinc-900/50 border border-border rounded-2xl p-8 space-y-8">
                
                {/* Profile Header */}
                <div className="flex items-center gap-6">
                    <div className="relative group">
                        <Avatar className="w-20 h-20 border-2 border-border group-hover:border-primary/40 transition-all">
                            <AvatarImage src={user.photoURL || undefined} />
                            <AvatarFallback className="text-2xl bg-primary/20 text-primary">
                                {user.displayName?.[0] || 'U'}
                            </AvatarFallback>
                        </Avatar>
                        
                        <label className="absolute inset-0 flex items-center justify-center bg-black/5 dark:bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-full cursor-pointer">
                            {isAvatarUploading ? <Loader2 className="w-6 h-6 animate-spin text-primary" /> : <Upload className="w-6 h-6 text-foreground" />}
                            <input 
                                type="file" 
                                className="hidden" 
                                accept="image/*" 
                                onChange={handleProfilePictureUpload}
                                disabled={isAvatarUploading}
                            />
                        </label>
                    </div>
                    
                    <div>
                        <h2 className="text-xl font-bold text-foreground">{user.displayName || "User"}</h2>
                        <div className="flex items-center gap-2 mt-1">
                            <p className="text-muted-foreground text-sm">Member since {new Date(user.createdAt).toLocaleDateString()}</p>
                            {user.deletionRequested && (
                                <span className="text-[10px] font-bold text-amber-500 uppercase tracking-widest bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 animate-pulse">
                                    Deletion Pending Approval
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="h-px bg-card" />

                {/* Info Grid */}
                <div className="space-y-4">
                    <div className="flex items-center gap-4 text-sm">
                        <div className="w-8 h-8 rounded-lg bg-card flex items-center justify-center flex-shrink-0">
                            <Mail className="w-4 h-4 text-muted-foreground" />
                        </div>
                        <div>
                            <p className="text-muted-foreground text-xs uppercase tracking-wider font-bold mb-0.5">Email</p>
                            <p className="text-foreground/90">{user.email}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4 text-sm">
                        <div className="w-8 h-8 rounded-lg bg-card flex items-center justify-center flex-shrink-0">
                            <Shield className="w-4 h-4 text-muted-foreground" />
                        </div>
                        <div>
                            <p className="text-muted-foreground text-xs uppercase tracking-wider font-bold mb-0.5">Role</p>
                            <p className="text-foreground/90 capitalize">{user.role}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4 text-sm">
                        <div className="w-8 h-8 rounded-lg bg-card flex items-center justify-center flex-shrink-0">
                            <User className="w-4 h-4 text-muted-foreground" />
                        </div>
                        <div>
                            <p className="text-muted-foreground text-xs uppercase tracking-wider font-bold mb-0.5">User ID</p>
                            <p className="text-muted-foreground font-mono text-xs">{user.uid}</p>
                        </div>
                    </div>
                </div>

                {user.role !== 'admin' && (
                    <>
                        <div className="h-px bg-card" />

                        {/* Danger Zone */}
                        <div className="space-y-4 pt-2">
                            <h3 className="text-red-400 text-sm font-semibold uppercase tracking-wider">Danger Zone</h3>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                                {user.deletionRequested 
                                    ? "Your account deletion request is currently under review by the administration. You will be notified once the protocol is finalized."
                                    : "Deleting your account will remove your personal data and revoke access to all projects. This request requires administrative authorization."
                                }
                            </p>
                            
                            <Button 
                                variant="destructive" 
                                onClick={handleDelete}
                                disabled={isDeleting || user.deletionRequested}
                                className={cn(
                                    "w-full transition-all duration-300",
                                    user.deletionRequested 
                                        ? "bg-amber-500/10 text-amber-500 hover:bg-amber-500/10 border-amber-500/20 cursor-default" 
                                        : "bg-red-500/10 text-red-500 hover:bg-red-500/20 border-red-500/20"
                                )}
                            >
                                {isDeleting ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        Updating...
                                    </>
                                ) : user.deletionRequested ? (
                                    <>
                                        <Shield className="w-4 h-4 mr-2" />
                                        Termination Request Active
                                    </>
                                ) : (
                                    <>
                                        <Trash2 className="w-4 h-4 mr-2" />
                                        Request Account Termination
                                    </>
                                )}
                            </Button>
                        </div>
                    </>
                )}

                {/* Agency Branding (Admin Only) */}
                {user.role === 'admin' && (
                    <>
                        <div className="h-px bg-card" />
                        
                        <div className="space-y-6 pt-2">
                            <div>
                                <h3 className="text-primary text-sm font-semibold uppercase tracking-wider">Agency Branding</h3>
                                <p className="text-xs text-muted-foreground mt-1">Manage the global brand identity of the platform.</p>
                            </div>

                            <div className="flex flex-col md:flex-row gap-8 items-start">
                                <div className="space-y-4 flex-1">
                                    <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Platform Logo</p>
                                    <div className="relative group">
                                        <div className="h-32 w-full max-w-sm rounded-[2rem] border border-dashed border-border bg-muted/50 flex items-center justify-center overflow-hidden transition-all group-hover:border-primary/30 group-hover:bg-muted/50">
                                            {logoUrl ? (
                                                <Image 
                                                    src={logoUrl} 
                                                    alt="Agency Logo" 
                                                    fill 
                                                    className="object-contain p-4 transition-all group-hover:scale-105"
                                                />
                                            ) : (
                                                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                                                    <Upload className="w-6 h-6" />
                                                    <span className="text-[10px] font-bold uppercase tracking-widest">No Logo Uploaded</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    
                                    <div className="flex items-center gap-4">
                                        <Button 
                                            asChild
                                            variant="outline" 
                                            disabled={isUploading}
                                            className="bg-card border-border hover:bg-card text-xs font-bold uppercase tracking-widest transition-all"
                                        >
                                            <label className="cursor-pointer">
                                                {isUploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                                                {logoUrl ? "Change Logo" : "Upload Logo"}
                                                <input 
                                                    type="file" 
                                                    className="hidden" 
                                                    accept="image/*" 
                                                    onChange={handleLogoUpload}
                                                    disabled={isUploading}
                                                />
                                            </label>
                                        </Button>
                                        <p className="text-[10px] text-muted-foreground font-medium">PNG or SVG recommended. Max 2MB.</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
