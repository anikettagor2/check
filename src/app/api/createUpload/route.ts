import Mux from "@mux/mux-node";
import { NextRequest, NextResponse } from "next/server";

const mux = new Mux({
    tokenId: process.env.MUX_TOKEN_ID,
    tokenSecret: process.env.MUX_TOKEN_SECRET,
});

export async function POST(request: NextRequest) {
    try {
        const { projectId, revisionId, type } = await request.json();

        const upload = await mux.video.uploads.create({
            new_asset_settings: {
                playback_policy: ["public"],
                passthrough: JSON.stringify({
                    projectId,
                    revisionId,
                    type: type || "revision",
                }),
            },
            cors_origin: "*",
        });

        return NextResponse.json({
            uploadUrl: upload.url,
            uploadId: upload.id,
        });
    } catch (error: any) {
        console.error("[Mux] Create Upload Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
