/**
 * The one content column for the public pages (/, /privacy, /support, /security, /workflow):
 * the same 80rem width as the app shell, with DESIGN.md §10 gutters (16px on phones, 24px from
 * 768px). The header row, the page and the footer row all use it, so their edges line up.
 */
export const PUBLIC_CONTAINER = "mx-auto w-full max-w-[80rem] px-4 md:px-6";

/** Which header nav item or footer link is the current page. */
export type MarketingActive =
  | "features"
  | "workflow"
  | "security"
  | "show-roles"
  | "equipment"
  | "master-calendar"
  | "package-cycles"
  | "package-progress"
  | "drive"
  | "home"
  | "privacy"
  | "support";

/**
 * The one inline-link style for reading text on the public pages (hero, info pages, callouts):
 * Green on Dark per DESIGN.md, always underlined so a link never differs by color alone.
 */
export const INLINE_LINK_CLASS =
  "font-medium text-[var(--brand-green)] underline underline-offset-4 hover:text-foreground";

/** Anchor targets clear the sticky 56px header (plus a little air). */
export const ANCHOR_OFFSET = "scroll-mt-20";
