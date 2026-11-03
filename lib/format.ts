const compactFmt = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

export function compact(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return compactFmt.format(n);
}

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Short relative time used in quoted-post headers: 12s, 5m, 16h, then "Nov 2" or "Nov 2, 2025". */
export function relativeTime(ts: number | null): string {
  if (!ts) return "";
  const seconds = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const d = new Date(ts);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("en-US", sameYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" });
}

/** Routes remote images through our proxy so canvas export isn't blocked by CORS. */
export function proxied(src: string | null | undefined): string {
  if (!src) return "";
  if (src.startsWith("data:") || src.startsWith("blob:") || src.startsWith("/")) return src;
  return `/api/image-proxy?url=${encodeURIComponent(src)}`;
}
