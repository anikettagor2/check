
import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";

admin.initializeApp();

// Point fluent-ffmpeg at the bundled binary
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const AISENSY_URL = "https://backend.aisensy.com/campaign/t1/api/v2";

function sanitizeFileName(fileName: string): string {
    return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
}

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

    async function deleteStorageObjectByUrl(url?: string): Promise<void> {
        const path = extractStoragePathFromUrl(url);
        if (!path) return;

        try {
            await admin.storage().bucket().file(path).delete({ ignoreNotFound: true });
        } catch {
            // Ignore object-level failures to keep cleanup resilient.
        }
    }

async function composeManyParts(params: {
    bucket: any;
    sourcePaths: string[];
    destinationPath: string;
    tempPrefix: string;
}): Promise<void> {
    const { bucket, sourcePaths, destinationPath, tempPrefix } = params;

    // GCS compose accepts max 32 source objects per request.
    let currentPaths = [...sourcePaths];
    const tempPaths: string[] = [];
    let round = 0;

    while (currentPaths.length > 32) {
        const nextRound: string[] = [];

        for (let i = 0; i < currentPaths.length; i += 32) {
            const batch = currentPaths.slice(i, i + 32).map((p) => bucket.file(p));
            const tempPath = `${tempPrefix}/round_${round}_batch_${Math.floor(i / 32)}.tmp`;
            await bucket.file(tempPath).compose(batch);
            nextRound.push(tempPath);
            tempPaths.push(tempPath);
        }

        currentPaths = nextRound;
        round += 1;
    }

    await bucket.file(destinationPath).compose(currentPaths.map((p) => bucket.file(p)));

    // Best-effort cleanup of temporary and part objects.
    await Promise.all([
        ...sourcePaths.map((p) => bucket.file(p).delete().catch(() => undefined)),
        ...tempPaths.map((p) => bucket.file(p).delete().catch(() => undefined)),
    ]);
}

function normalizePhone(phone?: string): string | null {
    if (!phone) return null;
    const digits = phone.replace(/\D/g, "");
    if (digits.length === 10) return `91${digits}`;
    if (digits.length === 12 && digits.startsWith("91")) return digits;
    return null;
}

function campaignByRole(role?: string): string {
    if (role === "client") return "CLIENT";
    if (role === "editor") return "EDITOR";
    return "PROJECT_MANAGER";
}

// ---------------------------------------------------------------------------
// Send WhatsApp notification to PM when editor rejects or doesn't accept
// ---------------------------------------------------------------------------
async function sendAssignmentRejectedWhatsApp(params: {
    pmName: string;
    pmPhone: string;
    projectName: string;
    rejectionReason: string;
}): Promise<void> {
    const apiKey = process.env.AISENSY_API_KEY;
    if (!apiKey) {
        console.warn("[WhatsApp] AISENSY_API_KEY missing; skipping assignment-rejected notification");
        return;
    }

    const settingsSnap = await admin.firestore().collection("settings").doc("whatsapp").get();
    const settings = settingsSnap.exists ? settingsSnap.data() : null;
    if (settings && settings.enabled === false) return;

    const campaignName = "pro_delay";

    const payload = {
        apiKey,
        campaignName,
        destination: params.pmPhone,
        userName: params.pmPhone,
        templateParams: [
            params.pmName || "Project Manager",     // {{1}} PM Name
            params.projectName || "Unknown Project",// {{2}} Project Name
            params.rejectionReason || "rejected",   // {{3}} Rejection reason ("delayed in accepting" or editor reason)
            params.projectName || "Unknown Project",// {{4}} Project name again
        ],
        source: "EditoHub-Functions",
    };

    const response = await fetch(AISENSY_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const text = await response.text();
        console.error("[WhatsApp] assignment-rejected send failed:", response.status, text);
    } else {
        console.log(`[WhatsApp] PM notified of assignment rejection for project: ${params.projectName}`);
    }
}

