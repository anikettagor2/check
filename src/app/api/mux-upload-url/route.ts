import Mux from "@mux/mux-node";
import { NextRequest, NextResponse } from "next/server";

const mux = new Mux({
    tokenId: process.env.MUX_TOKEN_ID,
    tokenSecret: process.env.MUX_TOKEN_SECRET,
});

export async function POST(request: NextRequest) {
    try {
        if (!process.env.MUX_TOKEN_ID || !process.env.MUX_TOKEN_SECRET) {
            console.error("[Mux] Missing API credentials in environment variables");
            return NextResponse.json({ error: "Server configuration error: Missing Mux credentials" }, { status: 500 });
        }

        const { projectId, revisionId, type } = await request.json();
        const origin = request.headers.get("origin");
        const forwardedProto = request.headers.get("x-forwarded-proto");
        const forwardedHost = request.headers.get("x-forwarded-host") || request.headers.get("host");
        const derivedOrigin =
            forwardedProto && forwardedHost
                ? `${forwardedProto}://${forwardedHost}`
                : request.nextUrl.origin;
        // Mux direct uploads need an explicit origin for tus HEAD/PATCH CORS.
        // Returning "*" here can cause the resume HEAD request to fail in-browser.
        const finalOrigin = origin && origin !== "null" ? origin : derivedOrigin;

        console.log(`[Mux] Creating Direct Upload:`, {
            projectId,
            revisionId,
            type,
            origin: finalOrigin,
            userAgent: request.headers.get("user-agent")
        });

        const upload = await mux.video.uploads.create({
            new_asset_settings: {
                playback_policy: ["public"],
                passthrough: JSON.stringify({
                    projectId,
                    revisionId,
                    type: type || "revision",
                }),
            },
            cors_origin: finalOrigin,
        });

        return NextResponse.json({
            uploadUrl: upload.url,
            uploadId: upload.id,
            origin: origin, // Return for debugging
        });
    } catch (error: unknown) {
        console.error("[Mux] Create Upload Error:", error);
        const message = error instanceof Error ? error.message : "Failed to create Mux upload";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
