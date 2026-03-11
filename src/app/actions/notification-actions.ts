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
        // 1. Update project status to 'in_review'
        await adminDb.collection('projects').doc(projectId).update({
            status: 'in_review',
            updatedAt: Date.now()
        });

        // 2. Notify client about new draft
        notifyClientDraftSubmitted(projectId);

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
        notifyClientProjectCompleted(projectId);
        
        // Notify PM if assigned
        if (project?.assignedPMId) {
            const clientSnap = await adminDb.collection('users').doc(project.clientId).get();
            const clientName = clientSnap.exists ? clientSnap.data()?.displayName || 'Client' : 'Client';
            notifyPMProjectCompleted(projectId, project.assignedPMId, clientName);
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
                notifyEditorNewComment(projectId, project.assignedEditorId, clientName);
            }
            if (project?.assignedPMId) {
                notifyPMNewComment(projectId, project.assignedPMId, commenterName, 'Client');
            }
        } else if (commenterRole === 'editor' || commenterRole === 'video_editor') {
            // Editor commented -> notify client and PM
            if (project?.clientId) {
                notifyClientNewComment(projectId, commenterName);
            }
            if (project?.assignedPMId) {
                notifyPMNewComment(projectId, project.assignedPMId, commenterName, 'Editor');
            }
        } else if (commenterRole === 'project_manager') {
            // PM commented -> notify client and editor
            if (project?.clientId) {
                notifyClientNewComment(projectId, commenterName);
            }
            if (project?.assignedEditorId) {
                const clientSnap = project.clientId ? await adminDb.collection('users').doc(project.clientId).get() : null;
                const clientName = clientSnap?.exists ? clientSnap.data()?.displayName || 'Client' : 'Client';
                notifyEditorNewComment(projectId, project.assignedEditorId, clientName);
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
            notifyEditorFeedbackReceived(projectId, project.assignedEditorId, rating);
        }

        return { success: true };
    } catch (error: any) {
        console.error("Error handling editor rating notification:", error);
        return { success: false, error: error.message };
    }
}
