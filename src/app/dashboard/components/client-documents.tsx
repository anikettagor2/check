"use client";

import { useState } from "react";
import { User } from "@/types/schema";
import { db, storage } from "@/lib/firebase/config";
import { doc, updateDoc, arrayUnion } from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import { motion } from "framer-motion";
import { FileText, Download, Upload, Trash2, Eye, Loader2, Link as LinkIcon, FileCheck } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { MAX_FILE_SIZE_BYTES, MAX_FILE_SIZE_GB } from "@/lib/constants";
import { UploadService } from "@/lib/services/upload-service";


interface ClientDocumentsProps {
    userProfile: User;
    isClient: boolean;
}

export function ClientDocuments({ userProfile, isClient }: ClientDocumentsProps) {
    const [uploadingDocType, setUploadingDocType] = useState<string | null>(null);
    const [uploadProgress, setUploadProgress] = useState(0);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, docType: 'agreement' | 'gst' | 'nda' | 'invoices') => {
        if (!e.target.files || !e.target.files[0] || !userProfile.uid) return;
        
        const file = e.target.files[0];

        // File size validation
        if (file.size > MAX_FILE_SIZE_BYTES) {
            toast.error(`File is too large. Max size allowed is ${MAX_FILE_SIZE_GB}GB.`);
            e.target.value = '';
            return;
        }

        setUploadingDocType(docType);
        
        try {
            const fileId = Date.now().toString();
            const storagePath = `client_documents/${userProfile.uid}/${docType}/${fileId}_${file.name}`;
            
            const downloadURL = await UploadService.uploadFileUnified(
                file,
                userProfile.uid,
                (progress) => setUploadProgress(progress),
                { 
                    type: 'document',
                    storagePath 
                }
            );

            const newDoc = {
                id: fileId,
                name: file.name,
                url: downloadURL,
                uploadedAt: Date.now()
            };

            const userRef = doc(db, "users", userProfile.uid);
            
            if (docType === 'invoices') {
                await updateDoc(userRef, {
                    "documents.invoices": arrayUnion(newDoc)
                });
            } else {
                await updateDoc(userRef, {
                    [`documents.${docType}`]: newDoc
                });
            }

            toast.success(`${file.name} uploaded successfully.`);
        } catch (error: any) {
            console.error("Error uploading document:", error);
            toast.error("Upload failed: " + error.message);
        } finally {
            setUploadingDocType(null);
            setUploadProgress(0);
            e.target.value = '';
        }
    };

    const renderDocumentSection = (title: string, docType: 'agreement' | 'gst' | 'nda', description: string, data?: {url: string, name: string, uploadedAt: number}) => {
        return (
            <div className="enterprise-card bg-muted/30 p-6 md:p-8 space-y-4 relative overflow-hidden group">
                <div className="flex justify-between items-start mb-2 relative z-10">
                    <div>
                        <h3 className="font-heading font-bold text-lg text-foreground tracking-tight flex items-center gap-2">
                            <FileCheck className="h-5 w-5 text-primary" />
                            {title}
                        </h3>
                        <p className="text-sm text-muted-foreground mt-1 font-medium">{description}</p>
                    </div>
                </div>

                <div className="relative z-10 pt-4 border-t border-border">
                    {data ? (
                        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between p-4 bg-background border border-border rounded-xl">
                            <div className="flex items-center gap-3 min-w-0">
                                <FileText className="h-8 w-8 text-primary shrink-0" />
                                <div className="min-w-0">
                                    <p className="font-bold text-sm text-foreground truncate">{data.name}</p>
                                    <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mt-1">Uploaded: {new Date(data.uploadedAt).toLocaleDateString()}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <a 
                                    href={data.url} 
                                    target="_blank" 
                                    rel="noreferrer"
                                    className="h-9 px-4 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest"
                                >
                                    <Eye className="h-3.5 w-3.5" /> View
                                </a>
                                {!isClient && (
                                    <label className="h-9 px-4 rounded-lg bg-muted border border-border hover:bg-accent text-foreground transition-colors flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest cursor-pointer">
                                        <Upload className="h-3.5 w-3.5" /> Replace
                                        <input type="file" className="hidden" accept=".pdf,.doc,.docx,.jpg,.png" onChange={(e) => handleFileUpload(e, docType)} disabled={uploadingDocType === docType} />
                                    </label>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-border rounded-xl bg-background text-center space-y-3">
                            <FileText className="h-10 w-10 text-muted-foreground opacity-50" />
                            <p className="text-sm font-bold text-muted-foreground">Not uploaded yet.</p>
                            {!isClient && (
                                <label className="mt-2 h-10 px-6 rounded-lg bg-primary text-primary-foreground hover:bg-zinc-200 shadow-md transition-colors flex items-center justify-center gap-2 text-[11px] font-bold uppercase tracking-widest cursor-pointer">
                                    {uploadingDocType === docType ? (
                                        <><Loader2 className="h-4 w-4 animate-spin" /> {uploadProgress.toFixed(0)}%</>
                                    ) : (
                                        <><Upload className="h-4 w-4" /> Upload {title}</>
                                    )}
                                    <input type="file" className="hidden" accept=".pdf,.doc,.docx,.jpg,.png" onChange={(e) => handleFileUpload(e, docType)} disabled={uploadingDocType !== null} />
                                </label>
                            )}
                        </div>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold font-heading mb-6">Important Documents</h2>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {renderDocumentSection("Service Agreement", "agreement", "Signed terms of service and retainer agreement.", userProfile.documents?.agreement)}
                {renderDocumentSection("GST Details / Tax Docs", "gst", "Your company's tax identity and GST certification.", userProfile.documents?.gst)}
                {renderDocumentSection("Non-Disclosure Agreement", "nda", "Protects mutually shared confidential information.", userProfile.documents?.nda)}
            </div>

            <div className="enterprise-card bg-muted/30 p-6 md:p-8 space-y-4">
               <div>
                   <h3 className="font-heading font-bold text-lg text-foreground tracking-tight flex items-center gap-2">
                       <Download className="h-5 w-5 text-primary" />
                       Invoices & Receipts
                   </h3>
                   <p className="text-sm text-muted-foreground mt-1 font-medium">Downloadable copies of your billing history.</p>
               </div>
               
               <div className="pt-4 border-t border-border">
                    <div className="grid gap-3">
                        {(!userProfile.documents?.invoices || userProfile.documents.invoices.length === 0) ? (
                            <div className="flex flex-col items-center justify-center p-8 border border-dashed border-border rounded-xl bg-background text-center">
                                <p className="text-sm font-bold text-muted-foreground">No invoices generated yet.</p>
                            </div>
                        ) : (
                            userProfile.documents.invoices.map((inv, idx) => (
                                <div key={inv.id || idx} className="flex items-center justify-between p-4 bg-background border border-border rounded-xl hover:border-primary/50 transition-colors">
                                    <div className="flex items-center gap-3">
                                        <div className="h-10 w-10 bg-primary/10 rounded-lg flex items-center justify-center text-primary">
                                            <FileText className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <p className="font-bold text-sm text-foreground">{inv.name}</p>
                                            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mt-1">Date: {new Date(inv.uploadedAt).toLocaleDateString()}</p>
                                        </div>
                                    </div>
                                    <a 
                                        href={inv.url} 
                                        target="_blank" 
                                        rel="noreferrer"
                                        className="h-9 w-9 rounded-lg bg-muted text-muted-foreground hover:bg-primary hover:text-primary-foreground transition-colors flex items-center justify-center"
                                    >
                                        <Download className="h-4 w-4" />
                                    </a>
                                </div>
                            ))
                        )}
                        
                        {!isClient && (
                            <div className="mt-4 flex justify-end">
                                <label className="h-9 px-4 rounded-lg bg-muted border border-border text-foreground hover:bg-accent transition-colors flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest cursor-pointer">
                                    {uploadingDocType === 'invoices' ? (
                                        <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading...</>
                                    ) : (
                                        <><Upload className="h-3.5 w-3.5" /> Add Invoice</>
                                    )}
                                    <input type="file" className="hidden" accept=".pdf,.doc,.docx,.jpg,.png" onChange={(e) => handleFileUpload(e, 'invoices')} disabled={uploadingDocType !== null} />
                                </label>
                            </div>
                        )}
                    </div>
               </div>
            </div>
        </div>
    );
}
