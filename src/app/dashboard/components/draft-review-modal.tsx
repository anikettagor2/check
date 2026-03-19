"use client";

import { useState } from "react";
import { useAuth } from "@/lib/context/auth-context";
import { db } from "@/lib/firebase/config";
import { addDoc, collection } from "firebase/firestore";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { Download, MessageSquarePlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

interface DraftReviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    project: any;
    revision: any;
    onDownload?: (fileName: string) => void;
    userRole?: 'client' | 'manager' | 'editor';
}

export function DraftReviewModal({
    isOpen,
    onClose,
    project,
    revision,
    onDownload,
    userRole = 'client'
}: DraftReviewModalProps) {
    const { user } = useAuth();
    const [feedbackMode, setFeedbackMode] = useState<'initial' | 'quick' | 'detailed'>('initial');
    const [showFeedbackPopup, setShowFeedbackPopup] = useState(false);
    const [feedbackText, setFeedbackText] = useState("");
    const [rating, setRating] = useState<number>(0);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Debug log
    console.log('DraftReviewModal props:', { isOpen, projectId: project?.id, revisionId: revision?.id, videoUrl: revision?.videoUrl, userRole });

    const handleDownloadClick = () => {
        if (userRole === 'client') {
            setFeedbackMode('quick');
            setShowFeedbackPopup(true);
        } else {
            // Managers/editors can download directly
            if (revision?.videoUrl) {
                const link = document.createElement('a');
                link.href = revision.videoUrl;
                link.download = `${project?.name}_draft_v${revision?.version}.mp4`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }
        }
    };

    const handleReviewClick = () => {
        if (userRole === 'client') {
            setFeedbackMode('detailed');
            setShowFeedbackPopup(true);
        } else {
            // Managers/editors can close and review via comments
            onClose();
        }
    };

    const handleSubmitFeedback = async () => {
        // For quick download, only require feedback (no rating)
        if (feedbackMode === 'quick') {
            if (!feedbackText.trim()) {
                toast.error("Please provide feedback before downloading.");
                return;
            }
        } else {
            // For detailed review, require both rating and feedback
            if (!feedbackText.trim() || rating === 0) {
                toast.error("Please provide feedback and a rating (1-5 stars) before downloading.");
                return;
            }
        }

        setIsSubmitting(true);
        try {
            // Save feedback to Firestore
            await addDoc(collection(db, 'feedback'), {
                projectId: project?.id,
                revisionId: revision?.id,
                clientId: user?.uid,
                clientName: user?.displayName || 'Anonymous',
                feedback: feedbackText,
                rating: feedbackMode === 'quick' ? 0 : rating,
                submittedAt: Date.now(),
                feedbackType: feedbackMode
            });

            toast.success("Thank you for your feedback!");
            
            // Trigger download
            if (revision?.videoUrl) {
                const link = document.createElement('a');
                link.href = revision.videoUrl;
                link.download = `${project?.name}_draft_v${revision?.version}.mp4`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }

            // Reset and close
            setShowFeedbackPopup(false);
            setFeedbackText("");
            setRating(0);
            setFeedbackMode('initial');
            setTimeout(() => onClose(), 500);
        } catch (error) {
            console.error('Error submitting feedback:', error);
            toast.error("Failed to submit feedback.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Review Draft Video"
            maxWidth="max-w-4xl"
        >
            {!revision || !project ? (
                <div className="mt-4 py-12 text-center">
                    <div className="inline-flex items-center gap-3 text-muted-foreground mb-4">
                        <div className="h-5 w-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                        <span className="text-sm">Loading draft video...</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-4">
                        {!revision ? 'No revision data' : ''} {!project ? 'No project data' : ''}
                    </p>
                </div>
            ) : (
                <div className="mt-4 space-y-5 max-h-[75vh] overflow-y-auto pr-2">
                    {/* Video Player */}
                    <div className="space-y-3">
                        <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest">Version {revision.version}</p>
                        <div className="relative rounded-xl overflow-hidden bg-black border border-border shadow-lg">
                            <video
                                src={revision.videoUrl}
                                controls
                                className="w-full max-h-[400px] object-contain"
                            />
                        </div>
                        {revision.description && (
                            <div className="p-4 rounded-lg bg-muted/30 border border-border">
                                <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest mb-2">Notes from Editor</p>
                                <p className="text-sm text-foreground">{revision.description}</p>
                            </div>
                        )}
                    </div>

                    {/* Action Buttons */}
                    {!showFeedbackPopup && (
                        <div className="flex gap-3">
                            {userRole === 'client' ? (
                                <>
                                    <button
                                        onClick={handleDownloadClick}
                                        className="flex-1 px-6 py-3 rounded-lg bg-primary text-primary-foreground text-sm font-bold uppercase tracking-widest hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 shadow-md"
                                    >
                                        <Download className="h-4 w-4" />
                                        Download
                                    </button>
                                    <button
                                        onClick={handleReviewClick}
                                        className="flex-1 px-6 py-3 rounded-lg bg-emerald-600 text-white text-sm font-bold uppercase tracking-widest hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2 shadow-md"
                                    >
                                        <MessageSquarePlus className="h-4 w-4" />
                                        Review & Feedback
                                    </button>
                                </>
                            ) : (
                                <button
                                    onClick={handleDownloadClick}
                                    className="w-full px-6 py-3 rounded-lg bg-primary text-primary-foreground text-sm font-bold uppercase tracking-widest hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 shadow-md"
                                >
                                    <Download className="h-4 w-4" />
                                    Download Draft
                                </button>
                            )}
                        </div>
                    )}

                    {/* Feedback Popup */}
                    <AnimatePresence>
                        {showFeedbackPopup && (
                            <motion.div
                                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                className="p-5 rounded-lg bg-blue-500/10 border border-blue-500/30 space-y-4"
                            >
                                <div>
                                    <p className="text-sm font-bold text-foreground">
                                        {feedbackMode === 'quick' ? 'Quick Feedback' : 'Detailed Review'}
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        {feedbackMode === 'quick' 
                                            ? 'Share your quick thoughts about this draft.' 
                                            : 'Please provide detailed feedback and rate this draft.'}
                                    </p>
                                </div>

                                {/* Rating Section - Only for Detailed Review */}
                                {feedbackMode === 'detailed' && (
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Rate the Draft</label>
                                        <div className="flex gap-2">
                                            {[1, 2, 3, 4, 5].map((star) => (
                                                <button
                                                    key={star}
                                                    onClick={() => setRating(star)}
                                                    className={cn(
                                                        "h-10 w-10 rounded-lg font-bold text-lg transition-all",
                                                        rating >= star
                                                            ? "bg-amber-500 text-white shadow-md"
                                                            : "bg-muted text-muted-foreground hover:bg-muted/80"
                                                    )}
                                                    title={`${star} star${star > 1 ? 's' : ''}`}
                                                >
                                                    ★
                                                </button>
                                            ))}
                                        </div>
                                        {rating > 0 && (
                                            <p className="text-xs text-amber-500 font-bold">{rating}/5 stars</p>
                                        )}
                                    </div>
                                )}

                                {/* Feedback Text Area */}
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Your Feedback</label>
                                    <Textarea
                                        placeholder={feedbackMode === 'quick'
                                            ? "What are your initial thoughts about this draft?..."
                                            : "Share your detailed feedback. What's working well? Any suggestions for improvement?..."}
                                        value={feedbackText}
                                        onChange={(e) => setFeedbackText(e.target.value)}
                                        maxLength={500}
                                        className="h-24 resize-none text-sm"
                                    />
                                    <p className="text-[10px] text-muted-foreground ml-auto">{feedbackText.length}/500</p>
                                </div>

                                {/* Action Buttons */}
                                <div className="flex gap-3 pt-2">
                                    <button
                                        onClick={() => {
                                            setShowFeedbackPopup(false);
                                            setFeedbackMode('initial');
                                            setFeedbackText("");
                                            setRating(0);
                                        }}
                                        disabled={isSubmitting}
                                        className="flex-1 px-4 py-2 rounded-lg border border-border bg-muted/30 text-foreground text-xs font-bold hover:bg-muted/50 transition-colors disabled:opacity-50"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleSubmitFeedback}
                                        disabled={isSubmitting || (feedbackMode === 'detailed' && !rating)}
                                        className="flex-1 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {isSubmitting ? "Submitting..." : `Submit & Download`}
                                    </button>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            )}
        </Modal>
    );
}
