import { NextRequest, NextResponse } from "next/server";
import { BUCKETS, rateLimit } from "@/lib/ratelimit";
import { normalizeWebUrl } from "@/lib/archive";

export const runtime = "nodejs";
export const maxDuration = 60;

// Overridable so tests can point at a stand-in server.
const AVAIL = process.env.WAYBACK_AVAILABLE_BASE ?? "https://archive.org";
const SAVE = process.env.WAYBACK_SAVE_BASE ?? "https://web.archive.org";

const UA = "ArchiveVault/1.0 (+https://github.com/2yadavrajneesh/SnapPost)";

type Snap = { url: string; timestamp: string } | null;

/** The newest Wayback snapshot of a page, if there is one. */
async function latestSnapshot(url: string): Promise<Snap> {
  const r = await fetch(`${AVAIL}/wayback/available?url=${encodeURIComponent(url)}`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(10000), cache: "no-store" });
  if (!r.ok) throw new Error(`lookup ${r.status}`);
  const j = await r.json();
  const c = j?.archived_snapshots?.closest;
  if (c?.available && typeof c.url === "string" && typeof c.timestamp === "string") {
    return { url: c.url.replace(/^http:\/\//, "https://"), timestamp: c.timestamp };
  }
  return null;
}

/** GET ?url=  ->  { snapshot } : is this page already in the Wayback Machine? */
export async function GET(req: NextRequest) {
  const limited = await rateLimit(req, BUCKETS.api);
  if (limited) return limited;
  const url = normalizeWebUrl(req.nextUrl.searchParams.get("url") ?? "");
  if (!url) return NextResponse.json({ error: "That doesn't look like a web address." }, { status: 400 });
  try {
    return NextResponse.json({ snapshot: await latestSnapshot(url) });
  } catch {
    return NextResponse.json({ error: "The Wayback Machine didn't answer. Try again in a moment." }, { status: 502 });
  }
}

/** POST { url }  ->  { snapshot } : asks the Wayback Machine to capture the page now (no account or key needed). */
export async function POST(req: NextRequest) {
  const limited = await rateLimit(req, BUCKETS.archive);
  if (limited) return limited;
  let body: { url?: string } = {};
  try {
    body = await req.json();
  } catch {}
  const url = normalizeWebUrl(body.url ?? "");
  if (!url) return NextResponse.json({ error: "That doesn't look like a web address." }, { status: 400 });

  try {
    const r = await fetch(`${SAVE}/save/${url}`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(55000), cache: "no-store", redirect: "follow" });
    if (r.status === 429) return NextResponse.json({ error: "The Wayback Machine is busy right now. Wait a minute and try again." }, { status: 429 });

    // A finished capture ends up at /web/<timestamp>/<page>; some replies only name it in a header.
    const found = [r.url, r.headers.get("content-location") ?? "", r.headers.get("link") ?? ""].map((v) => /\/web\/(\d{14})\//.exec(v)).find(Boolean);
    if (found) {
      return NextResponse.json({ snapshot: { url: `https://web.archive.org/web/${found[1]}/${url}`, timestamp: found[1] }, saved: true });
    }
    // The capture may still be finishing: look for the newest snapshot instead.
    const snap = r.ok ? await latestSnapshot(url).catch(() => null) : null;
    if (snap) return NextResponse.json({ snapshot: snap, saved: true });
    return NextResponse.json({ error: "The Wayback Machine couldn't save that page. Some sites block archiving. You can still try the other archives." }, { status: 502 });
  } catch (e) {
    const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    return NextResponse.json({ error: timeout ? "Saving took too long. The page may still be captured; check again in a minute." : "Couldn't reach the Wayback Machine." }, { status: 504 });
  }
}
