import type { NextConfig } from "next";

import { ROLE_PLAY_PRODUCTION_ORIGIN } from "./src/lib/role-plays/base-url";

const serverActionAllowedOrigins = ["institute.bmhgroupkc.com"];
if (process.env.NODE_ENV === "development") {
  serverActionAllowedOrigins.push("localhost:3100");
}

// The "Talk with Andrea" role-play block embeds an iframe served from Closer
// Lab (a different origin) and needs getUserMedia() camera access inside it.
// Permissions-Policy camera=() is an empty allowlist that disables camera for
// the top-level document AND every nested iframe, unconditionally overriding
// the iframe's own `allow="camera"` attribute. Name the Closer Lab origin
// explicitly here instead of opening camera to arbitrary embeds. This reuses
// the same production-origin constant the role-play token/base-url logic
// trusts, so the two can never drift apart.
const rolePlayEmbedOrigins = [ROLE_PLAY_PRODUCTION_ORIGIN];
if (process.env.NODE_ENV === "development") {
  rolePlayEmbedOrigins.push("http://localhost:3200", "http://127.0.0.1:3200");
}
const permissionsPolicy = [
  `camera=(self ${rolePlayEmbedOrigins.map((origin) => `"${origin}"`).join(" ")})`,
  "geolocation=()",
  "payment=()",
  "usb=()",
].join(", ");

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
          { key: "Permissions-Policy", value: permissionsPolicy },
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
