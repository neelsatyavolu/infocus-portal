/**
 * Admin's four views and how a link (#hash), the remembered view or a Google sign-in return
 * picks one. Pure, so it can be tested without a browser.
 */
export const ADMIN_VIEWS = ["overview", "people", "school-year", "system"] as const;

export type AdminView = (typeof ADMIN_VIEWS)[number];

/** Remembered per browser through the kit's useRememberedState storage (infocus:ui: prefix). */
export const VIEW_STORAGE_KEY = "admin:view:v1";

/**
 * Every id a link can point at, and the view it lives in. View ids and the old section ids
 * (from the single-scroll page) both still work.
 */
const TARGET_VIEW = new Map<string, AdminView>(Object.entries({
  overview: "overview",
  "access-requests": "overview",
  people: "people",
  "producer-team": "people",
  "school-year": "school-year",
  "package-cycles": "school-year",
  configuration: "school-year",
  system: "system",
  integrations: "system",
  backups: "system",
  "danger-zone": "system"
} satisfies Record<string, AdminView>));

export function isAdminView(value: unknown): value is AdminView {
  return typeof value === "string" && (ADMIN_VIEWS as readonly string[]).includes(value);
}

function hashId(hash: string) {
  try {
    return decodeURIComponent(hash.replace(/^#/, "")).trim();
  } catch {
    return "";
  }
}

/** The view and the element to scroll to (an element id on the page), or null to stay put. */
export type ViewTarget = { view: AdminView; section: string | null };

/**
 * "#backups" or "backups" → System, scrolled to #backups. A view id ("#people") opens the view
 * without scrolling, so a reload keeps the header in sight. Null for an unknown id or a view this
 * person can't open.
 */
export function resolveTarget(hash: string, canSystem: boolean): ViewTarget | null {
  const id = hashId(hash);
  const view = TARGET_VIEW.get(id);
  if (!view || (view === "system" && !canSystem)) return null;
  return { view, section: isAdminView(id) ? null : id };
}

/**
 * Which view opens first: a Google sign-in return always opens System (Integrations), then the
 * link's #hash, then the view remembered from last time, then Overview.
 */
export function resolveInitialView({
  hash,
  stored,
  canSystem,
  oauthReturn
}: {
  hash: string;
  stored: unknown;
  canSystem: boolean;
  oauthReturn: boolean;
}): ViewTarget {
  if (oauthReturn && canSystem) return { view: "system", section: "integrations" };
  const fromHash = resolveTarget(hash, canSystem);
  if (fromHash) return fromHash;
  if (isAdminView(stored) && (stored !== "system" || canSystem)) return { view: stored, section: null };
  return { view: "overview", section: null };
}

export type OAuthResult = { ok: boolean; message: string };

export type OAuthReturn = {
  youtube: OAuthResult | null;
  googleCalendar: OAuthResult | null;
  /** The query string without the sign-in result params (no leading "?"). */
  search: string;
};

/**
 * Google's round trips land back on /admin with ?youtube=connected|error&youtubeMessage=… or
 * ?gcal=connected|error&gcalMessage=… (src/server/youtube-credential.ts, google-calendar-credential.ts).
 */
export function parseOAuthReturn(search: string): OAuthReturn {
  const params = new URLSearchParams(search);
  const youtubeOutcome = params.get("youtube");
  const calendarOutcome = params.get("gcal");

  const youtube = youtubeOutcome
    ? youtubeOutcome === "connected"
      ? { ok: true, message: "YouTube is connected. Uploads resume on the next check." }
      : { ok: false, message: params.get("youtubeMessage") || "Couldn't connect YouTube. Try again." }
    : null;
  const googleCalendar = calendarOutcome
    ? calendarOutcome === "connected"
      ? { ok: true, message: "Google Calendar is connected. Meeting invites will sync shortly." }
      : { ok: false, message: params.get("gcalMessage") || "Couldn't connect Google Calendar. Try again." }
    : null;

  ["youtube", "youtubeMessage", "gcal", "gcalMessage"].forEach((key) => params.delete(key));
  return { youtube, googleCalendar, search: params.toString() };
}
