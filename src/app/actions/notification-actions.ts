'use server';

import { 
    notifyClientDraftSubmitted, 
    notifyClientProjectCompleted, 
    notifyClientNewComment,
    notifyEditorNewComment,
    notifyEditorFeedbackReceived,
    notifyPMNewComment,
    notifyPMProjectCompleted
} from "@/lib/whatsapp";
import { adminDb } from "@/lib/firebase/admin";
import { revalidatePath } from "next/cache";

/**
 * Triggered by the client-side upload page once a revision is successfully saved.
 * Also updates project status to 'in_review'.
 */
export async function handleRevisionUploaded(projectId: string) {
    try {
        // 1. Get the latest revision to get version number and ID
        const revisionsQuery = adminDb
            .collection('revisions')
            .where('projectId', '==', projectId)
            .orderBy('version', 'desc')
            .limit(1);
        
        const revisionsSnap = await revisionsQuery.get();
        let versionNumber = 1;
        let revisionId = '';
        
        if (!revisionsSnap.empty) {
            const latestRevision = revisionsSnap.docs[0];
            versionNumber = latestRevision.data().version;
            revisionId = latestRevision.id;
        }

        // 2. Update project status to 'in_review'
        await adminDb.collection('projects').doc(projectId).update({
            status: 'in_review',
            updatedAt: Date.now()
        });

        // 3. Build shareable link for review
        const baseUrl = process.env.SHORT_LINK_BASE_URL || process.env.NEXT_PUBLIC_SHORT_LINK_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://editohub.io';
        const reviewLink = `${baseUrl}/r/${revisionId}`;

        // 4. Notify client about new draft with version number and link
        const draftNotifyResult = await notifyClientDraftSubmitted(projectId, versionNumber, reviewLink);
        if (!draftNotifyResult.success) {
            console.error('[WhatsApp] Draft submitted notification failed', {
                projectId,
                error: draftNotifyResult.error,
            });
        }

        revalidatePath(`/dashboard/projects/${projectId}`);
        return { success: true };
    } catch (error: any) {
        console.error("Error handling revision upload notification:", error);
        return { success: false, error: error.message };
    }
}

/**
 * Triggered when client downloads the final file (project complete).
 */
export async function handleProjectCompleted(projectId: string) {
    try {
        const projectSnap = await adminDb.collection('projects').doc(projectId).get();
        if (!projectSnap.exists) return { success: false, error: "Project not found" };
        const project = projectSnap.data();

        // Notify client
        const clientCompletedResult = await notifyClientProjectCompleted(projectId);
        if (!clientCompletedResult.success) {
            console.error('[WhatsApp] Client project-completed notification failed', {
                projectId,
                error: clientCompletedResult.error,
            });
        }
        
        // Notify PM if assigned
        if (project?.assignedPMId) {
            const clientSnap = await adminDb.collection('users').doc(project.clientId).get();
            const clientName = clientSnap.exists ? clientSnap.data()?.displayName || 'Client' : 'Client';
            const pmCompletedResult = await notifyPMProjectCompleted(projectId, project.assignedPMId, clientName);
            if (!pmCompletedResult.success) {
                console.error('[WhatsApp] PM project-completed notification failed', {
                    projectId,
                    pmId: project.assignedPMId,
                    error: pmCompletedResult.error,
                });
            }
        }

        return { success: true };
    } catch (error: any) {
        console.error("Error handling project completion notification:", error);
        return { success: false, error: error.message };
    }
}

/**
 * Triggered when a new comment is added to the review tool.
 */
