"use client";

import { useAuth } from "@/lib/context/auth-context";
import { Button } from "@/components/ui/button";
import { Loader2, Trash2, User, Mail, Shield } from "lucide-react";
import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export default function ProfilePage() {
    const { user, requestAccountDeletion } = useAuth();
    const [isDeleting, setIsDeleting] = useState(false);

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
                    <Avatar className="w-20 h-20 border-2 border-border">
                        <AvatarImage src={user.photoURL || undefined} />
                        <AvatarFallback className="text-2xl bg-primary/20 text-primary">
                            {user.displayName?.[0] || 'U'}
                        </AvatarFallback>
                    </Avatar>
                    
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

            </div>
        </div>
    );
}
