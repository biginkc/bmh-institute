import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: ["institute.bmhgroupkc.com", "localhost:3100"],
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
