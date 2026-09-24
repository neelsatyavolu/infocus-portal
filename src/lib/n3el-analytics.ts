export const N3EL_ANALYTICS_SRC = "https://analytics.n3el.dev/p.js";

// Guest review links (/g/<token>) carry a secret token in the path; never report them.
export function shouldLoadN3elAnalytics(pathname: string | null) {
  return !pathname?.startsWith("/g/");
}
