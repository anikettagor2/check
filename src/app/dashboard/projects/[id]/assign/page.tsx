"use client";

import { useState, use } from "react";
import { useRouter } from "next/navigation";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { Sparkles, Users, Star, CheckCircle2, Zap, ArrowRight, Loader2 } from "lucide-react";

// Mock Editor Data
const MOCK_EDITORS = [
    {
        id: "editor_1",
        name: "Sarah Jenkins",
        role: "Senior Editor",
        rating: 4.9,
        rate: 60,
        completedProjects: 142,
        avatar: "https://i.pravatar.cc/150?u=editor_1",
        skills: ["Commercial", "Documentary"]
    },
    {
        id: "editor_2",
        name: "Mike Chen",
        role: "VFX Specialist",
        rating: 4.8,
        rate: 75,
        completedProjects: 89,
        avatar: "https://i.pravatar.cc/150?u=editor_2",
        skills: ["After Effects", "3D"]
    },
    {
        id: "editor_3",
        name: "Alex Rivera",
        role: "Storyteller",
        rating: 4.7,
        rate: 50,
        completedProjects: 215,
        avatar: "https://i.pravatar.cc/150?u=editor_3",
        skills: ["YouTube", "Vlog"]
    },
    {
        id: "editor_4",
        name: "Jessica Wu",
        role: "Colorist",
        rating: 5.0,
        rate: 85,
        completedProjects: 56,
        avatar: "https://i.pravatar.cc/150?u=editor_4",
        skills: ["Color Grading", "Cinema"]
    }
];

