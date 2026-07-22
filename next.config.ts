import type { NextConfig } from "next";

const serverActionAllowedOrigins = ["institute.bmhgroupkc.com"];
if (process.env.NODE_ENV === "development") {
  serverActionAllowedOrigins.push("localhost:3100");
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    serverActions: {
      allowedOrigins: serverActionAllowedOrigins,
      bodySizeLimit: "25mb",
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "base-uri 'self'; frame-ancestors 'none'; object-src 'none'",
          },
          { key: "Permissions-Policy", value: "camera=(), geolocation=(), payment=(), usb=()" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
        ],
      },
    ];
  },
};

export default nextConfig;
