/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // WASM PDF renderer, loaded at runtime on the server
  serverExternalPackages: ["mupdf"],
  // ArchiveVault now lives inside LinkDesk
  async redirects() {
    return [{ source: "/archive", destination: "/links#archive", permanent: true }];
  },
};

export default nextConfig;
