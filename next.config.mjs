/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { remotePatterns: [{ protocol: "https", hostname: "**" }] },
  // Agent runs can take a while; allow longer server actions / route handlers.
  experimental: { serverActions: { bodySizeLimit: "2mb" } },
};
export default nextConfig;
