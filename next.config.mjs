/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // WASM PDF renderer, loaded at runtime on the server
  serverExternalPackages: ["mupdf", "tesseract.js"],
  // OCR language files and engine are loaded from disk at runtime, so make sure they ship with the function
  outputFileTracingIncludes: {
    "/api/pdf/process": ["./node_modules/@tesseract.js-data/*/4.0.0_best_int/*.gz", "./node_modules/tesseract.js/**/*", "./node_modules/tesseract.js-core/**/*"],
  },
  // ArchiveVault now lives inside LinkDesk
  async redirects() {
    return [{ source: "/archive", destination: "/links#archive", permanent: true }];
  },
};

export default nextConfig;
