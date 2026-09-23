import type { PlatformRole } from "@prisma/client";
import { hasPlatformRole, normalizeEmail } from "@/src/lib/platform-admin";

/**
 * When true, signed-in users without a producer platform role are redirected
 * to /maintenance. Flip to false to reopen the portal for everyone.
 */
export const HUB_MAINTENANCE_MODE = false;

export const HUB_MAINTENANCE_ETA = "August 20th";

export const HUB_MAINTENANCE_TITLE = "The InFocus Portal is currently under maintenance.";

export const HUB_MAINTENANCE_BODY =
  "We are currently revamping the entire website to be more comprehensive, powerful, faster, and have a better user experience.";

/** Emails that may use the portal during maintenance without a producer role (env, comma-separated). */
const HUB_MAINTENANCE_EMAIL_BYPASS = new Set(
  (process.env.HUB_MAINTENANCE_BYPASS_EMAILS ?? "").split(",").map(normalizeEmail).filter(Boolean)
);

/** Producers (AP+) or explicit email allowlist. */
export function canBypassHubMaintenance(
  role: PlatformRole | null | undefined,
  email?: string | null
) {
  if (hasPlatformRole(role ?? null, "ASSOCIATE_PRODUCER")) {
    return true;
  }

  const normalized = normalizeEmail(email);
  return Boolean(normalized && HUB_MAINTENANCE_EMAIL_BYPASS.has(normalized));
}
