import { Metadata } from "next";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import GuestReviewPageClient from "./client-page";

type Props = {
    params: Promise<{ id: string }>;
};

// Fetch revision and project data server-side for metadata generation
async function fetchReviewData(revisionId: string) {
    try {
        const revSnap = await getDoc(doc(db, "revisions", revisionId));
        if (!revSnap.exists()) {
            return null;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const revData: any = { id: revSnap.id, ...revSnap.data() };
        let projectData = null;

        try {
            const projSnap = await getDoc(doc(db, "projects", revData.projectId));
            if (projSnap.exists()) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                projectData = { id: projSnap.id, ...projSnap.data() } as any;
            }
        } catch {
            // non-critical
        }

        return { revision: revData, project: projectData };
    } catch (error) {
        console.error("Failed to fetch review data:", error);
        return null;
    }
}

// Generate Open Graph metadata for WhatsApp link preview
export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { id: revisionId } = await params;
    const data = await fetchReviewData(revisionId);

    if (!data || !data.revision) {
        return {
            title: "Review Link - EditoHub",
            description: "EditoHub - Premium Video Editing Agency Platform",
        };
    }

    const { revision, project } = data;
    const videoName = revision.description || project?.name || "Video Review";
    const clientName = project?.clientName || project?.name || "EditoHub";
    const thumbnailUrl = revision.thumbnailUrl || "/default-thumbnail.jpg";
    const reviewUrl = `https://www.previewvideo.online/review/${revisionId}`;

    return {
        title: videoName,
        description: `Client: ${clientName}`,
        openGraph: {
            title: videoName,
            description: `Client: ${clientName}`,
            images: [
                {
                    url: thumbnailUrl,
                    width: 1200,
                    height: 630,
                    alt: videoName,
                },
            ],
            url: reviewUrl,
            type: "website",
            siteName: "EditoHub",
        },
        twitter: {
            card: "summary_large_image",
            title: videoName,
            description: `Client: ${clientName}`,
            images: [thumbnailUrl],
        },
    };
}

export default function GuestReviewPage({ params }: Props) {
    const revisionId = (params as any).id;
    return <GuestReviewPageClient revisionId={revisionId} />;
}
