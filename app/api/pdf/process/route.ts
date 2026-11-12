import { NextRequest, NextResponse } from "next/server";
import { PDF_LIMITS } from "@/lib/pdf/config";
import { PROCESSORS, type Input } from "@/lib/pdf/processors";
import { cleanName, deleteFiles, ownUrl, readFile, saveFile, sweepOld } from "@/lib/pdf/storage";
import { toolById } from "@/lib/pdf/tools";
import { BUCKETS, rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const maxDuration = 300;

type Body = { tool?: string; files?: { url?: string; name?: string }[]; options?: Record<string, unknown> };

/**
 * POST { tool, files: [{ url, name }], options }
 * Reads the uploaded files, runs the tool on the server, stores the result and returns a download link.
 * The uploaded files are deleted as soon as the job finishes.
 */
export async function POST(req: NextRequest) {
  const limited = (await rateLimit(req, BUCKETS.pdfRun)) ?? (await rateLimit(req, BUCKETS.pdfDay));
  if (limited) return limited;
  let body: Body = {};
  try {
    body = await req.json();
  } catch {}
  const tool = toolById(body.tool ?? "");
  const run = tool && PROCESSORS[tool.id];
  const files = Array.isArray(body.files) ? body.files : [];
  if (!tool || !run) return NextResponse.json({ error: "Unknown tool." }, { status: 400 });
  if (files.length < tool.min || files.length > (tool.multiple ? Math.min(tool.max ?? 99, PDF_LIMITS.maxFiles) : 1)) {
    return NextResponse.json({ error: tool.multiple ? `Add ${tool.min === (tool.max ?? 0) ? tool.min : `${tool.min} to ${Math.min(tool.max ?? 99, PDF_LIMITS.maxFiles)}`} files.` : "Add one file." }, { status: 400 });
  }
  const urls = files.map((f) => String(f.url ?? ""));
  if (!urls.every((u) => ownUrl(u, "in"))) return NextResponse.json({ error: "Those files were not uploaded here." }, { status: 400 });

  try {
    const inputs: Input[] = [];
    let total = 0;
    for (let i = 0; i < urls.length; i++) {
      const bytes = await readFile(urls[i], "in", PDF_LIMITS.maxFileBytes);
      total += bytes.length;
      if (total > PDF_LIMITS.maxTotalBytes) throw new Error("The files add up to too much. Use fewer or smaller files.");
      inputs.push({ name: cleanName(String(files[i].name ?? ""), `file-${i + 1}`), bytes });
    }
    const out = await run({ inputs, options: body.options ?? {} });
    const { url } = await saveFile("out", out.name, out.bytes, out.type);
    void sweepOld();
    return NextResponse.json({ url, name: out.name, size: out.bytes.length, note: out.note, expiresAt: Date.now() + PDF_LIMITS.ttlMinutes * 60_000 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Something went wrong while processing the file." }, { status: 422 });
  } finally {
    await deleteFiles(urls);
  }
}
