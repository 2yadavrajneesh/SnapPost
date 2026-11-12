/** @type {import('next').NextConfig} */
// The OCR engine starts a worker thread from a file path, so Next cannot see its dependencies on its own.
// Every package it needs at runtime is listed here so it ships with the function.
const OCR_PACKAGES = ["tesseract.js", "tesseract.js-core", "bmp-js", "idb-keyval", "is-url", "node-fetch", "regenerator-runtime", "tr46", "wasm-feature-detect", "webidl-conversions", "whatwg-url", "zlibjs"];

const nextConfig = {
  reactStrictMode: true,
  // WASM PDF renderer, loaded at runtime on the server
  serverExternalPackages: ["mupdf", "tesseract.js", "@pdf-lib/fontkit"],
  // OCR language files and engine are loaded from disk at runtime, so make sure they ship with the function
  outputFileTracingIncludes: {
    "/api/pdf/process": [
      "./node_modules/@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff",
      "./node_modules/@fontsource/noto-sans/files/noto-sans-latin-700-normal.woff",
      "./node_modules/@fontsource/noto-sans-devanagari/files/noto-sans-devanagari-devanagari-400-normal.woff",
      "./node_modules/@fontsource/noto-sans-devanagari/files/noto-sans-devanagari-devanagari-700-normal.woff","./node_modules/@tesseract.js-data/*/4.0.0_best_int/*.gz", ...OCR_PACKAGES.map((p) => `./node_modules/${p}/**/*`)],
  },
  // ArchiveVault now lives inside LinkDesk
  async redirects() {
    return [{ source: "/archive", destination: "/links#archive", permanent: true }];
  },
};

export default nextConfig;
