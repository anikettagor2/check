"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/context/auth-context";
import { db, storage } from "@/lib/firebase/config";
import { ref, uploadBytesResumable, getDownloadURL, UploadTaskSnapshot, StorageError } from "firebase/storage";
import { collection, addDoc, query, where, getDocs, orderBy, limit } from "firebase/firestore";
import { Revision } from "@/types/schema";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea"; 
import { Loader2, ArrowLeft, UploadCloud, FileVideo, Zap, ShieldCheck, ChevronRight } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { handleRevisionUploaded } from "@/app/actions/notification-actions";
import { motion, AnimatePresence } from "framer-motion";

export default function UploadRevisionPage() {
    const params = useParams();
    const id = params?.id as string;
    const { user } = useAuth();
    const router = useRouter();
    
    const [file, setFile] = useState<File | null>(null);
    const [description, setDescription] = useState("");
    const [isUploading, setIsUploading] = useState(false);
    const [progress, setProgress] = useState(0);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
        }
    };

    const handleUpload = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!file || !user || typeof id !== 'string') return;

        if (file.size > 2 * 1024 * 1024 * 1024) {
             alert("File is too large. Max size is 2GB.");
             return;
        }

        setIsUploading(true);
        setProgress(0);

        try {
            const q = query(
                collection(db, "revisions"),
                where("projectId", "==", id),
                orderBy("version", "desc"),
                limit(1)
            );
            const snap = await getDocs(q);
            let nextVersion = 1;
            if (!snap.empty) {
                const latest = snap.docs[0].data() as Revision;
                nextVersion = latest.version + 1;
            }

            const storageRef = ref(storage, `projects/${id}/v${nextVersion}_${file.name}`);
            const uploadTask = uploadBytesResumable(storageRef, file);

            uploadTask.on('state_changed', 
                (snapshot: UploadTaskSnapshot) => {
                    const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                    setProgress(progress);
                }, 
                (error: StorageError) => {
                    console.error("Upload failed:", error);
                    setIsUploading(false);
                }, 
                async () => {
                    try {
                        const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);

                        const newRevision: Omit<Revision, "id"> = {
                            projectId: id,
                            version: nextVersion,
                            videoUrl: downloadURL,
                            status: 'active',
                            uploadedBy: user.uid,
                            createdAt: Date.now(),
                            description: description
                        };
            
                        await addDoc(collection(db, "revisions"), newRevision);
                        await handleRevisionUploaded(id);
                        
                        setIsUploading(false);
                        router.push(`/dashboard/projects/${id}`);
                    } catch (dbError) {
                         console.error("Error saving revision:", dbError);
                         setIsUploading(false);
                    }
                }
            );

        } catch (error: any) {
            console.error("Error starting upload:", error);
            setIsUploading(false);
        }
    };

    return (
        <div className="min-h-[calc(100vh-10rem)] flex items-center justify-center p-6">
            <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-2xl space-y-10"
            >
                 <Link 
                    href={`/dashboard/projects/${id}`} 
                    className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-muted/50 border border-border text-muted-foreground hover:text-foreground text-[10px] font-black uppercase tracking-widest transition-all"
                >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Back to Project
                </Link>

                <div className="space-y-3">
                    <div className="flex items-center gap-3">
                        <div className="px-2.5 py-0.5 rounded-lg bg-primary/10 border border-primary/20">
                            <span className="text-[10px] font-black text-primary uppercase tracking-[0.3em]">New Version</span>
                        </div>
                        <span className="text-[10px] text-muted-foreground font-black uppercase tracking-[0.2em]">Secure Upload</span>
                    </div>
                    <h1 className="premium-header text-4xl text-foreground">Upload New <span className="text-muted-foreground">Draft</span></h1>
                    <p className="text-[13px] text-muted-foreground font-medium max-w-md">
                        Upload the latest version of the video for your client to review.
                    </p>
                </div>

                <form onSubmit={handleUpload} className="glass-panel rounded-[3rem] p-12 border-border relative overflow-hidden space-y-12 shadow-2xl">
                    <div className="absolute top-0 right-0 p-12 opacity-10 pointer-events-none">
                        <Zap className="h-32 w-32 text-primary blur-3xl" />
                    </div>

                    {/* Drag & Drop Area */}
                    <div className="space-y-6 relative z-10">
                        <Label className="text-[11px] font-black uppercase tracking-[0.3em] text-muted-foreground ml-1">Master Video File</Label>
                        <div className={cn(
                            "group relative border-2 border-dashed border-border rounded-[2.5rem] bg-black/5 dark:bg-black/40 dark:bg-black/5 dark:bg-black/40 dark:bg-black/5 dark:bg-black/40 dark:bg-black/5 dark:bg-black/40 hover:bg-black/5 dark:bg-black/40 dark:bg-black/5 dark:bg-black/40 dark:bg-black/5 dark:bg-black/40 dark:bg-black/5 dark:bg-black/40 hover:border-primary/50 transition-all duration-700 min-h-[280px] flex flex-col items-center justify-center text-center cursor-pointer p-10 shadow-inner",
                            file ? "border-primary/60 bg-primary/[0.04]" : ""
                        )}>
                            <input 
                                type="file" 
                                accept="video/*"
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                                onChange={handleFileChange}
                                required
                            />
                            <AnimatePresence mode="wait">
                                {file ? (
                                    <motion.div 
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        className="space-y-6"
                                    >
                                        <div className="h-20 w-20 bg-primary/20 rounded-3xl flex items-center justify-center mx-auto border border-primary/30 shadow-[0_0_40px_rgba(var(--primary),0.3)] rotate-3 group-hover:rotate-0 transition-transform duration-500">
                                            <FileVideo className="h-10 w-10 text-primary" />
                                        </div>
                                        <div className="space-y-2">
                                            <p className="text-lg font-black text-foreground truncate px-6 leading-none tracking-tight">{file.name}</p>
                                            <p className="text-[11px] font-black text-emerald-500 uppercase tracking-widest">{(file.size / (1024 * 1024)).toFixed(2)} MB — PROTOCOL_READY</p>
                                        </div>
                                    </motion.div>
                                ) : (
                                    <div className="space-y-6">
                                        <div className="h-20 w-20 bg-muted/50 rounded-3xl flex items-center justify-center mx-auto border border-border group-hover:scale-110 group-hover:text-primary group-hover:border-primary/40 transition-all duration-500 shadow-lg">
                                            <UploadCloud className="h-10 w-10 text-muted-foreground group-hover:text-primary transition-colors" />
                                        </div>
                                        <div className="space-y-2">
                                            <p className="text-base font-black text-muted-foreground group-hover:text-foreground/90 transition-colors">INITIATE_HANDOVER_PROTOCOL</p>
                                            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.3em]">MP4_MOV_WEBM // LIMIT_2GB</p>
                                        </div>
                                    </div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>

                    <div className="space-y-6 relative z-10">
                        <Label htmlFor="description" className="text-[11px] font-black uppercase tracking-[0.3em] text-muted-foreground ml-1">Operational Notes</Label>
                        <Textarea 
                            id="description" 
                            placeholder="Specify revisions, technical adjustments, or focus points for this version..."
                            className="bg-black/5 dark:bg-black/40 dark:bg-black/5 dark:bg-black/40 dark:bg-black/5 dark:bg-black/40 dark:bg-black/5 dark:bg-black/40 border-border focus:border-primary/50 focus:bg-black/5 dark:bg-black/40 dark:bg-black/5 dark:bg-black/40 dark:bg-black/5 dark:bg-black/40 dark:bg-black/5 dark:bg-black/40 transition-all duration-700 rounded-[2rem] font-bold text-foreground placeholder:text-muted-foreground text-base leading-relaxed p-8 min-h-[180px] shadow-inner"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                        />
                    </div>

                    {isUploading && (
                        <div className="space-y-3 relative z-10">
                            <div className="flex justify-between items-center px-1">
                                <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest animate-pulse">Uploading...</span>
                                <span className="text-[10px] font-black text-foreground uppercase tracking-widest">{Math.round(progress)}%</span>
                            </div>
                            <div className="h-2 w-full bg-muted/50 rounded-full overflow-hidden border border-border">
                                <motion.div 
                                    initial={{ width: 0 }}
                                    animate={{ width: `${progress}%` }}
                                    className="h-full bg-primary shadow-[0_0_20px_rgba(var(--primary),0.8)] transition-all duration-300 ease-out"
                                />
                            </div>
                        </div>
                    )}

                    <div className="relative z-10 pt-4">
                        <button 
                            type="submit" 
                            disabled={!file || isUploading}
                            className="w-full h-16 rounded-2xl bg-primary  text-primary-foreground text-[12px] font-black uppercase tracking-[0.2em] hover:bg-zinc-200 transition-all flex items-center justify-center gap-3 shadow-md shadow-primary/10 active:scale-[0.98] disabled:opacity-30 disabled:pointer-events-none group"
                        >
                            {isUploading ? (
                                <>
                                    <Loader2 className="h-5 w-5 animate-spin" />
                                    Sending...
                                </>
                            ) : (
                                <>
                                    Start Upload
                                    <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                                </>
                            )}
                        </button>
                    </div>

                    {/* Security Badge */}
                    <div className="flex items-center justify-center gap-3 pt-6 border-t border-border">
                        <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-[9px] font-black text-muted-foreground uppercase tracking-[0.3em]">Secure Transfer Active</span>
                    </div>
                </form>
            </motion.div>
        </div>
    );
}