export async function handleNewComment(
    projectId: string, 
    commenterId: string, 
    commenterName: string, 
    commenterRole: string
) {
    try {
        const projectSnap = await adminDb.collection('projects').doc(projectId).get();
        if (!projectSnap.exists) return { success: false, error: "Project not found" };
        const project = projectSnap.data();

        // Determine who to notify based on commenter role
        if (commenterRole === 'client') {
            // Client commented -> notify editor and PM
            if (project?.assignedEditorId) {
                const clientSnap = await adminDb.collection('users').doc(commenterId).get();
                const clientName = clientSnap.exists ? clientSnap.data()?.displayName || 'Client' : 'Client';
                const editorCommentResult = await notifyEditorNewComment(projectId, project.assignedEditorId, clientName);
                if (!editorCommentResult.success) {
                    console.error('[WhatsApp] Editor new-comment notification failed', {
                        projectId,
                        editorId: project.assignedEditorId,
                        error: editorCommentResult.error,
                    });
                }
            }
            if (project?.assignedPMId) {
                const pmCommentResult = await notifyPMNewComment(projectId, project.assignedPMId, commenterName, 'Client');
                if (!pmCommentResult.success) {
                    console.error('[WhatsApp] PM client-comment notification failed', {
                        projectId,
                        pmId: project.assignedPMId,
                        error: pmCommentResult.error,
                    });
                }
            }
        } else if (commenterRole === 'editor' || commenterRole === 'video_editor') {
            // Editor commented -> notify client and PM
            if (project?.clientId) {
                const clientCommentResult = await notifyClientNewComment(projectId, commenterName);
                if (!clientCommentResult.success) {
                    console.error('[WhatsApp] Client editor-comment notification failed', {
                        projectId,
                        error: clientCommentResult.error,
                    });
                }
            }
            if (project?.assignedPMId) {
                const pmCommentResult = await notifyPMNewComment(projectId, project.assignedPMId, commenterName, 'Editor');
                if (!pmCommentResult.success) {
                    console.error('[WhatsApp] PM editor-comment notification failed', {
                        projectId,
                        pmId: project.assignedPMId,
                        error: pmCommentResult.error,
                    });
                }
            }
        } else if (commenterRole === 'project_manager') {
            // PM commented -> notify client and editor
            if (project?.clientId) {
                const clientCommentResult = await notifyClientNewComment(projectId, commenterName);
                if (!clientCommentResult.success) {
                    console.error('[WhatsApp] Client PM-comment notification failed', {
                        projectId,
                        error: clientCommentResult.error,
                    });
                }
            }
            if (project?.assignedEditorId) {
                const clientSnap = project.clientId ? await adminDb.collection('users').doc(project.clientId).get() : null;
                const clientName = clientSnap?.exists ? clientSnap.data()?.displayName || 'Client' : 'Client';
                const editorCommentResult = await notifyEditorNewComment(projectId, project.assignedEditorId, clientName);
                if (!editorCommentResult.success) {
                    console.error('[WhatsApp] Editor PM-comment notification failed', {
                        projectId,
                        editorId: project.assignedEditorId,
                        error: editorCommentResult.error,
                    });
                }
            }
        }

        return { success: true };
    } catch (error: any) {
        console.error("Error handling new comment notification:", error);
        return { success: false, error: error.message };
    }
}

/**
 * Triggered when client submits editor rating/feedback.
 */
export async function handleEditorRatingSubmitted(projectId: string, rating: number) {
    try {
        const projectSnap = await adminDb.collection('projects').doc(projectId).get();
        if (!projectSnap.exists) return { success: false, error: "Project not found" };
        const project = projectSnap.data();

        // Notify editor about the feedback
        if (project?.assignedEditorId && rating > 0) {
            const editorRatingResult = await notifyEditorFeedbackReceived(projectId, project.assignedEditorId, rating);
            if (!editorRatingResult.success) {
                console.error('[WhatsApp] Editor feedback notification failed', {
                    projectId,
                    editorId: project.assignedEditorId,
                    error: editorRatingResult.error,
                });
            }
        }

        return { success: true };
    } catch (error: any) {
        console.error("Error handling editor rating notification:", error);
        return { success: false, error: error.message };
    }
}
