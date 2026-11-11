/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // ArchiveVault now lives inside LinkDesk
  async redirects() {
    return [{ source: "/archive", destination: "/links#archive", permanent: true }];
  },
};

export default nextConfig;
