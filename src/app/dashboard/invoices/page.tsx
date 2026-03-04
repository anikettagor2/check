"use client";

import { useEffect, useState } from "react";
import { collection, query, where, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuth } from "@/lib/context/auth-context";
import { Invoice } from "@/types/schema";
import { Button } from "@/components/ui/button";
import { Plus, Search, FileText, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

export default function InvoicesPage() {
    const { user } = useAuth();
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [loading, setLoading] = useState(true);

    const isAdmin = user?.role === 'admin' || user?.role === 'sales_executive' || user?.role === 'manager';

    useEffect(() => {
        if (!user) return;

        let q;
        if (isAdmin) {
            q = query(collection(db, "invoices"), orderBy("createdAt", "desc"));
        } else {
            // Client View
            q = query(
                collection(db, "invoices"), 
                where("clientId", "==", user.uid),
                orderBy("createdAt", "desc") // might require index
            );
        }

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list: Invoice[] = [];
            snapshot.forEach(doc => {
                 list.push({ id: doc.id, ...doc.data() } as Invoice);
            });
            setInvoices(list);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user, isAdmin]);

    const filteredInvoices = invoices.filter(inv => 
        inv.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inv.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="p-8 space-y-8 min-h-screen bg-zinc-950 text-foreground">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Invoices</h1>
                    <p className="text-muted-foreground">Manage and view payment requests.</p>
                </div>
                {isAdmin && (
                    <Link href="/dashboard/invoices/create">
                        <Button className="gap-2 bg-primary hover:bg-primary/90">
                            <Plus className="h-4 w-4" /> Create Invoice
                        </Button>
                    </Link>
                )}
            </div>

            <div className="flex items-center gap-4 bg-zinc-900/50 p-4 rounded-xl border border-border">
                <Search className="h-5 w-5 text-muted-foreground" />
                <Input 
                    placeholder="Search by client or invoice #..." 
                    className="bg-transparent border-none focus-visible:ring-0 text-sm h-auto p-0 placeholder:text-muted-foreground"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            {loading ? (
                <div className="text-center py-20 text-muted-foreground">Loading invoices...</div>
            ) : filteredInvoices.length === 0 ? (
                <div className="text-center py-20 border border-dashed border-zinc-800 rounded-xl">
                    <FileText className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                    <p className="text-muted-foreground font-medium">No invoices found</p>
                    {isAdmin && (
                        <Link href="/dashboard/invoices/create" className="text-primary text-sm hover:underline mt-2 inline-block">
                            Create your first invoice
                        </Link>
                    )}
                </div>
            ) : (
                <div className="grid gap-4">
                    {filteredInvoices.map((invoice) => (
                        <div key={invoice.id} className="group flex items-center justify-between p-4 rounded-xl bg-zinc-900 border border-border hover:border-border transition-all">
                            <div className="flex items-center gap-4">
                                <div className="h-10 w-10 rounded-lg bg-muted-foreground flex items-center justify-center text-muted-foreground font-bold text-xs">
                                    {invoice.status === 'paid' ? '$$' : 'INV'}
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="font-mono font-bold text-foreground">{invoice.invoiceNumber}</span>
                                        <span className={cn(
                                            "text-[10px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wider",
                                            invoice.status === 'paid' ? "bg-emerald-500/10 text-emerald-500" :
                                            invoice.status === 'sent' ? "bg-blue-500/10 text-blue-500" :
                                            invoice.status === 'overdue' ? "bg-red-500/10 text-red-500" :
                                            "bg-zinc-500/10 text-muted-foreground"
                                        )}>
                                            {invoice.status}
                                        </span>
                                    </div>
                                    <p className="text-sm text-muted-foreground mt-0.5">{invoice.clientName} • Due {format(invoice.dueDate, "MMM dd, yyyy")}</p>
                                </div>
                            </div>
                            
                            <div className="flex items-center gap-6">
                                <div className="text-right">
                                    <p className="text-sm font-bold text-foreground">₹{invoice.total.toLocaleString()}</p>
                                    <p className="text-xs text-muted-foreground">Total Amount</p>
                                </div>
                                <Link href={`/invoices/${invoice.id}`}>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-card">
                                        <ArrowUpRight className="h-4 w-4" />
                                    </Button>
                                </Link>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