async function sendAccountCreatedWhatsApp(params: {
    name: string;
    role: string;
    phone: string;
}): Promise<void> {
    const apiKey = process.env.AISENSY_API_KEY;
    if (!apiKey) {
        console.warn("[WhatsApp] AISENSY_API_KEY missing; skipping account-created notification");
        return;
    }

    const settingsSnap = await admin.firestore().collection("settings").doc("whatsapp").get();
    const settings = settingsSnap.exists ? settingsSnap.data() : null;
    if (settings && settings.enabled === false) return;

    const notif = settings?.notifications?.user_account_created;
    if (notif && notif.enabled === false) return;

    const message = (notif?.message as string) ||
        `Your ${params.role.replace(/_/g, " ")} account has been created successfully. You can now log in to EditoHub.`;
    const campaignName = settings?.campaigns?.[params.role === "editor" ? "editor" : params.role === "client" ? "client" : "pm"]
        || campaignByRole(params.role);

    const payload = {
        apiKey,
        campaignName,
        destination: params.phone,
        userName: params.phone,
        templateParams: [
            params.name || "User",
            message,
            "EditoHub Account",
        ],
        source: "EditoHub-Functions",
    };

    const response = await fetch(AISENSY_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const text = await response.text();
        console.error("[WhatsApp] account-created send failed:", response.status, text);
    }
}

// ---------------------------------------------------------------------------
// Scheduled: Handle assignment timeout (15 minutes) - Auto-reject if not accepted
// ---------------------------------------------------------------------------
export const handleAssignmentTimeout = functions.pubsub
    .schedule("every 5 minutes")
    .onRun(async () => {
        const now = Date.now();
        const fifteenMinutesAgo = now - (15 * 60 * 1000);

        // Find projects with pending assignment that haven't been accepted within 15 minutes
        const pendingSnap = await admin.firestore()
            .collection("projects")
            .where("assignmentStatus", "==", "pending")
            .where("assignedAt", "<=", fifteenMinutesAgo)
            .get();

        for (const projectDoc of pendingSnap.docs) {
            const project = projectDoc.data() as any;
            const editorId = project.assignedEditorId;
            const pmId = project.assignedPMId;

            if (!editorId || !pmId) continue;

            // Mark assignment as automatically rejected 
            // This triggers onProjectAssignmentRejected which sends the WhatsApp message.
            await projectDoc.ref.update({
                assignmentStatus: "rejected",
                rejectionReason: "delayed in accepting",
                autoRejectedAt: now,
                updatedAt: now,
            });

            console.log(`[AssignmentTimeout] Project auto-rejected: ${projectDoc.id}, Editor: ${editorId}`);
        }

        return null;
    });

// ---------------------------------------------------------------------------
// Trigger: Send pro_delay WhatsApp notification on assignment rejection
// ---------------------------------------------------------------------------
export const onProjectAssignmentRejected = functions.firestore
    .document("projects/{projectId}")
    .onUpdate(async (change: any, context: any) => {
        const newData = change.after.data();
        const oldData = change.before.data();

        // Check if transition is uniquely to "rejected" state
        if (newData.assignmentStatus === "rejected" && oldData.assignmentStatus !== "rejected") {
            const pmId = newData.assignedPMId;
            if (!pmId) return;

            const pmSnap = await admin.firestore().collection("users").doc(pmId).get();
            if (!pmSnap.exists) return;

            const pm = pmSnap.data();
            if (pm?.whatsappNumber || pm?.phoneNumber) {
                const pmPhone = pm.whatsappNumber || pm.phoneNumber;
                const normalizedPhone = normalizePhone(pmPhone);
                if (normalizedPhone) {
                    await sendAssignmentRejectedWhatsApp({
                        pmName: pm.displayName || "Project Manager",
                        pmPhone: normalizedPhone,
                        projectName: newData.name || "Unknown Project",
                        rejectionReason: newData.rejectionReason || "rejected",
                    });
                }
            }
        }
    });

// ---------------------------------------------------------------------------
// Scheduled cleanup: purge project assets 24h after first client download
// ---------------------------------------------------------------------------
export const cleanupProjectAssetsAfterClientDownload = functions.pubsub
    .schedule("every 60 minutes")
    .onRun(async () => {
        const now = Date.now();
        const dueSnap = await admin.firestore()
            .collection("projects")
            .where("assetsCleanupAfter", "<=", now)
            .get();

        for (const projectDoc of dueSnap.docs) {
            const project = projectDoc.data() as any;
            if (project.assetsPurgedAt) continue;

            const rawUrls = (project.rawFiles || []).map((f: any) => f?.url).filter(Boolean);
            const referenceUrls = (project.referenceFiles || []).map((f: any) => f?.url).filter(Boolean);
            const scriptUrls = (project.scripts || []).map((f: any) => f?.url).filter(Boolean);
            const footageUrl = project.footageLink;

            const allUrls = [...rawUrls, ...referenceUrls, ...scriptUrls, footageUrl].filter(Boolean);
            await Promise.all(allUrls.map((url: string) => deleteStorageObjectByUrl(url)));

            await projectDoc.ref.update({
                rawFiles: [],
                referenceFiles: [],
                scripts: [],
                assetsPurgedAt: now,
                updatedAt: now,
            });
        }

        return null;
    });

