import { redirect } from "next/navigation";

type Props = {
    params: Promise<{ id: string }>;
};

// Short redirect: /r/[id] → /review/[id]
// This is used for shareable review links copied from the dashboard
export default async function ShortReviewRedirect({ params }: Props) {
    const { id } = await params;
    redirect(`/review/${id}`);
}
