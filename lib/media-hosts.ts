/**
 * Which remote hosts the media proxies (/api/image-proxy and /api/video) may fetch from.
 * Kept strict so the proxies can't be used as an open relay.
 *
 * Self-hosters can add extra hosts (e.g. their own CDN) with MEDIA_PROXY_HOSTS="host1,host2:8080".
 */
const BASE_DOMAINS = ["twimg.com", "fxtwitter.com", "fixupx.com"];

export function isAllowedMediaUrl(u: URL): boolean {
  const extra = (process.env.MEDIA_PROXY_HOSTS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (extra.includes(u.host.toLowerCase()) && (u.protocol === "https:" || u.protocol === "http:")) return true;

  if (u.protocol !== "https:") return false;
  return BASE_DOMAINS.some((d) => u.hostname === d || u.hostname.endsWith(`.${d}`));
}