// ---------------------------------------------------------------------------
// Helper – run an ffmpeg command and return a Promise
// ---------------------------------------------------------------------------
function runFfmpeg(command: ffmpeg.FfmpegCommand): Promise<void> {
    return new Promise((resolve, reject) => {
        command.on("end", () => resolve()).on("error", reject).run();
    });
}

// ---------------------------------------------------------------------------
// Helper – download a GCS object to /tmp and return the local path
// ---------------------------------------------------------------------------
async function downloadToTmp(gsPath: string): Promise<string> {
    // gsPath format: "projects/{id}/revisions/{sid}/{filename}"
    const bucket = admin.storage().bucket();
    const localPath = path.join(os.tmpdir(), path.basename(gsPath));
    await bucket.file(gsPath).download({ destination: localPath });
    return localPath;
}

// ---------------------------------------------------------------------------
// Trigger: When a new comment is added
// ---------------------------------------------------------------------------
export const onCommentCreated = functions.firestore
    .document("projects/{projectId}/comments/{commentId}")
    .onCreate(async (snap: any, context: any) => {
        const comment = snap.data();
        const projectId = context.params.projectId;

        // 1. Get Project Details
        const projectRef = admin.firestore().collection("projects").doc(projectId);
        const projectSnap = await projectRef.get();
        const project = projectSnap.data();

        if (!project) return;

        // 2. Notify Project Members (Email / In-App)
        const members = project.members || [];

        // Filter out the comment author
        const recipients = members.filter((uid: string) => uid !== comment.userId);

        console.log(`Sending notifications to: ${recipients.join(", ")} for new comment on ${project.name}`);

        // Example: Create notification records in Firestore
        const batch = admin.firestore().batch();

        recipients.forEach((uid: string) => {
            const notifRef = admin.firestore().collection("users").doc(uid).collection("notifications").doc();
            batch.set(notifRef, {
                type: "comment",
                title: "New Comment",
                message: `${comment.userName} commented on ${project.name}`,
                link: `/dashboard/projects/${projectId}/review/${comment.revisionId}`,
                read: false,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
        });

        await batch.commit();
    });

// ---------------------------------------------------------------------------
// Trigger: When a project status changes
// ---------------------------------------------------------------------------
export const onProjectStatusChanged = functions.firestore
    .document("projects/{projectId}")
    .onUpdate(async (change: any, context: any) => {
        const newData = change.after.data();
        const oldData = change.before.data();

        if (newData.status !== oldData.status) {
            // Status changed logic (e.g., if Approved, generate final download link)
            console.log(`Project ${context.params.projectId} status changed to ${newData.status}`);
        }
    });

// ---------------------------------------------------------------------------
// Trigger: When a new user is created – send account-created WhatsApp
// ---------------------------------------------------------------------------
export const onUserCreated = functions.firestore
    .document("users/{userId}")
    .onCreate(async (snap: any) => {
        const user = snap.data() || {};
        const role = (user.role || "user") as string;
        const displayName = (user.displayName || "User") as string;
        const normalized = normalizePhone(user.whatsappNumber || user.phoneNumber);

        if (!normalized) {
            console.log("[WhatsApp] No valid phone for new user; skipping", snap.id);
            return;
        }

        await sendAccountCreatedWhatsApp({
            name: displayName,
            role,
            phone: normalized,
        });
    });

// ---------------------------------------------------------------------------
// Callable: Compose multipart raw upload into a single file
// ---------------------------------------------------------------------------
export const composeRawUpload = functions
    .runWith({ timeoutSeconds: 540, memory: "1GB" })
    .https
    .onCall(async (data: any, context: any) => {
        if (!context.auth?.uid) {
            throw new functions.https.HttpsError("unauthenticated", "Authentication required.");
        }

        const uid: string = context.auth.uid;
        const projectId = String(data?.projectId || "");
        const ownerId = String(data?.ownerId || "");
        const uploadId = String(data?.uploadId || "");
        const fileName = String(data?.fileName || "");
        const contentType = String(data?.contentType || "application/octet-stream");
        const partsCount = Number(data?.partsCount || 0);

        if (!projectId || !ownerId || !uploadId || !fileName || !Number.isInteger(partsCount) || partsCount <= 0) {
            throw new functions.https.HttpsError("invalid-argument", "Invalid compose request payload.");
        }

        if (partsCount > 2000) {
            throw new functions.https.HttpsError("invalid-argument", "Too many upload parts.");
        }

        const projectSnap = await admin.firestore().collection("projects").doc(projectId).get();
        if (!projectSnap.exists) {
            throw new functions.https.HttpsError("not-found", "Project not found.");
        }

        const project = projectSnap.data() || {};
        const userSnap = await admin.firestore().collection("users").doc(uid).get();
        const role = userSnap.exists ? String(userSnap.data()?.role || "") : "";
        const isStaff = ["admin", "manager", "project_manager", "sales_executive"].includes(role);

        const canUpload = isStaff ||
            uid === project.ownerId ||
            uid === project.clientId ||
            uid === project.assignedPMId ||
            uid === project.assignedEditorId;

        if (!canUpload) {
            throw new functions.https.HttpsError("permission-denied", "You do not have access to upload files for this project.");
        }

        const bucket = admin.storage().bucket();
        const sourcePaths = Array.from({ length: partsCount }, (_, index) => (
            `raw_footage/${ownerId}/multipart/${uploadId}/parts/part_${String(index).padStart(5, "0")}`
        ));

        const safeName = sanitizeFileName(fileName);
        const destinationPath = `raw_footage/${ownerId}/${uploadId}_${safeName}`;

        try {
            await composeManyParts({
                bucket,
                sourcePaths,
                destinationPath,
                tempPrefix: `raw_footage/${ownerId}/multipart/${uploadId}/tmp`,
            });

            await bucket.file(destinationPath).setMetadata({
                contentType,
                metadata: {
                    uploadId,
                    projectId,
                    uploadedBy: uid,
                    uploadedAt: String(Date.now()),
                },
            });

            return {
                success: true,
                destinationPath,
            };
        } catch (error: any) {
            console.error("composeRawUpload failed:", error);
            throw new functions.https.HttpsError("internal", error?.message || "Failed to compose uploaded parts.");
        }
    });

// ---------------------------------------------------------------------------
// Trigger: When a new revision is created – generate thumbnail + queue HLS
// ---------------------------------------------------------------------------
export const onRevisionCreated = functions
    .runWith({ timeoutSeconds: 540, memory: "2GB" })
    .firestore
    .document("revisions/{revisionId}")
    .onCreate(async (snap: any, context: any) => {
        const revisionId = context.params.revisionId;
        const revision = snap.data();
        if (!revision?.videoUrl || !revision?.projectId) return;

        const projectId: string = revision.projectId;
        const videoUrl: string = revision.videoUrl;

        // Create the VideoJob tracking document
        const jobRef = admin.firestore().collection("video_jobs").doc(revisionId);
        await jobRef.set({
            id: revisionId,
            projectId,
            revisionId,
            status: "pending",
            createdAt: Date.now(),
            updatedAt: Date.now(),
        });

        // ── Extract storage path from download URL ──────────────────────────
        // Firebase Storage download URLs contain the encoded object path after "/o/"
        let gcsPath: string;
        try {
            const urlObj = new URL(videoUrl);
            // e.g. /v0/b/<bucket>/o/projects%2F...
            const encoded = urlObj.pathname.split("/o/")[1];
            gcsPath = decodeURIComponent(encoded);
        } catch {
            console.error("Could not parse storage URL:", videoUrl);
            await jobRef.update({ status: "error", errorMessage: "Invalid video URL", updatedAt: Date.now() });
            return;
        }

        // ── Step 1: Generate thumbnail ───────────────────────────────────────
        await jobRef.update({ status: "processing_thumbnail", updatedAt: Date.now() });

        let localVideo: string | null = null;
        const localThumb = path.join(os.tmpdir(), `${revisionId}_thumb.jpg`);

        try {
            localVideo = await downloadToTmp(gcsPath);

            await runFfmpeg(
                ffmpeg(localVideo)
                    .seekInput(5)            // seek to 5 seconds
                    .frames(1)               // capture 1 frame
                    .outputOptions("-q:v", "3")
                    .output(localThumb)
            );

            const thumbGcsPath = `projects/${projectId}/thumbnails/${revisionId}.jpg`;
            await admin.storage().bucket().upload(localThumb, {
                destination: thumbGcsPath,
                metadata: { contentType: "image/jpeg" },
            });

            const [thumbUrl] = await admin
                .storage()
                .bucket()
                .file(thumbGcsPath)
                .getSignedUrl({ action: "read", expires: "03-01-2500" });

            await Promise.all([
                jobRef.update({ status: "thumbnail_done", thumbnailUrl: thumbUrl, updatedAt: Date.now() }),
                snap.ref.update({ thumbnailUrl: thumbUrl }),
            ]);

            console.log(`Thumbnail generated for revision ${revisionId}`);
        } catch (err) {
            console.error("Thumbnail generation failed:", err);
            await jobRef.update({
                status: "error",
                errorMessage: `Thumbnail failed: ${(err as Error).message}`,
                updatedAt: Date.now(),
            });
            return;
        } finally {
            if (localThumb && fs.existsSync(localThumb)) fs.unlinkSync(localThumb);
        }

        // ── Step 2: HLS Transcode ────────────────────────────────────────────
        if (!localVideo) return;

        await jobRef.update({ status: "transcoding", updatedAt: Date.now() });

        const hlsOutDir = path.join(os.tmpdir(), `hls_${revisionId}`);
        fs.mkdirSync(hlsOutDir, { recursive: true });

        // Define renditions: [label, width, height, videoBitrate]
        const renditions: Array<[string, number, number, string]> = [
            ["240p",  426,  240,  "400k"],
            ["360p",  640,  360,  "800k"],
            ["480p",  854,  480,  "1200k"],
            ["720p",  1280, 720,  "2500k"],
            ["1080p", 1920, 1080, "5000k"],
        ];

        const variantPaths: string[] = [];

        try {
            for (const [label, w, h, vbr] of renditions) {
                const renditionDir = path.join(hlsOutDir, label);
                fs.mkdirSync(renditionDir, { recursive: true });
                const m3u8Path = path.join(renditionDir, "index.m3u8");

                await runFfmpeg(
                    ffmpeg(localVideo!)
                        .outputOptions(
                            "-vf",          `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2`,
                            "-c:v",         "libx264",
                            "-b:v",         vbr,
                            "-c:a",         "aac",
                            "-b:a",         "128k",
                            "-hls_time",    "4",
                            "-hls_list_size", "0",
                            "-hls_segment_filename", path.join(renditionDir, "seg_%03d.ts"),
                            "-f",           "hls"
                        )
                        .output(m3u8Path)
                );

                // Upload all segment files and the playlist
                const segFiles = fs.readdirSync(renditionDir);
                for (const seg of segFiles) {
                    const localSeg = path.join(renditionDir, seg);
                    const gcsSeg = `projects/${projectId}/hls/${revisionId}/${label}/${seg}`;
                    await admin.storage().bucket().upload(localSeg, {
                        destination: gcsSeg,
                        metadata: {
                            contentType: seg.endsWith(".m3u8")
                                ? "application/vnd.apple.mpegurl"
                                : "video/MP2T",
                            cacheControl: "public, max-age=31536000",
                        },
                    });
                }

                variantPaths.push(`${label}/index.m3u8`);
            }

            // Build master playlist locally and upload
            // We list the lowest quality first for "Speed First" startup
            const masterContent = [
                "#EXTM3U",
                "#EXT-X-VERSION:3",
                "",
                `#EXT-X-STREAM-INF:BANDWIDTH=400000,RESOLUTION=426x240`,
                `240p/index.m3u8`,
                `#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360`,
                `360p/index.m3u8`,
                `#EXT-X-STREAM-INF:BANDWIDTH=1200000,RESOLUTION=854x480`,
                `480p/index.m3u8`,
                `#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720`,
                `720p/index.m3u8`,
                `#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080`,
                `1080p/index.m3u8`,
            ].join("\n");

            const masterLocalPath = path.join(hlsOutDir, "master.m3u8");
            fs.writeFileSync(masterLocalPath, masterContent);

            const masterGcsPath = `projects/${projectId}/hls/${revisionId}/master.m3u8`;
            await admin.storage().bucket().upload(masterLocalPath, {
                destination: masterGcsPath,
                metadata: { contentType: "application/vnd.apple.mpegurl" },
            });

            const [masterUrl] = await admin
                .storage()
                .bucket()
                .file(masterGcsPath)
                .getSignedUrl({ action: "read", expires: "03-01-2500" });

            await Promise.all([
                jobRef.update({
                    status: "ready",
                    hlsUrl: masterUrl,
                    resolutions: renditions.map(([label]) => label),
                    updatedAt: Date.now(),
                }),
                snap.ref.update({ hlsUrl: masterUrl }),
            ]);

            console.log(`HLS transcoding complete for revision ${revisionId}`);
        } catch (err) {
            console.error("HLS transcoding failed:", err);
            await jobRef.update({
                status: "error",
                errorMessage: `Transcode failed: ${(err as Error).message}`,
                updatedAt: Date.now(),
            });
        } finally {
            // Clean up temp files
            if (localVideo && fs.existsSync(localVideo)) fs.unlinkSync(localVideo);
            fs.rmSync(hlsOutDir, { recursive: true, force: true });
        }
    });

export * from "./mov-to-mp4";

// ---------------------------------------------------------------------------
// Trigger: When a raw footage file is finished (composed) – generate thumbnail + HLS
// ---------------------------------------------------------------------------
export const onRawFootageUploaded = functions
    .runWith({ timeoutSeconds: 540, memory: "2GB" })
    .storage
    .object()
    .onFinalize(async (object) => {
        const filePath = object.name;
        if (!filePath || !filePath.startsWith("raw_footage/")) return;
        
        // Skip HLS segments themselves, playlists, and thumbnails to avoid infinite loops
        if (filePath.includes("/hls/") || filePath.includes("/thumbnails/") || 
            filePath.endsWith(".m3u8") || filePath.endsWith(".ts") || filePath.endsWith(".jpg")) return;

        const metadata = object.metadata || {};
        const projectId = metadata.projectId;
        const uploadId = metadata.uploadId;

        if (!projectId) {
            console.log("[RawHLS] Skipping raw footage upload with no projectId metadata:", filePath);
            return;
        }

        console.log(`[RawHLS] Starting transcoding for: ${filePath} (Project: ${projectId}, UploadID: ${uploadId})`);

        const bucket = admin.storage().bucket(object.bucket);
        const fileName = path.basename(filePath);
        const localVideo = path.join(os.tmpdir(), fileName);

        const pathParts = filePath.split('/');
        const userId = pathParts[1] || 'unknown';
        const baseVideoId = uploadId || fileName.replace(/\.[^/.]+$/, '');
        const videoId = `${userId}_${baseVideoId}`.replace(/[^a-zA-Z0-9_-]/g, '_');

        const processedBase = `processed_videos/${videoId}`;
        const originalGcsPath = `${processedBase}/original.mp4`;
        const thumbGcsPath = `${processedBase}/thumbnails/thumbnail.jpg`;
        const hlsGcsBase = `${processedBase}/hls`;

        try {
            // Download the source video
            await bucket.file(filePath).download({ destination: localVideo });

            // Upload original video to processed_videos path with long CDN cache
            await bucket.upload(localVideo, {
                destination: originalGcsPath,
                metadata: {
                    contentType: 'video/mp4',
                    cacheControl: 'public, max-age=31536000',
                    metadata: {
                        processedFrom: filePath,
                        projectId: projectId || '',
                        userId,
                    },
                },
            });

            const [originalUrl] = await bucket.file(originalGcsPath).getSignedUrl({ action: 'read', expires: '03-01-2500' });

            // 1. Generate Thumbnail
            const localThumb = path.join(os.tmpdir(), `raw_${videoId}_thumb.jpg`);
            try {
                await runFfmpeg(
                    ffmpeg(localVideo)
                        .seekInput(2)
                        .frames(1)
                        .output(localThumb)
                );
                await bucket.upload(localThumb, {
                    destination: thumbGcsPath,
                    metadata: {
                        contentType: 'image/jpeg',
                        cacheControl: 'public, max-age=31536000',
                    },
                });
            } catch (thumbErr) {
                console.error('[RawHLS] Thumbnail generation failed:', thumbErr);
            }

            const [thumbUrl] = await bucket.file(thumbGcsPath).getSignedUrl({ action: 'read', expires: '03-01-2500' });
            if (fs.existsSync(localThumb)) fs.unlinkSync(localThumb);

            // 2. Generate HLS (2s segments, 360p & 720p only)
            const hlsOutDir = path.join(os.tmpdir(), `hlsraw_${videoId}`);
            if (fs.existsSync(hlsOutDir)) fs.rmSync(hlsOutDir, { recursive: true, force: true });
            fs.mkdirSync(hlsOutDir, { recursive: true });

            const renditions: Array<[string, number, number, string]> = [
                ['360p', 640, 360, '800k'],
                ['720p', 1280, 720, '2500k'],
            ];

            for (const [label, w, h, vbr] of renditions) {
                const renditionDir = path.join(hlsOutDir, label);
                fs.mkdirSync(renditionDir, { recursive: true });
                const m3u8Path = path.join(renditionDir, "index.m3u8");

                await runFfmpeg(
                    ffmpeg(localVideo)
                        .outputOptions(
                            "-vf",          `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2`,
                            "-c:v",         "libx264",
                            "-b:v",         vbr,
                            "-c:a",         "aac",
                            "-b:a",         "128k",
                            "-hls_time",    "2",
                            "-hls_list_size", "0",
                            "-hls_segment_filename", path.join(renditionDir, "seg_%03d.ts"),
                            "-f",           "hls"
                        )
                        .output(m3u8Path)
                );

                // Upload segments and rendition playlist
                const files = fs.readdirSync(renditionDir);
                for (const f of files) {
                    await bucket.upload(path.join(renditionDir, f), {
                        destination: `${hlsGcsBase}/${label}/${f}`,
                        metadata: { 
                            contentType: f.endsWith(".m3u8") ? "application/vnd.apple.mpegurl" : "video/MP2T",
                            cacheControl: "public, max-age=31536000"
                        }
                    });
                }
            }

            // Build and upload Master Playlist
            const masterContent = [
                "#EXTM3U",
                "#EXT-X-VERSION:3",
                "",
                `#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360`,
                `360p/index.m3u8`,
                `#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720`,
                `720p/index.m3u8`,
            ].join("\n");
            
            const masterLocal = path.join(hlsOutDir, "master.m3u8");
            fs.writeFileSync(masterLocal, masterContent);
            await bucket.upload(masterLocal, { 
                destination: `${hlsGcsBase}/master.m3u8`, 
                metadata: { contentType: "application/vnd.apple.mpegurl", cacheControl: "public, max-age=3600" } 
            });
            const [masterUrl] = await bucket.file(`${hlsGcsBase}/master.m3u8`).getSignedUrl({ action: "read", expires: "03-01-2500" });

            // 2.5. Store HLS metadata in Firestore for discovery
            await admin.firestore().collection("videos").doc(videoId).set({
                videoId,
                projectId,
                userId,
                sourceRawPath: filePath,
                processedPath: processedBase,
                originalUrl,
                thumbnailUrl: thumbUrl,
                hlsUrl: masterUrl,
                renditions: renditions.map(([label, w, h, vbr]) => ({ label, width: w, height: h, bitrate: vbr })),
                updatedAt: Date.now(),
            }, { merge: true });

            // 3. Update Project in Firestore
            const projectRef = admin.firestore().collection("projects").doc(projectId);
            await admin.firestore().runTransaction(async (transaction) => {
                const projectSnap = await transaction.get(projectRef);
                if (!projectSnap.exists) return;
                
                const data = projectSnap.data();
                const rawFiles = data?.rawFiles || [];
                
                let updated = false;
                const newRawFiles = rawFiles.map((f: any) => {
                    // Match by uploadId or by checking if the URL contains the filename
                    const isMatch = (uploadId && f.id === uploadId) || (f.url && f.url.includes(fileName));
                    if (isMatch) {
                        updated = true;
                        return { ...f, hlsUrl: masterUrl, thumbnailUrl: thumbUrl };
                    }
                    return f;
                });

                if (updated) {
                    transaction.update(projectRef, { rawFiles: newRawFiles, updatedAt: Date.now() });
                }
            });

            console.log(`[RawHLS] Finished transcoding for: ${filePath}`);
            // Cleanup temp directory
            fs.rmSync(hlsOutDir, { recursive: true, force: true });
        } catch (err) {
            console.error("[RawHLS] Critical Error during processing:", err);
        } finally {
            if (fs.existsSync(localVideo)) fs.unlinkSync(localVideo);
        }
    });
