"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/context/auth-context";
import { db } from "@/lib/firebase/config";
import { doc, getDoc, collection, getDocs, query, where } from "firebase/firestore";
import { Invoice, InvoiceItem, User } from "@/types/schema";
import { updateInvoice, deleteInvoice, getInvoiceSettings } from "@/app/actions/admin-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { InvoiceRenderer } from "@/components/invoice/invoice-renderer";
import { Plus, Trash2, Save, ArrowLeft, Loader2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { cn } from "@/lib/utils";

export default function EditInvoicePage(props: { params: Promise<{ id: string }> }) {
    const params = use(props.params);
    const { user } = useAuth();
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const [isFetching, setIsFetching] = useState(true);
    const [clients, setClients] = useState<User[]>([]);
    const [showPreview, setShowPreview] = useState(false);
    const [invoiceSettings, setInvoiceSettings] = useState<any>({});

    // Invoice Form State
    const [clientId, setClientId] = useState("");
    const [clientName, setClientName] = useState("");
    const [clientEmail, setClientEmail] = useState("");
    const [clientAddress, setClientAddress] = useState("");
    const [invoiceNumber, setInvoiceNumber] = useState("");
    const [issueDate, setIssueDate] = useState("");
    const [dueDate, setDueDate] = useState("");
    const [items, setItems] = useState<InvoiceItem[]>([{ description: "", quantity: 1, rate: 0, amount: 0 }]);
    const [taxRate, setTaxRate] = useState(0);
    const [notes, setNotes] = useState("");
    const [status, setStatus] = useState<Invoice['status']>('sent');

    useEffect(() => {
        if (user?.role !== 'admin' && user?.role !== 'sales_executive' && user?.role !== 'manager') {
            router.push("/dashboard/invoices");
            return;
        }

        async function fetchData() {
            try {
                // Fetch invoice
                const docRef = doc(db, "invoices", params.id);
                const snap = await getDoc(docRef);
                if (!snap.exists()) {
                    toast.error("Invoice not found");
                    router.push("/dashboard/invoices");
                    return;
                }

                const invoice = snap.data() as Invoice;
                setClientId(invoice.clientId);
                setClientName(invoice.clientName);
                setClientEmail(invoice.clientEmail);
                setClientAddress(invoice.clientAddress || "");
                setInvoiceNumber(invoice.invoiceNumber);
                setIssueDate(new Date(invoice.issueDate).toISOString().split('T')[0]);
                setDueDate(new Date(invoice.dueDate).toISOString().split('T')[0]);
                setItems(invoice.items);
                setTaxRate(invoice.tax ?? 18);
                setNotes(invoice.notes || "");
                setStatus(invoice.status || 'sent');

                // Fetch clients
                const q = query(collection(db, "users"), where("role", "==", "client"));
                const clientsSnap = await getDocs(q);
                const clientList: User[] = [];
                clientsSnap.forEach(doc => {
                    clientList.push(doc.data() as User);
                });
                setClients(clientList);

                // Fetch invoice settings
                const settingsRes = await getInvoiceSettings();
                if (settingsRes.success) {
                    setInvoiceSettings(settingsRes.data);
                }
            } catch (error) {
                console.error("Error fetching invoice:", error);
                toast.error("Failed to load invoice");
            } finally {
                setIsFetching(false);
            }
        }

        fetchData();
    }, [user, router, params.id]);

    // Handle Client Selection
    const handleClientSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const selectedId = e.target.value;
        const selectedClient = clients.find(c => c.uid === selectedId);
        if (selectedClient) {
            setClientId(selectedId);
            setClientName(selectedClient.displayName || "");
            setClientEmail(selectedClient.email || "");
        }
    };

    // Item Management
    const addItem = () => {
        setItems([...items, { description: "", quantity: 1, rate: 0, amount: 0 }]);
    };

    const removeItem = (index: number) => {
        const newItems = [...items];
        newItems.splice(index, 1);
        setItems(newItems);
    };

    const updateItem = (index: number, field: keyof InvoiceItem, value: string | number) => {
        const newItems = [...items];
        const item = { ...newItems[index] };

        if (field === "description") item.description = value as string;
        if (field === "quantity") item.quantity = Number(value);
        if (field === "rate") item.rate = Number(value);
        
        item.amount = item.quantity * item.rate;
        newItems[index] = item;
        setItems(newItems);
    };

    // Calculations
    const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
    const taxAmount = (subtotal * taxRate) / 100;
    const total = subtotal + taxAmount;

    // Save
    const handleSave = async () => {
        if (!clientId || !issueDate || !dueDate) {
            toast.error("Please fill in all required fields (Client, Dates)");
            return;
        }

        setIsLoading(true);
        try {
            const res = await updateInvoice(params.id, {
                invoiceNumber,
                clientId,
                clientName,
                clientEmail,
                clientAddress,
                items,
                subtotal,
                tax: taxRate,
                total,
                status,
                issueDate: new Date(issueDate).getTime(),
                dueDate: new Date(dueDate).getTime(),
                notes
            });

            if (res.success) {
                toast.success("Invoice updated successfully!");
                router.push("/dashboard/invoices");
            } else {
                toast.error(res.error || "Failed to update invoice");
            }
        } catch (error) {
            console.error("Error updating invoice:", error);
            toast.error("Failed to update invoice");
        } finally {
            setIsLoading(false);
        }
    };

    // Delete
    const handleDelete = async () => {
        if (!confirm("Are you sure you want to delete this invoice? This action cannot be undone.")) return;

        try {
            const res = await deleteInvoice(params.id);
            if (res.success) {
                toast.success("Invoice deleted");
                router.push("/dashboard/invoices");
            } else {
                toast.error(res.error || "Failed to delete");
            }
        } catch (error) {
            toast.error("Failed to delete invoice");
        }
    };

    // Preview object
    const previewInvoice: Invoice = {
        id: params.id,
        invoiceNumber,
        clientId,
        clientName: clientName || "Client Name",
        clientEmail: clientEmail || "client@example.com",
        clientAddress,
        items,
        subtotal,
        tax: taxRate,
        total,
        status,
        issueDate: issueDate ? new Date(issueDate).getTime() : Date.now(),
        dueDate: dueDate ? new Date(dueDate).getTime() : Date.now(),
        notes,
        createdAt: Date.now(),
        updatedAt: Date.now()
    };

    if (isFetching) {
        return (
            <div className="flex h-screen items-center justify-center bg-zinc-950">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    <span className="text-sm text-muted-foreground">Loading invoice...</span>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-screen bg-zinc-950 text-foreground overflow-hidden">
            {/* Editor Sidebar */}
            <div className={cn("border-r border-border flex flex-col bg-zinc-900 overflow-y-auto transition-all", showPreview ? "w-1/2" : "w-full max-w-3xl mx-auto")}>
                <div className="p-6 border-b border-border sticky top-0 bg-zinc-900 z-10">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-4">
                            <Link href="/dashboard/invoices" className="p-2 hover:bg-card rounded-full transition-colors">
                                <ArrowLeft className="h-5 w-5 text-muted-foreground" />
                            </Link>
                            <h1 className="text-xl font-bold">Edit Invoice</h1>
                        </div>
                        <button
                            onClick={() => setShowPreview(!showPreview)}
                            className="p-2 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground transition-all"
                        >
                            {showPreview ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                        </button>
                    </div>
                    
                    <div className="flex gap-2">
                        <Button onClick={handleSave} disabled={isLoading} className="flex-1 gap-2 bg-primary hover:bg-primary/90">
                            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            {isLoading ? "Saving..." : "Save Changes"}
                        </Button>
                        <Button onClick={handleDelete} variant="outline" className="gap-2 border-red-500/30 text-red-500 hover:bg-red-500/10 hover:text-red-500">
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                </div>

                <div className="p-6 space-y-8">
                    {/* Status */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Invoice Status</h3>
                        <div className="flex gap-2">
                            {(['draft', 'sent', 'paid', 'overdue', 'cancelled'] as const).map(s => (
                                <button
                                    key={s}
                                    onClick={() => setStatus(s)}
                                    className={cn(
                                        "px-4 py-2 rounded-lg text-sm font-medium transition-all capitalize",
                                        status === s 
                                            ? s === 'paid' ? "bg-emerald-500/20 text-emerald-500 border border-emerald-500/30"
                                            : s === 'overdue' ? "bg-red-500/20 text-red-500 border border-red-500/30"
                                            : s === 'cancelled' ? "bg-zinc-500/20 text-zinc-300 border border-zinc-500/30"
                                            : s === 'sent' ? "bg-blue-500/20 text-blue-500 border border-blue-500/30"
                                            : "bg-zinc-500/20 text-zinc-400 border border-zinc-500/30"
                                            : "bg-muted text-muted-foreground border border-transparent hover:border-border"
                                    )}
                                >
                                    {s}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Client Details */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Client Details</h3>
                        <div className="space-y-2">
                            <Label>Select Client</Label>
                            <select 
                                className="w-full bg-zinc-950 border border-border rounded-md p-2 text-sm focus:ring-1 focus:ring-primary outline-none"
                                value={clientId}
                                onChange={handleClientSelect}
                            >
                                <option value="">Select a client...</option>
                                {clients.map(c => (
                                    <option key={c.uid} value={c.uid}>{c.displayName} ({c.email})</option>
                                ))}
                            </select>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Client Name</Label>
                                <Input value={clientName} onChange={e => setClientName(e.target.value)} className="bg-zinc-950 border-border" />
                            </div>
                            <div className="space-y-2">
                                <Label>Client Email</Label>
                                <Input value={clientEmail} onChange={e => setClientEmail(e.target.value)} className="bg-zinc-950 border-border" />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Client Address</Label>
                            <Textarea value={clientAddress} onChange={e => setClientAddress(e.target.value)} className="bg-zinc-950 border-border resize-none" rows={2} />
                        </div>
                    </div>

                    {/* Invoice Details */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Invoice Details</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div className="space-y-2">
                                <Label>Invoice #</Label>
                                <Input value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} className="bg-zinc-950 border-border font-mono" />
                            </div>
                            <div className="space-y-2">
                                <Label>Issue Date</Label>
                                <Input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} className="bg-zinc-950 border-border" />
                            </div>
                            <div className="space-y-2">
                                <Label>Due Date</Label>
                                <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="bg-zinc-950 border-border" />
                            </div>
                        </div>
                    </div>

                    {/* Line Items */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Line Items</h3>
                        <div className="space-y-3">
                            {items.map((item, index) => (
                                <div key={index} className="flex gap-3 items-start bg-zinc-950/50 p-3 rounded-lg border border-border">
                                    <div className="flex-1 space-y-2">
                                        <Input 
                                            placeholder="Description" 
                                            value={item.description} 
                                            onChange={e => updateItem(index, "description", e.target.value)}
                                            className="bg-zinc-950 border-border"
                                        />
                                    </div>
                                    <div className="w-20 space-y-2">
                                        <Input 
                                            type="number" 
                                            placeholder="Qty" 
                                            value={item.quantity} 
                                            onChange={e => updateItem(index, "quantity", e.target.value)}
                                            className="bg-zinc-950 border-border text-center"
                                        />
                                    </div>
                                    <div className="w-28 space-y-2">
                                        <Input 
                                            type="number" 
                                            placeholder="Rate" 
                                            value={item.rate} 
                                            onChange={e => updateItem(index, "rate", e.target.value)}
                                            className="bg-zinc-950 border-border"
                                        />
                                    </div>
                                    <div className="w-28 text-right">
                                        <p className="text-sm font-bold text-foreground py-2">₹{item.amount.toLocaleString()}</p>
                                    </div>
                                    <Button variant="ghost" size="icon" onClick={() => removeItem(index)} disabled={items.length === 1} className="text-muted-foreground hover:text-red-500">
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                        <Button variant="outline" onClick={addItem} className="w-full gap-2 border-dashed">
                            <Plus className="h-4 w-4" /> Add Item
                        </Button>
                    </div>

                    {/* Tax & Totals */}
                    <div className="space-y-4 bg-zinc-950/50 p-4 rounded-lg border border-border">
                        <div className="flex justify-between items-center">
                            <span className="text-muted-foreground">Subtotal</span>
                            <span className="font-medium">₹{subtotal.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center gap-4">
                            <span className="text-muted-foreground">Tax (%)</span>
                            <Input 
                                type="number" 
                                value={taxRate} 
                                onChange={e => setTaxRate(Number(e.target.value))}
                                className="w-20 bg-zinc-950 border-border text-center"
                            />
                            <span className="font-medium w-24 text-right">₹{taxAmount.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center border-t border-border pt-4">
                            <span className="text-lg font-bold">Total</span>
                            <span className="text-lg font-bold">₹{total.toLocaleString()}</span>
                        </div>
                    </div>

                    {/* Notes */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Notes</h3>
                        <Textarea 
                            placeholder="Add any notes for the client..." 
                            value={notes} 
                            onChange={e => setNotes(e.target.value)}
                            className="bg-zinc-950 border-border resize-none"
                            rows={3}
                        />
                    </div>
                </div>
            </div>

            {/* Preview Panel */}
            {showPreview && (
                <div className="flex-1 bg-zinc-100 overflow-auto p-8">
                    <div className="transform scale-[0.75] origin-top">
                        <InvoiceRenderer invoice={previewInvoice} settings={invoiceSettings} />
                    </div>
                </div>
            )}
        </div>
    );
}
