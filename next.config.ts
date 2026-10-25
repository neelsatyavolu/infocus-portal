import type { NextConfig } from "next";
import path from "node:path";

// Hosted builds (Vercel, the Cloudflare deploy workflow, Workers Builds) skip type checking (Next.js 16 builds no longer lint);
// .github/workflows/checks.yml runs both on every push. Local `npm run build` still checks.
const HOSTED_BUILD =
  process.env.VERCEL === "1" || process.env.WORKERS_CI === "1" || process.env.PORTAL_DEPLOY_BUILD === "1";

const nextConfig: NextConfig = {
  typedRoutes: true,
  outputFileTracingRoot: path.join(__dirname),
  outputFileTracingIncludes: {
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
      { protocol: "https", hostname: "drive.infocusportal.com" },
      { protocol: "https", hostname: "drive.infocuspaly.com" },
      { protocol: "http", hostname: "drive.infocuspaly.com" }
    ]
  },
  typescript: { ignoreBuildErrors: HOSTED_BUILD },
  // Commit the build came from, shown in call diagnostics.
  env: { NEXT_PUBLIC_BUILD_SHA: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.WORKERS_CI_COMMIT_SHA ?? process.env.GITHUB_SHA ?? "" },
  // Prisma on Cloudflare Workers (OpenNext patches these two packages; they must stay external).
  serverExternalPackages: ["@prisma/client", ".prisma/client"],
  webpack: (config, { isServer, nextRuntime, dev, webpack }) => {
    // Production server build: Next.js only shares a module group over 20 KB and caps how many
    // chunks a route may load, so the same src/server helpers were copied into hundreds of route
    // files. The Worker ships one bundle, so a smaller bundle means faster cold starts.
    if (isServer && nextRuntime === "nodejs" && !dev && config.optimization?.splitChunks) {
      config.optimization.splitChunks = {
        ...config.optimization.splitChunks,
        minSize: 0,
        maxInitialRequests: Infinity,
        maxAsyncRequests: Infinity
      };
    }
    // src/lib/prisma.ts reaches client bundles through shared libs; keep `pg` out of the browser.
    if (!isServer) {
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(
          /[\\/]src[\\/]lib[\\/]prisma-workers$/,
          path.join(__dirname, "src/lib/prisma-workers.browser.ts")
        )
      );
    }
    return config;
  },
  // `next dev` runs Turbopack, which ignores the webpack rule above: keep `pg` out of the browser.
  // Production builds use webpack (`next build --webpack`): Turbopack's Worker bundle came out
  // 24% larger.
  turbopack: {
    resolveAlias: {
      "@/src/lib/prisma-workers": { browser: "./src/lib/prisma-workers.browser.ts" }
    }
  },
  experimental: {
    optimizePackageImports: ["lucide-react"]
  }
};

export default nextConfig;
