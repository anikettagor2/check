"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/context/auth-context";
import { useRouter } from "next/navigation";
import { getInvoiceSettings, updateInvoiceSettings } from "@/app/actions/admin-actions";
import { storage } from "@/lib/firebase/config";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { MAX_FILE_SIZE_BYTES, MAX_FILE_SIZE_GB } from "@/lib/constants";
import {
    Loader2,
    Save,
    Upload,
    FileText,
    Building2,
    Mail,
    Phone,
    MapPin,
    Receipt,
    Image as ImageIcon,
    Trash2,
    Eye
} from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { InvoiceRenderer } from "@/components/invoice/invoice-renderer";
import { Invoice } from "@/types/schema";

interface InvoiceSettings {
    companyName: string;
    companyAddress: string;
    companyEmail: string;
    companyPhone: string;
    companyLogo: string;
    footerText: string;
    bankDetails: string;
    gstNumber: string;
    termsAndConditions: string;
}

export default function InvoiceSettingsPage() {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [settings, setSettings] = useState<InvoiceSettings>({
        companyName: 'EditoHub Agency',
        companyAddress: '123 Creative Studio Blvd\nLos Angeles, CA 90012',
        companyEmail: 'billing@editohub.com',
        companyPhone: '',
        companyLogo: '',
        footerText: 'Thank you for your business.',
        bankDetails: '',
        gstNumber: '',
        termsAndConditions: ''
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [showPreview, setShowPreview] = useState(false);

    useEffect(() => {
        if (!authLoading && (!user || user.role !== 'admin')) {
            router.push('/dashboard');
            return;
        }
        loadSettings();
    }, [user, authLoading, router]);

    const loadSettings = async () => {
        try {
            const res = await getInvoiceSettings();
            if (res.success && res.data) {
                setSettings(res.data as InvoiceSettings);
            }
        } catch (err) {
            console.error("Failed to load settings:", err);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await updateInvoiceSettings(settings);
            if (res.success) {
                toast.success("Invoice settings saved");
            } else {
                toast.error(res.error || "Failed to save");
            }
        } catch (err) {
            toast.error("An error occurred");
        } finally {
            setSaving(false);
        }
    };

    const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            toast.error("Please upload an image file");
            return;
        }

        if (file.size > MAX_FILE_SIZE_BYTES) {
            toast.error(`Image must be less than ${MAX_FILE_SIZE_GB}GB`);
            return;
        }

        setUploading(true);
        try {
            const storageRef = ref(storage, `invoice-assets/logo-${Date.now()}`);
            await uploadBytes(storageRef, file);
            const url = await getDownloadURL(storageRef);
            setSettings(prev => ({ ...prev, companyLogo: url }));
            toast.success("Logo uploaded");
        } catch (err) {
            toast.error("Failed to upload logo");
        } finally {
            setUploading(false);
        }
    };

    const removeLogo = () => {
        setSettings(prev => ({ ...prev, companyLogo: '' }));
    };

    // Sample invoice for preview
    const previewInvoice: Invoice = {
        id: 'preview',
        invoiceNumber: 'INV-2024-0001',
        clientId: 'sample',
        clientName: 'John Doe',
        clientEmail: 'john@example.com',
        clientAddress: '456 Client Street\nNew York, NY 10001',
        items: [
            { description: 'Video Editing - Product Launch', quantity: 1, rate: 15000, amount: 15000 },
            { description: 'Color Grading', quantity: 1, rate: 3000, amount: 3000 },
            { description: 'Sound Mixing', quantity: 2, rate: 2000, amount: 4000 }
        ],
        subtotal: 22000,
        tax: 18,
        total: 25960,
        status: 'sent',
        issueDate: Date.now(),
        dueDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
        notes: 'Payment due within 7 days.',
        createdAt: Date.now(),
        updatedAt: Date.now()
    };

    if (authLoading || loading) {
        return (
            <div className="flex h-[calc(100vh-12rem)] items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    <span className="text-sm text-muted-foreground">Loading invoice settings...</span>
                </div>
            </div>
        );
    }

    if (user?.role !== 'admin') return null;

    return (
        <div className="p-8 max-w-6xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                            <Receipt className="w-6 h-6 text-primary" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-foreground">Invoice Template</h1>
                            <p className="text-sm text-muted-foreground">Customize your invoice appearance</p>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setShowPreview(!showPreview)}
                        className="px-4 py-2 bg-muted hover:bg-muted/80 border border-border rounded-lg text-sm font-medium flex items-center gap-2 transition-all"
                    >
                        <Eye className="w-4 h-4" />
                        {showPreview ? "Hide Preview" : "Preview"}
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="px-5 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-primary/90 transition-all disabled:opacity-50"
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Save Changes
                    </button>
                </div>
            </div>

            <div className={cn("grid gap-8", showPreview ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1")}>
                {/* Settings Form */}
                <div className="space-y-6">
                    {/* Company Logo */}
                    <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-card border border-border rounded-xl p-6"
                    >
                        <div className="flex items-center gap-3 mb-4">
                            <ImageIcon className="w-5 h-5 text-muted-foreground" />
                            <h2 className="text-lg font-bold text-foreground">Company Logo</h2>
                        </div>
                        <div className="flex items-center gap-4">
                            {settings.companyLogo ? (
                                <div className="relative group">
                                    <img 
                                        src={settings.companyLogo} 
                                        alt="Company Logo" 
                                        className="h-20 w-auto object-contain rounded-lg border border-border bg-white p-2"
                                    />
                                    <button
                                        onClick={removeLogo}
                                        className="absolute -top-2 -right-2 h-6 w-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        <Trash2 className="w-3 h-3" />
                                    </button>
                                </div>
                            ) : (
                                <div className="h-20 w-32 border-2 border-dashed border-border rounded-lg flex items-center justify-center text-muted-foreground">
                                    <ImageIcon className="w-8 h-8" />
                                </div>
                            )}
                            <div>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    onChange={handleLogoUpload}
                                    className="hidden"
                                />
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={uploading}
                                    className="px-4 py-2 bg-muted hover:bg-muted/80 border border-border rounded-lg text-sm font-medium flex items-center gap-2 transition-all disabled:opacity-50"
                                >
                                    {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                                    {uploading ? "Uploading..." : "Upload Logo"}
                                </button>
                                <p className="text-xs text-muted-foreground mt-1">PNG, JPG (max {MAX_FILE_SIZE_GB}GB)</p>
                            </div>
                        </div>
                    </motion.div>

                    {/* Company Details */}
                    <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="bg-card border border-border rounded-xl p-6"
                    >
                        <div className="flex items-center gap-3 mb-4">
                            <Building2 className="w-5 h-5 text-muted-foreground" />
                            <h2 className="text-lg font-bold text-foreground">Company Details</h2>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="col-span-2 space-y-2">
                                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Company Name</Label>
                                <Input
                                    value={settings.companyName}
                                    onChange={(e) => setSettings(prev => ({ ...prev, companyName: e.target.value }))}
                                    placeholder="Your Company Name"
                                    className="bg-background border-border"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1">
                                    <Mail className="w-3 h-3" /> Email
                                </Label>
                                <Input
                                    value={settings.companyEmail}
                                    onChange={(e) => setSettings(prev => ({ ...prev, companyEmail: e.target.value }))}
                                    placeholder="billing@company.com"
                                    className="bg-background border-border"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1">
                                    <Phone className="w-3 h-3" /> Phone
                                </Label>
                                <Input
                                    value={settings.companyPhone}
                                    onChange={(e) => setSettings(prev => ({ ...prev, companyPhone: e.target.value }))}
                                    placeholder="+91 98765 43210"
                                    className="bg-background border-border"
                                />
                            </div>
                            <div className="col-span-2 space-y-2">
                                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1">
                                    <MapPin className="w-3 h-3" /> Address
                                </Label>
                                <Textarea
                                    value={settings.companyAddress}
                                    onChange={(e) => setSettings(prev => ({ ...prev, companyAddress: e.target.value }))}
                                    placeholder="123 Business Street\nCity, State 12345"
                                    rows={3}
                                    className="bg-background border-border resize-none"
                                />
                            </div>
                        </div>
                    </motion.div>

                    {/* Tax & Banking */}
                    <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="bg-card border border-border rounded-xl p-6"
                    >
                        <div className="flex items-center gap-3 mb-4">
                            <FileText className="w-5 h-5 text-muted-foreground" />
                            <h2 className="text-lg font-bold text-foreground">Tax & Banking</h2>
                        </div>
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">GST Number</Label>
                                <Input
                                    value={settings.gstNumber}
                                    onChange={(e) => setSettings(prev => ({ ...prev, gstNumber: e.target.value }))}
                                    placeholder="22AAAAA0000A1Z5"
                                    className="bg-background border-border"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Bank Details (for invoices)</Label>
                                <Textarea
                                    value={settings.bankDetails}
                                    onChange={(e) => setSettings(prev => ({ ...prev, bankDetails: e.target.value }))}
                                    placeholder="Bank: HDFC Bank\nA/C: 1234567890\nIFSC: HDFC0001234"
                                    rows={3}
                                    className="bg-background border-border resize-none"
                                />
                            </div>
                        </div>
                    </motion.div>

                    {/* Footer & Terms */}
                    <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="bg-card border border-border rounded-xl p-6"
                    >
                        <div className="flex items-center gap-3 mb-4">
                            <FileText className="w-5 h-5 text-muted-foreground" />
                            <h2 className="text-lg font-bold text-foreground">Footer & Terms</h2>
                        </div>
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Footer Text</Label>
                                <Input
                                    value={settings.footerText}
                                    onChange={(e) => setSettings(prev => ({ ...prev, footerText: e.target.value }))}
                                    placeholder="Thank you for your business."
                                    className="bg-background border-border"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Terms & Conditions</Label>
                                <Textarea
                                    value={settings.termsAndConditions}
                                    onChange={(e) => setSettings(prev => ({ ...prev, termsAndConditions: e.target.value }))}
                                    placeholder="1. Payment is due within 15 days.\n2. Late payments may incur additional charges."
                                    rows={4}
                                    className="bg-background border-border resize-none"
                                />
                            </div>
                        </div>
                    </motion.div>
                </div>

                {/* Preview */}
                {showPreview && (
                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="sticky top-8"
                    >
                        <div className="bg-zinc-100 rounded-xl p-4 overflow-auto max-h-[calc(100vh-200px)]">
                            <p className="text-xs text-zinc-500 font-bold uppercase tracking-widest mb-3 text-center">Live Preview</p>
                            <div className="transform scale-[0.6] origin-top">
                                <InvoiceRenderer invoice={previewInvoice} settings={settings} />
                            </div>
                        </div>
                    </motion.div>
                )}
            </div>
        </div>
    );
}
