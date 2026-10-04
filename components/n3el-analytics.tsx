"use client";

import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { usePathname } from "next/navigation";
import { N3EL_ANALYTICS_SRC, shouldLoadN3elAnalytics } from "@/src/lib/n3el-analytics";

// Cookieless page-view counter (hostname, path, referrer) plus Vercel Analytics and Speed Insights.
// See README "Privacy & analytics". All three are skipped on pages with secrets (shouldLoadN3elAnalytics).
export function N3elAnalytics() {
  const pathname = usePathname();
  if (!shouldLoadN3elAnalytics(pathname)) return null;
  return (
    <>
      <Analytics />
      <SpeedInsights />
      <Script src={N3EL_ANALYTICS_SRC} strategy="afterInteractive" />
    </>
  );
}
