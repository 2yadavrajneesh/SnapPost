/**
 * Largest video the site will hand out as a download. Override with NEXT_PUBLIC_MAX_VIDEO_MB
 * (read by both the server route and the picker UI so they always agree).
 */
const mb = Number(process.env.NEXT_PUBLIC_MAX_VIDEO_MB);
export const MAX_VIDEO_MB = Number.isFinite(mb) && mb > 0 ? mb : 100;
export const MAX_VIDEO_BYTES = MAX_VIDEO_MB * 1024 * 1024;
