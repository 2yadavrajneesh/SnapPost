import { NextRequest, NextResponse } from "next/server";
import { PDF_LIMITS } from "@/lib/pdf/config";
import { saveFile, storageMode } from "@/lib/pdf/storage";
import { BUCKETS, rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";

/** Local and test stand-in for the Vercel Blob upload. Only available when PDF_STORAGE=local. */
export async function PUT(req: NextRequest) {
  if (storageMode() !== "local") return NextResponse.json({ error: "Not available." }, { status: 404 });
  const limited = await rateLimit(req, BUCKETS.pdfUpload);
  if (limited) return limited;
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (!bytes.length || bytes.length > PDF_LIMITS.maxFileBytes) return NextResponse.json({ error: "That file is empty or too large." }, { status: 400 });
  const { url } = await saveFile("in", req.nextUrl.searchParams.get("name") ?? "file", bytes, req.headers.get("content-type") ?? "application/octet-stream");
  return NextResponse.json({ url });
}
