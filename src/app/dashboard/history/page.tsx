"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/context/auth-context";
import { db } from "@/lib/firebase/config";
import { collection, query, where, getDocs, orderBy } from "firebase/firestore";
import { Project } from "@/types/schema";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { FolderGit2, Calendar, CheckCircle2, Clock } from "lucide-react";
import Link from "next/link";

export default function WorkHistoryPage() {
    const { user } = useAuth();
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user || user.role !== 'editor') return;

        async function fetchHistory() {
            try {
                // Fetch projects where editor is assigned and status is completed or archived
                const q = query(
                    collection(db, "projects"),
                    where("members", "array-contains", user!.uid)
                );

                const snapshot = await getDocs(q);
                const list = snapshot.docs
                    .map(doc => ({ id: doc.id, ...doc.data() } as Project))
                    .filter(p => p.status === 'completed' || p.status === 'archived')
                    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)); // Client-side sort
                
                setProjects(list);
            } catch (error) {
                console.error("Error fetching work history:", error);
            } finally {
                setLoading(false);
            }
        }

        fetchHistory();
    }, [user]);

    if (loading) {
        return <div className="p-8 text-center text-muted-foreground">Loading history...</div>;
    }

    return (
        <div className="p-8 space-y-8 min-h-screen bg-zinc-950 text-foreground">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Work History</h1>
                <p className="text-muted-foreground mt-2">A record of your completed projects and contributions.</p>
            </div>

            {projects.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-12 border border-dashed border-zinc-800 rounded-xl bg-zinc-900/50">
                    <FolderGit2 className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium text-foreground/80">No completed projects yet</h3>
                    <p className="text-muted-foreground text-sm mt-1">Once you finish tasks, they will appear here.</p>
                </div>
            ) : (
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-zinc-900 text-muted-foreground uppercase font-medium border-b border-zinc-800">
                            <tr>
                                <th className="px-6 py-4">Project Name</th>
                                <th className="px-6 py-4">Type</th>
                                <th className="px-6 py-4">Finished Date</th>
                                <th className="px-6 py-4">Duration</th>
                                <th className="px-6 py-4 text-right">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800">
                            {projects.map((project) => (
                                <tr key={project.id} className="hover:bg-zinc-900/80 transition-colors group">
                                    <td className="px-6 py-4 font-medium text-foreground">
                                        <Link href={`/dashboard/projects/${project.id}`} className="hover:text-primary transition-colors">
                                            {project.name}
                                        </Link>
                                        <div className="text-xs text-muted-foreground mt-0.5 font-mono">
                                            ID: {project.id.slice(0, 8)}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-muted-foreground">
                                        {project.videoType || "Video"}
                                    </td>
                                    <td className="px-6 py-4 text-muted-foreground flex items-center gap-2">
                                        <Calendar className="h-3 w-3" />
                                        {project.updatedAt ? format(project.updatedAt, "MMM dd, yyyy") : "N/A"}
                                    </td>
                                    <td className="px-6 py-4 text-muted-foreground">
                                        {project.duration ? `${project.duration} mins` : "-"}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <Badge variant="secondary" className={
                                            (project.status === 'completed' || project.status === 'archived')
                                                ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" 
                                                : "bg-muted-foreground text-foreground/80 border-zinc-600"
                                        }>
                                            {(project.status === 'completed' || project.status === 'archived') ? <CheckCircle2 className="h-3 w-3 mr-1" /> : <Clock className="h-3 w-3 mr-1" />}
                                            {(project.status === 'completed' || project.status === 'archived') ? "Completed" : project.status}
                                        </Badge>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
