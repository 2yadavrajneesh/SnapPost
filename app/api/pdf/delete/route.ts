import { NextRequest, NextResponse } from "next/server";
import { deleteFiles, ownUrl } from "@/lib/pdf/storage";
import { BUCKETS, rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";

/** POST { url } removes a result right away, so people can clear their file before the time limit. */
export async function POST(req: NextRequest) {
  const limited = await rateLimit(req, BUCKETS.pdfUpload);
  if (limited) return limited;
  let url = "";
  try {
    url = String((await req.json()).url ?? "");
  } catch {}
  if (!ownUrl(url, "out") && !ownUrl(url, "in")) return NextResponse.json({ error: "Not a valid file link." }, { status: 400 });
  await deleteFiles([url]);
  return NextResponse.json({ ok: true });
}
