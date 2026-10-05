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
    ],
    "/api/live/thumbnail": ["./public/live/infocus-wordmark-white.png", "./public/live/infocus-icon.png"],
    // Meeting link preview image (falls back to a text wordmark if the file is missing).
    "/meet-preview/**": ["./public/live/infocus-wordmark-white.png", "./public/live/infocus-icon.png"],
    "/api/package-cycle/package-of-cycle/certificate": [
      "./public/favicon/infocus-wordmark-light.png",
      "./public/live/infocus-icon.png"
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
  // Vercel deploys skip lint + type checking (~40s); .github/workflows/checks.yml runs both
  // on every push. Local `npm run build` still checks.
  eslint: { ignoreDuringBuilds: process.env.VERCEL === "1" },
  typescript: { ignoreBuildErrors: process.env.VERCEL === "1" },
  experimental: {
    optimizePackageImports: ["lucide-react"]
  }
};

export default nextConfig;
