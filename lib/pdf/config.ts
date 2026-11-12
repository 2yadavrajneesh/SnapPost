/** Limits for PaperNest, kept small so the free hosting plan is enough. */
export const PDF_LIMITS = {
  maxFileBytes: 150 * 1024 * 1024,
  maxFiles: 20,
  maxTotalBytes: 300 * 1024 * 1024,
  /** Uploaded files and results are deleted after this long. */
  ttlMinutes: 30,
};

export const mb = (n: number) => `${(n / 1048576).toFixed(n >= 10485760 ? 0 : 1)} MB`;
