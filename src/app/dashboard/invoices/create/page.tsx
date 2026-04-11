"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/context/auth-context";
import { db } from "@/lib/firebase/config";
import { collection, addDoc, getDocs, query, where, serverTimestamp } from "firebase/firestore";
import { Invoice, InvoiceItem, User } from "@/types/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { InvoiceRenderer } from "@/components/invoice/invoice-renderer";
import { Plus, Trash2, Printer, Save, FileText, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

export default function CreateInvoicePage() {
    const { user } = useAuth();
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);
    const [clients, setClients] = useState<User[]>([]);

    // Invoice Form State
    const [clientId, setClientId] = useState("");
    const [clientName, setClientName] = useState("");
    const [clientEmail, setClientEmail] = useState("");
    const [clientAddress, setClientAddress] = useState("");
    const [invoiceNumber, setInvoiceNumber] = useState(`INV-${new Date().getFullYear()}-${Math.floor(Math.random() * 10000)}`);
    const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0]);
    const [dueDate, setDueDate] = useState<string>("");
    const [items, setItems] = useState<InvoiceItem[]>([{ description: "", quantity: 1, rate: 0, amount: 0 }]);
    const [taxRate, setTaxRate] = useState(18);
    const [notes, setNotes] = useState("");

    // Fetch Clients
    useEffect(() => {
        if (user?.role !== 'admin' && user?.role !== 'sales_executive' && user?.role !== 'manager') {
           // router.push("/dashboard"); // Redirect unauthorized
           // commented out for now to allow development testing
        }

        async function fetchClients() {
            const q = query(collection(db, "users"), where("role", "==", "client"));
            const snapshot = await getDocs(q);
            const clientList: User[] = [];
            snapshot.forEach(doc => {
                clientList.push(doc.data() as User);
            });
            setClients(clientList);
        }
        fetchClients();
    }, [user, router]);

    // Handle Client Selection
    const handleClientSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const selectedId = e.target.value;
        const selectedClient = clients.find(c => c.uid === selectedId);
        if (selectedClient) {
            setClientId(selectedId);
            setClientName(selectedClient.displayName || "");
            setClientEmail(selectedClient.email || "");
            // Address might not be in User schema, so leave blank or use custom logic
        } else {
             setClientId("");
             setClientName("");
             setClientEmail("");
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
        
        // Auto-calc amount
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
            const newInvoice: Omit<Invoice, "id"> = {
                invoiceNumber,
                clientId,
                clientName,
                clientEmail,
                clientAddress,
                items,
                subtotal,
                tax: taxRate,
                total,
                status: 'sent',
                issueDate: new Date(issueDate).getTime(),
                dueDate: new Date(dueDate).getTime(),
                notes,
                createdAt: Date.now(),
                updatedAt: Date.now()
            };

            await addDoc(collection(db, "invoices"), newInvoice);
            toast.success("Invoice created successfully!");
            router.push("/dashboard/invoices");
        } catch (error) {
            console.error("Error creating invoice:", error);
            toast.error("Failed to create invoice");
        } finally {
            setIsLoading(false);
        }
    };

    // Create live preview object
    const previewInvoice: Invoice = {
        id: "preview",
        invoiceNumber,
        clientId,
        clientName: clientName || "Client Name",
        clientEmail: clientEmail || "client@example.com",
        clientAddress,
        items,
        subtotal,
        tax: taxRate,
        total,
        status: 'draft',
        issueDate: issueDate ? new Date(issueDate).getTime() : Date.now(),
        dueDate: dueDate ? new Date(dueDate).getTime() : Date.now(),
        notes,
        createdAt: Date.now(),
        updatedAt: Date.now()
    };

    return (
        <div className="flex h-screen bg-zinc-950 text-foreground overflow-hidden">
            {/* Editor Sidebar */}
            <div className="w-full lg:w-1/3 lg:min-w-[400px] border-b lg:border-r lg:border-b-0 border-border flex flex-col bg-zinc-900 overflow-y-auto">
                <div className="p-6 border-b border-border sticky top-0 bg-zinc-900 z-10">
                    <div className="flex items-center gap-4 mb-4">
                        <Link href="/dashboard/invoices" className="p-2 hover:bg-card rounded-full transition-colors">
                            <ArrowLeft className="h-5 w-5 text-muted-foreground" />
                        </Link>
                        <h1 className="text-xl font-bold">New Invoice</h1>
                    </div>
                    
                    <div className="flex gap-2">
                        <Button onClick={handleSave} disabled={isLoading} className="flex-1 gap-2 bg-primary hover:bg-primary/90">
                            <Save className="h-4 w-4" />
                            {isLoading ? "Saving..." : "Save Invoice"}
                        </Button>
                    </div>
                </div>

                <div className="p-6 space-y-8">
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
                        <div className="space-y-2">
                            <Label>Client Name</Label>
                            <Input value={clientName} onChange={e => setClientName(e.target.value)} className="bg-zinc-950 border-border" placeholder="Or type manually" />
                        </div>
                        <div className="space-y-2">
                            <Label>Email</Label>
                            <Input value={clientEmail} onChange={e => setClientEmail(e.target.value)} className="bg-zinc-950 border-border" />
                        </div>
                        <div className="space-y-2">
                            <Label>Address</Label>
                            <Textarea value={clientAddress} onChange={e => setClientAddress(e.target.value)} className="bg-zinc-950 border-border" rows={3} />
                        </div>
                    </div>

                    <div className="h-px bg-card" />

                    {/* Invoice Meta */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Invoice Details</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Invoice #</Label>
                                <Input value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} className="bg-zinc-950 border-border" />
                            </div>
                            <div className="space-y-2">
                                <Label>Tax Rate (%)</Label>
                                <Input type="number" value={taxRate} onChange={e => setTaxRate(Number(e.target.value))} className="bg-zinc-950 border-border" />
                            </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

                    <div className="h-px bg-card" />

                    {/* Items */}
                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Line Items</h3>
                            <Button size="sm" variant="ghost" onClick={addItem} className="h-8 text-primary hover:text-primary hover:bg-primary/10">
                                <Plus className="h-4 w-4 mr-1" /> Add Item
                            </Button>
                        </div>
                        
                        <div className="space-y-3">
                            {items.map((item, idx) => (
                                <div key={idx} className="p-3 bg-zinc-950/50 rounded-lg border border-border group relative">
                                    <div className="grid grid-cols-12 gap-2 mb-2">
                                        <div className="col-span-12">
                                            <Input 
                                                placeholder="Description" 
                                                value={item.description} 
                                                onChange={e => updateItem(idx, 'description', e.target.value)}
                                                className="bg-transparent border-none p-0 h-auto focus-visible:ring-0 font-medium placeholder:text-muted-foreground"
                                            />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-12 gap-2 items-center">
                                        <div className="col-span-3">
                                            <div className="text-[10px] text-muted-foreground uppercase">Qty</div>
                                            <Input 
                                                type="number" 
                                                value={item.quantity} 
                                                onChange={e => updateItem(idx, 'quantity', e.target.value)}
                                                className="bg-zinc-900 border-border h-8 text-xs"
                                            />
                                        </div>
                                        <div className="col-span-4">
                                            <div className="text-[10px] text-muted-foreground uppercase">Rate</div>
                                            <Input 
                                                type="number" 
                                                value={item.rate} 
                                                onChange={e => updateItem(idx, 'rate', e.target.value)}
                                                className="bg-zinc-900 border-border h-8 text-xs"
                                            />
                                        </div>
                                        <div className="col-span-4 text-right">
                                            <div className="text-[10px] text-muted-foreground uppercase">Amount</div>
                                            <div className="font-mono text-sm pt-1">₹{item.amount.toLocaleString()}</div>
                                        </div>
                                        <div className="col-span-1 text-right">
                                             <Button 
                                                size="icon" 
                                                variant="ghost" 
                                                onClick={() => removeItem(idx)}
                                                className="h-6 w-6 text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
                                            >
                                                <Trash2 className="h-3 w-3" />
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="h-px bg-card" />
                    
                    <div className="space-y-2">
                        <Label>Notes / Payment Instructions</Label>
                        <Textarea 
                            value={notes} 
                            onChange={e => setNotes(e.target.value)} 
                            className="bg-zinc-950 border-border min-h-[100px]" 
                            placeholder="Bank details, terms, etc."
                        />
                    </div>
                </div>
            </div>

            {/* Preview Area */}
            <div className="flex-1 bg-zinc-950 p-8 overflow-y-auto flex items-start justify-center">
                <div className="w-full max-w-[210mm] shadow-2xl origin-top sm:scale-75 md:scale-90 lg:scale-100 transition-transform">
                     {/* Print Overlay for quick action */}
                     <div className="mb-4 flex justify-between items-center bg-zinc-900/50 p-4 rounded-lg border border-border backdrop-blur">
                         <span className="text-sm text-muted-foreground font-medium">Live Preview (A4)</span>
                         <Button variant="outline" size="sm" className="gap-2" onClick={() => window.print()}>
                             <Printer className="h-4 w-4" /> Print / Save PDF
                         </Button>
                     </div>
                     
                     <InvoiceRenderer invoice={previewInvoice} />
                </div>
            </div>
            
            {/* Print Styles */}
            <style jsx global>{`
                @media print {
                    body * {
                        visibility: hidden;
                    }
                    #invoice-print-area, #invoice-print-area * {
                        visibility: visible;
                    }
                    #invoice-print-area {
                        position: absolute;
                        left: 0;
                        top: 0;
                        width: 100%;
                        margin: 0;
                        padding: 2cm; /* Add standard print padding */
                    }
                }
            `}</style>
        </div>
    );
}
