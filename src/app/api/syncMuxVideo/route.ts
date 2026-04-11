import Mux from "@mux/mux-node";
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";

const mux = new Mux({
    tokenId: process.env.MUX_TOKEN_ID,
    tokenSecret: process.env.MUX_TOKEN_SECRET,
});

export async function POST(request: NextRequest) {
    try {
        const { uploadId, revisionId } = await request.json();

        if (!uploadId || !revisionId) {
            return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
        }

        // Firebase Document IDs are precisely 20 characters alphanumeric (base62).
        // Mux Upload IDs will not fit this pattern. This prevents a crash when a duplicate video job doc is passed.
        if (uploadId.length === 20) {
            console.log(`[SyncMuxVideo] Ignoring Sync request: ${uploadId} appears to be a Firebase doc ID, not a Mux Upload ID.`);
            return NextResponse.json({ success: false, error: "Invalid Mux Upload ID format" }, { status: 400 });
        }

        // 1. Fetch the upload from Mux
        const upload = await mux.video.uploads.retrieve(uploadId);
        
        if (upload.status === "asset_created" && upload.asset_id) {
            // 2. Fetch the asset
            const asset = await mux.video.assets.retrieve(upload.asset_id);
            
            if (asset.status === "ready") {
                const playbackId = asset.playback_ids?.[0]?.id;
                if (playbackId) {
                    // 3. Update Firestore
                    await adminDb.collection("revisions").doc(revisionId).update({
                        playbackId,
                        status: "ready",
                        updatedAt: Date.now(),
                    });

                    await adminDb.collection("video_jobs").doc(uploadId).update({
                        status: "ready",
                        hlsUrl: `https://stream.mux.com/${playbackId}.m3u8`,
                        updatedAt: Date.now(),
                    });
                    
                    console.log(`[SyncMuxVideo] Manually synced revision ${revisionId} with playbackId ${playbackId}`);
                    return NextResponse.json({ success: true, playbackId });
                }
            }
        }

        return NextResponse.json({ success: false, status: upload.status });
    } catch (error: any) {
        console.error("[SyncMuxVideo] Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
