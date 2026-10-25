/**
 * Host / subdomain helpers for multi-app routing. The Portal answers on two domains:
 * infocusportal.com (canonical once APP_BASE_URL points there) and infocuspaly.com (the original,
 * kept for installed apps and old links; see legacyPortalRedirect).
 *
 * - grades.<domain> → grades dashboard
 * - teleprompter.<domain> → teleprompter app
 * - equipment.<domain> → equipment app
 * - meet.<domain> → Meetings (/ = the Meetings tab, /producers = the series, /<id> = a call)
 * - <domain> (and www / previews) → main packages app
 */

export type AppSurface = "main" | "grades" | "teleprompter" | "equipment" | "meet";

/** Every domain the Portal answers on. The first is the default canonical one. */
export const PORTAL_DOMAINS = ["infocusportal.com", "infocuspaly.com"] as const;
export type PortalDomain = (typeof PORTAL_DOMAINS)[number];

/**
 * The domain built into the InFocus apps already on people's phones and Macs. They treat any other
 * host as an outside site, so links pushed to them stay on this domain (toInstalledAppUrl).
 */
export const INSTALLED_APP_PORTAL_DOMAIN: PortalDomain = "infocuspaly.com";

export function normalizeHost(hostHeader?: string | null): string {
  return (hostHeader ?? "").split(":")[0]?.trim().toLowerCase() ?? "";
}

/** The Portal domain a host is on (`meet.infocuspaly.com` → `infocuspaly.com`), or null. */
export function portalDomainOf(hostHeader?: string | null): PortalDomain | null {
  const host = normalizeHost(hostHeader);
  return PORTAL_DOMAINS.find((domain) => host === domain || host.endsWith(`.${domain}`)) ?? null;
}

/** The domain links and emails use: APP_BASE_URL's (NEXT_PUBLIC_APP_URL in the browser). */
export function canonicalPortalDomain(): PortalDomain {
  const configured = process.env.APP_BASE_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim() || "";
  try {
    return portalDomainOf(new URL(configured).hostname) ?? PORTAL_DOMAINS[0];
  } catch {
    return PORTAL_DOMAINS[0];
  }
}

export function resolveAppSurface(hostHeader?: string | null): AppSurface {
  const host = normalizeHost(hostHeader);

  if (host.startsWith("grades.")) {
    return "grades";
  }

  if (host.startsWith("teleprompter.")) {
    return "teleprompter";
  }

  if (host.startsWith("equipment.")) {
    return "equipment";
  }

  if (host.startsWith("meet.")) {
    return "meet";
  }

  return "main";
}

/** Shared cookie Domain for the request's Portal domain (`.infocusportal.com` or `.infocuspaly.com`). */
export function resolveSessionCookieDomain(hostHeader?: string | null): string | undefined {
  const host = normalizeHost(hostHeader);
  if (!host) {
    // Fall back to env for non-request contexts
    if (process.env.SESSION_COOKIE_DOMAIN?.trim()) {
      return process.env.SESSION_COOKIE_DOMAIN.trim();
    }
    if (process.env.NODE_ENV === "production" || process.env.VERCEL === "1") {
      return `.${canonicalPortalDomain()}`;
    }
    return undefined;
  }

  const domain = portalDomainOf(host);
  if (domain) {
    return `.${domain}`;
  }

  // Local / preview: host-only cookie (no Domain attribute)
  return undefined;
}

function canonicalOrigin(subdomain?: string) {
  return `https://${subdomain ? `${subdomain}.` : ""}${canonicalPortalDomain()}`;
}

export function gradesAppOrigin() {
  return process.env.GRADES_APP_URL?.trim() || canonicalOrigin("grades");
}

export function teleprompterAppOrigin() {
  return process.env.TELEPROMPTER_APP_URL?.trim() || canonicalOrigin("teleprompter");
}

export function equipmentAppOrigin() {
  return process.env.EQUIPMENT_APP_URL?.trim() || canonicalOrigin("equipment");
}

