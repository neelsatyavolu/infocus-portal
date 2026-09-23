import { ASSISTANT_PLACES } from "@/src/lib/assistant-places";

const PORTAL_NAME = "InFocus Portal";

function titleCase(segment: string) {
  return segment
    .split("-")
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Title for /sign-in when a protected link redirects there. Link previews
 * (iMessage, Slack) fetch signed out, so this is the title they show.
 * Uses only the first path segment so IDs never leak into the preview.
 */
export function signInPageTitle(returnTo?: string | null) {
  const value = (returnTo ?? "").trim();
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/api/")) {
    return PORTAL_NAME;
  }

  const segment = value.slice(1).split(/[/?#]/)[0].toLowerCase();
  if (!segment || !/^[a-z0-9-]+$/.test(segment) || segment === "sign-in") {
    return PORTAL_NAME;
  }

  const place = ASSISTANT_PLACES.find((entry) => !entry.external && entry.href === `/${segment}`);
  const label = place?.label ?? titleCase(segment);
  return label ? `${label} · ${PORTAL_NAME}` : PORTAL_NAME;
}
