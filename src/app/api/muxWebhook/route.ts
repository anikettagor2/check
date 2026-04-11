import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { type, data } = body;

        console.log(`[MuxWebhook] Received event: ${type}`);

        if (type === "video.asset.ready") {
            const asset = data;
            const playbackId = asset.playback_ids?.[0]?.id;
            const metadata = asset.passthrough ? JSON.parse(asset.passthrough) : (asset.metadata || {});
            
            const { projectId, revisionId, type: uploadType } = metadata;

            if (playbackId) {
                if (uploadType === "revision" && revisionId) {
                    // Update revision document
                    await adminDb.collection("revisions").doc(revisionId).update({
                        playbackId,
                        status: "ready",
                        updatedAt: Date.now(),
                    });

                    // Update project's video job if it exists
                    await adminDb.collection("video_jobs").doc(revisionId).update({
                        status: "ready",
                        hlsUrl: `https://stream.mux.com/${playbackId}.m3u8`, // Fallback/compatibility
                        updatedAt: Date.now(),
                    });
                    
                    console.log(`[MuxWebhook] Updated revision ${revisionId} with playbackId ${playbackId}`);
                } else if ((uploadType === "raw_footage" || uploadType === "brole_footage" || uploadType === "delivered_files") && projectId) {
                    // Try finding by projectId first, then by uploadToken
                    let projectRef = adminDb.collection("projects").doc(projectId);
                    let projectSnap = await projectRef.get();
                    
                    if (!projectSnap.exists) {
                        const snap = await adminDb.collection("projects").where("uploadToken", "==", projectId).limit(1).get();
                        if (!snap.empty) {
                            projectRef = snap.docs[0].ref;
                            projectSnap = snap.docs[0];
                        }
                    }

                    if (projectSnap.exists) {
                        const projectData = projectSnap.data();
                        const uploadId = asset.upload_id;
                        
                        if (uploadId) {
                            const fieldName = 
                                (uploadType === "raw_footage" || uploadType === "raw") ? "rawFiles" : 
                                uploadType === "brole_footage" ? "bRoleFiles" : 
                                uploadType === "pm_file" ? "pmFiles" :
                                "deliveredFiles";
                            
                            const files = [...(projectData?.[fieldName] || [])];
                            const fileIndex = files.findIndex((f: any) => f.url === `mux://${uploadId}` || f.storagePath === `mux://${uploadId}`);
                            
                            if (fileIndex !== -1) {
                                files[fileIndex].playbackId = playbackId;
                                // Also update url to the direct stream URL for convenience, 
                                // though the components should preferably use VideoPlayer with playbackId
                                files[fileIndex].url = `https://stream.mux.com/${playbackId}.m3u8`;
                                await projectRef.update({ [fieldName]: files });
                                console.log(`[MuxWebhook] Updated project ${projectSnap.id} ${uploadType} file at index ${fileIndex}`);
                            }
                        }
                    }
                }
            }
        }

        return NextResponse.json({ received: true });
    } catch (error: any) {
        console.error("[MuxWebhook] Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
