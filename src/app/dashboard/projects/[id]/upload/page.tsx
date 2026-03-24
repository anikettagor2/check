"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/context/auth-context";
import { db } from "@/lib/firebase/config";
import { collection, addDoc, query, where, getDocs } from "firebase/firestore";
import {
    startChunkedUpload,
    ChunkedUploadProgress,
    formatBytes,
    formatSpeed,
    formatEta,
} from "@/lib/services/chunked-upload";
import { Revision } from "@/types/schema";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Loader2,
    ArrowLeft,
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
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [description, setDescription] = useState("");
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProg, setUploadProg] = useState<ChunkedUploadProgress | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    useEffect(() => {
        return () => {
            if (previewUrl) URL.revokeObjectURL(previewUrl);
        };
    }, [previewUrl]);

    const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (!f) return;
        setFile(f);
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(URL.createObjectURL(f));
    }, [previewUrl]);

    const handleCancel = () => {
        abortRef.current?.abort();
        setIsUploading(false);
        setUploadProg(null);
    };

    const handleUpload = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!file || !user || typeof id !== "string") return;

        if (file.size > 2 * 1024 * 1024 * 1024) {
            alert("File is too large. Max size is 2 GB.");
            return;
        }

        setIsUploading(true);
        setUploadProg(null);

        const controller = new AbortController();
        abortRef.current = controller;

        try {
            const q = query(
                collection(db, "revisions"),
                where("projectId", "==", id)
            );
            const snap = await getDocs(q);
            let nextVersion = 1;
            if (!snap.empty) {
                // Sort in memory by version (descending) and get the latest
                const revisions = snap.docs.map(doc => doc.data() as Revision);
                const latest = revisions.sort((a, b) => (b.version || 0) - (a.version || 0))[0];
                nextVersion = latest.version + 1;
            }

            const downloadURL = await startChunkedUpload(
                id,
                file,
                (p) => setUploadProg(p),
                controller.signal
            );

            const newRevision: Omit<Revision, "id"> = {
                projectId: id,
                version: nextVersion,
                videoUrl: downloadURL,
                status: "active",
                uploadedBy: user.uid,
                createdAt: Date.now(),
                description,
            };

            await addDoc(collection(db, "revisions"), newRevision);
            await handleRevisionUploaded(id);
            router.push(`/dashboard/projects/${id}`);
        } catch (err: unknown) {
            if (err instanceof Error && err.name !== "AbortError") {
                console.error("Upload failed:", err);
            }
            setIsUploading(false);
            setUploadProg(null);
        }
    };

    const statusLabel = !uploadProg
        ? "Uploading..."
        : uploadProg.status === "assembling"
        ? "Finalizing..."
        : uploadProg.status === "done"
        ? "Complete"
        : "Uploading...";

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
                        <span className="text-[10px] text-muted-foreground font-black uppercase tracking-[0.2em]">Chunked Upload</span>
                    </div>
                    <h1 className="premium-header text-4xl text-foreground">
                        Upload New <span className="text-muted-foreground">Draft</span>
                    </h1>
                    <p className="text-[13px] text-muted-foreground font-medium max-w-md">
                        Adaptive turbo upload uses parallel chunk transfer and resumable recovery for faster large-file delivery.
                    </p>
                </div>

                <form
                    onSubmit={handleUpload}
                    className="glass-panel rounded-[3rem] p-12 border-border relative overflow-hidden space-y-12 shadow-2xl"
                >
                    <div className="absolute top-0 right-0 p-12 opacity-10 pointer-events-none">
                        <Zap className="h-32 w-32 text-primary blur-3xl" />
                    </div>

                    <div className="space-y-6 relative z-10">
                        <Label className="text-[11px] font-black uppercase tracking-[0.3em] text-muted-foreground ml-1">
                            Master Video File
                        </Label>
                        <AnimatePresence mode="wait">
                            {previewUrl ? (
                                <motion.div
                                    key="preview"
                                    initial={{ opacity: 0, scale: 0.97 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.97 }}
                                    className="relative rounded-[2rem] overflow-hidden border border-primary/40 shadow-xl bg-black"
                                >
                                    {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                                    <video src={previewUrl} controls playsInline className="w-full max-h-[320px] object-contain" />
                                    {!isUploading && (
                                        <label className="absolute inset-0 flex items-end justify-center pb-4 bg-gradient-to-t from-black/60 to-transparent cursor-pointer opacity-0 hover:opacity-100 transition-opacity">
                                            <input type="file" accept="video/*" className="hidden" onChange={handleFileChange} />
                                            <span className="text-[10px] font-black text-white uppercase tracking-widest bg-white/20 backdrop-blur px-4 py-2 rounded-xl border border-white/30">
                                                Change File
                                            </span>
                                        </label>
                                    )}
                                    <div className="px-6 py-4 bg-muted/10 border-t border-border flex items-center gap-3">
                                        <FileVideo className="h-4 w-4 text-primary shrink-0" />
                                        <span className="text-[12px] font-black text-foreground truncate">{file?.name}</span>
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
                                        "group relative border-2 border-dashed border-border rounded-[2.5rem] bg-muted/30",
                                        "hover:bg-muted/50 hover:border-primary/50 transition-all duration-700",
                                        "min-h-[200px] flex flex-col items-center justify-center text-center cursor-pointer p-10 shadow-inner"
                                    )}
                                >
                                    <input
                                        type="file"
                                        accept="video/*"
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                                        onChange={handleFileChange}
                                        required
                                    />
                                    <div className="space-y-4">
                                        <div className="h-20 w-20 bg-muted/50 rounded-3xl flex items-center justify-center mx-auto border border-border group-hover:scale-110 group-hover:border-primary/40 transition-all duration-500 shadow-lg">
                                            <UploadCloud className="h-10 w-10 text-muted-foreground group-hover:text-primary transition-colors" />
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-base font-black text-muted-foreground group-hover:text-foreground/90 transition-colors">INITIATE_HANDOVER_PROTOCOL</p>
                                            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.3em]">MP4 · MOV · WEBM // LIMIT 2 GB</p>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    <div className="space-y-6 relative z-10">
                        <Label htmlFor="description" className="text-[11px] font-black uppercase tracking-[0.3em] text-muted-foreground ml-1">
                            Operational Notes
                        </Label>
                        <Textarea
                            id="description"
                            placeholder="Specify revisions, technical adjustments, or focus points for this version..."
                            className="bg-muted/30 border-border focus:border-primary/50 focus:bg-muted/50 transition-all duration-700 rounded-[2rem] font-bold text-foreground placeholder:text-muted-foreground text-base leading-relaxed p-8 min-h-[160px] shadow-inner"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            disabled={isUploading}
                        />
                    </div>

                    <AnimatePresence>
                        {isUploading && uploadProg && (
                            <motion.div
                                key="progress"
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0 }}
                                className="space-y-5 relative z-10 p-6 rounded-[2rem] bg-muted/30 border border-border"
                            >
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center">
                                        <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest animate-pulse">{statusLabel}</span>
                                        <span className="text-[10px] font-black text-foreground uppercase tracking-widest">{Math.round(uploadProg.overallPct)}%</span>
                                    </div>
                                    <div className="h-2 w-full bg-muted/50 rounded-full overflow-hidden border border-border">
                                        <motion.div
                                            animate={{ width: `${uploadProg.overallPct}%` }}
                                            transition={{ ease: "linear", duration: 0.2 }}
                                            className="h-full bg-primary shadow-[0_0_20px_rgba(var(--primary),0.8)]"
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="flex items-center gap-2 px-3 py-2.5 rounded-2xl bg-muted/40 border border-border">
                                        <Layers className="h-3.5 w-3.5 text-primary shrink-0" />
                                        <div>
                                            <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Chunks</p>
                                            <p className="text-[11px] font-black text-foreground">{uploadProg.chunksComplete} / {uploadProg.chunksTotal}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 px-3 py-2.5 rounded-2xl bg-muted/40 border border-border">
                                        <Gauge className="h-3.5 w-3.5 text-primary shrink-0" />
                                        <div>
                                            <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Speed</p>
                                            <p className="text-[11px] font-black text-foreground">{formatSpeed(uploadProg.speedBps)}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 px-3 py-2.5 rounded-2xl bg-muted/40 border border-border">
                                        <Timer className="h-3.5 w-3.5 text-primary shrink-0" />
                                        <div>
                                            <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">ETA</p>
                                            <p className="text-[11px] font-black text-foreground">{formatEta(uploadProg.etaSeconds)}</p>
                                        </div>
                                    </div>
                                </div>
                                <p className="text-[10px] font-bold text-muted-foreground text-center">
                                    {formatBytes(uploadProg.bytesUploaded)} of {formatBytes(uploadProg.totalBytes)} transferred
                                </p>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <div className="relative z-10 pt-4 flex gap-3">
                        {isUploading && (
                            <button
                                type="button"
                                onClick={handleCancel}
                                className="h-16 px-8 rounded-2xl bg-muted border border-border text-muted-foreground text-[12px] font-black uppercase tracking-[0.2em] hover:bg-destructive/10 hover:text-destructive hover:border-destructive/40 transition-all flex items-center justify-center gap-2"
                            >
                                <X className="h-4 w-4" />
                                Cancel
                            </button>
                        )}
                        <button
                            type="submit"
                            disabled={!file || isUploading}
                            className="flex-1 h-16 rounded-2xl bg-primary text-primary-foreground text-[12px] font-black uppercase tracking-[0.2em] hover:bg-zinc-200 transition-all flex items-center justify-center gap-3 shadow-md shadow-primary/10 active:scale-[0.98] disabled:opacity-30 disabled:pointer-events-none group"
                        >
                            {isUploading ? (
                                <><Loader2 className="h-5 w-5 animate-spin" />{statusLabel}</>
                            ) : (
                                <>Start Upload<ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></>
                            )}
                        </button>
                    </div>

                    <div className="flex items-center justify-center gap-3 pt-6 border-t border-border">
                        <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-[9px] font-black text-muted-foreground uppercase tracking-[0.3em]">
                            Encrypted Chunked Transfer · Resumable
                        </span>
                    </div>
                </form>
            </motion.div>
        </div>
    );
}
