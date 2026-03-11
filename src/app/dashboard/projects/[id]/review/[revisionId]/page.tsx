"use client";

import { useEffect, useRef, useState, use } from "react";
import { VideoPlayer, VideoPlayerHandle } from "@/components/video-review/video-player";
import { CommentThread } from "@/components/video-review/comment-thread";
import { TimelineComments } from "@/components/video-review/timeline-comments";
import { GuestIdentityModal } from "@/components/video-review/guest-identity-modal";
import { Comment, Revision, UserRole } from "@/types/schema";
import { doc, collection, query, where, onSnapshot, setDoc, updateDoc, orderBy, arrayUnion } from "firebase/firestore";
import { db, storage } from "@/lib/firebase/config";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { Button } from "@/components/ui/button";
import { 
    ChevronLeft, 
    Share2, 
    Download, 
    MessageSquarePlus, 
    IndianRupee, 
    Loader2, 
    ShieldCheck,
    PanelRightClose,
    PanelRightOpen,
    Eye,
    Zap,
    Maximize2,
    Activity
} from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/lib/context/auth-context";
import { v4 as uuidv4 } from 'uuid';
import { cn } from "@/lib/utils";
import { Modal } from "@/components/ui/modal";
import { toast } from "sonner";
import { registerDownload, requestDownloadUnlock } from "@/app/actions/project-actions";
import { handleNewComment } from "@/app/actions/notification-actions";
import { motion, AnimatePresence } from "framer-motion";

