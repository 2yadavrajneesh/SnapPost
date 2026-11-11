import { NextRequest, NextResponse } from "next/server";
import { cleanName, readLocal, storageMode, type Kind } from "@/lib/pdf/storage";

export const runtime = "nodejs";

/** Serves stored files when PDF_STORAGE=local. On Vercel the links point straight at Vercel Blob instead. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  if (storageMode() !== "local") return NextResponse.json({ error: "Not found." }, { status: 404 });
  const [kind, id, name] = (await ctx.params).path;
  if ((kind !== "in" && kind !== "out") || !id || !name) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const bytes = await readLocal(kind as Kind, id, name);
  if (!bytes) return NextResponse.json({ error: "That file has expired." }, { status: 404 });
  const file = cleanName(decodeURIComponent(name));
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": file.endsWith(".pdf") ? "application/pdf" : "application/octet-stream",
      "Content-Disposition": `attachment; filename="${file}"`,
      "Cache-Control": "no-store",
    },
  });
}
