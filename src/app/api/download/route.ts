import { NextRequest, NextResponse } from "next/server";
import { adminStorage, adminDb } from "@/lib/firebase/admin";
import Mux from "@mux/mux-node";

const mux = new Mux({
    tokenId: process.env.MUX_TOKEN_ID,
    tokenSecret: process.env.MUX_TOKEN_SECRET,
});

export async function POST(req: NextRequest) {
    const { url, fileName } = await req.json();
    console.log('[API Download] Request received:', { url, fileName });

    if (!url) {
        console.log('[API Download] No URL provided');
        return NextResponse.json({ success: false, error: "No URL provided" }, { status: 400 });
    }

    try {
        // Handle Firebase Storage URLs
        if (url.includes("firebasestorage.googleapis.com")) {
            const pathParts = url.split("/o/");
            if (pathParts.length > 1) {
                const encodedPath = pathParts[1].split("?")[0];
                const fullPath = decodeURIComponent(encodedPath);
                console.log('[API Download] Extracted path:', fullPath);

                const file = adminStorage.bucket().file(fullPath);
                const safeFileName = fileName ? fileName.replace(/[^a-zA-Z0-9.\-_]/g, "_") : "download";

                // Get file metadata
                const [metadata] = await file.getMetadata().catch(() => [{}]);
                const contentType = (metadata as any)?.contentType || 'application/octet-stream';

                console.log('[API Download] File metadata:', { contentType, size: (metadata as any)?.size });

                // Generate signed URL for reading
                const [signedUrl] = await file.getSignedUrl({
                    version: "v4",
                    action: "read",
                    expires: Date.now() + 60 * 60 * 1000, // 1 hour
                });

                console.log('[API Download] Signed URL generated, now fetching file content');

                // Fetch the file content
                const response = await fetch(signedUrl);
                if (!response.ok) {
                    throw new Error(`Failed to fetch file: ${response.status}`);
                }

                const blob = await response.blob();

                console.log('[API Download] File fetched successfully, size:', blob.size);

                // Return the file with forced download headers
                const headers = new Headers();
                headers.set('Content-Type', contentType);
                headers.set('Content-Disposition', `attachment; filename="${safeFileName}"`);
                headers.set('Content-Length', blob.size.toString());
                headers.set('Cache-Control', 'no-cache');

                return new NextResponse(blob, {
                    status: 200,
                    headers,
                });
            }

            console.log('[API Download] Invalid storage URL format');
            return NextResponse.json({ success: false, error: "Invalid storage URL" }, { status: 400 });
        }

        // Handle stream.mux.com URLs (playback URLs)
        if (url.includes("stream.mux.com")) {
            console.log('[API Download] Detected MUX playback URL');
            
            // Extract playbackId from URL
            // Format: https://stream.mux.com/{playbackId}...
            const match = url.match(/stream\.mux\.com\/([^./]+)/);
            if (!match) {
                return NextResponse.json({ success: false, error: "Could not extract playback ID" }, { status: 400 });
            }

            const playbackId = match[1];
            console.log(`[API Download] Extracted playbackId: ${playbackId}`);

            // Generate MP4 URL from MUX
            let mp4Url = `https://stream.mux.com/${playbackId}.mp4`;

            console.log(`[API Download] Fetching MP4 from MUX: ${mp4Url}`);

            // Fetch MP4 from MUX
            const mp4Response = await fetch(mp4Url);

            if (!mp4Response.ok) {
                console.error(`[API Download] MUX returned ${mp4Response.status}`);
                return NextResponse.json(
                    { success: false, error: `Failed to fetch video from MUX: ${mp4Response.statusText}` },
                    { status: 500 }
                );
            }

            const contentLength = mp4Response.headers.get("content-length");
            const contentType = mp4Response.headers.get("content-type") || "video/mp4";

            const safeFileName = fileName ? fileName.replace(/[^a-zA-Z0-9.\-_]/g, "_") : "video.mp4";

            // Create response with proper headers for download
            const headers = new Headers();
            headers.set("Content-Type", contentType);
            headers.set("Content-Disposition", `attachment; filename="${safeFileName}"`);
            headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
            headers.set("Pragma", "no-cache");
            headers.set("Expires", "0");

            if (contentLength) {
                headers.set("Content-Length", contentLength);
            }

            console.log(`[API Download] Streaming MP4 from MUX (size: ${contentLength || 'unknown'})`);

            // Pipe the stream to response
            return new NextResponse(mp4Response.body, {
                status: 200,
                headers: headers,
            });
        }

        // For other URLs, just return them as-is
        console.log('[API Download] Non-Firebase/MUX URL, returning as-is');
        return NextResponse.json({ success: true, url });

    } catch (err: any) {
        console.error('[API Download] Error:', err);
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}