export default function ReviewPage(props: { params: Promise<{ id: string; revisionId: string }> }) {
  const params = use(props.params); 
  const { user } = useAuth();
  const playerRef = useRef<VideoPlayerHandle>(null);
  
  // State
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Guest State
  const [guestInfo, setGuestInfo] = useState<{name: string, email: string} | null>(null);
  const [isGuestModalOpen, setIsGuestModalOpen] = useState(false);

  // Real Data State
  const [revision, setRevision] = useState<Revision | null>(null);
  const [project, setProject] = useState<any>(null); 
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUnlockModalOpen, setIsUnlockModalOpen] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);

  const waitingForGuest = useRef(false);

  useEffect(() => {
    if (!params.id || !params.revisionId) return;

    const unsubRev = onSnapshot(doc(db, "revisions", params.revisionId), (snap) => {
      if (snap.exists()) {
        setRevision({ id: snap.id, ...snap.data() } as Revision);
      }
    });

    const unsubProj = onSnapshot(doc(db, "projects", params.id), (snap) => {
      if (snap.exists()) {
        setProject({ id: snap.id, ...snap.data() });
      }
    });

    return () => {
      unsubRev();
      unsubProj();
    };
  }, [params.id, params.revisionId]);

  const handleDownloadAttempt = () => {
      const isClient = user?.role === 'client' || user?.uid === project?.ownerId;
      if (isClient && project?.paymentStatus !== 'full_paid') {
          setIsUnlockModalOpen(true);
      } else {
          if (revision?.videoUrl) {
              window.open(revision.videoUrl, '_blank');
          }
      }
  };

  const handleRequestUnlock = async () => {
      if (!params.id || !user?.uid) return;
      setIsRequesting(true);
      try {
          const res = await requestDownloadUnlock(params.id, user.uid);
          if (res.success) {
              toast.success("Request sent! We'll look into it.");
              setIsUnlockModalOpen(false);
          } else {
              toast.error(res.error || "Failed to send request");
          }
      } catch (err) {
          toast.error("An error occurred.");
      } finally {
          setIsRequesting(false);
      }
  };

  useEffect(() => {
    if (!params.revisionId) return;

    const q = query(
        collection(db, "comments"),
        where("revisionId", "==", params.revisionId),
        orderBy("timestamp", "asc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
        const fetchedComments: Comment[] = [];
        snapshot.forEach((doc) => {
            fetchedComments.push({ id: doc.id, ...doc.data() } as Comment);
        });
        setComments(fetchedComments);
        setLoading(false);
    });

    return () => unsubscribe();
  }, [params.revisionId]);

  const [isAddingComment, setIsAddingComment] = useState(false);
  const [draftTime, setDraftTime] = useState<number | null>(null);

  const handleShareReview = () => {
      if (typeof window === "undefined") return;
      const publicLink = `${window.location.origin}/review/${params.id}/${params.revisionId}`;
      navigator.clipboard.writeText(publicLink);
      toast.success("Link copied!");
  };

  const handleUploadFile = async (file: File): Promise<string> => {
      if (!user) {
          toast.error("Please log in to upload images.");
          throw new Error("Unauthorized");
      }
      const storageRef = ref(storage, `comments/${params.id}/${Date.now()}_${file.name}`);
      const uploadTask = uploadBytesResumable(storageRef, file);
      
      return new Promise((resolve, reject) => {
          uploadTask.on('state_changed', null, reject, async () => {
              const url = await getDownloadURL(uploadTask.snapshot.ref);
              resolve(url);
          });
      });
  };

  const handleTimeUpdate = (time: number) => setCurrentTime(time);
  const handleSeek = (time: number) => playerRef.current?.seekTo(time);

  const handleSelectComment = (comment: Comment) => {
     setActiveCommentId(comment.id);
     playerRef.current?.seekTo(comment.timestamp);
     playerRef.current?.pause();
  };

  const handleGuestIdentify = (name: string, email: string) => {
      setGuestInfo({ name, email });
      setIsGuestModalOpen(false);
      if (waitingForGuest.current) {
          setIsAddingComment(true);
          setDraftTime(currentTime);
          waitingForGuest.current = false;
      }
  };

  const handleAddCommentStart = () => {
      if (!user && !guestInfo) {
          playerRef.current?.pause();
          waitingForGuest.current = true;
          setIsGuestModalOpen(true);
          return;
      }
      playerRef.current?.pause();
      setDraftTime(currentTime);
      setIsAddingComment(true);
      setIsSidebarOpen(true);
  };

  const handleSaveComment = async (content: string, attachments?: string[]) => {
      if (!draftTime && draftTime !== 0) return;
      const newId = uuidv4(); 
      const userId = user?.uid || (guestInfo?.email ? `guest-${guestInfo.email}` : `guest-${Date.now()}`);
      const userName = user?.displayName || guestInfo?.name || "Guest";
      const userRole: UserRole = user?.role || 'guest';

      const newComment: Comment = {
          id: newId, 
          projectId: params.id,
          revisionId: params.revisionId,
          userId: userId,
          userName: userName,
          userRole: userRole,
          userAvatar: user?.photoURL || null,
          content: content, 
          timestamp: draftTime!,
          attachments: attachments || [],
          createdAt: Date.now(),
          status: "open",
          replies: []
      };

      setComments(prev => [...prev, newComment]);
      setIsAddingComment(false);
      setDraftTime(null);
      setActiveCommentId(newId);
      
      try {
          const { id, ...data } = newComment;
          await setDoc(doc(db, "comments", newId), data);
          
          // Send WhatsApp notifications (fire-and-forget)
          handleNewComment(params.id, userId, userName, userRole).catch(console.error);
      } catch (err) {
          setComments(prev => prev.filter(c => c.id !== newId));
          toast.error("Couldn't add your comment. Please try again.");
      }
  };

  const handleResolveComment = async (commentId: string) => {
      const targetComment = comments.find(c => c.id === commentId);
      if (!targetComment) return;
      const newStatus = targetComment.status === 'open' ? 'resolved' : 'open';
      setComments(prev => prev.map(c => c.id === commentId ? { ...c, status: newStatus } : c));
      try {
          await updateDoc(doc(db, "comments", commentId), { status: newStatus });
      } catch (err) {
          toast.error("Couldn't update the status.");
      }
  };

  const handleReply = async (commentId: string, content: string, attachments?: string[]) => {
      if (!user && !guestInfo) {
          setIsGuestModalOpen(true);
          return;
      }
      const userId = user?.uid || (guestInfo?.email ? `guest-${guestInfo.email}` : `guest-${Date.now()}`);
      const userName = user?.displayName || guestInfo?.name || "Guest";
      const userRole: UserRole = user?.role || 'guest';
      const newReply = { 
          id: uuidv4(), 
          userId, 
          userName, 
          userRole, 
          content, 
          attachments: attachments || [],
          createdAt: Date.now() 
      };

      setComments(prev => prev.map(c => c.id === commentId ? { ...c, replies: [...(c.replies || []), newReply] } : c));
      try {
          await updateDoc(doc(db, "comments", commentId), { replies: arrayUnion(newReply) });
      } catch (err) {
          toast.error("Failed to add reply.");
      }
  };

  const handleCancelComment = () => {
      setIsAddingComment(false);
      setDraftTime(null);
  };

  if(!revision && !loading) return <div className="text-foreground p-10 font-heading">We couldn't find this version.</div>;

  const isClientUser = user?.role === "client" || user?.uid === project?.ownerId;
  const isEditorUser = user?.role === "editor" || user?.uid === project?.assignedEditorId;
  const showPaymentLock = isClientUser && project?.paymentStatus !== "full_paid";
  const showDownloadButton = !isEditorUser; // Hide download for editors

  return (
    <div className="flex h-screen flex-col bg-background text-foreground overflow-hidden mesh-grid">
       {/* Header */}
       <header className="flex h-16 items-center justify-between border-b border-border px-6 bg-background/60 backdrop-blur-2xl z-20 shrink-0">
          <div className="flex items-center gap-6">
             <Link href={`/dashboard/projects/${params.id}`} className="group h-10 w-10 flex items-center justify-center rounded-xl bg-muted/50 border border-border hover:bg-muted/50 hover:border-border transition-all">
                <ChevronLeft className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
             </Link>
             <div className="h-6 w-px bg-muted/50" />
             <div>
                <div className="flex items-center gap-3">
                    <h1 className="font-heading font-bold text-sm tracking-tight text-foreground">{project?.name || "Loading..."}</h1>
                    <div className="px-2 py-0.5 rounded-md bg-primary/10 border border-primary/20">
                       <span className="text-[10px] font-bold text-primary uppercase tracking-wider">Version {revision?.version || '?'}</span>
                    </div>
                </div>
                <p className="text-[11px] text-muted-foreground font-bold uppercase tracking-widest mt-0.5">
                   Project File <span className="text-muted-foreground">/</span> Video Review
                </p>
             </div>
          </div>

          <div className="flex items-center gap-4">
              {/* Video Specs */}
              <div className="hidden lg:flex items-center gap-4 px-4 py-2 rounded-xl bg-muted/50 border border-border mr-4">
                  <div className="flex flex-col">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Quality</span>
                      <span className="text-[11px] font-bold text-muted-foreground">4K Resolution</span>
                  </div>
                  <div className="w-px h-6 bg-muted/50" />
                  <div className="flex flex-col">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Format</span>
                      <span className="text-[11px] font-bold text-muted-foreground">Horizontal</span>
                  </div>
              </div>

              {/* Download button - hidden for editors */}
              {showDownloadButton && (
              <button 
                onClick={async () => {
                   if (!showPaymentLock) {
                       try {
                           const res = await registerDownload(params.id, params.revisionId);
                           if (!res.success) {
                               toast.error(res.error || "Download limit reached");
                               return;
                           }
                           if (revision) setRevision({ ...revision, downloadCount: (revision.downloadCount || 0) + 1 });
                           if (res.downloadUrl) window.location.href = res.downloadUrl;
                           else if (revision?.videoUrl) window.open(revision.videoUrl, '_blank');
                       } catch (e) {
                           toast.error("Download failed.");
                       }
                   } else {
                       handleDownloadAttempt();
                   }
                }}
                disabled={!showPaymentLock && (revision?.downloadCount || 0) >= 3}
                className={cn(
                    "h-10 px-6 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-3 active:scale-95 border",
                    !showPaymentLock 
                        ? "bg-muted/50 border-border text-muted-foreground hover:text-foreground hover:bg-muted/50" 
                        : "bg-emerald-500/10 border-emerald-500/20 text-emerald-500 hover:bg-emerald-500/20 shadow-[0_0_20px_rgba(16,185,129,0.1)]"
                )}
              >
                 {!showPaymentLock ? <Download className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                 {!showPaymentLock 
                    ? ((revision?.downloadCount || 0) >= 3 ? "Max Reached" : `Download (${3 - (revision?.downloadCount || 0)} left)`)
                    : "Get Video File"}
              </button>
              )}

              <button 
                onClick={handleShareReview}
                className="h-10 px-6 rounded-xl bg-primary  text-primary-foreground text-[10px] font-black uppercase tracking-widest hover:bg-zinc-200 transition-all active:scale-95 shadow-md shadow-primary/10 flex items-center gap-3"
              >
                 <Share2 className="h-3.5 w-3.5 stroke-[2.5px]" />
                 Share Link
              </button>
          </div>
       </header>

       <div className="flex flex-1 overflow-hidden relative">
          {/* Video Player */}
          <main className="relative flex-1 flex flex-col items-center justify-center p-8 lg:p-12 transition-all duration-700">
             
             {/* Dynamic Glow Background */}
             <div className="absolute inset-0 pointer-events-none opacity-20">
                 <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80%] h-[80%] bg-primary/10 blur-[150px] rounded-full" />
             </div>

             <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="relative w-full max-w-[1200px] aspect-video glass-panel border-border rounded-[2rem] shadow-[0_40px_100px_rgba(0,0,0,0.6)] overflow-hidden"
             >
                {revision && (
                    <VideoPlayer 
                        ref={playerRef}
                        src={revision.videoUrl} 
                        onTimeUpdate={handleTimeUpdate}
                        onDurationChange={setDuration}
                    />
                )}
                
                {/* Timeline */}
                <div className="absolute bottom-10 left-10 right-10">
                    <TimelineComments 
                        duration={duration} 
                        comments={comments} 
                        onSeek={handleSeek}
                        hoverTime={hoverTime}
                    />
                </div>
             </motion.div>

             {/* Feedback Controls */}
             <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="mt-14 flex items-center gap-6"
             >
                 <button 
                    onClick={handleAddCommentStart} 
                    className="group h-14 px-10 rounded-2xl bg-muted/50 border border-border hover:bg-muted/50 hover:border-primary/40 text-foreground transition-all active:scale-95 flex items-center gap-4 relative overflow-hidden"
                 >
                    <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <MessageSquarePlus className="h-5 w-5 text-primary" />
                    <span className="text-[11px] font-black uppercase tracking-[0.2em]">
                        {isAddingComment ? "Drafting..." : `Leave a comment at ${Math.floor(currentTime)}s`}
                    </span>
                 </button>

                 <div className="h-10 w-px bg-muted/50" />

                 <div className="flex items-center gap-3">
                    <button className="h-12 w-12 rounded-xl bg-muted/50 border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-all">
                        <Maximize2 className="h-4 w-4" />
                    </button>
                    <button 
                        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                        className={cn(
                            "h-12 w-12 rounded-xl flex items-center justify-center transition-all border",
                            isSidebarOpen ? "bg-primary text-foreground border-primary/20" : "bg-muted/50 border-border text-muted-foreground hover:text-foreground"
                        )}
                    >
                        {isSidebarOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
                    </button>
                 </div>
             </motion.div>

             {/* System Status Indicators */}
             <div className="absolute bottom-8 left-12 flex items-center gap-6 pointer-events-none">
                <div className="flex items-center gap-2.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse shadow-[0_0_10px_rgba(var(--primary),0.8)]" />
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Auto-saving Feedback</span>
                </div>
                <div className="flex items-center gap-2.5">
                    <Activity className="h-3 w-3 text-emerald-500" />
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Active</span>
                </div>
             </div>
          </main>

          {/* 3. Threaded Communication Sidebar */}
          <AnimatePresence>
              {isSidebarOpen && (
                <motion.aside 
                    initial={{ x: 400, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: 400, opacity: 0 }}
                    transition={{ type: "spring", damping: 25, stiffness: 200 }}
                    className="w-[450px] border-l border-border bg-background/40 backdrop-blur-3xl flex flex-col relative z-10 shadow-2xl"
                >
                    <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none">
                        <Zap className="h-40 w-40 text-primary blur-3xl" />
                    </div>
                    
                    <CommentThread 
                        comments={comments}
                        activeCommentId={activeCommentId}
                        isAddingComment={isAddingComment}
                        draftTime={draftTime}
                        onSelectComment={handleSelectComment}
                        onResolveComment={handleResolveComment}
                        onReply={handleReply}
                        onSaveComment={handleSaveComment}
                        onCancelComment={handleCancelComment}
                        onUploadFile={handleUploadFile}
                    />
                </motion.aside>
              )}
          </AnimatePresence>
       </div>
       
       <GuestIdentityModal 
            isOpen={isGuestModalOpen}
            onIdentify={handleGuestIdentify}
            onClose={() => setIsGuestModalOpen(false)}
       />

       {/* Authorize Download Modal */}
       <Modal
           isOpen={isUnlockModalOpen}
           onClose={() => setIsUnlockModalOpen(false)}
           title="Get Download Access"
       >
            <div className="space-y-10">
                <div className="p-8 glass-panel border-border rounded-[2rem] space-y-6">
                   <div className="flex items-center justify-between border-b border-border pb-4">
                       <span className="text-muted-foreground font-black uppercase tracking-widest text-[9px]">Project</span>
                       <span className="text-foreground font-bold font-heading text-sm">{project?.name}</span>
                   </div>
                   <div className="flex justify-between items-center">
                       <span className="text-muted-foreground font-black uppercase tracking-widest text-[9px]">Remaining Balance</span>
                       <span className="text-primary font-heading font-black text-2xl tracking-tighter">₹{((project?.totalCost || 0) - (project?.amountPaid || 0)).toLocaleString()}</span>
                   </div>
                </div>

                <div className="grid gap-4">
                    <button 
                        onClick={handleRequestUnlock}
                        disabled={isRequesting || project?.downloadUnlockRequested}
                        className={cn(
                            "w-full group relative flex flex-col items-start p-6 rounded-[1.5rem] border transition-all text-left",
                            project?.downloadUnlockRequested 
                                ? "bg-muted/50 border-border cursor-not-allowed opacity-50" 
                                : "bg-muted/50 border-border hover:border-primary/40 hover:bg-primary/[0.02]"
                        )}
                    >
                        <div className="flex items-center gap-4 mb-2">
                            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform border border-primary/20">
                                {isRequesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-5 w-5" />}
                            </div>
                            <span className="font-heading font-black text-foreground text-base tracking-tight">
                                {project?.downloadUnlockRequested ? "Request Sent" : "Request Permission"}
                            </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground ml-14 font-medium leading-relaxed">Ask an admin to unlock the download for this project.</p>
                        
                        {project?.downloadUnlockRequested && (
                            <div className="absolute top-6 right-6 text-[9px] bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded-lg font-black tracking-widest border border-emerald-500/20 uppercase">
                                Sent...
                            </div>
                        )}
                    </button>

                    <div className="relative group grayscale cursor-not-allowed opacity-30">
                        <div className="flex flex-col items-start p-6 rounded-[1.5rem] border border-border bg-muted/50">
                            <div className="flex items-center gap-4 mb-2">
                                <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center text-muted-foreground">
                                    <IndianRupee className="h-5 w-5" />
                                </div>
                                <span className="font-heading font-black text-muted-foreground text-base tracking-tight">Complete Payment</span>
                            </div>
                            <p className="text-[11px] text-muted-foreground ml-14 font-medium italic">Instant unlock with payment (Coming soon)</p>
                        </div>
                    </div>
                </div>

                <p className="text-center text-[10px] text-muted-foreground font-black uppercase tracking-[0.2em] leading-relaxed px-10">
                    Once unlocked, you'll be able to download the high-quality final version.
                </p>
            </div>
       </Modal>
    </div>
  );
}
