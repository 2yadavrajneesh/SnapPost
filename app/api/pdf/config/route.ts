import { NextResponse } from "next/server";
import { PDF_LIMITS } from "@/lib/pdf/config";
import { storageMode } from "@/lib/pdf/storage";

export const runtime = "nodejs";

/** Tells the page how to upload (Vercel Blob or the local test store) and the size limits. */
export function GET() {
  return NextResponse.json({ mode: storageMode(), maxFileBytes: PDF_LIMITS.maxFileBytes, maxFiles: PDF_LIMITS.maxFiles, ttlMinutes: PDF_LIMITS.ttlMinutes });
}
