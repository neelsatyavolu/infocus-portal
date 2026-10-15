"use client";

import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { N3EL_ANALYTICS_SRC, shouldLoadN3elAnalytics } from "@/src/lib/n3el-analytics";

// Vercel sets this at build time. Its analytics scripts only exist on Vercel, so skip them on any other host.
const ON_VERCEL = Boolean(process.env.NEXT_PUBLIC_VERCEL_ENV);

declare global {
  interface Window {
    n3elAnalyticsShouldTrack?: () => boolean;
  }
}

// Cookieless page-view counter (hostname, path, referrer) plus Vercel Analytics and Speed Insights.
// See README "Privacy & analytics". All three are skipped on pages with secrets (shouldLoadN3elAnalytics).
function subscribeNever() {
  return () => undefined;
}

export function N3elAnalytics() {
  const pathname = usePathname();
  // The host is only known in the browser; nothing loads until it is (the Meetings host never loads any).
  const hostname = useSyncExternalStore<string | null>(
    subscribeNever,
    () => window.location.hostname,
    () => null
  );
  useEffect(() => {
    // The script's navigation hooks survive unmounts; check the current URL on every send.
    window.n3elAnalyticsShouldTrack = () => shouldLoadN3elAnalytics(window.location.pathname, window.location.hostname);
  }, []);
  if (hostname === null || !shouldLoadN3elAnalytics(pathname, hostname)) return null;
  return (
    <>
      {ON_VERCEL ? <Analytics /> : null}
      {ON_VERCEL ? <SpeedInsights /> : null}
      <Script src={N3EL_ANALYTICS_SRC} strategy="afterInteractive" />
    </>
  );
}
