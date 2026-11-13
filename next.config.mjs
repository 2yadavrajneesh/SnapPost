/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // WASM PDF renderer, loaded at runtime on the server
  serverExternalPackages: ["mupdf", "@pdf-lib/fontkit"],
  // fonts are read from disk at runtime, so make sure they ship with the function
  outputFileTracingIncludes: {
    "/api/pdf/process": [
      "./node_modules/@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff",
      "./node_modules/@fontsource/noto-sans/files/noto-sans-latin-700-normal.woff",
      "./node_modules/@fontsource/noto-sans-devanagari/files/noto-sans-devanagari-devanagari-400-normal.woff",
      "./node_modules/@fontsource/noto-sans-devanagari/files/noto-sans-devanagari-devanagari-700-normal.woff",
    ],
  },
  // ArchiveVault now lives inside LinkDesk
  async redirects() {
    return [
      { source: "/archive", destination: "/links#archive", permanent: true },
      // PaperNest was removed: its two kept tools became their own apps
      { source: "/pdf/news-pdf", destination: "/clipbook", permanent: false },
      { source: "/pdf/edit-pdf", destination: "/editpdf", permanent: false },
      { source: "/pdf/:path*", destination: "/", permanent: false },
      { source: "/pdf", destination: "/", permanent: false },
    ];
  },
};

export default nextConfig;
