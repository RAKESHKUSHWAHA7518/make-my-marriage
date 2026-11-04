import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return ["/gallery", "/shared-gallery", "/wedding/gallery/sharing", "/wedding/website/:path*", "/wedding/announcements/:path*", "/wedding/invitations/:path*", "/api/v1/weddings/:id/designs/:path*", "/w/:path*", "/api/public/weddings/:path*", "/invite", "/guest/:path*", "/api/v1/guest/:path*", "/api/v1/access/:path*"].map(source => ({ source, headers: [{ key: "Referrer-Policy", value: "no-referrer" }, { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }, { key: "Cache-Control", value: "private, no-store" }] }));
  },
  poweredByHeader: false,
  turbopack: { root: process.cwd() },
};

export default nextConfig;
