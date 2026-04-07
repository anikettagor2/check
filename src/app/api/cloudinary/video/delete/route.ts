import { v2 as cloudinary } from "cloudinary";
import { NextResponse } from "next/server";

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function POST(request: Request) {
  try {
    const { publicId } = await request.json();
    // For videos, you MUST specify resource_type: "video"
    const result = await cloudinary.uploader.destroy(publicId, { resource_type: "video" });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}