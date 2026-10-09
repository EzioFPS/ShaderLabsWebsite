import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Separate dev output so `next dev` can run next to a production server.
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  poweredByHeader: false,
  // Mail compose uploads attachments through a server action (Netlify caps requests at ~6 MB).
  experimental: { serverActions: { bodySizeLimit: "5mb" } },
  async redirects() {
    return [{ source: "/products", destination: "/work", permanent: true }];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      {
        source: "/admin/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
};

export default nextConfig;
