'use server';

import { adminDb, adminStorage } from "@/lib/firebase/admin";
import { Project, Revision } from "@/types/schema";
import { revalidatePath } from "next/cache";
import { FieldValue } from "firebase-admin/firestore";

/**
 * Registers a download attempt for a revision, enforcing a download limit.
 */
export async function registerDownload(projectId: string, revisionId: string) {
    console.log(`[registerDownload] Initiating for Project: ${projectId}, Revision: ${revisionId}`);
    try {
        const docRef = adminDb.collection('revisions').doc(revisionId);
        const snap = await docRef.get();

        if (!snap.exists) {
            console.error(`[registerDownload] Revision not found: ${revisionId}`);
            return { success: false, error: "Revision not found" };
        }

        const data = snap.data() as Revision;
        const currentCount = data.downloadCount || 0;
        const DOWNLOAD_LIMIT = 10; // Increased from 3

        console.log(`[registerDownload] Current count: ${currentCount}/${DOWNLOAD_LIMIT}`);

        // If limit reached, mark as archived and return error
        if (currentCount >= DOWNLOAD_LIMIT) {
            console.warn(`[registerDownload] Limit reached for revision: ${revisionId}`);
            if (data.status !== 'archived') {
                await docRef.update({
                    status: 'archived',
                    description: (data.description || "") + " [Download Limit Reached]"
                });
            }
            return { success: false, error: "Download limit reached for this revision." };
        }

        // Increment count
        await docRef.update({
            downloadCount: currentCount + 1
        });

        // Return a signed URL with force-download headers
        let downloadUrl = data.videoUrl || "";

        try {
            if (downloadUrl.includes('firebasestorage.googleapis.com')) {
                // Extract path from Firebase Storage URL
                const pathParts = downloadUrl.split('/o/');
                if (pathParts.length > 1) {
                    const encodedPath = pathParts[1].split('?')[0];
                    const fullPath = decodeURIComponent(encodedPath);

                    const bucket = adminStorage.bucket();
                    const file = bucket.file(fullPath);

                    // Fetch project name for the filename
                    const projectSnap = await adminDb.collection('projects').doc(projectId).get();
                    const projectData = projectSnap.exists ? (projectSnap.data() as Project) : null;
                    const projectName = projectData?.name || "Video";
                    const safeName = projectName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
                    const filename = `${safeName}_v${data.version || '1'}.mp4`;

                    // Generate signed URL that expires in 1 hour and forces download
                    const signedUrlResponse = await file.getSignedUrl({
                        version: 'v4',
                        action: 'read',
                        expires: Date.now() + 60 * 60 * 1000, // 1 hour
                        promptSaveAs: filename,
                        responseDisposition: `attachment; filename="${filename}"`
                    });

                    if (Array.isArray(signedUrlResponse) && signedUrlResponse.length > 0) {
                        downloadUrl = signedUrlResponse[0];
                    }
                }
            }
        } catch (err: any) {
            console.error("[registerDownload] Signed URL generation failed:", err);
            // Fallback to original URL is handled by the check below
        }

        if (!downloadUrl) {
            console.error(`[registerDownload] No download URL available for revision: ${revisionId}`);
            return { success: false, error: "No video file found for this revision." };
        }

        revalidatePath(`/dashboard/projects/${projectId}`);
        return { success: true, count: currentCount + 1, remaining: DOWNLOAD_LIMIT - (currentCount + 1), downloadUrl };

    } catch (error: any) {
        console.error("[registerDownload] Fatal error:", error);
        return { success: false, error: error.message };
    }
}


import { notifyClientOfStatusUpdate } from "@/lib/whatsapp";

/**
 * Marks a project as paid/deferred based on user's Pay Later status.
 * This function bypasses payment processors.
 */
/**
 * Unlocks project downloads manually (Admin/PM override).
 */
export async function unlockProjectDownloads(projectId: string, userId: string) {
    try {
        // Verify user has permission
        const userDoc = await adminDb.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            return { success: false, error: "User not found" };
        }

        const userData = userDoc.data();
        const allowedRoles = ['admin', 'project_manager'];

        if (!allowedRoles.includes(userData?.role)) {
            return { success: false, error: "Unauthorized: Only Admins or Project Managers can unlock downloads." };
        }

        await adminDb.collection('projects').doc(projectId).update({
            status: 'completed',
            downloadsUnlocked: true,
            downloadUnlockRequested: false,
            notes: FieldValue.arrayUnion(`Downloads unlocked by ${userData?.email} (${userData?.role}) at ${new Date().toISOString()}`)
        });

        // Notify client that project is completed/ready for download
        await notifyClientOfStatusUpdate(projectId, 'completed');

        revalidatePath(`/dashboard/projects/${projectId}`);
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/**
 * Called by a Pay Later client to request download unlock from their PM.
 * Sets downloadUnlockRequested = true on the project document.
 */
export async function requestDownloadUnlock(projectId: string, userId: string) {
    try {
        const userDoc = await adminDb.collection('users').doc(userId).get();
        if (!userDoc.exists) return { success: false, error: "User not found" };

        const project = await adminDb.collection('projects').doc(projectId).get();
        if (!project.exists) return { success: false, error: "Project not found" };

        const projectData = project.data();

        // Allow any user who is the client, owner, or a member of the project
        const isProjectMember =
            projectData?.clientId === userId ||
            projectData?.ownerId === userId ||
            (Array.isArray(projectData?.members) && projectData.members.includes(userId));

        if (!isProjectMember) {
            return { success: false, error: "Unauthorized: You are not a member of this project." };
        }

        await adminDb.collection('projects').doc(projectId).update({
            downloadUnlockRequested: true,
            updatedAt: Date.now()
        });

        revalidatePath(`/dashboard/projects/${projectId}`);
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function submitEditorRating(projectId: string, rating: number, review: string) {
    try {
        await adminDb.collection('projects').doc(projectId).update({
            editorRating: rating,
            editorReview: review,
            updatedAt: Date.now()
        });
        revalidatePath(`/dashboard/projects/${projectId}`);
        return { success: true };
    } catch (e: any) {
        console.error("Failed to submit rating", e);
        return { success: false, error: e.message };
    }
}
