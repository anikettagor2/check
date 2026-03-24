import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { adminAuth, adminStorage } from "@/lib/firebase/admin";

const MAX_COMPOSE_SOURCES = 32;

type ComposeBody = {
  projectId: string;
  sessionId: string;
  fileName: string;
  chunkPaths: string[];
  contentType?: string;
};

async function composeRecursively(
  bucket: ReturnType<typeof adminStorage.bucket>,
  sourcePaths: string[],
  destinationPath: string,
  sessionId: string
) {
  const tempFilesToCleanup: string[] = [];
  let currentSources = sourcePaths;
  let round = 0;

  while (currentSources.length > MAX_COMPOSE_SOURCES) {
    const nextRound: string[] = [];

    for (let i = 0; i < currentSources.length; i += MAX_COMPOSE_SOURCES) {
      const group = currentSources.slice(i, i + MAX_COMPOSE_SOURCES);
      const tempPath = `projects/_compose_tmp/${sessionId}/round-${round}-part-${Math.floor(i / MAX_COMPOSE_SOURCES)}.tmp`;

      await bucket.combine(
        group.map((path) => bucket.file(path)),
        bucket.file(tempPath)
      );

      nextRound.push(tempPath);
      tempFilesToCleanup.push(tempPath);
    }

    currentSources = nextRound;
    round += 1;
  }

  await bucket.combine(
    currentSources.map((path) => bucket.file(path)),
    bucket.file(destinationPath)
  );

  return tempFilesToCleanup;
}

function toDownloadUrl(bucketName: string, objectPath: string, token: string) {
  const encoded = encodeURIComponent(objectPath);
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encoded}?alt=media&token=${token}`;
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

    if (!token) {
      return NextResponse.json({ error: "Missing auth token." }, { status: 401 });
    }

    try {
      await adminAuth.verifyIdToken(token);
    } catch {
      return NextResponse.json({ error: "Invalid auth token." }, { status: 401 });
    }

    const body = (await request.json()) as ComposeBody;
    const { projectId, sessionId, fileName, chunkPaths, contentType } = body;

    if (!projectId || !sessionId || !fileName || !Array.isArray(chunkPaths) || chunkPaths.length === 0) {
      return NextResponse.json({ error: "Invalid compose payload." }, { status: 400 });
    }

    const bucket = adminStorage.bucket();
    const destinationPath = `projects/${projectId}/revisions/${sessionId}/${fileName}`;

    const tempFiles = await composeRecursively(bucket, chunkPaths, destinationPath, sessionId);

    const downloadToken = randomUUID();
    await bucket.file(destinationPath).setMetadata({
      contentType: contentType || "video/mp4",
      cacheControl: "public, max-age=31536000, immutable",
      metadata: {
        firebaseStorageDownloadTokens: downloadToken,
      },
    });

    await Promise.allSettled([
      ...chunkPaths.map((path) => bucket.file(path).delete({ ignoreNotFound: true })),
      ...tempFiles.map((path) => bucket.file(path).delete({ ignoreNotFound: true })),
    ]);

    const downloadURL = toDownloadUrl(bucket.name, destinationPath, downloadToken);
    return NextResponse.json({ downloadURL });
  } catch (error: any) {
    console.error("[UploadCompose] Failed:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to finalize upload." },
      { status: 500 }
    );
  }
}
