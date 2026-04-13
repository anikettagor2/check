'use server';

import { adminDb, adminStorage } from "@/lib/firebase/admin";
import { Project, Revision } from "@/types/schema";
import { revalidatePath } from "next/cache";
import { FieldValue } from "firebase-admin/firestore";

const DOWNLOAD_LIMIT = 10;
const ASSET_PURGE_DELAY_MS = 24 * 60 * 60 * 1000;

/**
 * ⚠️ CRITICAL BUSINESS RULE ⚠️
 * 
 * PROJECT COMPLETION IS TIED TO CLIENT DOWNLOADS ONLY
 * 
 * A project is marked as "completed" ONLY when:
 * 1. The client successfully downloads the final video (registerDownload function)
 * 2. The clientHasDownloaded flag is set to true
 * 
 * NO OTHER FUNCTION should manually set status to "completed"
 * - Editors CANNOT mark projects as complete
 * - Project Managers CANNOT mark projects as complete  
 * - Only client downloads trigger the "completed" status
 * 
 * @see registerDownload() - The ONLY function that should set status to 'completed'
 */

function extractStoragePathFromUrl(url?: string): string | null {
    if (!url) return null;

    if (url.startsWith("gs://")) {
        const noScheme = url.replace("gs://", "");
        const slashIdx = noScheme.indexOf("/");
        return slashIdx >= 0 ? noScheme.slice(slashIdx + 1) : null;
    }

    if (url.includes("/o/")) {
        const encoded = url.split("/o/")[1]?.split("?")[0];
        return encoded ? decodeURIComponent(encoded) : null;
    }

    return null;
}

async function deleteStorageFileByUrl(url?: string): Promise<void> {
    const path = extractStoragePathFromUrl(url);
    if (!path) return;

    try {
        await adminStorage.bucket().file(path).delete({ ignoreNotFound: true });
    } catch {
        // Ignore storage deletion failures to keep lifecycle job resilient.
    }
}

async function purgeProjectAssets(projectId: string, projectData: any): Promise<void> {
    const rawUrls = (projectData.rawFiles || []).map((f: any) => f?.url).filter(Boolean);
    const referenceUrls = (projectData.referenceFiles || []).map((f: any) => f?.url).filter(Boolean);
    const scriptUrls = (projectData.scripts || []).map((f: any) => f?.url).filter(Boolean);
    const footageUrl = projectData.footageLink;

    const allUrls = [...rawUrls, ...referenceUrls, ...scriptUrls, footageUrl].filter(Boolean);
    await Promise.all(allUrls.map((u) => deleteStorageFileByUrl(u)));

    await adminDb.collection("projects").doc(projectId).update({
        rawFiles: [],
        referenceFiles: [],
        scripts: [],
        assetsPurgedAt: Date.now(),
        updatedAt: Date.now(),
    });
}

async function purgeProjectRevisionVideos(projectId: string): Promise<void> {
    const revisionsSnap = await adminDb
        .collection("revisions")
        .where("projectId", "==", projectId)
        .get();

    const now = Date.now();
    const batch = adminDb.batch();

    for (const revisionDoc of revisionsSnap.docs) {
        const revision = revisionDoc.data() as Revision;
        if (revision.videoUrl) {
            await deleteStorageFileByUrl(revision.videoUrl);
        }

        batch.update(revisionDoc.ref, {
            videoUrl: "",
            videoDeletedAt: now,
            status: "archived",
            description: `${revision.description || ""} [Auto Purged After Download Limit]`.trim(),
            updatedAt: now,
        });
    }

    await batch.commit();
    await adminDb.collection("projects").doc(projectId).update({
        finalVideoPurged: true,
        finalVideoPurgedAt: now,
        updatedAt: now,
    });
}

/**
 * Registers a download attempt for a revision, enforcing a download limit.
 *
 * IMPORTANT: Always uses the original high-quality videoUrl for downloads.
 * The optimizedUrl (360p MP4) is only for display in review systems.
 * This ensures clients always download the highest quality version available.
 */
