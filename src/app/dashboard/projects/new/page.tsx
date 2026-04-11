"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { addDoc, collection, doc, getDoc, updateDoc, increment } from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import { UploadService } from "@/lib/services/upload-service";
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
    Plus,
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
    CreditCard,
    AlertCircle,
    Mic,
    Square,
    Archive,
    ArrowRight
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { MAX_FILE_SIZE_BYTES, MAX_FILE_SIZE_GB } from "@/lib/constants";

import { handleProjectCreated } from "@/app/actions/admin-actions";
import { CURRENCY } from "@/lib/razorpay";

// Function to load Razorpay script dynamically
const loadRazorpayScript = () => {
    return new Promise((resolve) => {
        if ((window as any).Razorpay) {
            resolve(true);
            return;
        }
        const script = document.createElement("script");
        script.src = "https://checkout.razorpay.com/v1/checkout.js";
        script.onload = () => resolve(true);
        script.onerror = () => resolve(false);
        document.body.appendChild(script);
    });
};

interface UploadedFile {
    name: string;
    url: string;
    playbackId?: string;
    storagePath?: string;
    size: number;
    type: string;
    uploadedAt: number;
}

interface FileWithProgress {
    file: File;
    progress: number;
    status: 'pending' | 'uploading' | 'complete' | 'error';
    uploadedData?: UploadedFile;
    error?: string;
}

const VIDEO_TYPES = [
    { key: "Reel Format", label: "Reel Format", desc: "Optimized for vertical consumption" },
    { key: "Long Video", label: "Long Video", desc: "Standard horizontal long-form content" },
    { key: "Documentary", label: "Documentary", desc: "Story-telling and cinematic archives" },
    { key: "Podcast Edit", label: "Podcast Edit", desc: "Multi-cam or single stream podcasting" },
    { key: "Motion Graphic", label: "Motion Graphic", desc: "Animated vectors and clean graphics" },
    { key: "Cinematic Event", label: "Cinematic Event", desc: "High production value event coverage" }
];

const VIDEO_TYPE_ALIASES: Record<string, string[]> = {
    "Reel Format": ["Reel Format", "Reels", "Short Videos"],
    "Long Video": ["Long Video", "Long Videos"],
    "Documentary": ["Documentary", "Long Videos"],
    "Podcast Edit": ["Podcast Edit", "Long Videos"],
    "Motion Graphic": ["Motion Graphic", "Graphics Videos"],
    "Cinematic Event": ["Cinematic Event", "Ads/UGC Videos"]
};

function getResolvedClientRate(customRates: Record<string, number> | undefined, videoType: string) {
    const aliases = VIDEO_TYPE_ALIASES[videoType] || [videoType];
    for (const alias of aliases) {
        if (customRates?.[alias] !== undefined) return customRates[alias];
    }
    return BASE_PROJECT_PRICE;
}

function isVideoTypeAllowed(allowedFormats: Record<string, boolean> | undefined, videoType: string) {
    if (!allowedFormats || Object.keys(allowedFormats).length === 0) return true;
    const aliases = VIDEO_TYPE_ALIASES[videoType] || [videoType];
    return aliases.some((alias) => allowedFormats[alias] === true);
}

const ASPECT_RATIOS = [
    { key: "9:16", label: "9:16", desc: "Reels / Shorts" },
    { key: "1:1", label: "1:1", desc: "Instagram Post" },
    { key: "16:9", label: "16:9", desc: "YouTube Standard" }
];

const DEFAULT_URGENT_PRICE = 500;
const BASE_PROJECT_PRICE = 1000;
const MAX_CONCURRENT_UPLOADS = 3; // Upload up to 3 files simultaneously
const DESCRIPTION_WORD_LIMIT = 500;

