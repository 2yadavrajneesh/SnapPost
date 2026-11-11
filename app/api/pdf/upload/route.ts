import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { PDF_LIMITS } from "@/lib/pdf/config";
import { storageMode } from "@/lib/pdf/storage";
import { BUCKETS, rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";

const TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

/** Gives the browser a short-lived permission to upload one file straight to Vercel Blob (so the 4.5 MB request limit does not apply). */
export async function POST(req: NextRequest) {
  if (storageMode() !== "blob") return NextResponse.json({ error: "File storage is not set up." }, { status: 503 });
  const limited = await rateLimit(req, BUCKETS.pdfUpload);
  if (limited) return limited;
  let body: HandleUploadBody;
  try {
    body = (await req.json()) as HandleUploadBody;
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  try {
    const json = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        if (!/^papernest\/in\/[\w-]{36}\/[^/]{1,100}$/.test(pathname)) throw new Error("Bad file path.");
        return { allowedContentTypes: TYPES, maximumSizeInBytes: PDF_LIMITS.maxFileBytes, addRandomSuffix: false };
      },
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(json);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Upload not allowed." }, { status: 400 });
  }
}