export function mainAppOrigin() {
  return process.env.APP_BASE_URL?.trim() || canonicalOrigin();
}

/**
 * The Meetings host. Server env MEET_APP_URL; NEXT_PUBLIC_MEET_APP_URL is the browser's copy
 * (only NEXT_PUBLIC_ values reach client code). Unset: the production host.
 */
export function meetAppOrigin() {
  return (
    process.env.MEET_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_MEET_APP_URL?.trim() ||
    canonicalOrigin("meet")
  ).replace(/\/+$/, "");
}

/**
 * The main host on the request's own Portal domain, for sign-in and redirects: cookies are per
 * domain, so a request on infocuspaly.com (an installed app) must stay there. Elsewhere: mainAppOrigin().
 */
export function mainOriginForHost(hostHeader?: string | null) {
  const domain = portalDomainOf(hostHeader);
  return domain ? `https://${domain}` : mainAppOrigin();
}

/** The Meetings host on the request's own Portal domain (see mainOriginForHost). */
export function meetOriginForHost(hostHeader?: string | null) {
  const domain = portalDomainOf(hostHeader);
  return domain ? `https://meet.${domain}` : meetAppOrigin();
}

/**
 * A browser page on the other Portal domain → the same page on the canonical one (308), or null.
 * GET/HEAD pages only: API calls, assets and /.well-known keep working on both domains. The caller
 * skips the iPhone app, the Mac app and kiosks, which stay on the domain they were set up on.
 */
export function legacyPortalRedirect(hostHeader: string | null | undefined, method: string, pathname: string, search: string) {
  const host = normalizeHost(hostHeader);
  const domain = portalDomainOf(host);
  const canonical = canonicalPortalDomain();
  if (!domain || domain === canonical) return null;
  if (method !== "GET" && method !== "HEAD") return null;
  if (pathname.startsWith("/api/") || pathname.startsWith("/_next") || pathname.startsWith("/.well-known/")) return null;
  // Drive's notes taker opens this page on the origin Drive pins (src/server/meetings-scribe.ts).
  if (pathname === "/meet-scribe") return null;
  return `https://${host.slice(0, host.length - domain.length)}${canonical}${pathname}${search}`;
}

/** A Portal URL as the installed apps know it: same page, on INSTALLED_APP_PORTAL_DOMAIN. Others unchanged. */
export function toInstalledAppUrl(url: string) {
  try {
    const parsed = new URL(url);
    const domain = portalDomainOf(parsed.hostname);
    if (!domain || domain === INSTALLED_APP_PORTAL_DOMAIN) return url;
    parsed.hostname = `${parsed.hostname.slice(0, parsed.hostname.length - domain.length)}${INSTALLED_APP_PORTAL_DOMAIN}`;
    return parsed.toString();
  } catch {
    return url;
  }
}

/** Host prefixes the Portal Worker serves on every Portal domain (wrangler.jsonc routes). */
const PORTAL_SUBDOMAINS = ["", "www.", "meet.", "grades.", "equipment.", "teleprompter."];

/**
 * A link to the other Portal domain, moved onto `currentHost`'s domain (same subdomain and page);
 * null when it needs no change. Pages on infocuspaly.com (the installed apps, kiosks) keep their
 * clicks there: the apps open any other domain in Safari, without their sign-in.
 */
export function linkOnCurrentPortalDomain(href: string, currentHost: string) {
  const current = portalDomainOf(currentHost);
  if (!current) return null;
  try {
    const url = new URL(href);
    const domain = portalDomainOf(url.hostname);
    if (!domain || domain === current) return null;
    const subdomain = url.hostname.slice(0, url.hostname.length - domain.length);
    // Only the Portal's own hosts exist on both domains (Drive, for one, does not).
    if (!PORTAL_SUBDOMAINS.includes(subdomain)) return null;
    url.hostname = `${subdomain}${current}`;
    return url.toString();
  } catch {
    return null;
  }
}