export default function NewProjectPage() {
    const router = useRouter();
    const { user } = useAuth();
    
    // Step State
    const [currentStep, setCurrentStep] = useState(1);

    // Step 1: Project Information
    const [name, setName] = useState("");
    const [videoType, setVideoType] = useState<string>("Reel Format");
    const [aspectRatio, setAspectRatio] = useState<string>("9:16");
    const [urgency, setUrgency] = useState<'24hrs' | 'urgent'>('24hrs');
    const [description, setDescription] = useState("");
    const [selectedPriceIndex, setSelectedPriceIndex] = useState<number>(0); // Index of selected price from multiTierRates

    // Step 3: Files with immediate upload tracking
    const [rawFiles, setRawFiles] = useState<FileWithProgress[]>([]);
    const [bRoleFiles, setBRoleFiles] = useState<FileWithProgress[]>([]);
    const [scriptFiles, setScriptFiles] = useState<FileWithProgress[]>([]);
    const [referenceFiles, setReferenceFiles] = useState<FileWithProgress[]>([]);
    const [audioFiles, setAudioFiles] = useState<FileWithProgress[]>([]);
    const [scriptText, setScriptText] = useState("");
    const [footageLinkInput, setFootageLinkInput] = useState("");
    const [footageLinks, setFootageLinks] = useState<string[]>([]);
    const [referenceLinkInput, setReferenceLinkInput] = useState("");
    const [referenceLinks, setReferenceLinks] = useState<string[]>([]);
    const [isRecordingAudio, setIsRecordingAudio] = useState(false);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const recordingStreamRef = useRef<MediaStream | null>(null);
    const recordedAudioChunksRef = useRef<BlobPart[]>([]);
    
    // Misc
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Derived Logic
    const wordCount = description.trim() === "" ? 0 : description.trim().split(/\s+/).length;
    
    // Dynamic pricing calculation with multi-tier support
    const availableVideoTypes = VIDEO_TYPES.filter((vt) => isVideoTypeAllowed(user?.allowedFormats, vt.key));
    
    // Get available prices for the selected video type
    const availablePrices = user?.multiTierRates?.[videoType] || [];
    const basePrice = availablePrices.length > 0 
        ? availablePrices[Math.min(selectedPriceIndex, availablePrices.length - 1)].price 
        : getResolvedClientRate(user?.customRates, videoType);
    
    // Project accounting is GST-exclusive; GST is only applied during billing/invoice.
    const gstRate = 0.18;
    const urgentExtraCost = urgency === 'urgent' ? DEFAULT_URGENT_PRICE : 0;
    const projectTotalWithoutGst = basePrice + urgentExtraCost;
    const gstAmount = projectTotalWithoutGst * gstRate;
    const finalTotalWithGst = projectTotalWithoutGst + gstAmount;

    // 50% upfront in project ledger (without GST), plus GST only at billing time.
    const upfrontPaymentWithoutGst = projectTotalWithoutGst / 2;
    const upfrontPaymentWithGst = upfrontPaymentWithoutGst * (1 + gstRate);

    const canPayLater = user?.payLater === true;
    const [isProcessingPayment, setIsProcessingPayment] = useState(false);
    const [uploadToken] = useState(() => `req_${Math.random().toString(36).substring(2, 15)}_${Date.now()}`);
    
    // Pay Later limit check
    const creditLimit = user?.creditLimit || 0;
    const pendingDues = user?.pendingDues || 0;
    const canUsePayLater = canPayLater && (pendingDues + upfrontPaymentWithoutGst <= creditLimit);
    const remainingCredit = Math.max(0, creditLimit - pendingDues);

    useEffect(() => {
        if (availableVideoTypes.length === 0) return;
        
        // Only reset price index if the current videoType is not available
        const isCurrentTypeAvailable = availableVideoTypes.some((vt) => vt.key === videoType);
        if (!isCurrentTypeAvailable) {
            setVideoType(availableVideoTypes[0].key);
            setSelectedPriceIndex(0);
        }
    }, [availableVideoTypes]);

    // Separate effect to track when user intentionally changes video type
    const prevVideoTypeRef = useRef(videoType);
    useEffect(() => {
        if (prevVideoTypeRef.current !== videoType) {
            setSelectedPriceIndex(0);
            prevVideoTypeRef.current = videoType;
        }
    }, [videoType]);

    // Check if all files are uploaded
    const allFilesUploaded = [...rawFiles, ...bRoleFiles, ...scriptFiles, ...referenceFiles, ...audioFiles].every(
        f => f.status === 'complete'
    );
    const hasUploadingFiles = [...rawFiles, ...bRoleFiles, ...scriptFiles, ...referenceFiles, ...audioFiles].some(
        f => f.status === 'uploading'
    );
    const totalUploadProgress = (() => {
        const allFiles = [...rawFiles, ...bRoleFiles, ...scriptFiles, ...referenceFiles, ...audioFiles];
        if (allFiles.length === 0) return 100;
        const total = allFiles.reduce((acc, f) => acc + f.progress, 0);
        return Math.round(total / allFiles.length);
    })();

    useEffect(() => {
        return () => {
            if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
                mediaRecorderRef.current.stop();
            }
            if (recordingStreamRef.current) {
                recordingStreamRef.current.getTracks().forEach((track) => track.stop());
                recordingStreamRef.current = null;
            }
        };
    }, []);

    const uploadFileImmediately = useCallback(async (
        file: File, 
        path: string,
        onProgress: (progress: number) => void,
        onComplete: (data: UploadedFile) => void,
        onError: (error: string) => void
    ) => {
        if (!user) return;

        // Map path to UploadService type
        let uploadType: 'raw' | 'asset' = 'asset';
        if (path === 'raw_footage' || path === 'brole_footage') {
            uploadType = 'raw';
        }

        try {
            // Use the unified upload service for everything
            const result = await UploadService.uploadFileUnified(
                file,
                uploadToken,
                onProgress,
                {
                    type: uploadType,
                    // If it's a non-video, we can specify a custom storage path if desired
                    // Otherwise UploadService uses a default consistent path
                }
            );

            const isMux = result.startsWith('mux://');

            onComplete({
                name: file.name,
                url: isMux ? "" : result,
                playbackId: "", 
                storagePath: result, // For Mux it's mux://id, for Firebase it's the download URL
                size: file.size,
                type: file.type,
                uploadedAt: Date.now()
            });
        } catch (err: any) {
            console.error('Upload error:', err);
            onError(err.message || 'Upload failed');
        }
    }, [user, uploadToken]);

    // Handle file selection and immediate upload
    const enqueueFilesForUpload = useCallback((
        files: File[],
        type: 'raw' | 'brole' | 'script' | 'reference' | 'audio'
    ) => {
        if (!files.length || !user) return;

        // Filter files by size
        const validFiles: File[] = [];
        const tooLargeFiles: File[] = [];

        files.forEach(file => {
            if (file.size > MAX_FILE_SIZE_BYTES) {
                tooLargeFiles.push(file);
            } else {
                validFiles.push(file);
            }
        });

        if (tooLargeFiles.length > 0) {
            toast.error(`${tooLargeFiles.length} file(s) exceed the ${MAX_FILE_SIZE_GB}GB limit and were skipped.`);
        }

        if (!validFiles.length) return;

        const path =
            type === 'raw'
                ? 'raw_footage'
                : type === 'brole'
                    ? 'brole_footage'
                    : type === 'script'
                        ? 'scripts'
                        : type === 'audio'
                            ? 'audio_assets'
                            : 'references';
        
        const newFileEntries: FileWithProgress[] = validFiles.map(file => ({
            file,
            progress: 0,
            status: 'pending' as const
        }));

        // Add files to state
        if (type === 'raw') {
            setRawFiles(prev => [...prev, ...newFileEntries]);
        } else if (type === 'brole') {
            setBRoleFiles(prev => [...prev, ...newFileEntries]);
        } else if (type === 'script') {
            setScriptFiles(prev => [...prev, ...newFileEntries]);
        } else if (type === 'audio') {
            setAudioFiles(prev => [...prev, ...newFileEntries]);
        } else {
            setReferenceFiles(prev => [...prev, ...newFileEntries]);
        }

        // Start uploads with bounded concurrency for better throughput on large batches.
        const setState =
            type === 'raw'
                ? setRawFiles
                : type === 'brole'
                    ? setBRoleFiles
                    : type === 'script'
                        ? setScriptFiles
                        : type === 'audio'
                            ? setAudioFiles
                            : setReferenceFiles;

        const uploadSingleFile = (file: File) => new Promise<void>((resolve) => {
            setState(prev => {
                const fileIndex = prev.findIndex(f => f.file === file && f.status === 'pending');
                if (fileIndex === -1) return prev;

                const updated = [...prev];
                updated[fileIndex] = { ...updated[fileIndex], status: 'uploading' };
                return updated;
            });

            uploadFileImmediately(
                file,
                path,
                (progress) => {
                    setState(prev => {
                        const fileIndex = prev.findIndex(f => f.file === file);
                        if (fileIndex === -1) return prev;
                        const updated = [...prev];
                        updated[fileIndex] = { ...updated[fileIndex], progress };
                        return updated;
                    });
                },
                (uploadedData) => {
                    setState(prev => {
                        const fileIndex = prev.findIndex(f => f.file === file);
                        if (fileIndex === -1) return prev;
                        const updated = [...prev];
                        updated[fileIndex] = {
                            ...updated[fileIndex],
                            status: 'complete',
                            progress: 100,
                            uploadedData
                        };
                        return updated;
                    });
                    resolve();
                },
                (error) => {
                    setState(prev => {
                        const fileIndex = prev.findIndex(f => f.file === file);
                        if (fileIndex === -1) return prev;
                        const updated = [...prev];
                        updated[fileIndex] = {
                            ...updated[fileIndex],
                            status: 'error',
                            error
                        };
                        return updated;
                    });
                    toast.error(`Failed to upload ${file.name}`);
                    resolve();
                }
            );
        });

        const queue = [...validFiles];
        let activeUploads = 0;

        const processQueue = () => {
            while (activeUploads < MAX_CONCURRENT_UPLOADS && queue.length > 0) {
                const nextFile = queue.shift();
                if (!nextFile) return;

                activeUploads += 1;
                uploadSingleFile(nextFile).finally(() => {
                    activeUploads -= 1;
                    processQueue();
                });
            }
        };

        processQueue();

    }, [user, uploadFileImmediately]);

    // Handle file selection and immediate upload
    const handleFileUpload = useCallback((
        e: React.ChangeEvent<HTMLInputElement>,
        type: 'raw' | 'brole' | 'script' | 'reference' | 'audio'
    ) => {
        if (!e.target.files || !user) return;
        const files = Array.from(e.target.files);
        enqueueFilesForUpload(files, type);

        // Reset input
        e.target.value = '';
    }, [user, enqueueFilesForUpload]);

    const startAudioRecording = async () => {
        if (isRecordingAudio) return;
        if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined') {
            toast.error('Audio recording is not supported in this browser.');
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            recordingStreamRef.current = stream;

            const recorder = new MediaRecorder(stream);
            mediaRecorderRef.current = recorder;
            recordedAudioChunksRef.current = [];

            recorder.ondataavailable = (event) => {
                if (event.data && event.data.size > 0) {
                    recordedAudioChunksRef.current.push(event.data);
                }
            };

            recorder.onstop = () => {
                const chunks = recordedAudioChunksRef.current;
                if (chunks.length > 0) {
                    const blob = new Blob(chunks, { type: 'audio/webm' });
                    const recordedFile = new File([blob], `recorded-audio-${Date.now()}.webm`, { type: blob.type || 'audio/webm' });
                    enqueueFilesForUpload([recordedFile], 'audio');
                }

                if (recordingStreamRef.current) {
                    recordingStreamRef.current.getTracks().forEach((track) => track.stop());
                    recordingStreamRef.current = null;
                }

                mediaRecorderRef.current = null;
                recordedAudioChunksRef.current = [];
                setIsRecordingAudio(false);
            };

            recorder.start();
            setIsRecordingAudio(true);
            toast.success('Audio recording started.');
        } catch (error) {
            console.error('Audio recording failed:', error);
            toast.error('Unable to access microphone. Please allow mic permission.');
        }
    };

    const stopAudioRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
            toast.success('Audio recording stopped and uploading started.');
        }
    };

    const removeFile = async (index: number, type: 'raw' | 'brole' | 'script' | 'reference' | 'audio') => {
    // 1. Identify which list we are looking at
    let fileList;
    let setFileList;

    if (type === 'raw') { fileList = rawFiles; setFileList = setRawFiles; }
    else if (type === 'brole') { fileList = bRoleFiles; setFileList = setBRoleFiles; }
    else if (type === 'script') { fileList = scriptFiles; setFileList = setScriptFiles; }
    else if (type === 'audio') { fileList = audioFiles; setFileList = setAudioFiles; }
    else { fileList = referenceFiles; setFileList = setReferenceFiles; }

    const fileToRemove = fileList[index];
    const data = fileToRemove?.uploadedData;

    if (fileToRemove.status === 'complete' && data?.url) {
        const path = data.storagePath;
        
        // BETTER CHECK: Does the URL contain "cloudinary.com"?
        const isCloudinaryFile = data.url.includes('cloudinary.com');

        try {
            if (isCloudinaryFile) {
                // --- CLOUDINARY DELETE ---
                await fetch('/api/cloudinary/video/delete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ publicId: path }),
                });
                toast.success("Removed from Cloudinary");
            } else {
                // --- FIREBASE DELETE ---
                const storageRef = ref(storage, path);
                await deleteObject(storageRef);
                toast.success("Removed from Firebase");
            }
        } catch (error) {
            console.error("Cleanup error:", error);
        }
    }

    // Always remove from UI at the end
    setFileList(prev => prev.filter((_, i) => i !== index));
};
    // const removeFile = (index: number, type: 'raw' | 'brole' | 'script' | 'reference' | 'audio') => {
    //     if (type === 'raw') {
    //         setRawFiles(prev => prev.filter((_, i) => i !== index));
    //     } else if (type === 'brole') {
    //         setBRoleFiles(prev => prev.filter((_, i) => i !== index));
    //     } else if (type === 'script') {
    //         setScriptFiles(prev => prev.filter((_, i) => i !== index));
    //     } else if (type === 'audio') {
    //         setAudioFiles(prev => prev.filter((_, i) => i !== index));
    //     } else {
    //         setReferenceFiles(prev => prev.filter((_, i) => i !== index));
    //     }
    // };

    const addReferenceLink = () => {
        const trimmedLink = referenceLinkInput.trim();
        if (!trimmedLink) return;
        if (referenceLinks.includes(trimmedLink)) {
            toast.error("This reference link is already added.");
            return;
        }

        setReferenceLinks((prev) => [...prev, trimmedLink]);
        setReferenceLinkInput("");
    };

    const removeReferenceLink = (index: number) => {
        setReferenceLinks((prev) => prev.filter((_, i) => i !== index));
    };

    const addFootageLink = () => {
        const trimmedLink = footageLinkInput.trim();
        if (!trimmedLink) return;
        if (footageLinks.includes(trimmedLink)) {
            toast.error("This Google Drive link is already added.");
            return;
        }

        setFootageLinks((prev) => [...prev, trimmedLink]);
        setFootageLinkInput("");
    };

    const removeFootageLink = (index: number) => {
        setFootageLinks((prev) => prev.filter((_, i) => i !== index));
    };

    const handleNextStep = () => {
        if (currentStep === 1) {
            if (!name) return toast.error("Project name is required.");
            if (wordCount > DESCRIPTION_WORD_LIMIT) return toast.error(`Description cannot exceed ${DESCRIPTION_WORD_LIMIT} words.`);
            setCurrentStep(2);
        } else if (currentStep === 2) {
            setCurrentStep(3);
        } else if (currentStep === 3) {
            if (rawFiles.length === 0 && footageLinks.length === 0 && !footageLinkInput.trim()) {
                return toast.error("Please provide either raw files or a Google Drive link.");
            }
            if (hasUploadingFiles) {
                return toast.error("Please wait for all files to finish uploading.");
            }
            const failedFiles = [...rawFiles, ...bRoleFiles, ...scriptFiles, ...referenceFiles, ...audioFiles].filter(f => f.status === 'error');
            if (failedFiles.length > 0) {
                return toast.error(`${failedFiles.length} file(s) failed to upload. Please remove and re-upload them.`);
            }
            setCurrentStep(4);
        }
    };

    const handlePrevStep = () => {
        setCurrentStep(prev => Math.max(1, prev - 1));
    };

    // Collect uploaded file data
    const getUploadedFiles = () => {
        const uploadedRawFiles = rawFiles
            .filter(f => f.status === 'complete' && f.uploadedData)
            .map(f => f.uploadedData!);
        
        const uploadedBRoleFiles = bRoleFiles
            .filter(f => f.status === 'complete' && f.uploadedData)
            .map(f => f.uploadedData!);
        
        const uploadedScripts = scriptFiles
            .filter(f => f.status === 'complete' && f.uploadedData)
            .map(f => f.uploadedData!);
        
        const uploadedReferences = referenceFiles
            .filter(f => f.status === 'complete' && f.uploadedData)
            .map(f => f.uploadedData!);

        const uploadedAudioFiles = audioFiles
            .filter(f => f.status === 'complete' && f.uploadedData)
            .map(f => f.uploadedData!);

        return { uploadedRawFiles, uploadedBRoleFiles, uploadedScripts, uploadedReferences, uploadedAudioFiles };
    };

    // Create project in Firestore
    const createProject = async (paymentOption: 'pay_now' | 'pay_later', razorpayPaymentId?: string) => {
        if (!user) throw new Error("User not authenticated");

        const { uploadedRawFiles, uploadedBRoleFiles, uploadedScripts, uploadedReferences, uploadedAudioFiles } = getUploadedFiles();
        const normalizedFootageLinks = footageLinkInput.trim()
            ? Array.from(new Set([...footageLinks, footageLinkInput.trim()]))
            : footageLinks;
        const normalizedReferenceLinks = referenceLinkInput.trim()
            ? Array.from(new Set([...referenceLinks, referenceLinkInput.trim()]))
            : referenceLinks;

        // Prepare pricing tier info
        const pricingTierInfo = availablePrices.length > 0 ? {
            selectedPricingTier: selectedPriceIndex,
            pricingTierLabel: availablePrices[selectedPriceIndex].label || `Option ${selectedPriceIndex + 1}`,
            pricingTierPrice: availablePrices[selectedPriceIndex].price
        } : {};

        const projectData = {
            name,
            videoType,
            description,
            urgency,
            budget: projectTotalWithoutGst,
            totalCost: projectTotalWithoutGst,
            upfrontAmount: upfrontPaymentWithoutGst,
            remainingAmount: projectTotalWithoutGst - upfrontPaymentWithoutGst,
            amountPaid: paymentOption === 'pay_now' ? upfrontPaymentWithoutGst : 0,
            paymentStatus: paymentOption === 'pay_now' ? 'half_paid' : 'unpaid',
            paymentOption,
            razorpayPaymentId: razorpayPaymentId || null,
            deadline: null,
            rawFiles: uploadedRawFiles,
            bRoleFiles: uploadedBRoleFiles,
            scripts: uploadedScripts,
            audioFiles: uploadedAudioFiles,
            footageLink: normalizedFootageLinks[0] || "",
            footageLinks: normalizedFootageLinks,
            referenceFiles: uploadedReferences,
            referenceLink: normalizedReferenceLinks[0] || "",
            referenceLinks: normalizedReferenceLinks,
            aspectRatio,
            videoFormat: videoType,
            scriptText,
            assignedPMId: user.managedByPM || null,
            assignedSEId: user.managedBy || user.createdBy || null,
            status: 'project_created', 
            createdAt: Date.now(),
            updatedAt: Date.now(),
            members: [user.uid],
            ownerId: user.uid,
            clientId: user.uid,
            isPayLaterRequest: paymentOption === 'pay_later',
            clientName: user.displayName || 'Anonymous Client',
            uploadToken,
            gstRate: 18,
            gstAppliedAtBilling: true,
            ...pricingTierInfo
        };

        const projectRef = await addDoc(collection(db, "projects"), projectData);
        await handleProjectCreated(projectRef.id);
        return projectRef.id;
    };

    // Handle Pay Later submission
    const handlePayLater = async () => {
        if (!user) return;
        
        // Double-check pay later limit
        if (!canUsePayLater) {
            toast.error("You have exceeded your Pay Later limit. Please use Pay Now or clear pending dues.");
            return;
        }
        
        setIsSubmitting(true);

        try {
            await createProject('pay_later');
            
            // Update user's pending dues
            const userRef = doc(db, "users", user.uid);
            await updateDoc(userRef, {
                pendingDues: increment(upfrontPaymentWithoutGst)
            });
            
            toast.success("Project created successfully!");
            router.push("/dashboard");
        } catch (error: any) {
            console.error("Error creating project:", error);
            toast.error("Something went wrong: " + error.message);
            setIsSubmitting(false);
        }
    };

    // Handle Pay Now with Razorpay
    const handlePayNow = async () => {
        if (!user) return;
        setIsProcessingPayment(true);

        try {
            // 1. Load Razorpay Script
            const scriptLoaded = await loadRazorpayScript();
            if (!scriptLoaded) {
                toast.error("Razorpay SDK failed to load. Please check your internet connection.");
                setIsProcessingPayment(false);
                return;
            }

            // 2. Create a temporary order ID for Razorpay
            const tempOrderId = `temp_${Date.now()}`;
            
            // 3. Create Razorpay Order
            const orderRes = await fetch("/api/create-order", {
                method: "POST",
                body: JSON.stringify({ amount: upfrontPaymentWithGst, projectId: tempOrderId }),
                headers: { "Content-Type": "application/json" }
            });
            
            if (!orderRes.ok) {
                const errorData = await orderRes.json();
                throw new Error(errorData.error || "Failed to create payment order");
            }
            
            const orderData = await orderRes.json();

            // 4. Open Razorpay Checkout
            const options = {
                key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID!,
                amount: orderData.amount,
                currency: orderData.currency,
                name: "EditoHub Studio",
                description: `Project: ${name}`,
                order_id: orderData.id,
                handler: async function (response: any) {
                    try {
                        setIsSubmitting(true);
                        
                        // Create project with payment details
                        await createProject('pay_now', response.razorpay_payment_id);
                        
                        toast.success("Payment successful! Project created.");
                        router.push("/dashboard");
                    } catch (err: any) {
                        console.error("Error creating project after payment:", err);
                        toast.error("Payment received but project creation failed. Please contact support.");
                        setIsSubmitting(false);
                    }
                },
                prefill: {
                    name: user?.displayName || "",
                    email: user?.email || "",
                    contact: user?.phoneNumber || "",
                },
                theme: {
                    color: "#D946EF",
                },
                modal: {
                    ondismiss: function() {
                        setIsProcessingPayment(false);
                        toast.info("Payment cancelled");
                    }
                }
            };

            const paymentObject = new (window as any).Razorpay(options);
            paymentObject.open();

        } catch (error: any) {
            console.error("Payment Error:", error);
            toast.error("Payment failed: " + error.message);
            setIsProcessingPayment(false);
        }
    };

    // Legacy handler for compatibility
    const handleSubmitProject = async (paymentOption: 'pay_now' | 'pay_later') => {
        if (paymentOption === 'pay_later') {
            await handlePayLater();
        } else {
            await handlePayNow();
        }
    };


    return (
        <div className="max-w-4xl mx-auto min-h-[calc(100vh-8rem)] flex flex-col gap-8 pb-10">
            {/* Header / Stepper Layer */}
            <div className="flex flex-col items-center justify-center pt-8 pb-4">
                 <h1 className="text-4xl font-heading font-black tracking-tight text-foreground mb-8">
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
                                            : "bg-muted border-border text-foreground/50"
                                 )}>
                                     {currentStep > step ? <CheckCircle2 className="h-5 w-5" /> : step}
                                 </div>
                                 <span className={cn(
                                     "text-[10px] font-bold uppercase tracking-widest text-center leading-none",
                                     currentStep >= step ? "text-primary" : "text-muted-foreground"
                                 )}>
                                     {step === 1 ? 'Info' : step === 2 ? 'Format' : step === 3 ? 'Upload' : 'Payment'}
                                 </span>
                             </div>
                             {step < 4 && (
                                 <div className={cn(
                                     "flex-1 h-0.5 mx-2 md:mx-4 rounded-full transition-all",
                                     currentStep > step ? "bg-emerald-500" : "bg-muted"
                                 )} />
                             )}
                         </div>
                     ))}
                 </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 w-full bg-card/60 backdrop-blur-xl border border-border rounded-3xl p-6 md:p-10 shadow-2xl relative overflow-hidden">
                {/* Step 1 */}
                {currentStep === 1 && (
                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="space-y-8"
                    >
                        <div className="space-y-1">
                            <h2 className="text-2xl font-bold text-foreground">Project Information</h2>
                            <p className="text-sm text-muted-foreground">Provide the basic details for your new project.</p>
                        </div>
                        
                        <div className="space-y-6">
                            <div className="space-y-2">
                                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1">Project Name *</Label>
                                <Input 
                                    placeholder="e.g. Summer Campaign Video" 
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    className="h-12 bg-muted/50 border-border focus:border-primary/50 rounded-xl font-medium text-foreground placeholder:text-muted-foreground"
                                />
                            </div>



                            <div className="space-y-3">
                                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1">Delivery Time (Select One)</Label>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <button 
                                        type="button"
                                        onClick={() => setUrgency('24hrs')}
                                        className={cn(
                                            "flex items-center gap-4 p-4 rounded-xl border transition-all text-left",
                                            urgency === '24hrs' 
                                                ? "bg-primary/10 border-primary shadow-[0_0_15px_rgba(var(--primary),0.1)]" 
                                                : "bg-muted/50 border-border hover:border-border"
                                        )}
                                    >
                                        <div className={cn("p-2 rounded-lg", urgency === '24hrs' ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground")}>
                                            <Clock className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <p className={cn("font-bold", urgency === '24hrs' ? "text-primary" : "text-foreground")}>Standard Delivery</p>
                                            <p className="text-xs text-muted-foreground font-medium">Get video in 24hrs</p>
                                        </div>
                                    </button>

                                    <button 
                                        type="button"
                                        onClick={() => setUrgency('urgent')}
                                        className={cn(
                                            "flex items-center gap-4 p-4 rounded-xl border transition-all text-left",
                                            urgency === 'urgent' 
                                                ? "bg-amber-500/10 border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.1)]" 
                                                : "bg-muted/50 border-border hover:border-border"
                                        )}
                                    >
                                        <div className={cn("p-2 rounded-lg", urgency === 'urgent' ? "bg-amber-500/20 text-amber-500" : "bg-muted text-muted-foreground")}>
                                            <Zap className="w-5 h-5" />
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                                <p className={cn("font-bold", urgency === 'urgent' ? "text-amber-500" : "text-foreground")}>Urgent Delivery</p>
                                                <span className="text-[9px] font-black bg-amber-500/20 text-amber-500 px-1.5 py-0.5 rounded uppercase">+Extra</span>
                                            </div>
                                            <p className="text-xs text-muted-foreground font-medium">Prioritized queue delivery</p>
                                        </div>
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <div className="flex justify-between items-end">
                                    <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1">Project Description *</Label>
                                    <span className={cn("text-xs font-bold", wordCount > DESCRIPTION_WORD_LIMIT ? "text-red-500" : "text-muted-foreground")}>{wordCount} / {DESCRIPTION_WORD_LIMIT} words</span>
                                </div>
                                <Textarea 
                                    placeholder="Provide detailed instructions for the editor..."
                                    value={description}
                                    onChange={e => setDescription(e.target.value)}
                                    className={cn(
                                        "min-h-[120px] resize-none bg-muted/50 border-border rounded-xl font-medium text-foreground placeholder:text-muted-foreground",
                                        wordCount > DESCRIPTION_WORD_LIMIT ? "border-red-500 focus:border-red-500" : "focus:border-primary/50"
                                    )}
                                />
                                {wordCount > DESCRIPTION_WORD_LIMIT && <p className="text-xs text-red-500 font-medium">You have exceeded the {DESCRIPTION_WORD_LIMIT} words limit.</p>}
                            </div>

                            {/* Audio Upload & Recording */}
                            <div className="space-y-3 pt-2">
                                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1 flex items-center gap-2">
                                    <Mic className="w-4 h-4 text-primary" />
                                    Audio File / Voice Note (Optional)
                                </Label>
                                <p className="text-[11px] text-muted-foreground ml-1">Add your voice brief below the description so editors understand your exact direction.</p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-4">
                                        <div className="border border-dashed border-border rounded-xl p-6 hover:bg-muted/50 hover:border-primary/50 transition-all text-center relative overflow-hidden group h-full flex flex-col items-center justify-center">
                                            <input
                                                type="file"
                                                multiple
                                                accept="audio/*"
                                                onChange={(e) => handleFileUpload(e, 'audio')}
                                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                            />
                                            <UploadCloud className="w-8 h-8 text-muted-foreground group-hover:text-primary transition-colors mb-2" />
                                            <p className="text-xs font-bold text-foreground">Upload Audio File</p>
                                            <p className="text-[10px] text-muted-foreground">MP3, WAV, M4A, WEBM</p>
                                        </div>
                                    </div>
                                    <div className="space-y-3">
                                        <Button
                                            type="button"
                                            onClick={isRecordingAudio ? stopAudioRecording : startAudioRecording}
                                            className={cn(
                                                "w-full h-11 rounded-xl font-bold tracking-wide",
                                                isRecordingAudio
                                                    ? "bg-red-600 hover:bg-red-700"
                                                    : "bg-primary hover:bg-primary/90"
                                            )}
                                        >
                                            {isRecordingAudio ? (
                                                <>
                                                    <Square className="w-4 h-4 mr-2" /> Stop Recording
                                                </>
                                            ) : (
                                                <>
                                                    <Mic className="w-4 h-4 mr-2" /> Record Audio
                                                </>
                                            )}
                                        </Button>
                                        <p className="text-[10px] text-muted-foreground font-medium">
                                            Recorded audio is auto-saved and uploaded as soon as you stop recording.
                                        </p>
                                    </div>
                                </div>
                                {audioFiles.length > 0 && (
                                    <div className="space-y-2 mt-4">
                                        {audioFiles.map((fileItem, i) => (
                                            <div key={i} className="bg-muted/50 border border-border rounded-lg p-3 group">
                                                <div className="flex items-center justify-between mb-2">
                                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                                        <Mic className="w-3.5 h-3.5 text-primary shrink-0" />
                                                        <span className="text-xs text-foreground truncate font-medium">{fileItem.file.name}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2 shrink-0">
                                                        {fileItem.status === 'complete' && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                                                        {fileItem.status === 'error' && <AlertCircle className="w-4 h-4 text-red-500" />}
                                                        {fileItem.status === 'uploading' && (
                                                            <span className="text-[10px] text-primary font-bold">{Math.round(fileItem.progress)}%</span>
                                                        )}
                                                        <button type="button" onClick={() => removeFile(i, 'audio')} className="opacity-0 group-hover:opacity-100 hover:text-red-500 transition-all">
                                                            <X className="w-3 h-3" />
                                                        </button>
                                                    </div>
                                                </div>
                                                {fileItem.status === 'complete' && fileItem.uploadedData?.url && (
                                                    <audio controls className="w-full h-8" src={fileItem.uploadedData.url} preload="metadata" />
                                                )}
                                                {(fileItem.status === 'uploading' || fileItem.status === 'pending') && (
                                                    <div className="h-1 bg-muted rounded-full overflow-hidden mt-1">
                                                        <div
                                                            className="h-full bg-primary transition-all duration-300"
                                                            style={{ width: `${fileItem.progress}%` }}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
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
                            <h2 className="text-2xl font-bold text-foreground">Video Format</h2>
                            <p className="text-sm text-muted-foreground">Select the aspect ratio and format for your video.</p>
                        </div>

                        <div className="space-y-8">
                            <div className="space-y-3">
                                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1">Video Type Format</Label>
                                <div className="grid grid-cols-1 xs:grid-cols-2 md:grid-cols-3 gap-3">
                                    {availableVideoTypes.map(vt => {
                                        const tieredPrices = user?.multiTierRates?.[vt.key];
                                        const fallbackPrice = getResolvedClientRate(user?.customRates, vt.key);
                                        const isSelected = videoType === vt.key;
                                        const displayPrice = tieredPrices ? tieredPrices[0].price : fallbackPrice;
                                        const hasMultipleTiers = tieredPrices && tieredPrices.length > 1;
                                        
                                        return (
                                            <button
                                                key={vt.key}
                                                type="button"
                                                onClick={() => setVideoType(vt.key)}
                                                className={cn(
                                                    "flex flex-col p-4 rounded-xl border transition-all text-left group",
                                                    isSelected
                                                        ? "bg-primary/10 border-primary shadow-[0_0_15px_rgba(var(--primary),0.1)]" 
                                                        : "bg-muted/50 border-border hover:border-border hover:bg-muted/60"
                                                )}
                                            >
                                                <div className="flex flex-col w-full">
                                                    <div className="flex items-center justify-between mb-1 gap-1">
                                                        <span className={cn("text-xs font-bold", isSelected ? "text-primary" : "text-foreground")}>{vt.label}</span>
                                                        <div className="flex items-center gap-1">
                                                            <span className={cn("text-[10px] font-mono font-bold", tieredPrices ? "text-amber-500" : "text-emerald-500")}>₹{displayPrice}</span>
                                                            {hasMultipleTiers && <span className={cn("text-[8px] font-bold px-1.5 py-0.5 rounded-full", isSelected ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground")}>+{tieredPrices.length - 1}</span>}
                                                        </div>
                                                    </div>
                                                    <span className="text-[9px] text-muted-foreground line-clamp-1">{vt.desc}</span>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {availablePrices.length > 1 && (
                                <div className="space-y-3 border border-border rounded-lg p-4">
                                    <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Select Pricing Tier</Label>
                                    <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 gap-2">
                                        {availablePrices.map((option, idx) => (
                                            <button
                                                key={idx}
                                                type="button"
                                                onClick={() => setSelectedPriceIndex(idx)}
                                                className={cn(
                                                    "flex flex-col items-center p-3 rounded-lg border-2 transition-all text-sm font-bold",
                                                    selectedPriceIndex === idx
                                                        ? "bg-amber-500/20 border-amber-500 text-amber-600" 
                                                        : "bg-muted/50 border-border text-muted-foreground hover:border-muted-foreground/50"
                                                )}
                                            >
                                                <span className="text-xs font-semibold">{option.label || `Tier ${idx + 1}`}</span>
                                                <span className="text-base mt-1">₹{option.price}</span>
                                            </button>
                                        ))}
                                    </div>
                                    <div className="text-center pt-2 border-t border-border">
                                        <p className="text-xs text-muted-foreground">Selected Price:</p>
                                        <p className="text-lg font-bold text-amber-600">₹{availablePrices[selectedPriceIndex].price.toLocaleString()}</p>
                                    </div>
                                </div>
                            )}

                            <div className="space-y-3 pt-6 border-t border-border">
                                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1">Select Aspect Ratio</Label>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                    {ASPECT_RATIOS.map(ar => {
                                        const isSelected = aspectRatio === ar.key;
                                        const is9x16 = ar.key === "9:16";
                                        const is16x9 = ar.key === "16:9";
                                        const is1x1 = ar.key === "1:1";

                                        return (
                                            <button
                                                key={ar.key}
                                                type="button"
                                                onClick={() => setAspectRatio(ar.key)}
                                                className={cn(
                                                    "flex flex-col items-center p-6 rounded-2xl border transition-all group relative overflow-hidden",
                                                    isSelected
                                                        ? "bg-primary/10 border-primary shadow-[0_0_20px_rgba(var(--primary),0.15)]" 
                                                        : "bg-muted/30 border-border hover:border-border hover:bg-muted/50"
                                                )}
                                            >
                                                <div className="mb-4 flex items-center justify-center h-16 w-full">
                                                    <div 
                                                        className={cn(
                                                            "border-2 transition-all duration-300 rounded-sm flex items-center justify-center shadow-lg",
                                                            isSelected ? "border-primary bg-primary/20 text-primary scale-110" : "border-zinc-700 bg-muted-foreground/10 text-muted-foreground group-hover:border-zinc-500"
                                                        )}
                                                        style={{
                                                            width: is9x16 ? '24px' : is16x9 ? '56px' : '40px',
                                                            height: is9x16 ? '42px' : is16x9 ? '32px' : '40px',
                                                        }}
                                                    >
                                                        <span className="text-[8px] font-black">{ar.key}</span>
                                                    </div>
                                                </div>
                                                <span className={cn("text-[10px] font-black uppercase tracking-widest", isSelected ? "text-primary" : "text-foreground/80")}>{ar.label}</span>
                                                <span className="text-[9px] text-muted-foreground font-bold mt-1">{ar.desc}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center justify-between pt-4">
                            <Button type="button" onClick={handlePrevStep} variant="ghost" size="lg" className="rounded-xl text-muted-foreground hover:text-foreground">
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
                            <h2 className="text-2xl font-bold text-foreground">Upload Assets & Scripts</h2>
                            <p className="text-sm text-muted-foreground">Provide all necessary files for the editor to begin working.</p>
                        </div>

                        <div className="space-y-8">
                            {/* Raw Video/Images */}
                            <div className="space-y-3">
                                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1 flex items-center gap-2">
                                    <FileVideo className="w-4 h-4 text-primary" /> 
                                    Upload Raw Video / Images
                                </Label>
                                <div className="border-2 border-dashed border-border rounded-2xl p-8 hover:bg-muted/50 hover:border-primary/50 transition-all text-center relative overflow-hidden group">
                                    <input 
                                        type="file" 
                                        multiple
                                        accept="video/*,image/*,.zip,.rar,.7z"
                                        onChange={(e) => handleFileUpload(e, 'raw')}
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                    />
                                    <div className="flex flex-col items-center justify-center gap-3">
                                        <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center group-hover:scale-110 transition-transform">
                                            <UploadCloud className="w-6 h-6" />
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-sm font-bold text-foreground">Click or drag files to upload</p>
                                            <p className="text-xs text-muted-foreground font-medium tracking-tight">mp4, mov, jpg, png, zip, rar, 7z &nbsp;·&nbsp; Max 5 GB per file</p>
                                        </div>
                                    </div>
                                </div>
                                {/* File List with Progress */}
                                {rawFiles.length > 0 && (
                                    <div className="space-y-2 mt-4">
                                        {rawFiles.map((fileItem, i) => (
                                            <div key={i} className="bg-muted/50 border border-border rounded-lg p-3 group">
                                                <div className="flex items-center justify-between mb-2">
                                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                                        {fileItem.file.type.includes('image') ? <ImageIcon className="w-4 h-4 text-amber-500 shrink-0" /> : fileItem.file.name.match(/\.(zip|rar|7z)$/i) || fileItem.file.type.includes('zip') ? <Archive className="w-4 h-4 text-purple-500 shrink-0" /> : <FileVideo className="w-4 h-4 text-blue-500 shrink-0" />}
                                                        <span className="text-xs text-foreground truncate font-medium">{fileItem.file.name}</span>
                                                        <span className="text-[10px] text-muted-foreground">
                                                            ({(fileItem.file.size / 1024 / 1024).toFixed(1)} MB)
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-2 shrink-0">
                                                        {fileItem.status === 'complete' && (
                                                            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                                        )}
                                                        {fileItem.status === 'error' && (
                                                            <AlertCircle className="w-4 h-4 text-red-500" />
                                                        )}
                                                        {fileItem.status === 'uploading' && (
                                                            <span className="text-[10px] text-primary font-bold">{Math.round(fileItem.progress)}%</span>
                                                        )}
                                                        <button type="button" onClick={() => removeFile(i, 'raw')} className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/20 text-red-500 rounded transition-all">
                                                            <X className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                </div>
                                                {(fileItem.status === 'uploading' || fileItem.status === 'pending') && (
                                                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                                        <div 
                                                            className="h-full bg-gradient-to-r from-primary to-primary/70 transition-all duration-300"
                                                            style={{ width: `${fileItem.progress}%` }}
                                                        />
                                                    </div>
                                                )}
                                                {fileItem.status === 'error' && (
                                                    <p className="text-[10px] text-red-500 mt-1">{fileItem.error || 'Upload failed'}</p>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* B-Role Files */}
                            <div className="space-y-3 pt-4 border-t border-border">
                                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1 flex items-center gap-2">
                                    <FileVideo className="w-4 h-4 text-amber-500" /> 
                                    B-Role Files (Optional)
                                </Label>
                                <div className="border-2 border-dashed border-border rounded-2xl p-8 hover:bg-muted/50 hover:border-amber-500/50 transition-all text-center relative overflow-hidden group">
                                    <input 
                                        type="file" 
                                        multiple
                                        accept="video/*,image/*,audio/*,.pdf,.doc,.docx,.txt,.zip,.rar,.7z"
                                        onChange={(e) => handleFileUpload(e, 'brole')}
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                    />
                                    <div className="flex flex-col items-center justify-center gap-3">
                                        <div className="w-12 h-12 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center group-hover:scale-110 transition-transform">
                                            <UploadCloud className="w-6 h-6" />
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-sm font-bold text-foreground">Click or drag files to upload</p>
                                            <p className="text-xs text-muted-foreground font-medium tracking-tight">Videos, images, audio, documents &nbsp;·&nbsp; Max 5 GB per file</p>
                                        </div>
                                    </div>
                                </div>
                                {/* B-Role Files List with Progress */}
                                {bRoleFiles.length > 0 && (
                                    <div className="space-y-2 mt-4">
                                        {bRoleFiles.map((fileItem, i) => (
                                            <div key={i} className="bg-muted/50 border border-border rounded-lg p-3 group">
                                                <div className="flex items-center justify-between mb-2">
                                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                                        {fileItem.file.type.includes('image') ? <ImageIcon className="w-4 h-4 text-amber-500 shrink-0" /> : fileItem.file.type.includes('video') ? <FileVideo className="w-4 h-4 text-blue-500 shrink-0" /> : fileItem.file.name.match(/\.(zip|rar|7z)$/i) || fileItem.file.type.includes('zip') ? <Archive className="w-4 h-4 text-purple-500 shrink-0" /> : <FileText className="w-4 h-4 text-gray-500 shrink-0" />}
                                                        <span className="text-xs text-foreground truncate font-medium">{fileItem.file.name}</span>
                                                        <span className="text-[10px] text-muted-foreground">
                                                            ({(fileItem.file.size / 1024 / 1024).toFixed(1)} MB)
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-2 shrink-0">
                                                        {fileItem.status === 'complete' && (
                                                            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                                        )}
                                                        {fileItem.status === 'error' && (
                                                            <AlertCircle className="w-4 h-4 text-red-500" />
                                                        )}
                                                        {fileItem.status === 'uploading' && (
                                                            <span className="text-[10px] text-amber-500 font-bold">{Math.round(fileItem.progress)}%</span>
                                                        )}
                                                        <button type="button" onClick={() => removeFile(i, 'brole')} className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/20 text-red-500 rounded transition-all">
                                                            <X className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                </div>
                                                {(fileItem.status === 'uploading' || fileItem.status === 'pending') && (
                                                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                                        <div 
                                                            className="h-full bg-gradient-to-r from-amber-500 to-amber-500/70 transition-all duration-300"
                                                            style={{ width: `${fileItem.progress}%` }}
                                                        />
                                                    </div>
                                                )}
                                                {fileItem.status === 'error' && (
                                                    <p className="text-[10px] text-red-500 mt-1">{fileItem.error || 'Upload failed'}</p>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Scripts */}
                            <div className="space-y-3 pt-4 border-t border-border">
                                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1 flex items-center gap-2">
                                    <FileText className="w-4 h-4 text-primary" /> 
                                    Script / Direction
                                </Label>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-4">
                                        <div className="border border-dashed border-border rounded-xl p-6 hover:bg-muted/50 hover:border-primary/50 transition-all text-center relative overflow-hidden group h-full flex flex-col items-center justify-center">
                                            <input 
                                                type="file" 
                                                multiple
                                                accept=".pdf,.doc,.docx,.txt"
                                                onChange={(e) => handleFileUpload(e, 'script')}
                                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                            />
                                            <FileText className="w-8 h-8 text-muted-foreground group-hover:text-primary transition-colors mb-2" />
                                            <p className="text-xs font-bold text-foreground">Upload Script File</p>
                                            <p className="text-[10px] text-muted-foreground">PDF, DOC, TXT</p>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Textarea 
                                            placeholder="Or directly paste your script here..."
                                            value={scriptText}
                                            onChange={e => setScriptText(e.target.value)}
                                            className="h-full min-h-[140px] resize-none bg-muted/50 border-border rounded-xl font-medium text-foreground placeholder:text-muted-foreground text-xs leading-relaxed"
                                        />
                                    </div>
                                </div>
                                {/* Script Files List with Progress */}
                                {scriptFiles.length > 0 && (
                                    <div className="space-y-2 mt-4">
                                        {scriptFiles.map((fileItem, i) => (
                                            <div key={i} className="bg-muted/50 border border-border rounded-lg p-3 group">
                                                <div className="flex items-center justify-between mb-1">
                                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                                        <FileText className="w-3.5 h-3.5 text-pink-500 shrink-0" />
                                                        <span className="text-xs text-foreground truncate font-medium">{fileItem.file.name}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2 shrink-0">
                                                        {fileItem.status === 'complete' && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                                                        {fileItem.status === 'error' && <AlertCircle className="w-4 h-4 text-red-500" />}
                                                        {fileItem.status === 'uploading' && (
                                                            <span className="text-[10px] text-primary font-bold">{Math.round(fileItem.progress)}%</span>
                                                        )}
                                                        <button type="button" onClick={() => removeFile(i, 'script')} className="opacity-0 group-hover:opacity-100 hover:text-red-500 transition-all">
                                                            <X className="w-3 h-3" />
                                                        </button>
                                                    </div>
                                                </div>
                                                {(fileItem.status === 'uploading' || fileItem.status === 'pending') && (
                                                    <div className="h-1 bg-muted rounded-full overflow-hidden">
                                                        <div 
                                                            className="h-full bg-gradient-to-r from-pink-500 to-pink-400 transition-all duration-300"
                                                            style={{ width: `${fileItem.progress}%` }}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Google Drive Link */}
                            <div className="space-y-2 pt-4 border-t border-border">
                                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1 flex items-center gap-2">
                                    <LinkIcon className="w-4 h-4 text-emerald-500" /> 
                                    Google Drive Link (Optional)
                                </Label>
                                <div className="flex items-center gap-2">
                                    <Input 
                                        placeholder="Paste URL here..." 
                                        value={footageLinkInput}
                                        onChange={e => setFootageLinkInput(e.target.value)}
                                        className="h-12 bg-muted/50 border-border focus:border-emerald-500/50 rounded-xl font-medium text-foreground placeholder:text-muted-foreground"
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                addFootageLink();
                                            }
                                        }}
                                    />
                                    <Button
                                        type="button"
                                        size="sm"
                                        className="h-12 px-3 rounded-xl"
                                        onClick={addFootageLink}
                                    >
                                        <Plus className="h-4 w-4" />
                                    </Button>
                                </div>
                                {footageLinks.length > 0 && (
                                    <div className="space-y-1 pt-1">
                                        {footageLinks.map((link, idx) => (
                                            <div key={`${link}-${idx}`} className="flex items-center justify-between gap-2 bg-muted/30 border border-border rounded-lg px-2.5 py-1.5">
                                                <span className="text-[10px] text-foreground truncate">{link}</span>
                                                <button
                                                    type="button"
                                                    onClick={() => removeFootageLink(idx)}
                                                    className="text-muted-foreground hover:text-red-500 transition-colors shrink-0"
                                                >
                                                    <X className="h-3.5 w-3.5" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Reference Link & Files */}
                            <div className="space-y-4 pt-6 mt-6 border-t-2 border-primary/20 bg-primary/5 p-6 rounded-2xl">
                                <div className="space-y-1">
                                    <Label className="text-[11px] font-black uppercase tracking-[0.2em] text-primary flex items-center gap-2">
                                        <Zap className="h-4 w-4" /> Style Reference (Optional)
                                    </Label>
                                    <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Share a link or upload a file that shows your desired style</p>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                     <div className="space-y-2">
                                         <Label className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Reference URL(s)</Label>
                                         <div className="flex items-center gap-2">
                                            <Input 
                                                placeholder="Instagram/YouTube link..." 
                                                value={referenceLinkInput}
                                                onChange={e => setReferenceLinkInput(e.target.value)}
                                                className="h-11 bg-background/50 border-border rounded-xl text-xs"
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                        e.preventDefault();
                                                        addReferenceLink();
                                                    }
                                                }}
                                            />
                                            <Button
                                                type="button"
                                                size="sm"
                                                className="h-11 px-3 rounded-xl"
                                                onClick={addReferenceLink}
                                            >
                                                <Plus className="h-4 w-4" />
                                            </Button>
                                         </div>
                                         {referenceLinks.length > 0 && (
                                            <div className="space-y-1 pt-1">
                                                {referenceLinks.map((link, idx) => (
                                                    <div key={`${link}-${idx}`} className="flex items-center justify-between gap-2 bg-background/40 border border-border rounded-lg px-2.5 py-1.5">
                                                        <span className="text-[10px] text-foreground truncate">{link}</span>
                                                        <button
                                                            type="button"
                                                            onClick={() => removeReferenceLink(idx)}
                                                            className="text-muted-foreground hover:text-red-500 transition-colors shrink-0"
                                                        >
                                                            <X className="h-3.5 w-3.5" />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                         )}
                                     </div>
                                     <div className="space-y-2">
                                         <Label className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest ml-1">Reference File(s)</Label>
                                         <div className="relative h-11 border border-dashed border-border rounded-xl flex items-center justify-center hover:bg-background/40 transition-colors cursor-pointer group">
                                             <input 
                                                type="file" 
                                                multiple
                                                onChange={(e) => handleFileUpload(e, 'reference')}
                                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                             />
                                             <UploadCloud className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                                             <span className="ml-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest group-hover:text-foreground transition-colors">Attach File</span>
                                         </div>
                                     </div>
                                </div>
                                {referenceFiles.length > 0 && (
                                    <div className="space-y-2 pt-2">
                                        {referenceFiles.map((fileItem, i) => (
                                            <div key={i} className="bg-primary/10 border border-primary/20 rounded-lg p-2.5 group">
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="text-[10px] font-bold text-primary truncate max-w-[150px]">{fileItem.file.name}</span>
                                                    <div className="flex items-center gap-2">
                                                        {fileItem.status === 'complete' && <CheckCircle2 className="w-3 h-3 text-emerald-500" />}
                                                        {fileItem.status === 'error' && <AlertCircle className="w-3 h-3 text-red-500" />}
                                                        {fileItem.status === 'uploading' && (
                                                            <span className="text-[9px] text-primary font-bold">{Math.round(fileItem.progress)}%</span>
                                                        )}
                                                        <button onClick={() => removeFile(i, 'reference')} className="text-primary hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <X className="h-3 w-3" />
                                                        </button>
                                                    </div>
                                                </div>
                                                {(fileItem.status === 'uploading' || fileItem.status === 'pending') && (
                                                    <div className="h-1 bg-primary/20 rounded-full overflow-hidden">
                                                        <div 
                                                            className="h-full bg-primary transition-all duration-300"
                                                            style={{ width: `${fileItem.progress}%` }}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Overall Upload Progress */}
                        {(rawFiles.length > 0 || scriptFiles.length > 0 || referenceFiles.length > 0 || audioFiles.length > 0) && (
                            <div className="bg-muted/30 border border-border rounded-xl p-4">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                                        Upload Progress
                                    </span>
                                    <span className={cn(
                                        "text-xs font-bold",
                                        allFilesUploaded ? "text-emerald-500" : hasUploadingFiles ? "text-primary" : "text-muted-foreground"
                                    )}>
                                        {allFilesUploaded ? (
                                            <span className="flex items-center gap-1">
                                                <CheckCircle2 className="w-3 h-3" /> All Files Uploaded
                                            </span>
                                        ) : hasUploadingFiles ? (
                                            `${totalUploadProgress}% Complete`
                                        ) : (
                                            'Ready'
                                        )}
                                    </span>
                                </div>
                                <div className="h-2 bg-muted rounded-full overflow-hidden">
                                    <div 
                                        className={cn(
                                            "h-full transition-all duration-500",
                                            allFilesUploaded 
                                                ? "bg-gradient-to-r from-emerald-500 to-emerald-400" 
                                                : "bg-gradient-to-r from-primary to-primary/70"
                                        )}
                                        style={{ width: `${totalUploadProgress}%` }}
                                    />
                                </div>
                                <div className="flex items-center justify-between mt-2 text-[10px] text-muted-foreground">
                                    <span>{rawFiles.length + scriptFiles.length + referenceFiles.length + audioFiles.length} file(s)</span>
                                    <span>
                                        {[...rawFiles, ...scriptFiles, ...referenceFiles, ...audioFiles].filter(f => f.status === 'complete').length} uploaded
                                    </span>
                                </div>
                            </div>
                        )}

                        <div className="flex items-center justify-between pt-4">
                            <Button type="button" onClick={handlePrevStep} variant="ghost" size="lg" className="rounded-xl text-muted-foreground hover:text-foreground">
                                <ChevronLeft className="mr-2 w-4 h-4" /> Go Back
                            </Button>
                            <Button 
                                onClick={handleNextStep} 
                                size="lg" 
                                className="rounded-xl px-10 shadow-xl font-bold tracking-wide"
                                disabled={hasUploadingFiles}
                            >
                                {hasUploadingFiles ? (
                                    <>Uploading... {totalUploadProgress}%</>
                                ) : (
                                    <>Next Step <ChevronRight className="ml-2 w-4 h-4" /></>
                                )}
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
                            <h2 className="text-2xl font-bold text-foreground">Review & Payment</h2>
                            <p className="text-sm text-muted-foreground">Review your final cost and select a payment method.</p>
                        </div>

                        <div className="bg-[#0b0c0f] border border-border rounded-2xl p-6 md:p-8 space-y-6">
                            <div className="space-y-4">
                                {availablePrices.length > 1 && (
                                    <div className="flex justify-between items-center pb-4 border-b border-border bg-amber-500/5 -m-6 p-6 border-b-border">
                                        <div>
                                            <span className="text-xs text-muted-foreground font-bold uppercase tracking-widest block mb-1">Selected Pricing Tier</span>
                                            <span className="text-sm text-amber-600 font-semibold">{availablePrices[selectedPriceIndex].label || `Option ${selectedPriceIndex + 1}`}</span>
                                        </div>
                                        <button 
                                            onClick={() => setCurrentStep(2)}
                                            className="text-xs px-3 py-1 rounded-lg border border-amber-500/30 text-amber-600 hover:bg-amber-500/10 transition-colors font-medium"
                                        >
                                            Change
                                        </button>
                                    </div>
                                )}
                                <div className="flex justify-between items-center pb-4 border-b border-border">
                                    <span className="text-sm text-muted-foreground font-bold uppercase tracking-widest">Base Project Cost</span>
                                    <div className="flex items-center font-bold text-foreground">
                                        <IndianRupee className="w-4 h-4 mr-1 text-muted-foreground" />
                                        {basePrice.toLocaleString()}
                                    </div>
                                </div>
                                {urgency === 'urgent' && (
                                    <div className="flex justify-between items-center pb-4 border-b border-border">
                                        <span className="text-sm text-amber-500 font-bold uppercase tracking-widest flex items-center gap-2">
                                            <Zap className="w-4 h-4" /> Urgent Delivery
                                        </span>
                                        <div className="flex items-center font-bold text-amber-500">
                                            + <IndianRupee className="w-4 h-4 mx-1" />
                                            {DEFAULT_URGENT_PRICE.toLocaleString()}
                                        </div>
                                    </div>
                                )}
                                <div className="flex justify-between items-center pb-4 border-b border-border">
                                    <span className="text-sm text-muted-foreground font-bold uppercase tracking-widest">GST (18%)</span>
                                    <div className="flex items-center font-bold text-foreground">
                                        + <IndianRupee className="w-4 h-4 mx-1 text-muted-foreground" />
                                        {gstAmount.toLocaleString()}
                                    </div>
                                </div>
                                <div className="flex justify-between items-center pt-2">
                                    <div className="flex flex-col">
                                        <span className="text-lg text-foreground font-black">Total Project Value (Excl. GST)</span>
                                        <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest italic">50% upfront in project ledger</span>
                                    </div>
                                    <div className="flex items-center text-3xl font-black text-primary">
                                        <IndianRupee className="w-6 h-6 mr-1" />
                                        {projectTotalWithoutGst.toLocaleString()}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Submission Status */}
                        {isSubmitting && (
                            <div className="bg-primary/10 border border-primary/20 rounded-xl p-4 flex items-center gap-3">
                                <Loader2 className="w-5 h-5 text-primary animate-spin" />
                                <div>
                                    <p className="text-sm font-bold text-foreground">Creating Your Project...</p>
                                    <p className="text-xs text-muted-foreground">This will only take a moment</p>
                                </div>
                            </div>
                        )}

                        {/* Payment Options - Pay Now visible to everyone, Pay Later only for enabled clients */}
                        <div className="pt-4 space-y-4">
                            {/* Pay Now - Always visible to everyone */}
                            <div>
                                <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 mb-3">
                                    <div className="flex items-center gap-2 mb-2">
                                        <CreditCard className="w-5 h-5 text-green-400" />
                                        <span className="text-sm font-bold text-green-400">Secure 50% Upfront Billing</span>
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        Base upfront: ₹{upfrontPaymentWithoutGst.toLocaleString()} + GST: ₹{(upfrontPaymentWithGst - upfrontPaymentWithoutGst).toLocaleString()} = ₹{upfrontPaymentWithGst.toLocaleString()} billed now.
                                    </p>
                                </div>
                                <Button 
                                    onClick={handlePayNow} 
                                    disabled={isSubmitting || isProcessingPayment}
                                    size="lg" 
                                    className="h-14 rounded-xl font-bold tracking-wide w-full bg-green-600 hover:bg-green-700 shadow-lg shadow-green-500/10"
                                >
                                    {(isSubmitting || isProcessingPayment) ? (
                                        <Loader2 className="w-5 h-5 animate-spin mr-2" />
                                    ) : (
                                        <CreditCard className="w-5 h-5 mr-3" />
                                    )}
                                    Pay ₹{upfrontPaymentWithGst.toLocaleString()} & Start Project
                                </Button>
                            </div>

                            {/* Pay Later - Only visible to enabled clients */}
                            {canPayLater && (
                                <div>
                                    <div className="relative">
                                        <div className="absolute inset-0 flex items-center">
                                            <div className="w-full border-t border-border"></div>
                                        </div>
                                        <div className="relative flex justify-center text-xs uppercase">
                                            <span className="bg-card px-3 text-muted-foreground font-bold tracking-widest">Or</span>
                                        </div>
                                    </div>
                                    
                                    <div className={cn(
                                        "mt-4 rounded-xl p-4 mb-3",
                                        canUsePayLater 
                                            ? "bg-blue-500/10 border border-blue-500/20" 
                                            : "bg-red-500/10 border border-red-500/20"
                                    )}>
                                        <div className="flex items-center gap-2 mb-2">
                                            <Clock className={cn("w-5 h-5", canUsePayLater ? "text-blue-400" : "text-red-400")} />
                                            <span className={cn("text-sm font-bold", canUsePayLater ? "text-blue-400" : "text-red-400")}>
                                                Pay Later {canUsePayLater ? "Available" : "Limit Exceeded"}
                                            </span>
                                        </div>
                                        {canUsePayLater ? (
                                            <p className="text-xs text-muted-foreground">
                                                Submit now and settle the 50% upfront base amount (₹{upfrontPaymentWithoutGst.toLocaleString()}) with your Project Manager later. GST will be applied during billing.
                                                <span className="block mt-1 text-blue-400 font-medium">
                                                    Available Credit: ₹{remainingCredit.toLocaleString()} / ₹{creditLimit.toLocaleString()}
                                                </span>
                                            </p>
                                        ) : (
                                            <p className="text-xs text-muted-foreground">
                                                You have exceeded your Pay Later limit. Please clear pending dues or use Pay Now.
                                                <span className="block mt-1 text-red-400 font-medium">
                                                    Pending: ₹{pendingDues.toLocaleString()} | Limit: ₹{creditLimit.toLocaleString()}
                                                </span>
                                            </p>
                                        )}
                                    </div>
                                    <Button 
                                        onClick={handlePayLater} 
                                        disabled={isSubmitting || !canUsePayLater}
                                        size="lg" 
                                        className={cn(
                                            "h-14 rounded-xl font-bold tracking-wide w-full shadow-lg transition-all",
                                            canUsePayLater 
                                                ? "bg-blue-600 hover:bg-blue-700 shadow-blue-500/10" 
                                                : "bg-gray-500 cursor-not-allowed opacity-50"
                                        )}
                                    >
                                        {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Clock className="w-5 h-5 mr-3" />}
                                        Submit with ₹{upfrontPaymentWithoutGst.toLocaleString()} Base (Pay Later)
                                    </Button>
                                </div>
                            )}
                        </div>
                        
                        {/* Additional info for all users */}
                        <div className="mt-4 p-3 bg-muted/30 rounded-lg">
                            <p className="text-[10px] text-muted-foreground text-center">
                                By submitting, you agree to our terms of service. Your project will be assigned to an editor within 24 hours.
                            </p>
                        </div>

                        {!isSubmitting && (
                            <div className="flex justify-start pt-2">
                                <Button type="button" onClick={handlePrevStep} variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
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