export async function registerDownload(projectId: string, revisionId: string) {
    console.log(`[registerDownload] Initiating for Project: ${projectId}, Revision: ${revisionId}`);
    try {
        const docRef = adminDb.collection('revisions').doc(revisionId);
        const snap = await docRef.get();
        const projectRef = adminDb.collection('projects').doc(projectId);
        const projectSnap = await projectRef.get();

        if (!snap.exists) {
            console.error(`[registerDownload] Revision not found: ${revisionId}`);
            return { success: false, error: "Revision not found" };
        }

        if (!projectSnap.exists) {
            console.error(`[registerDownload] Project not found: ${projectId}`);
            return { success: false, error: "Project not found" };
        }

        const data = snap.data() as Revision;
        const projectData = projectSnap.data() as Project;
        const currentCount = data.downloadCount || 0;

        // Fetch dynamic download limit from system settings
        const settingsSnap = await adminDb.collection('settings').doc('system').get();
        const settings = settingsSnap.data();
        const limit = settings?.downloadLimit ?? DOWNLOAD_LIMIT;

        console.log(`[registerDownload] Current count: ${currentCount}/${limit}`);

        // If limit reached, ensure final videos are purged and block further downloads.
        if (currentCount >= limit) {
            console.warn(`[registerDownload] Limit reached for revision: ${revisionId}`);
            if (!projectData.finalVideoPurged) {
                await purgeProjectRevisionVideos(projectId);
            }
            return { success: false, error: "Download limit reached for this revision." };
        }

        const now = Date.now();
        const nextCount = currentCount + 1;

        // Increment per-revision count.
        await docRef.update({
            downloadCount: nextCount
        });

        const projectUpdate: any = {
            clientHasDownloaded: true,
            downloadedAt: now,
            finalDownloadCount: nextCount,
            status: projectData.paymentStatus === 'full_paid' ? 'completed' : 'completed_pending_payment',
            updatedAt: now,
        };

        // First successful client download starts retention timer for project assets.
        if (!projectData.downloadRetentionStartedAt) {
            projectUpdate.downloadRetentionStartedAt = now;
            projectUpdate.assetsCleanupAfter = now + ASSET_PURGE_DELAY_MS;
        }

        await projectRef.update(projectUpdate);

        // If assets cleanup timer has elapsed and not purged yet, purge assets now.
        const cleanupDue = (projectData.assetsCleanupAfter || 0) <= now;
        if (cleanupDue && !projectData.assetsPurgedAt) {
            await purgeProjectAssets(projectId, projectData);
        }

        // Return a signed URL with force-download headers
        let downloadUrl = data.videoUrl || "";

        try {
            if (downloadUrl && downloadUrl.includes('firebasestorage.googleapis.com')) {
                // Extract path from Firebase Storage URL
                const pathParts = downloadUrl.split('/o/');
                if (pathParts.length > 1) {
                    const encodedPath = pathParts[1].split('?')[0];
                    const fullPath = decodeURIComponent(encodedPath);

                    const bucket = adminStorage.bucket();
                    const file = bucket.file(fullPath);

                    // Fetch project name for the filename
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

        // On final allowed download, purge all revision videos to keep only metadata/history.
        if (nextCount >= limit && !projectData.finalVideoPurged) {
            await purgeProjectRevisionVideos(projectId);
        }

        revalidatePath(`/dashboard/projects/${projectId}`);
        return { success: true, count: nextCount, remaining: Math.max(0, limit - nextCount), downloadUrl };

    } catch (error: any) {
        console.error("[registerDownload] Fatal error:", error);
        return { success: false, error: error.message };
    }
}


import { notifyClientProjectCompleted } from "@/lib/whatsapp";

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
        const completionNotifyResult = await notifyClientProjectCompleted(projectId);
        if (!completionNotifyResult.success) {
            console.error('[WhatsApp] Client completion notification failed', {
                projectId,
                error: completionNotifyResult.error,
            });
        }

        const { addProjectLog } = await import("./admin-actions");
        await addProjectLog(projectId, 'COMPLETED', { uid: userId, displayName: userData?.displayName || 'PM/Admin' }, 'Downloads unlocked. Project successfully marked as completed.');

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

export async function getSignedDownloadUrl(downloadUrl: string, fileName?: string) {
    try {
        if (!downloadUrl) return { success: false, error: "No URL provided" };
        if (!downloadUrl.includes('firebasestorage.googleapis.com')) {
           return { success: true, url: downloadUrl };
        }

        const pathParts = downloadUrl.split('/o/');
        if (pathParts.length > 1) {
            const encodedPath = pathParts[1].split('?')[0];
            const fullPath = decodeURIComponent(encodedPath);

            const bucket = adminStorage.bucket();
            const file = bucket.file(fullPath);
            const safeFileName = fileName ? fileName.replace(/[^a-zA-Z0-9.\-_]/g, '_') : 'download';

            const signedUrlResponse = await file.getSignedUrl({
                version: 'v4',
                action: 'read',
                expires: Date.now() + 60 * 60 * 1000, // 1 hour
                promptSaveAs: safeFileName,
                responseDisposition: `attachment; filename="${safeFileName}"`
            });

            if (Array.isArray(signedUrlResponse) && signedUrlResponse.length > 0) {
                return { success: true, url: signedUrlResponse[0] };
            }
        }
        return { success: false, error: "Failed to generate signed URL from path" };
    } catch (err: any) {
        console.error("Failed to generate signed URL:", err);
        return { success: false, error: err.message };
    }
}
