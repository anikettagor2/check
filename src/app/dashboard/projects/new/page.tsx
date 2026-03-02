"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { addDoc, collection, doc, getDoc } from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/lib/firebase/config";
import { useAuth } from "@/lib/context/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";  
import { 
    Loader2, 
    UploadCloud, 
    X, 
    FileVideo, 
    IndianRupee,
    ChevronRight,
    ChevronLeft,
    CheckCircle2,
    Zap,
    Clock,
    Link as LinkIcon,
    FileText,
    Image as ImageIcon,
    CreditCard
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

import { handleProjectCreated } from "@/app/actions/admin-actions";

const VIDEO_TYPES = [
    { key: "Reels", label: "Reels", ratio: "9:16", desc: "Instagram Reels, YouTube Shorts, TikTok, Facebook Reels" },
    { key: "Graphics Videos", label: "Graphic", ratio: "1:1", desc: "Instagram Feed, Facebook Feed, LinkedIn Feed" },
    { key: "Ads/UGC Videos", label: "UGC Video", ratio: "9:16", desc: "Instagram Reels, TikTok, YouTube Shorts" },
    { key: "Long Videos", label: "Long VIDEO", ratio: "16:9", desc: "YouTube, Vimeo, OTT Platforms" },
    { key: "Short Videos", label: "Short Videos", ratio: "9:16", desc: "Generic short format" }
];

// Default urgent price if not fetched or set (fallback)
const DEFAULT_URGENT_PRICE = 500;
const BASE_PROJECT_PRICE = 1000;

export default function NewProjectPage() {
    const router = useRouter();
    const { user } = useAuth();
    
    // Step State
    const [currentStep, setCurrentStep] = useState(1);

    // Step 1: Project Information
    const [name, setName] = useState("");
    const [videoType, setVideoType] = useState<string>("Reels");
    const [urgency, setUrgency] = useState<'24hrs' | 'urgent'>('24hrs');
    const [description, setDescription] = useState("");



    // Step 2: Project Uploaded
    const [rawFiles, setRawFiles] = useState<File[]>([]);
    const [scriptFiles, setScriptFiles] = useState<File[]>([]);
    const [scriptText, setScriptText] = useState("");
    const [footageLink, setFootageLink] = useState("");
    
    // Misc
    const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Derived Logic
    const wordCount = description.trim() === "" ? 0 : description.trim().split(/\s+/).length;
    
    // Dynamic pricing calculation
    const basePrice = user?.customRates?.[videoType] || BASE_PROJECT_PRICE;

    const urgentExtraCost = urgency === 'urgent' ? DEFAULT_URGENT_PRICE : 0;
    const finalCost = basePrice + urgentExtraCost;

    const canPayLater = user?.payLater === true;

    const handleNextStep = () => {
        if (currentStep === 1) {
            if (!name) return toast.error("Project name is required.");
            if (wordCount > 100) return toast.error("Description cannot exceed 100 words.");
            setCurrentStep(2);
        } else if (currentStep === 2) {
            setCurrentStep(3);
        } else if (currentStep === 3) {
            if (rawFiles.length === 0 && !footageLink) {
                return toast.error("Please provide either raw files or a Google Drive link.");
            }
            setCurrentStep(4);
        }
    };

    const handlePrevStep = () => {
        setCurrentStep(prev => Math.max(1, prev - 1));
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'raw' | 'script') => {
        if (e.target.files) {
            const filesArray = Array.from(e.target.files);
            if (type === 'raw') {
                setRawFiles(prev => [...prev, ...filesArray]);
            } else {
                setScriptFiles(prev => [...prev, ...filesArray]);
            }
        }
    };

    const removeFile = (index: number, type: 'raw' | 'script') => {
        if (type === 'raw') {
            setRawFiles(prev => prev.filter((_, i) => i !== index));
        } else {
            setScriptFiles(prev => prev.filter((_, i) => i !== index));
        }
    };

    const handleSubmitProject = async (paymentOption: 'pay_now' | 'pay_later') => {
        if (!user) return;
        setIsSubmitting(true);

        try {
            // 1. Upload All Files
            const uploadedRawFiles: any[] = [];
            const uploadedScripts: any[] = [];

            const uploadFile = async (file: File, path: string) => {
                const storageRef = ref(storage, `${path}/${user.uid}/${Date.now()}_${file.name}`);
                const uploadTask = uploadBytesResumable(storageRef, file);

                return new Promise<any>((resolve, reject) => {
                    uploadTask.on('state_changed', 
                        (snapshot) => {
                            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                            setUploadProgress(prev => ({ ...prev, [file.name]: progress }));
                        }, 
                        (error) => reject(error), 
                        async () => {
                            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                            resolve({
                                name: file.name,
                                url: downloadURL,
                                size: file.size,
                                type: file.type,
                                uploadedAt: Date.now()
                            });
                        }
                    );
                });
            };

            for (const file of rawFiles) {
                uploadedRawFiles.push(await uploadFile(file, 'raw_footage'));
            }

            for (const file of scriptFiles) {
                uploadedScripts.push(await uploadFile(file, 'scripts'));
            }

            // 2. Create Project
            const projectData = {
                name,
                videoType,
                description,
                urgency,
                budget: finalCost,
                totalCost: finalCost,
                amountPaid: paymentOption === 'pay_now' ? finalCost : 0, 
                paymentStatus: paymentOption === 'pay_now' ? 'paid' : 'pay_later',
                paymentOption, // either pay_now or pay_later
                deadline: null, // As requested
                footageLink, 
                rawFiles: uploadedRawFiles,
                scripts: uploadedScripts,
                scriptText,
                assignedPMId: user.managedByPM || null,
                assignedSEId: user.managedBy || user.createdBy || null,
                status: 'pending_assignment', 
                createdAt: Date.now(),
                updatedAt: Date.now(),
                members: [user.uid],
                ownerId: user.uid,
                clientId: user.uid,
                isPayLaterRequest: paymentOption === 'pay_later',
                clientName: user.displayName || 'Anonymous Client'
            };

            const projectRef = await addDoc(collection(db, "projects"), projectData);
            
            // 3. Trigger Server-side workflows
            await handleProjectCreated(projectRef.id);

            toast.success("Project created successfully!");
            router.push("/dashboard");

        } catch (error: any) {
            console.error("Error creating project:", error);
            toast.error("Something went wrong: " + error.message);
            setIsSubmitting(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto min-h-[calc(100vh-8rem)] flex flex-col gap-8 pb-10">
            {/* Header / Stepper Layer */}
            <div className="flex flex-col items-center justify-center pt-8 pb-4">
                 <h1 className="text-4xl font-heading font-black tracking-tight text-white mb-8">
                     Create New <span className="text-primary">Project</span>
                 </h1>

                 {/* Stepper */}
                 <div className="flex items-center gap-4 w-full max-w-2xl px-4">
                    {[1, 2, 3, 4].map((step) => (
                         <div key={step} className="flex items-center flex-1 last:flex-none">
                             <div className={cn(
                                 "flex flex-col items-center justify-center gap-2",
                                 currentStep === step ? "opacity-100" : currentStep > step ? "opacity-80" : "opacity-30"
                             )}>
                                 <div className={cn(
                                     "h-10 w-10 flex items-center justify-center rounded-full font-bold transition-all border-2",
                                     currentStep === step 
                                         ? "bg-primary/20 border-primary text-primary shadow-[0_0_15px_rgba(var(--primary),0.3)]" 
                                         : currentStep > step
                                            ? "bg-emerald-500/20 border-emerald-500 text-emerald-500"
                                            : "bg-white/5 border-white/10 text-white/50"
                                 )}>
                                     {currentStep > step ? <CheckCircle2 className="h-5 w-5" /> : step}
                                 </div>
                                 <span className={cn(
                                     "text-[10px] font-bold uppercase tracking-widest text-center leading-none",
                                     currentStep >= step ? "text-primary" : "text-zinc-500"
                                 )}>
                                     {step === 1 ? 'Info' : step === 2 ? 'Format' : step === 3 ? 'Upload' : 'Payment'}
                                 </span>
                             </div>
                             {step < 4 && (
                                 <div className={cn(
                                     "flex-1 h-0.5 mx-2 md:mx-4 rounded-full transition-all",
                                     currentStep > step ? "bg-emerald-500" : "bg-white/10"
                                 )} />
                             )}
                         </div>
                     ))}
                 </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 w-full bg-[#161920]/60 backdrop-blur-xl border border-white/10 rounded-3xl p-6 md:p-10 shadow-2xl relative overflow-hidden">
                {/* Step 1 */}
                {currentStep === 1 && (
                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="space-y-8"
                    >
                        <div className="space-y-1">
                            <h2 className="text-2xl font-bold text-white">Project Information</h2>
                            <p className="text-sm text-zinc-400">Provide the basic details for your new project.</p>
                        </div>
                        
                        <div className="space-y-6">
                            <div className="space-y-2">
                                <Label className="text-xs font-bold uppercase tracking-widest text-zinc-400 ml-1">Project Name *</Label>
                                <Input 
                                    placeholder="e.g. Summer Campaign Video" 
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    className="h-12 bg-white/[0.03] border-white/10 focus:border-primary/50 rounded-xl font-medium text-white placeholder:text-zinc-700"
                                />
                            </div>



                            <div className="space-y-3">
                                <Label className="text-xs font-bold uppercase tracking-widest text-zinc-400 ml-1">Delivery Time (Select One)</Label>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <button 
                                        type="button"
                                        onClick={() => setUrgency('24hrs')}
                                        className={cn(
                                            "flex items-center gap-4 p-4 rounded-xl border transition-all text-left",
                                            urgency === '24hrs' 
                                                ? "bg-primary/10 border-primary shadow-[0_0_15px_rgba(var(--primary),0.1)]" 
                                                : "bg-white/[0.02] border-white/10 hover:border-white/20"
                                        )}
                                    >
                                        <div className={cn("p-2 rounded-lg", urgency === '24hrs' ? "bg-primary/20 text-primary" : "bg-white/5 text-zinc-400")}>
                                            <Clock className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <p className={cn("font-bold", urgency === '24hrs' ? "text-primary" : "text-white")}>Standard Delivery</p>
                                            <p className="text-xs text-zinc-500 font-medium">Get video in 24hrs</p>
                                        </div>
                                    </button>

                                    <button 
                                        type="button"
                                        onClick={() => setUrgency('urgent')}
                                        className={cn(
                                            "flex items-center gap-4 p-4 rounded-xl border transition-all text-left",
                                            urgency === 'urgent' 
                                                ? "bg-amber-500/10 border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.1)]" 
                                                : "bg-white/[0.02] border-white/10 hover:border-white/20"
                                        )}
                                    >
                                        <div className={cn("p-2 rounded-lg", urgency === 'urgent' ? "bg-amber-500/20 text-amber-500" : "bg-white/5 text-zinc-400")}>
                                            <Zap className="w-5 h-5" />
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                                <p className={cn("font-bold", urgency === 'urgent' ? "text-amber-500" : "text-white")}>Urgent Delivery</p>
                                                <span className="text-[9px] font-black bg-amber-500/20 text-amber-500 px-1.5 py-0.5 rounded uppercase">+Extra</span>
                                            </div>
                                            <p className="text-xs text-zinc-500 font-medium">Prioritized queue delivery</p>
                                        </div>
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <div className="flex justify-between items-end">
                                    <Label className="text-xs font-bold uppercase tracking-widest text-zinc-400 ml-1">Project Description *</Label>
                                    <span className={cn("text-xs font-bold", wordCount > 100 ? "text-red-500" : "text-zinc-500")}>{wordCount} / 100 words</span>
                                </div>
                                <Textarea 
                                    placeholder="Provide detailed instructions for the editor..."
                                    value={description}
                                    onChange={e => setDescription(e.target.value)}
                                    className={cn(
                                        "min-h-[120px] resize-none bg-white/[0.03] border-white/10 rounded-xl font-medium text-white placeholder:text-zinc-700",
                                        wordCount > 100 ? "border-red-500 focus:border-red-500" : "focus:border-primary/50"
                                    )}
                                />
                                {wordCount > 100 && <p className="text-xs text-red-500 font-medium">You have exceeded the 100 words limit.</p>}
                            </div>
                        </div>

                        <div className="flex justify-end pt-4">
                            <Button onClick={handleNextStep} size="lg" className="rounded-xl px-10 shadow-xl font-bold tracking-wide">
                                Next Step <ChevronRight className="ml-2 w-4 h-4" />
                            </Button>
                        </div>
                    </motion.div>
                )}

                {/* Step 2 */}
                {currentStep === 2 && (
                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="space-y-8"
                    >
                         <div className="space-y-1">
                            <h2 className="text-2xl font-bold text-white">Video Format</h2>
                            <p className="text-sm text-zinc-400">Select the aspect ratio and format for your video.</p>
                        </div>

                        <div className="space-y-8">
                            <div className="space-y-3">
                                <Label className="text-xs font-bold uppercase tracking-widest text-zinc-400 ml-1">Video Type Format</Label>
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                                    {VIDEO_TYPES.map(vt => {
                                        const price = user?.customRates?.[vt.key] || BASE_PROJECT_PRICE;
                                        const hasCustomRate = user?.customRates?.[vt.key] !== undefined;
                                        const isSelected = videoType === vt.key;
                                        
                                        const is9x16 = vt.ratio === "9:16";
                                        const is16x9 = vt.ratio === "16:9";
                                        const is1x1 = vt.ratio === "1:1";

                                        return (
                                            <button
                                                key={vt.key}
                                                type="button"
                                                onClick={() => setVideoType(vt.key)}
                                                className={cn(
                                                    "flex flex-col relative items-center justify-start p-4 rounded-xl border transition-all text-left overflow-hidden h-full group",
                                                    isSelected
                                                        ? "bg-primary/10 border-primary shadow-[0_0_15px_rgba(var(--primary),0.1)]" 
                                                        : "bg-white/[0.02] border-white/10 hover:border-white/20 hover:bg-white/[0.04]"
                                                )}
                                            >
                                                <div className="w-full h-24 mb-4 flex items-center justify-center bg-black/20 rounded-lg border border-white/5 transition-colors">
                                                    <div 
                                                        className={cn(
                                                            "border-2 transition-all duration-300 rounded-sm flex items-center justify-center shadow-lg",
                                                            isSelected ? "border-primary bg-primary/20 text-primary scale-110" : "border-zinc-600 bg-zinc-800 text-zinc-400 group-hover:border-zinc-400 group-hover:scale-105"
                                                        )}
                                                        style={{
                                                            width: is9x16 ? '36px' : is16x9 ? '72px' : '48px',
                                                            height: is9x16 ? '64px' : is16x9 ? '40px' : '48px',
                                                        }}
                                                    >
                                                        <span className="text-[10px] font-bold">{vt.ratio}</span>
                                                    </div>
                                                </div>
                                                
                                                <div className="flex flex-col w-full h-full">
                                                    <div className="flex items-start justify-between mb-1 gap-1 w-full flex-wrap xl:flex-nowrap">
                                                        <span className={cn("text-xs font-bold leading-tight", isSelected ? "text-primary" : "text-white")}>{vt.label}</span>
                                                        <span className={cn("text-[11px] font-mono font-bold whitespace-nowrap", hasCustomRate ? "text-amber-500" : "text-emerald-500")}>₹{price}</span>
                                                    </div>
                                                    <span className="text-[9px] text-zinc-500 leading-tight line-clamp-3 mb-2">{vt.desc}</span>
                                                    
                                                    <div className="mt-auto">
                                                        {hasCustomRate && (
                                                            <span className="text-[8px] uppercase tracking-widest font-bold text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded">Custom Rate</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center justify-between pt-4">
                            <Button type="button" onClick={handlePrevStep} variant="ghost" size="lg" className="rounded-xl text-zinc-400 hover:text-white">
                                <ChevronLeft className="mr-2 w-4 h-4" /> Go Back
                            </Button>
                            <Button onClick={handleNextStep} size="lg" className="rounded-xl px-10 shadow-xl font-bold tracking-wide">
                                Next Step <ChevronRight className="ml-2 w-4 h-4" />
                            </Button>
                        </div>
                    </motion.div>
                )}

                {/* Step 3 */}
                {currentStep === 3 && (
                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="space-y-8"
                    >
                         <div className="space-y-1">
                            <h2 className="text-2xl font-bold text-white">Upload Assets & Scripts</h2>
                            <p className="text-sm text-zinc-400">Provide all necessary files for the editor to begin working.</p>
                        </div>

                        <div className="space-y-8">
                            {/* Raw Video/Images */}
                            <div className="space-y-3">
                                <Label className="text-xs font-bold uppercase tracking-widest text-zinc-400 ml-1 flex items-center gap-2">
                                    <FileVideo className="w-4 h-4 text-primary" /> 
                                    Upload Raw Video / Images
                                </Label>
                                <div className="border-2 border-dashed border-white/10 rounded-2xl p-8 hover:bg-white/[0.02] hover:border-primary/50 transition-all text-center relative overflow-hidden group">
                                    <input 
                                        type="file" 
                                        multiple
                                        accept="video/*,image/*"
                                        onChange={(e) => handleFileUpload(e, 'raw')}
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                    />
                                    <div className="flex flex-col items-center justify-center gap-3">
                                        <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center group-hover:scale-110 transition-transform">
                                            <UploadCloud className="w-6 h-6" />
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-sm font-bold text-white">Click or drag files to upload</p>
                                            <p className="text-xs text-zinc-500 font-medium tracking-tight">Support for mp4, mov, jpg, png</p>
                                        </div>
                                    </div>
                                </div>
                                {/* File List */}
                                {rawFiles.length > 0 && (
                                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
                                        {rawFiles.map((file, i) => (
                                            <div key={i} className="flex items-center justify-between bg-white/[0.03] border border-white/5 rounded-lg p-2 group pr-1">
                                                <div className="flex items-center gap-2 min-w-0 pr-2">
                                                    {file.type.includes('image') ? <ImageIcon className="w-4 h-4 text-amber-500 shrink-0" /> : <FileVideo className="w-4 h-4 text-blue-500 shrink-0" />}
                                                    <span className="text-[10px] text-zinc-300 truncate font-semibold">{file.name}</span>
                                                </div>
                                                <button type="button" onClick={() => removeFile(i, 'raw')} className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/20 text-red-500 rounded transition-all shrink-0">
                                                    <X className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Scripts */}
                            <div className="space-y-3 pt-4 border-t border-white/5">
                                <Label className="text-xs font-bold uppercase tracking-widest text-zinc-400 ml-1 flex items-center gap-2">
                                    <FileText className="w-4 h-4 text-primary" /> 
                                    Script / Direction
                                </Label>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-4">
                                        <div className="border border-dashed border-white/20 rounded-xl p-6 hover:bg-white/[0.02] hover:border-primary/50 transition-all text-center relative overflow-hidden group h-full flex flex-col items-center justify-center">
                                            <input 
                                                type="file" 
                                                multiple
                                                accept=".pdf,.doc,.docx,.txt"
                                                onChange={(e) => handleFileUpload(e, 'script')}
                                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                            />
                                            <FileText className="w-8 h-8 text-zinc-600 group-hover:text-primary transition-colors mb-2" />
                                            <p className="text-xs font-bold text-white">Upload Script File</p>
                                            <p className="text-[10px] text-zinc-500">PDF, DOC, TXT</p>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Textarea 
                                            placeholder="Or directly paste your script here..."
                                            value={scriptText}
                                            onChange={e => setScriptText(e.target.value)}
                                            className="h-full min-h-[140px] resize-none bg-white/[0.03] border-white/10 rounded-xl font-medium text-white placeholder:text-zinc-700 text-xs leading-relaxed"
                                        />
                                    </div>
                                </div>
                                {/* Script Files List */}
                                {scriptFiles.length > 0 && (
                                    <div className="flex flex-wrap gap-2 mt-4">
                                        {scriptFiles.map((file, i) => (
                                            <div key={i} className="flex items-center gap-2 bg-white/[0.03] border border-white/5 rounded-md px-2 py-1.5 group">
                                                <FileText className="w-3.5 h-3.5 text-pink-500 shrink-0" />
                                                <span className="text-[10px] text-zinc-300 truncate max-w-[150px] font-semibold">{file.name}</span>
                                                <button type="button" onClick={() => removeFile(i, 'script')} className="ml-1 opacity-0 group-hover:opacity-100 hover:text-red-500 transition-all">
                                                    <X className="w-3 h-3" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Google Drive Link */}
                            <div className="space-y-2 pt-4 border-t border-white/5">
                                <Label className="text-xs font-bold uppercase tracking-widest text-zinc-400 ml-1 flex items-center gap-2">
                                    <LinkIcon className="w-4 h-4 text-emerald-500" /> 
                                    Google Drive Link (Optional)
                                </Label>
                                <Input 
                                    placeholder="Paste URL here..." 
                                    value={footageLink}
                                    onChange={e => setFootageLink(e.target.value)}
                                    className="h-12 bg-white/[0.03] border-white/10 focus:border-emerald-500/50 rounded-xl font-medium text-white placeholder:text-zinc-700"
                                />
                            </div>
                        </div>

                        <div className="flex items-center justify-between pt-4">
                            <Button type="button" onClick={handlePrevStep} variant="ghost" size="lg" className="rounded-xl text-zinc-400 hover:text-white">
                                <ChevronLeft className="mr-2 w-4 h-4" /> Go Back
                            </Button>
                            <Button onClick={handleNextStep} size="lg" className="rounded-xl px-10 shadow-xl font-bold tracking-wide">
                                Next Step <ChevronRight className="ml-2 w-4 h-4" />
                            </Button>
                        </div>
                    </motion.div>
                )}

                {/* Step 4 */}
                {currentStep === 4 && (
                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="space-y-8"
                    >
                         <div className="space-y-1">
                            <h2 className="text-2xl font-bold text-white">Review & Payment</h2>
                            <p className="text-sm text-zinc-400">Review your final cost and select a payment method.</p>
                        </div>

                        <div className="bg-[#0b0c0f] border border-white/5 rounded-2xl p-6 md:p-8 space-y-6">
                            <div className="space-y-4">
                                <div className="flex justify-between items-center pb-4 border-b border-white/5">
                                    <span className="text-sm text-zinc-400 font-bold uppercase tracking-widest">Base Project Cost</span>
                                    <div className="flex items-center font-bold text-white">
                                        <IndianRupee className="w-4 h-4 mr-1 text-zinc-500" />
                                        {basePrice.toLocaleString()}
                                    </div>
                                </div>
                                {urgency === 'urgent' && (
                                    <div className="flex justify-between items-center pb-4 border-b border-white/5">
                                        <span className="text-sm text-amber-500 font-bold uppercase tracking-widest flex items-center gap-2">
                                            <Zap className="w-4 h-4" /> Urgent Delivery
                                        </span>
                                        <div className="flex items-center font-bold text-amber-500">
                                            + <IndianRupee className="w-4 h-4 mx-1" />
                                            {DEFAULT_URGENT_PRICE.toLocaleString()}
                                        </div>
                                    </div>
                                )}
                                <div className="flex justify-between items-center pt-2">
                                    <span className="text-lg text-white font-black">Total Cost</span>
                                    <div className="flex items-center text-3xl font-black text-primary">
                                        <IndianRupee className="w-6 h-6 mr-1" />
                                        {finalCost.toLocaleString()}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Progress display if submitting */}
                        {isSubmitting && Object.keys(uploadProgress).length > 0 && (
                            <div className="space-y-3 bg-white/[0.02] border border-white/10 rounded-xl p-4">
                                <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Uploading Assets...</p>
                                {Object.entries(uploadProgress).map(([fileName, progress]) => (
                                    <div key={fileName} className="space-y-1.5">
                                        <div className="flex justify-between text-[10px] font-bold">
                                            <span className="text-white truncate max-w-[200px]">{fileName}</span>
                                            <span className="text-primary">{Math.round(progress)}%</span>
                                        </div>
                                        <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                                            <div className="h-full bg-primary transition-all duration-300" style={{ width: `${progress}%` }} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
                            <Button 
                                type="button"
                                disabled={true}
                                size="lg" 
                                className="h-14 rounded-xl font-bold tracking-wide w-full opacity-50"
                            >
                                <CreditCard className="w-5 h-5 mr-3 opacity-50" />
                                Pay Now (Coming Soon)
                            </Button>
                            
                            {canPayLater ? (
                                <Button 
                                    onClick={() => handleSubmitProject('pay_later')} 
                                    disabled={isSubmitting}
                                    variant="outline"
                                    size="lg" 
                                    className="h-14 rounded-xl font-bold tracking-wide w-full border-primary/50 text-primary hover:bg-primary/10"
                                >
                                    {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Clock className="w-5 h-5 mr-3" />}
                                    Pay Later
                                </Button>
                            ) : (
                                <div className="h-14 rounded-xl border border-dashed border-white/10 flex items-center justify-center text-xs font-bold text-zinc-500 uppercase tracking-widest w-full">
                                    Pay Later Disabled
                                </div>
                            )}
                        </div>

                        {!isSubmitting && (
                            <div className="flex justify-start pt-2">
                                <Button type="button" onClick={handlePrevStep} variant="ghost" size="sm" className="text-zinc-500 hover:text-white">
                                    <ChevronLeft className="mr-1 w-3 h-3" /> Back to Uploads
                                </Button>
                            </div>
                        )}
                    </motion.div>
                )}
            </div>
        </div>
    );
}

