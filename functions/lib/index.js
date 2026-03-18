"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.onRevisionCreated = exports.composeRawUpload = exports.onUserCreated = exports.onProjectStatusChanged = exports.onCommentCreated = exports.cleanupProjectAssetsAfterClientDownload = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const fs = __importStar(require("fs"));
const fluent_ffmpeg_1 = __importDefault(require("fluent-ffmpeg"));
const ffmpeg_1 = __importDefault(require("@ffmpeg-installer/ffmpeg"));
admin.initializeApp();
// Point fluent-ffmpeg at the bundled binary
fluent_ffmpeg_1.default.setFfmpegPath(ffmpeg_1.default.path);
const AISENSY_URL = "https://backend.aisensy.com/campaign/t1/api/v2";
function sanitizeFileName(fileName) {
    return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
}
function extractStoragePathFromUrl(url) {
    var _a;
    if (!url)
        return null;
    if (url.startsWith("gs://")) {
        const noScheme = url.replace("gs://", "");
        const slashIdx = noScheme.indexOf("/");
        return slashIdx >= 0 ? noScheme.slice(slashIdx + 1) : null;
    }
    if (url.includes("/o/")) {
        const encoded = (_a = url.split("/o/")[1]) === null || _a === void 0 ? void 0 : _a.split("?")[0];
        return encoded ? decodeURIComponent(encoded) : null;
    }
    return null;
}
async function deleteStorageObjectByUrl(url) {
    const path = extractStoragePathFromUrl(url);
    if (!path)
        return;
    try {
        await admin.storage().bucket().file(path).delete({ ignoreNotFound: true });
    }
    catch (_a) {
        // Ignore object-level failures to keep cleanup resilient.
    }
}
async function composeManyParts(params) {
    const { bucket, sourcePaths, destinationPath, tempPrefix } = params;
    // GCS compose accepts max 32 source objects per request.
    let currentPaths = [...sourcePaths];
    const tempPaths = [];
    let round = 0;
    while (currentPaths.length > 32) {
        const nextRound = [];
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
function normalizePhone(phone) {
    if (!phone)
        return null;
    const digits = phone.replace(/\D/g, "");
    if (digits.length === 10)
        return `91${digits}`;
    if (digits.length === 12 && digits.startsWith("91"))
        return digits;
    return null;
}
function campaignByRole(role) {
    if (role === "client")
        return "CLIENT";
    if (role === "editor")
        return "EDITOR";
    return "PROJECT_MANAGER";
}
async function sendAccountCreatedWhatsApp(params) {
    var _a, _b;
    const apiKey = process.env.AISENSY_API_KEY;
    if (!apiKey) {
        console.warn("[WhatsApp] AISENSY_API_KEY missing; skipping account-created notification");
        return;
    }
    const settingsSnap = await admin.firestore().collection("settings").doc("whatsapp").get();
    const settings = settingsSnap.exists ? settingsSnap.data() : null;
    if (settings && settings.enabled === false)
        return;
    const notif = (_a = settings === null || settings === void 0 ? void 0 : settings.notifications) === null || _a === void 0 ? void 0 : _a.user_account_created;
    if (notif && notif.enabled === false)
        return;
    const message = (notif === null || notif === void 0 ? void 0 : notif.message) ||
        `Your ${params.role.replace(/_/g, " ")} account has been created successfully. You can now log in to EditoHub.`;
    const campaignName = ((_b = settings === null || settings === void 0 ? void 0 : settings.campaigns) === null || _b === void 0 ? void 0 : _b[params.role === "editor" ? "editor" : params.role === "client" ? "client" : "pm"])
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
// Scheduled cleanup: purge project assets 24h after first client download
// ---------------------------------------------------------------------------
exports.cleanupProjectAssetsAfterClientDownload = functions.pubsub
    .schedule("every 60 minutes")
    .onRun(async () => {
    const now = Date.now();
    const dueSnap = await admin.firestore()
        .collection("projects")
        .where("assetsCleanupAfter", "<=", now)
        .get();
    for (const projectDoc of dueSnap.docs) {
        const project = projectDoc.data();
        if (project.assetsPurgedAt)
            continue;
        const rawUrls = (project.rawFiles || []).map((f) => f === null || f === void 0 ? void 0 : f.url).filter(Boolean);
        const referenceUrls = (project.referenceFiles || []).map((f) => f === null || f === void 0 ? void 0 : f.url).filter(Boolean);
        const scriptUrls = (project.scripts || []).map((f) => f === null || f === void 0 ? void 0 : f.url).filter(Boolean);
        const footageUrl = project.footageLink;
        const allUrls = [...rawUrls, ...referenceUrls, ...scriptUrls, footageUrl].filter(Boolean);
        await Promise.all(allUrls.map((url) => deleteStorageObjectByUrl(url)));
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
function runFfmpeg(command) {
    return new Promise((resolve, reject) => {
        command.on("end", () => resolve()).on("error", reject).run();
    });
}
// ---------------------------------------------------------------------------
// Helper – download a GCS object to /tmp and return the local path
// ---------------------------------------------------------------------------
async function downloadToTmp(gsPath) {
    // gsPath format: "projects/{id}/revisions/{sid}/{filename}"
    const bucket = admin.storage().bucket();
    const localPath = path.join(os.tmpdir(), path.basename(gsPath));
    await bucket.file(gsPath).download({ destination: localPath });
    return localPath;
}
// ---------------------------------------------------------------------------
// Trigger: When a new comment is added
// ---------------------------------------------------------------------------
exports.onCommentCreated = functions.firestore
    .document("projects/{projectId}/comments/{commentId}")
    .onCreate(async (snap, context) => {
    const comment = snap.data();
    const projectId = context.params.projectId;
    // 1. Get Project Details
    const projectRef = admin.firestore().collection("projects").doc(projectId);
    const projectSnap = await projectRef.get();
    const project = projectSnap.data();
    if (!project)
        return;
    // 2. Notify Project Members (Email / In-App)
    const members = project.members || [];
    // Filter out the comment author
    const recipients = members.filter((uid) => uid !== comment.userId);
    console.log(`Sending notifications to: ${recipients.join(", ")} for new comment on ${project.name}`);
    // Example: Create notification records in Firestore
    const batch = admin.firestore().batch();
    recipients.forEach((uid) => {
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
exports.onProjectStatusChanged = functions.firestore
    .document("projects/{projectId}")
    .onUpdate(async (change, context) => {
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
exports.onUserCreated = functions.firestore
    .document("users/{userId}")
    .onCreate(async (snap) => {
    const user = snap.data() || {};
    const role = (user.role || "user");
    const displayName = (user.displayName || "User");
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
exports.composeRawUpload = functions
    .runWith({ timeoutSeconds: 540, memory: "1GB" })
    .https
    .onCall(async (data, context) => {
    var _a, _b;
    if (!((_a = context.auth) === null || _a === void 0 ? void 0 : _a.uid)) {
        throw new functions.https.HttpsError("unauthenticated", "Authentication required.");
    }
    const uid = context.auth.uid;
    const projectId = String((data === null || data === void 0 ? void 0 : data.projectId) || "");
    const ownerId = String((data === null || data === void 0 ? void 0 : data.ownerId) || "");
    const uploadId = String((data === null || data === void 0 ? void 0 : data.uploadId) || "");
    const fileName = String((data === null || data === void 0 ? void 0 : data.fileName) || "");
    const contentType = String((data === null || data === void 0 ? void 0 : data.contentType) || "application/octet-stream");
    const partsCount = Number((data === null || data === void 0 ? void 0 : data.partsCount) || 0);
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
    const role = userSnap.exists ? String(((_b = userSnap.data()) === null || _b === void 0 ? void 0 : _b.role) || "") : "";
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
    const sourcePaths = Array.from({ length: partsCount }, (_, index) => (`raw_footage/${ownerId}/multipart/${uploadId}/parts/part_${String(index).padStart(5, "0")}`));
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
    }
    catch (error) {
        console.error("composeRawUpload failed:", error);
        throw new functions.https.HttpsError("internal", (error === null || error === void 0 ? void 0 : error.message) || "Failed to compose uploaded parts.");
    }
});
// ---------------------------------------------------------------------------
// Trigger: When a new revision is created – generate thumbnail + queue HLS
// ---------------------------------------------------------------------------
exports.onRevisionCreated = functions
    .runWith({ timeoutSeconds: 300, memory: "1GB" })
    .firestore
    .document("revisions/{revisionId}")
    .onCreate(async (snap, context) => {
    const revisionId = context.params.revisionId;
    const revision = snap.data();
    if (!(revision === null || revision === void 0 ? void 0 : revision.videoUrl) || !(revision === null || revision === void 0 ? void 0 : revision.projectId))
        return;
    const projectId = revision.projectId;
    const videoUrl = revision.videoUrl;
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
    let gcsPath;
    try {
        const urlObj = new URL(videoUrl);
        // e.g. /v0/b/<bucket>/o/projects%2F...
        const encoded = urlObj.pathname.split("/o/")[1];
        gcsPath = decodeURIComponent(encoded);
    }
    catch (_a) {
        console.error("Could not parse storage URL:", videoUrl);
        await jobRef.update({ status: "error", errorMessage: "Invalid video URL", updatedAt: Date.now() });
        return;
    }
    // ── Step 1: Generate thumbnail ───────────────────────────────────────
    await jobRef.update({ status: "processing_thumbnail", updatedAt: Date.now() });
    let localVideo = null;
    const localThumb = path.join(os.tmpdir(), `${revisionId}_thumb.jpg`);
    try {
        localVideo = await downloadToTmp(gcsPath);
        await runFfmpeg((0, fluent_ffmpeg_1.default)(localVideo)
            .seekInput(5) // seek to 5 seconds
            .frames(1) // capture 1 frame
            .outputOptions("-q:v", "3")
            .output(localThumb));
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
    }
    catch (err) {
        console.error("Thumbnail generation failed:", err);
        await jobRef.update({
            status: "error",
            errorMessage: `Thumbnail failed: ${err.message}`,
            updatedAt: Date.now(),
        });
        return;
    }
    finally {
        if (localThumb && fs.existsSync(localThumb))
            fs.unlinkSync(localThumb);
    }
    // ── Step 2: HLS Transcode ────────────────────────────────────────────
    if (!localVideo)
        return;
    await jobRef.update({ status: "transcoding", updatedAt: Date.now() });
    const hlsOutDir = path.join(os.tmpdir(), `hls_${revisionId}`);
    fs.mkdirSync(hlsOutDir, { recursive: true });
    // Define renditions: [label, width, height, videoBitrate]
    const renditions = [
        ["1080p", 1920, 1080, "4000k"],
        ["720p", 1280, 720, "2000k"],
        ["480p", 854, 480, "1000k"],
    ];
    const variantPaths = [];
    try {
        for (const [label, w, h, vbr] of renditions) {
            const renditionDir = path.join(hlsOutDir, label);
            fs.mkdirSync(renditionDir, { recursive: true });
            const m3u8Path = path.join(renditionDir, "index.m3u8");
            await runFfmpeg((0, fluent_ffmpeg_1.default)(localVideo)
                .outputOptions("-vf", `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2`, "-c:v", "libx264", "-b:v", vbr, "-c:a", "aac", "-b:a", "128k", "-hls_time", "6", "-hls_list_size", "0", "-hls_segment_filename", path.join(renditionDir, "seg_%03d.ts"), "-f", "hls")
                .output(m3u8Path));
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
                    },
                });
            }
            variantPaths.push(`${label}/index.m3u8`);
        }
        // Build master playlist locally and upload
        const masterContent = [
            "#EXTM3U",
            "#EXT-X-VERSION:3",
            "",
            `#EXT-X-STREAM-INF:BANDWIDTH=4000000,RESOLUTION=1920x1080`,
            `1080p/index.m3u8`,
            `#EXT-X-STREAM-INF:BANDWIDTH=2000000,RESOLUTION=1280x720`,
            `720p/index.m3u8`,
            `#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=854x480`,
            `480p/index.m3u8`,
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
    }
    catch (err) {
        console.error("HLS transcoding failed:", err);
        await jobRef.update({
            status: "error",
            errorMessage: `Transcode failed: ${err.message}`,
            updatedAt: Date.now(),
        });
    }
    finally {
        // Clean up temp files
        if (localVideo && fs.existsSync(localVideo))
            fs.unlinkSync(localVideo);
        fs.rmSync(hlsOutDir, { recursive: true, force: true });
    }
});
//# sourceMappingURL=index.js.map