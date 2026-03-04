"use client";

import { motion } from "framer-motion";
import { CreditCard, DollarSign, Download, Clock, CheckCircle2, ChevronRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase/config";
import { collection, query, where, getDocs } from "firebase/firestore";
import { useAuth } from "@/lib/context/auth-context";
import { Project } from "@/types/schema";

export default function PaymentsPage() {
    const { user } = useAuth();
    const [payments, setPayments] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchPayments() {
            if (!user) return;
            try {
                const q = query(
                    collection(db, "projects"),
                    where("ownerId", "==", user.uid)
                );
                const querySnapshot = await getDocs(q);
                const fetched: Project[] = [];
                querySnapshot.forEach((doc) => {
                    fetched.push({ id: doc.id, ...doc.data() } as Project);
                });
                setPayments(fetched);
            } catch (error) {
                console.error("Error fetching payments:", error);
            } finally {
                setLoading(false);
            }
        }
        fetchPayments();
    }, [user]);

    const totalSpent = payments.reduce((acc, curr) => acc + (curr.amountPaid || 0), 0);
    const pendingTotal = payments.reduce((acc, curr) => acc + ((curr.totalCost || 0) - (curr.amountPaid || 0)), 0);

    if (loading) return <div className="flex h-96 items-center justify-center"><Loader2 className="animate-spin text-primary" /></div>;

    return (
        <div className="space-y-8 max-w-6xl mx-auto">
            <header>
                <h1 className="text-3xl font-bold text-foreground font-heading">Payments & Invoices</h1>
                <p className="text-muted-foreground mt-1">Track your project investments and billing history.</p>
            </header>

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="p-6 rounded-3xl bg-[#09090b] border border-zinc-800 shadow-xl">
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4">Total Invested</p>
                    <div className="flex items-end gap-2">
                        <span className="text-4xl font-bold text-foreground tracking-tighter">₹{totalSpent.toLocaleString()}</span>
                        <span className="text-emerald-500 text-xs font-bold mb-1 flex items-center gap-0.5"><CheckCircle2 className="h-3 w-3"/> Verified</span>
                    </div>
                </div>
                <div className="p-6 rounded-3xl bg-[#09090b] border border-zinc-800 shadow-xl">
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4">Outstanding</p>
                    <div className="flex items-end gap-2">
                        <span className="text-4xl font-bold text-foreground tracking-tighter">₹{pendingTotal.toLocaleString()}</span>
                        <span className="text-amber-500 text-xs font-bold mb-1 flex items-center gap-0.5"><Clock className="h-3 w-3"/> Pending</span>
                    </div>
                </div>
                <div className="p-6 rounded-3xl bg-primary/5 border border-primary/20 shadow-xl flex flex-col justify-between">
                     <p className="text-xs font-bold text-primary uppercase tracking-widest mb-4">Active Method</p>
                     <div className="flex items-center gap-3">
                         <div className="p-2 bg-primary/20 rounded-lg"><CreditCard className="h-5 w-5 text-primary" /></div>
                         <span className="text-sm font-semibold text-foreground">Razorpay Checkout</span>
                     </div>
                </div>
            </div>

            {/* Transaction List */}
            <div className="bg-[#09090b] rounded-3xl border border-zinc-800 overflow-hidden shadow-2xl">
                <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
                    <h3 className="font-bold text-lg">Transaction History</h3>
                </div>
                
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-zinc-900/50 text-[10px] text-muted-foreground uppercase tracking-widest font-bold">
                            <tr>
                                <th className="p-6">Project</th>
                                <th className="p-6">Date</th>
                                <th className="p-6">Status</th>
                                <th className="p-6">Amount</th>
                                <th className="p-6">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-900">
                            {payments.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="p-12 text-center text-muted-foreground italic">No transactions found</td>
                                </tr>
                            ) : payments.map((p) => (
                                <tr key={p.id} className="hover:bg-zinc-900/30 transition-colors">
                                    <td className="p-6">
                                        <div className="font-semibold text-foreground">{p.name}</div>
                                        <div className="text-[10px] text-muted-foreground font-mono">{p.id}</div>
                                    </td>
                                    <td className="p-6 text-sm text-muted-foreground">
                                        {new Date(p.updatedAt).toLocaleDateString()}
                                    </td>
                                    <td className="p-6">
                                        <span className={cn(
                                            "px-2 py-1 rounded-full text-[10px] uppercase font-bold border",
                                            p.amountPaid === p.totalCost ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500" : "bg-amber-500/10 border-amber-500/20 text-amber-500"
                                        )}>
                                            {p.amountPaid === p.totalCost ? "Paid" : "Partial"}
                                        </span>
                                    </td>
                                    <td className="p-6 font-mono text-foreground">₹{p.amountPaid?.toLocaleString() || 0}</td>
                                    <td className="p-6">
                                        <button className="p-2 hover:bg-card rounded-lg text-muted-foreground hover:text-foreground transition-all">
                                            <Download className="h-4 w-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
