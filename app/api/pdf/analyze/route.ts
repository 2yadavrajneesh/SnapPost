import { NextRequest, NextResponse } from "next/server";
import { PDF_LIMITS } from "@/lib/pdf/config";
import { analyzePdf } from "@/lib/pdf/analyze";
import { ownUrl, readFile } from "@/lib/pdf/storage";
import { BUCKETS, rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const maxDuration = 60;

/** POST { url } measures how much of a PDF each page accounts for, so the page can estimate the size of a result. The file is not deleted. */
export async function POST(req: NextRequest) {
  const limited = await rateLimit(req, BUCKETS.pdfUpload);
  if (limited) return limited;
  let url = "";
  try {
    url = String((await req.json()).url ?? "");
  } catch {}
  if (!ownUrl(url, "in")) return NextResponse.json({ error: "Not a valid file link." }, { status: 400 });
  try {
    const bytes = await readFile(url, "in", PDF_LIMITS.maxFileBytes);
    return NextResponse.json(await analyzePdf(bytes));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not analyse this file." }, { status: 422 });
  }
}
