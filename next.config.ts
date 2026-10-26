import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return ["/invite", "/guest/:path*", "/api/v1/guest/:path*", "/api/v1/access/:path*"].map(source => ({ source, headers: [{ key: "Referrer-Policy", value: "no-referrer" }, { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }, { key: "Cache-Control", value: "private, no-store" }] }));
  },
  poweredByHeader: false,
  turbopack: { root: process.cwd() },
};

export default nextConfig;
