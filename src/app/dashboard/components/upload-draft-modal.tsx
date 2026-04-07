"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useAuth } from "@/lib/context/auth-context";
import { db, storage } from "@/lib/firebase/config";
import { collection, addDoc, query, where, getDocs, orderBy, limit } from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { formatBytes } from "@/lib/services/chunked-upload";
import { Revision } from "@/types/schema";
import { Textarea } from "@/components/ui/textarea";
import {
    Loader2,
    UploadCloud,
    FileVideo,
    Zap,
    ShieldCheck,
    ChevronRight,
    X,
    Gauge,
    Timer,
    Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { handleRevisionUploaded } from "@/app/actions/notification-actions";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { MAX_FILE_SIZE_BYTES, MAX_FILE_SIZE_GB } from "@/lib/constants";


interface UploadDraftModalProps {
    isOpen: boolean;
    projectId: string;
    projectName: string;
    onClose: () => void;
    onSuccess?: () => void;
}

export function UploadDraftModal({
    isOpen,
    projectId,
    projectName,
    onClose,
    onSuccess,
}: UploadDraftModalProps) {
    const { user } = useAuth();
    const [file, setFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [description, setDescription] = useState("");
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProg, setUploadProg] = useState<number | null>(null);
    const abortRef = useRef<AbortController | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        return () => {
            if (previewUrl) URL.revokeObjectURL(previewUrl);
        };
    }, [previewUrl]);

    const handleFileChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setFile(f);
            if (previewUrl) URL.revokeObjectURL(previewUrl);
            setPreviewUrl(URL.createObjectURL(f));
        },
        [previewUrl]
    );

    const handleCancel = () => {
        abortRef.current?.abort();
        setIsUploading(false);
        setUploadProg(null);
    };

    // Using cloudinary to uplaod videos
    const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !user || !projectId) return;

    if (file.size > MAX_FILE_SIZE_BYTES) {
        toast.error(`File is too large. Max size allowed is ${MAX_FILE_SIZE_GB}GB.`);
        return;
    }

    setIsUploading(true);
    setUploadProg(null);

    try {
        // 1. Get the next version number (Your existing Firestore logic)
        const q = query(
            collection(db, "revisions"),
            where("projectId", "==", projectId),
            orderBy("version", "desc"),
            limit(1)
        );
        const snap = await getDocs(q);
        let nextVersion = 1;
        if (!snap.empty) {
            const latest = snap.docs[0].data() as Revision;
            nextVersion = latest.version + 1;
        }

        // 2. Upload to Cloudinary using XHR (for progress tracking)
        const downloadURL = await new Promise<string>((resolve, reject) => {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("upload_preset", process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET!);
            formData.append("resource_type", "video");
            
            // Set the folder to editor_works as requested
            formData.append("folder", `editor_works/${projectId}`);

            const xhr = new XMLHttpRequest();
            xhr.open("POST", `https://api.cloudinary.com/v1_1/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/video/upload`);

            // Progress tracking
            xhr.upload.onprogress = (event) => {
                if (event.lengthComputable) {
                    const progress = (event.loaded / event.total) * 100;
                    setUploadProg(progress);
                }
            };

            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    const response = JSON.parse(xhr.responseText);
                    // Use playback_url for the HLS (.m3u8) streaming link
                    resolve(response.playback_url || response.secure_url);
                } else {
                    reject(new Error("Cloudinary upload failed"));
                }
            };

            xhr.onerror = () => reject(new Error("Network error during upload"));
            
            // Handle Abort if necessary
            if (abortRef.current) {
                abortRef.current.signal.addEventListener("abort", () => xhr.abort());
            }

            xhr.send(formData);
        });

        // 3. Save the new Revision to Firestore
        const newRevision: Omit<Revision, "id"> = {
            projectId,
            version: nextVersion,
            videoUrl: downloadURL, // This is now your smooth HLS link
            status: "active",
            uploadedBy: user.uid,
            createdAt: Date.now(),
            description,
        };

        await addDoc(collection(db, "revisions"), newRevision);
        await handleRevisionUploaded(projectId);

        toast.success("Draft uploaded successfully!");
        
        // 4. Reset form
        setFile(null);
        setPreviewUrl(null);
        setDescription("");
        setIsUploading(false);
        setUploadProg(null);

        onSuccess?.();
        setTimeout(() => onClose(), 500);

    } catch (err: unknown) {
        console.error("Upload failed:", err);
        toast.error("Upload failed. Please try again.");
        setIsUploading(false);
        setUploadProg(null);
    }
};
    // const handleUpload = async (e: React.FormEvent) => {
    //     e.preventDefault();
    //     if (!file || !user || !projectId) return;

    //     if (file.size > MAX_FILE_SIZE_BYTES) {
    //         toast.error(`File is too large. Max size allowed is ${MAX_FILE_SIZE_GB}GB.`);
    //         return;
    //     }

    //     setIsUploading(true);
    //     setUploadProg(null);

    //     const controller = new AbortController();
    //     abortRef.current = controller;

    //     try {
    //         const q = query(
    //             collection(db, "revisions"),
    //             where("projectId", "==", projectId),
    //             orderBy("version", "desc"),
    //             limit(1)
    //         );
    //         const snap = await getDocs(q);
    //         let nextVersion = 1;
    //         if (!snap.empty) {
    //             const latest = snap.docs[0].data() as Revision;
    //             nextVersion = latest.version + 1;
    //         }

    //         const storageRef = ref(storage, `projects/${projectId}/revisions/${Date.now()}_${file.name}`);
    //         const uploadTask = uploadBytesResumable(storageRef, file);
            
    //         const handleAbort = () => {
    //             uploadTask.cancel();
    //         };
    //         controller.signal.addEventListener("abort", handleAbort);

    //         const downloadURL = await new Promise<string>((resolve, reject) => {
    //             uploadTask.on(
    //                 "state_changed",
    //                 (snapshot) => {
    //                     const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
    //                     setUploadProg(progress);
    //                 },
    //                 (error) => {
    //                     controller.signal.removeEventListener("abort", handleAbort);
    //                     reject(error);
    //                 },
    //                 async () => {
    //                     controller.signal.removeEventListener("abort", handleAbort);
    //                     try {
    //                         const url = await getDownloadURL(uploadTask.snapshot.ref);
    //                         resolve(url);
    //                     } catch (err) {
    //                         reject(err);
    //                     }
    //                 }
    //             );
    //         });

    //         const newRevision: Omit<Revision, "id"> = {
    //             projectId,
    //             version: nextVersion,
    //             videoUrl: downloadURL,
    //             status: "active",
    //             uploadedBy: user.uid,
    //             createdAt: Date.now(),
    //             description,
    //         };

    //         await addDoc(collection(db, "revisions"), newRevision);
    //         await handleRevisionUploaded(projectId);

    //         toast.success("Draft uploaded successfully!");
            
    //         // Reset form
    //         setFile(null);
    //         setPreviewUrl(null);
    //         setDescription("");
    //         setIsUploading(false);
    //         setUploadProg(null);

    //         // Close modal after success
    //         onSuccess?.();
    //         setTimeout(() => onClose(), 500);
    //     } catch (err: unknown) {
    //         if (err instanceof Error && err.name !== "AbortError") {
    //             console.error("Upload failed:", err);
    //             toast.error("Upload failed. Please try again.");
    //         }
    //         setIsUploading(false);
    //         setUploadProg(null);
    //     }
    // };

    const statusLabel = uploadProg === null 
        ? "Uploading..." 
        : uploadProg === 100 
            ? "Complete" 
            : "Uploading...";

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    key="upload-modal"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[10000] bg-black/60 backdrop-blur-md flex items-center justify-center p-4 pointer-events-auto"
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ scale: 0.95, y: 20 }}
                        animate={{ scale: 1, y: 0 }}
                        exit={{ scale: 0.95, y: 20 }}
                        className="relative w-full max-w-2xl bg-card border border-border rounded-2xl overflow-hidden shadow-2xl max-h-[90vh] overflow-y-auto"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Close Button */}
                        <button
                            onClick={onClose}
                            className="absolute top-4 right-4 h-10 w-10 bg-muted/30 hover:bg-muted/50 text-foreground rounded-lg flex items-center justify-center transition-colors z-50"
                        >
                            <X className="h-5 w-5" />
                        </button>

                        {/* Header */}
                        <div className="sticky top-0 bg-card border-b border-border p-6 z-40">
                            <div className="space-y-2">
                                <div className="flex items-center gap-3">
                                    <div className="px-2.5 py-0.5 rounded-lg bg-primary/10 border border-primary/20">
                                        <span className="text-[10px] font-black text-primary uppercase tracking-[0.3em]">
                                            New Version
                                        </span>
                                    </div>
                                    <span className="text-[10px] text-muted-foreground font-black uppercase tracking-[0.2em]">
                                        Chunked Upload
                                    </span>
                                </div>
                                <h2 className="text-xl font-bold text-foreground">
                                    Upload Draft - <span className="text-muted-foreground">{projectName}</span>
                                </h2>
                                <p className="text-xs text-muted-foreground">
                                    Adaptive turbo upload uses parallel chunk transfer and resumable recovery for faster large-file delivery.
                                </p>
                            </div>
                        </div>

                        {/* Content */}
                        <form onSubmit={handleUpload} className="p-6 space-y-6">
                            {/* File Upload Section */}
                            <div className="space-y-4">
                                <label className="text-[11px] font-black uppercase tracking-[0.3em] text-muted-foreground">
                                    Master Video File
                                </label>
                                <AnimatePresence mode="wait">
                                    {previewUrl ? (
                                        <motion.div
                                            key="preview"
                                            initial={{ opacity: 0, scale: 0.97 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            exit={{ opacity: 0, scale: 0.97 }}
                                            className="relative rounded-xl overflow-hidden border border-primary/40 shadow-lg bg-black"
                                        >
                                            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                                            <video
                                                src={previewUrl}
                                                controls
                                                playsInline
                                                className="w-full max-h-[240px] object-contain"
                                            />
                                            {!isUploading && (
                                                <label className="absolute inset-0 flex items-end justify-center pb-4 bg-gradient-to-t from-black/60 to-transparent cursor-pointer opacity-0 hover:opacity-100 transition-opacity">
                                                    <input
                                                        ref={fileInputRef}
                                                        type="file"
                                                        accept="video/*"
                                                        className="hidden"
                                                        onChange={handleFileChange}
                                                    />
                                                    <span className="text-[10px] font-black text-white uppercase tracking-widest bg-white/20 backdrop-blur px-3 py-1.5 rounded-lg border border-white/30">
                                                        Change File
                                                    </span>
                                                </label>
                                            )}
                                            <div className="px-4 py-3 bg-muted/10 border-t border-border flex items-center gap-2">
                                                <FileVideo className="h-4 w-4 text-primary shrink-0" />
                                                <span className="text-[11px] font-black text-foreground truncate">
                                                    {file?.name}
                                                </span>
                                                <span className="ml-auto text-[10px] font-black text-emerald-500 uppercase tracking-widest shrink-0">
                                                    {file ? formatBytes(file.size) : ""}
                                                </span>
                                            </div>
                                        </motion.div>
                                    ) : (
                                        <motion.div
                                            key="picker"
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            exit={{ opacity: 0 }}
                                            className={cn(
                                                "group relative border-2 border-dashed border-border rounded-xl bg-muted/30",
                                                "hover:bg-muted/50 hover:border-primary/50 transition-all duration-500",
                                                "min-h-[160px] flex flex-col items-center justify-center text-center cursor-pointer p-8 shadow-inner"
                                            )}
                                        >
                                            <input
                                                ref={fileInputRef}
                                                type="file"
                                                accept="video/*"
                                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                                                onChange={handleFileChange}
                                                required
                                            />
                                            <div className="space-y-3">
                                                <div className="h-16 w-16 bg-muted/50 rounded-2xl flex items-center justify-center mx-auto border border-border group-hover:scale-110 group-hover:border-primary/40 transition-all duration-500 shadow-lg">
                                                    <UploadCloud className="h-8 w-8 text-muted-foreground group-hover:text-primary transition-colors" />
                                                </div>
                                                <div className="space-y-1">
                                                    <p className="text-sm font-black text-muted-foreground group-hover:text-foreground/90 transition-colors">
                                                        Upload Video
                                                    </p>
                                                    <p className="text-[9px] font-black text-muted-foreground uppercase tracking-[0.2em]">
                                                        MP4 · MOV · WEBM // MAX {MAX_FILE_SIZE_GB} GB
                                                    </p>
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>

                            {/* Description Section */}
                            <div className="space-y-3">
                                <label className="text-[11px] font-black uppercase tracking-[0.3em] text-muted-foreground">
                                    Operational Notes (Optional)
                                </label>
                                <Textarea
                                    placeholder="Specify revisions, technical adjustments, or focus points for this version..."
                                    className="bg-muted/30 border-border focus:border-primary/50 focus:bg-muted/50 transition-all rounded-lg font-medium text-sm text-foreground placeholder:text-muted-foreground p-4 min-h-[100px] shadow-inner"
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    disabled={isUploading}
                                />
                            </div>

                            {/* Upload Progress */}
                            <AnimatePresence>
                                {isUploading && uploadProg !== null && (
                                    <motion.div
                                        key="progress"
                                        initial={{ opacity: 0, y: 8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0 }}
                                        className="space-y-4 p-4 rounded-lg bg-muted/30 border border-border"
                                    >
                                        <div className="space-y-2">
                                            <div className="flex justify-between items-center">
                                                <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest animate-pulse">
                                                    {statusLabel}
                                                </span>
                                                <span className="text-[10px] font-black text-foreground uppercase tracking-widest">
                                                    {Math.round(uploadProg)}%
                                                </span>
                                            </div>
                                            <div className="h-2 w-full bg-muted/50 rounded-full overflow-hidden border border-border">
                                                <motion.div
                                                    animate={{ width: `${uploadProg}%` }}
                                                    transition={{ ease: "linear", duration: 0.2 }}
                                                    className="h-full bg-primary shadow-[0_0_20px_rgba(var(--primary),0.8)]"
                                                />
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Action Buttons */}
                            <div className="flex gap-3 pt-4 border-t border-border">
                                {isUploading && (
                                    <button
                                        type="button"
                                        onClick={handleCancel}
                                        className="h-11 px-6 rounded-lg bg-muted border border-border text-muted-foreground text-[11px] font-black uppercase tracking-widest hover:bg-destructive/10 hover:text-destructive hover:border-destructive/40 transition-all flex items-center justify-center gap-2"
                                    >
                                        <X className="h-4 w-4" />
                                        Cancel
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={onClose}
                                    disabled={isUploading}
                                    className="h-11 px-6 rounded-lg bg-muted border border-border text-muted-foreground text-[11px] font-black uppercase tracking-widest hover:bg-muted/60 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                                >
                                    {isUploading ? "Close" : "Close"}
                                </button>
                                <button
                                    type="submit"
                                    disabled={!file || isUploading}
                                    className="flex-1 h-11 rounded-lg bg-primary text-primary-foreground text-[11px] font-black uppercase tracking-widest hover:bg-primary/90 transition-all flex items-center justify-center gap-2 shadow-md shadow-primary/10 active:scale-[0.98] disabled:opacity-30 disabled:pointer-events-none"
                                >
                                    {isUploading ? (
                                        <>
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            {statusLabel}
                                        </>
                                    ) : (
                                        <>
                                            <UploadCloud className="h-4 w-4" />
                                            Start Upload
                                            <ChevronRight className="h-4 w-4" />
                                        </>
                                    )}
                                </button>
                            </div>

                            {/* Footer Info */}
                            <div className="flex items-center justify-center gap-2 pt-3 border-t border-border">
                                <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="text-[8px] font-black text-muted-foreground uppercase tracking-[0.2em]">
                                    Direct High-Speed Transfer · Resumable · Cloud Proxied
                                </span>
                            </div>
                        </form>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
