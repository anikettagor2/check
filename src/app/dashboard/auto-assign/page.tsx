"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/context/auth-context";
import { useRouter } from "next/navigation";
import { db } from "@/lib/firebase/config";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { User, Project } from "@/types/schema";
import { 
    getAutoAssignSettings, 
    updateAutoAssignSettings 
} from "@/app/actions/admin-actions";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
    Loader2,
    Zap,
    Star,
    GripVertical,
    Plus,
    Trash2,
    Save,
    CheckCircle2,
    AlertCircle,
    Users,
    BarChart3,
    Settings2,
    ArrowUpDown
} from "lucide-react";

interface AutoAssignEditor {
    editorId: string;
    priority: number;
    maxProjects: number;
    isActive: boolean;
}

export default function AutoAssignPage() {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();
    
    const [editors, setEditors] = useState<User[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [autoAssignEditors, setAutoAssignEditors] = useState<AutoAssignEditor[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [globalMaxProjects, setGlobalMaxProjects] = useState(5);
    const [isEnabled, setIsEnabled] = useState(true);

    useEffect(() => {
        if (!authLoading && (!user || user.role !== 'admin')) {
            router.push('/dashboard');
            return;
        }

        // Fetch editors
        const editorsQuery = query(collection(db, "users"), where("role", "==", "editor"));
        const unsubEditors = onSnapshot(editorsQuery, (snapshot) => {
            const editorsData = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as User));
            setEditors(editorsData);
        });

        // Fetch active projects to show workload
        const projectsQuery = query(collection(db, "projects"));
        const unsubProjects = onSnapshot(projectsQuery, (snapshot) => {
            const projectsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Project));
            setProjects(projectsData);
        });

        // Load auto-assign settings
        loadSettings();

        return () => {
            unsubEditors();
            unsubProjects();
        };
    }, [user, authLoading, router]);

    const loadSettings = async () => {
        try {
            const res = await getAutoAssignSettings();
            if (res.success && res.data) {
                setAutoAssignEditors(res.data.editors || []);
                setGlobalMaxProjects(res.data.globalMaxProjects || 5);
                setIsEnabled(res.data.isEnabled !== false);
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
            const res = await updateAutoAssignSettings({
                editors: autoAssignEditors,
                globalMaxProjects,
                isEnabled,
                updatedAt: Date.now()
            });
            if (res.success) {
                toast.success("Auto-assign settings saved");
            } else {
                toast.error(res.error || "Failed to save");
            }
        } catch (err) {
            toast.error("An error occurred");
        } finally {
            setSaving(false);
        }
    };

    const addEditor = (editorId: string) => {
        if (autoAssignEditors.find(e => e.editorId === editorId)) {
            toast.error("Editor already in auto-assign pool");
            return;
        }
        const nextPriority = autoAssignEditors.length + 1;
        setAutoAssignEditors([
            ...autoAssignEditors,
            { editorId, priority: nextPriority, maxProjects: globalMaxProjects, isActive: true }
        ]);
    };

    const removeEditor = (editorId: string) => {
        const updated = autoAssignEditors
            .filter(e => e.editorId !== editorId)
            .map((e, idx) => ({ ...e, priority: idx + 1 })); // Re-index priorities
        setAutoAssignEditors(updated);
    };

    const updatePriority = (editorId: string, newPriority: number) => {
        if (newPriority < 1 || newPriority > autoAssignEditors.length) return;
        
        const updated = [...autoAssignEditors];
        const currentIdx = updated.findIndex(e => e.editorId === editorId);
        const currentEditor = updated[currentIdx];
        const oldPriority = currentEditor.priority;
        
        // Swap priorities
        const otherIdx = updated.findIndex(e => e.priority === newPriority);
        if (otherIdx !== -1) {
            updated[otherIdx].priority = oldPriority;
        }
        updated[currentIdx].priority = newPriority;
        
        // Sort by priority
        updated.sort((a, b) => a.priority - b.priority);
        setAutoAssignEditors(updated);
    };

    const toggleEditorActive = (editorId: string) => {
        setAutoAssignEditors(prev => 
            prev.map(e => e.editorId === editorId ? { ...e, isActive: !e.isActive } : e)
        );
    };

    const setEditorMaxProjects = (editorId: string, max: number) => {
        setAutoAssignEditors(prev =>
            prev.map(e => e.editorId === editorId ? { ...e, maxProjects: max } : e)
        );
    };

    const getEditorWorkload = (editorId: string) => {
        return projects.filter(p => 
            p.assignedEditorId === editorId && 
            !['completed', 'archived'].includes(p.status)
        ).length;
    };

    const availableEditors = editors.filter(
        e => !autoAssignEditors.find(ae => ae.editorId === e.uid)
    );

    if (authLoading || loading) {
        return (
            <div className="flex h-[calc(100vh-12rem)] items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    <span className="text-sm text-muted-foreground">Loading auto-assign settings...</span>
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
                            <Zap className="w-6 h-6 text-primary" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-foreground">Auto-Assign Editors</h1>
                            <p className="text-sm text-muted-foreground">Configure automatic editor assignment for projects</p>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setIsEnabled(!isEnabled)}
                        className={cn(
                            "px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2",
                            isEnabled 
                                ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                                : "bg-muted text-muted-foreground border border-border"
                        )}
                    >
                        {isEnabled ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                        {isEnabled ? "Enabled" : "Disabled"}
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

            {/* Global Settings */}
            <div className="bg-card border border-border rounded-xl p-6 mb-8">
                <div className="flex items-center gap-3 mb-4">
                    <Settings2 className="w-5 h-5 text-muted-foreground" />
                    <h2 className="text-lg font-bold text-foreground">Global Settings</h2>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div>
                        <label className="text-sm font-medium text-muted-foreground mb-2 block">
                            Default Max Projects Per Editor
                        </label>
                        <input
                            type="number"
                            value={globalMaxProjects}
                            onChange={(e) => setGlobalMaxProjects(Math.max(1, parseInt(e.target.value) || 5))}
                            min={1}
                            max={20}
                            className="w-full px-4 py-2 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                            Maximum concurrent projects an editor can handle (default for new editors)
                        </p>
                    </div>
                    <div className="bg-muted/30 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <BarChart3 className="w-4 h-4 text-primary" />
                            <span className="text-sm font-medium text-foreground">How It Works</span>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                            When a Project Manager chooses "Auto Assign", the system will check each editor 
                            in priority order (1 → 2 → 3 → ...) and assign the project to the first available 
                            editor who has less than their max projects.
                        </p>
                    </div>
                </div>
            </div>

            {/* Priority Pool */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Users className="w-5 h-5 text-muted-foreground" />
                        <h2 className="text-lg font-bold text-foreground">Priority Pool</h2>
                        <span className="px-2 py-0.5 bg-primary/10 text-primary rounded-full text-xs font-bold">
                            {autoAssignEditors.length} editors
                        </span>
                    </div>
                </div>

                {/* Editor Table */}
                <div className="divide-y divide-border">
                    <AnimatePresence>
                        {autoAssignEditors
                            .sort((a, b) => a.priority - b.priority)
                            .map((ae, idx) => {
                                const editor = editors.find(e => e.uid === ae.editorId);
                                if (!editor) return null;
                                const workload = getEditorWorkload(ae.editorId);
                                const isAtCapacity = workload >= ae.maxProjects;
                                const status = editor.availabilityStatus || 'offline';

                                return (
                                    <motion.div
                                        key={ae.editorId}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, x: -100 }}
                                        className={cn(
                                            "px-6 py-4 flex items-center gap-4 transition-all",
                                            !ae.isActive && "opacity-50 bg-muted/30"
                                        )}
                                    >
                                        {/* Priority Badge */}
                                        <div className="flex items-center gap-2">
                                            <GripVertical className="w-4 h-4 text-muted-foreground/50" />
                                            <div className={cn(
                                                "h-10 w-10 rounded-xl flex items-center justify-center text-lg font-black",
                                                ae.priority === 1 ? "bg-amber-500/20 text-amber-500" :
                                                ae.priority === 2 ? "bg-slate-400/20 text-slate-400" :
                                                ae.priority === 3 ? "bg-orange-600/20 text-orange-600" :
                                                "bg-muted text-muted-foreground"
                                            )}>
                                                {ae.priority}
                                            </div>
                                        </div>

                                        {/* Editor Info */}
                                        <div className="flex items-center gap-3 flex-1 min-w-0">
                                            <div className="relative">
                                                <Avatar className="h-10 w-10 ring-2 ring-border">
                                                    <AvatarImage src={editor.photoURL || undefined} />
                                                    <AvatarFallback className="bg-primary/10 text-primary font-bold">
                                                        {editor.displayName?.[0]}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <div className={cn(
                                                    "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card",
                                                    status === 'online' ? "bg-emerald-500" : 
                                                    status === 'sleep' ? "bg-amber-500" : "bg-red-500"
                                                )} />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="font-bold text-foreground truncate">{editor.displayName}</p>
                                                <p className="text-xs text-muted-foreground truncate">{editor.email}</p>
                                            </div>
                                        </div>

                                        {/* Workload */}
                                        <div className="text-center px-4">
                                            <div className={cn(
                                                "text-lg font-bold",
                                                isAtCapacity ? "text-red-500" : "text-foreground"
                                            )}>
                                                {workload}/{ae.maxProjects}
                                            </div>
                                            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Workload</p>
                                        </div>

                                        {/* Priority Buttons */}
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={() => updatePriority(ae.editorId, ae.priority - 1)}
                                                disabled={ae.priority === 1}
                                                className="p-2 hover:bg-muted rounded-lg disabled:opacity-30 transition-all"
                                                title="Move up"
                                            >
                                                <ArrowUpDown className="w-4 h-4 text-muted-foreground rotate-180" />
                                            </button>
                                            <button
                                                onClick={() => updatePriority(ae.editorId, ae.priority + 1)}
                                                disabled={ae.priority === autoAssignEditors.length}
                                                className="p-2 hover:bg-muted rounded-lg disabled:opacity-30 transition-all"
                                                title="Move down"
                                            >
                                                <ArrowUpDown className="w-4 h-4 text-muted-foreground" />
                                            </button>
                                        </div>

                                        {/* Max Projects Input */}
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-muted-foreground">Max:</span>
                                            <input
                                                type="number"
                                                value={ae.maxProjects}
                                                onChange={(e) => setEditorMaxProjects(ae.editorId, Math.max(1, parseInt(e.target.value) || 5))}
                                                min={1}
                                                max={20}
                                                className="w-16 px-2 py-1.5 bg-background border border-border rounded-lg text-center text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50"
                                            />
                                        </div>

                                        {/* Toggle Active */}
                                        <button
                                            onClick={() => toggleEditorActive(ae.editorId)}
                                            className={cn(
                                                "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                                                ae.isActive 
                                                    ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                                                    : "bg-muted text-muted-foreground border border-border"
                                            )}
                                        >
                                            {ae.isActive ? "Active" : "Paused"}
                                        </button>

                                        {/* Remove */}
                                        <button
                                            onClick={() => removeEditor(ae.editorId)}
                                            className="p-2 hover:bg-red-500/10 rounded-lg text-muted-foreground hover:text-red-500 transition-all"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </motion.div>
                                );
                            })}
                    </AnimatePresence>
                </div>

                {autoAssignEditors.length === 0 && (
                    <div className="px-6 py-12 text-center">
                        <Users className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                        <p className="text-muted-foreground">No editors in auto-assign pool</p>
                        <p className="text-xs text-muted-foreground mt-1">Add editors below to enable auto-assignment</p>
                    </div>
                )}
            </div>

            {/* Add Editors Section */}
            <div className="mt-8 bg-card border border-border rounded-xl p-6">
                <div className="flex items-center gap-3 mb-4">
                    <Plus className="w-5 h-5 text-muted-foreground" />
                    <h2 className="text-lg font-bold text-foreground">Add Editors to Pool</h2>
                </div>

                {availableEditors.length === 0 ? (
                    <p className="text-sm text-muted-foreground">All editors are already in the auto-assign pool.</p>
                ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                        {availableEditors.map(editor => {
                            const workload = getEditorWorkload(editor.uid);
                            const status = editor.availabilityStatus || 'offline';
                            
                            return (
                                <button
                                    key={editor.uid}
                                    onClick={() => addEditor(editor.uid)}
                                    className="group p-4 bg-muted/30 hover:bg-muted/50 border border-border hover:border-primary/30 rounded-xl text-left transition-all"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="relative">
                                            <Avatar className="h-10 w-10 ring-2 ring-border group-hover:ring-primary/30">
                                                <AvatarImage src={editor.photoURL || undefined} />
                                                <AvatarFallback className="bg-primary/10 text-primary font-bold">
                                                    {editor.displayName?.[0]}
                                                </AvatarFallback>
                                            </Avatar>
                                            <div className={cn(
                                                "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card",
                                                status === 'online' ? "bg-emerald-500" : 
                                                status === 'sleep' ? "bg-amber-500" : "bg-red-500"
                                            )} />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="font-semibold text-foreground truncate text-sm">{editor.displayName}</p>
                                            <p className="text-xs text-muted-foreground">{workload} active projects</p>
                                        </div>
                                        <Plus className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
