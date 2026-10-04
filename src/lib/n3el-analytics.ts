export const N3EL_ANALYTICS_SRC = "https://analytics.n3el.dev/p.js";

// Pages where no analytics (n3el, Vercel Analytics, Speed Insights) may load:
// guest review links (/g/<token>) carry a secret token in the path, and meeting pages
// (/meet/*, /meet-scribe) hold room tickets and the meeting key.
const NO_ANALYTICS_PATTERNS = [/^\/g\//, /^\/meet\//, /^\/meet-scribe(?:\/|$)/];

export function shouldLoadN3elAnalytics(pathname: string | null) {
  return !NO_ANALYTICS_PATTERNS.some((pattern) => pattern.test(pathname ?? ""));
}
