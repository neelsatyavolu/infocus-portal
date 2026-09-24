"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { N3EL_ANALYTICS_SRC, shouldLoadN3elAnalytics } from "@/src/lib/n3el-analytics";

// Cookieless page-view counter (hostname, path, referrer). See README "Privacy & analytics".
export function N3elAnalytics() {
  const pathname = usePathname();
  if (!shouldLoadN3elAnalytics(pathname)) return null;
  return <Script src={N3EL_ANALYTICS_SRC} strategy="afterInteractive" />;
}