export default function AssignEditorPage(props: { params: Promise<{ id: string }> }) {
    const params = use(props.params);
    const router = useRouter();
    
    // State
    const [viewMode, setViewMode] = useState<'selection' | 'automated' | 'list'>('selection');
    const [isProcessing, setIsProcessing] = useState(false);
    const [selectedEditor, setSelectedEditor] = useState<string | null>(null);

    const handleAssign = async (editorId: string) => {
        if (!params.id) return;
        setIsProcessing(true);
        setSelectedEditor(editorId);

        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 2000));

        try {
            const projectRef = doc(db, "projects", params.id);
            await updateDoc(projectRef, {
                assignedEditorId: editorId,
                status: "in_progress",
                assignedAt: Date.now()
            });
            
            // Redirect to project dashboard
            router.push(`/dashboard/projects/${params.id}`);
        } catch (error) {
            console.error("Error assigning editor:", error);
            setIsProcessing(false);
        }
    };

    const runUseAutomate = async () => {
        setViewMode('automated');
        // Fake "AI Matching" process
        await new Promise(resolve => setTimeout(resolve, 2500));
        // Pick top rated editor
        handleAssign(MOCK_EDITORS[0].id);
    };

    return (
        <div className="min-h-screen bg-background text-foreground p-8">
            <div className="max-w-5xl mx-auto">
                <header className="mb-12 text-center">
                    <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-white to-zinc-500 bg-clip-text text-transparent">
                        Find Your Perfect Editor
                    </h1>
                    <p className="text-muted-foreground">
                        Choose how you'd like to match with an editor for your project.
                    </p>
                </header>

                {viewMode === 'selection' && (
                    <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
                        {/* Option 1: Automate */}
                        <div 
                            onClick={runUseAutomate}
                            className="group relative overflow-hidden rounded-3xl border border-border bg-zinc-900/50 p-8 hover:bg-muted-foreground/50 transition-all cursor-pointer hover:border-primary/50"
                        >
                            <div className="absolute top-0 right-0 p-4 opacity-50 group-hover:opacity-100 transition-opacity">
                                <Sparkles className="w-24 h-24 text-primary/20" />
                            </div>
                            
                            <div className="relative z-10">
                                <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center mb-6 text-primary">
                                    <Zap className="w-6 h-6" />
                                </div>
                                <h2 className="text-2xl font-bold mb-2">Automate Match</h2>
                                <p className="text-muted-foreground mb-6">
                                    Our AI analyzes your project requirements and instantly matches you with the best available editor.
                                </p>
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                                    <span>Fastest assignment</span>
                                </div>
                                <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                                    <span>Verified top-tier talent</span>
                                </div>
                            </div>
                        </div>

                        {/* Option 2: Browse */}
                        <div 
                            onClick={() => setViewMode('list')}
                            className="group relative overflow-hidden rounded-3xl border border-border bg-zinc-900/50 p-8 hover:bg-muted-foreground/50 transition-all cursor-pointer hover:border-blue-500/50"
                        >
                             <div className="absolute top-0 right-0 p-4 opacity-50 group-hover:opacity-100 transition-opacity">
                                <Users className="w-24 h-24 text-blue-500/20" />
                            </div>

                            <div className="relative z-10">
                                <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center mb-6 text-blue-500">
                                    <Users className="w-6 h-6" />
                                </div>
                                <h2 className="text-2xl font-bold mb-2">Browse Editors</h2>
                                <p className="text-muted-foreground mb-6">
                                    Browse through our curated list of professional editors, view portfolios, and choose your favorite.
                                </p>
                                <Button variant="outline" className="w-full bg-transparent border-border hover:bg-muted hover:text-foreground group-hover:border-blue-500/50">
                                    View Available Editors <ArrowRight className="ml-2 w-4 h-4" />
                                </Button>
                            </div>
                        </div>
                    </div>
                )}

                {viewMode === 'automated' && (
                    <div className="flex flex-col items-center justify-center py-20">
                        <div className="relative w-24 h-24 mb-8">
                            <div className="absolute inset-0 border-4 border-zinc-800 rounded-full"></div>
                            <div className="absolute inset-0 border-4 border-primary rounded-full border-t-transparent animate-spin"></div>
                            <Sparkles className="absolute inset-0 m-auto w-8 h-8 text-primary animate-pulse" />
                        </div>
                        <h2 className="text-2xl font-bold mb-2">Finding the best match...</h2>
                        <p className="text-muted-foreground">Analyzing your requirements and checking status...</p>
                    </div>
                )}

                {viewMode === 'list' && (
                    <div className="space-y-6">
                        <div className="flex items-center justify-between mb-8">
                            <h2 className="text-2xl font-bold">Top Rated Editors</h2>
                            <Button variant="ghost" onClick={() => setViewMode('selection')}>Back</Button>
                        </div>

                        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {MOCK_EDITORS.map((editor) => (
                                <div key={editor.id} className="bg-zinc-900/50 border border-border rounded-2xl p-6 hover:border-border transition-all">
                                    <div className="flex items-start justify-between mb-4">
                                        <div className="flex items-center gap-3">
                                            <Avatar className="w-12 h-12 border border-border">
                                                <AvatarImage src={editor.avatar} />
                                                <AvatarFallback>{editor.name.substring(0,2)}</AvatarFallback>
                                            </Avatar>
                                            <div>
                                                <h3 className="font-bold">{editor.name}</h3>
                                                <p className="text-xs text-muted-foreground">{editor.role}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1 bg-yellow-500/10 text-yellow-500 px-2 py-1 rounded text-xs font-bold">
                                            <Star className="w-3 h-3 fill-current" />
                                            {editor.rating}
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap gap-2 mb-6">
                                        {editor.skills.map(skill => (
                                            <span key={skill} className="px-2 py-1 rounded-md bg-muted text-[10px] text-muted-foreground border border-border">
                                                {skill}
                                            </span>
                                        ))}
                                    </div>

                                    <div className="flex items-center justify-between mt-auto">
                                        <div className="text-sm">
                                            <span className="text-foreground font-bold">${editor.rate}</span>
                                            <span className="text-muted-foreground">/min</span>
                                        </div>
                                        <Button 
                                            onClick={() => handleAssign(editor.id)}
                                            disabled={isProcessing}
                                            className={cn(
                                                "bg-primary  text-primary-foreground hover:bg-zinc-200 min-w-[100px]",
                                                selectedEditor === editor.id && "bg-primary text-foreground border-primary"
                                            )}
                                        >
                                            {selectedEditor === editor.id ? (
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                            ) : (
                                                "Hire"
                                            )}
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
