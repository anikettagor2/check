'use server';

import { 
    notifyClientDraftSubmitted, 
    notifyClientProjectCompleted, 
    notifyClientNewComment,
    notifyEditorNewComment,
    notifyEditorFeedbackReceived,
    notifyPMNewComment,
    notifyPMProjectCompleted,
    sendWhatsAppNotification
} from "@/lib/whatsapp";
import { adminDb } from "@/lib/firebase/admin";
import { revalidatePath } from "next/cache";

const DEFAULT_SHORT_LINK_BASE_URL = "https://previewvideo.online";

function normalizeBaseUrl(url: string) {
    return url.replace(/\/+$/, "");
}

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
            status: 'review',
            updatedAt: Date.now()
        });

        // 3. Build shareable link for review
        const baseUrl = normalizeBaseUrl(
            process.env.SHORT_LINK_BASE_URL ||
            process.env.NEXT_PUBLIC_SHORT_LINK_BASE_URL ||
            process.env.NEXT_PUBLIC_APP_URL ||
            DEFAULT_SHORT_LINK_BASE_URL
        );
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
 * Editor notification is sent only on the FIRST comment (not for every comment).
 */
export async function handleNewComment(
    projectId: string, 
    commenterId: string, 
    commenterName: string, 
    commenterRole: string,
    commentText?: string,
    revisionId?: string
) {
    try {
        const projectSnap = await adminDb.collection('projects').doc(projectId).get();
        if (!projectSnap.exists) return { success: false, error: "Project not found" };
        const project = projectSnap.data();
        const baseUrl = normalizeBaseUrl(
            process.env.SHORT_LINK_BASE_URL ||
            process.env.NEXT_PUBLIC_SHORT_LINK_BASE_URL ||
            process.env.NEXT_PUBLIC_APP_URL ||
            DEFAULT_SHORT_LINK_BASE_URL
        );
        const safeRevisionId = revisionId || '';
        const reviewLink = safeRevisionId ? `${baseUrl}/r/${safeRevisionId}` : `${baseUrl}/dashboard/projects/${projectId}`;
        const commentSnippet = (commentText || '').trim();

        // Determine who to notify based on commenter role
        if (commenterRole === 'client') {
            // Client commented -> notify editor (FIRST TIME ONLY) and PM
            if (project?.assignedEditorId) {
                // Check if editor has already been notified about first comment
                const hasEditorBeenNotified = project?.editorFirstCommentNotified === true;
                
                if (!hasEditorBeenNotified) {
                    // Send notification only on first comment
                    const clientSnap = await adminDb.collection('users').doc(commenterId).get();
                    const clientName = clientSnap.exists ? clientSnap.data()?.displayName || 'Client' : 'Client';
                    const editorCommentResult = await notifyEditorNewComment(projectId, project.assignedEditorId, clientName, commentSnippet, reviewLink);
                    if (!editorCommentResult.success) {
                        console.error('[WhatsApp] Editor first-comment notification failed', {
                            projectId,
                            editorId: project.assignedEditorId,
                            error: editorCommentResult.error,
                        });
                    } else {
                        // Mark that editor has been notified about first comment
                        await adminDb.collection('projects').doc(projectId).update({
                            editorFirstCommentNotified: true
                        });
                    }
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
                const clientCommentResult = await notifyClientNewComment(projectId, commenterName, commentSnippet, reviewLink);
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
                const clientCommentResult = await notifyClientNewComment(projectId, commenterName, commentSnippet, reviewLink);
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
                const editorCommentResult = await notifyEditorNewComment(projectId, project.assignedEditorId, clientName, commentSnippet, reviewLink);
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

/**
 * Notify editor when assigned to a project
 */
export async function notifyEditorAssigned(projectId: string, editorId: string) {
    try {
        // Get project data
        const projectSnap = await adminDb.collection('projects').doc(projectId).get();
        if (!projectSnap.exists) return { success: false, error: "Project not found" };
        const project = projectSnap.data();
        if (!project) return { success: false, error: "Project data not found" };

        // Get editor data
        const editorSnap = await adminDb.collection('users').doc(editorId).get();
        if (!editorSnap.exists) return { success: false, error: "Editor not found" };
        const editor = editorSnap.data();
        if (!editor) return { success: false, error: "Editor data not found" };

        const phoneNumber = editor.whatsappNumber || editor.phoneNumber;
        if (!phoneNumber) return { success: false, error: "No phone number" };

        // Get project price (use totalCost, pricingTierPrice, or budget)
        const projectPrice = project.totalCost || project.pricingTierPrice || project.budget || 0;

        // Send WhatsApp notification with specific campaign and template
        const result = await sendWhatsAppNotification(
            phoneNumber,
            [
                editor.displayName || editor.name || "Editor",
                project.name || "Project", 
                projectPrice.toString()
            ],
            "editor_assigned",
            0,
            { templateName: "editor_assigned" }
        );

        if (!result.success) {
            console.error('[WhatsApp] Editor assignment notification failed', {
                projectId,
                editorId,
                error: result.error,
            });
        }

        return result;
    } catch (error: any) {
        console.error("Error notifying editor assignment:", error);
        return { success: false, error: error.message };
    }
}
