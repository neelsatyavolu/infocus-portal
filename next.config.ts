import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  typedRoutes: true,
  outputFileTracingRoot: path.join(__dirname),
  outputFileTracingIncludes: {
    "/api/assistant/chat": [
      "./docs/knowledge/**/*",
      "./docs/class-rules-2026-27.md",
      "./docs/NAS-STORAGE.md",
      "./docs/SUBDOMAINS.md"
    ]
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "*.b-cdn.net" },
      // NAS posters/signed downloads from InFocus Drive
      { protocol: "https", hostname: "drive.infocuspaly.com" },
      { protocol: "http", hostname: "drive.infocuspaly.com" }
    ]
  },
  experimental: {
    optimizePackageImports: ["lucide-react"]
  }
};

export default nextConfig;
