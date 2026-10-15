import { meetingsHomeUrl } from "@/src/lib/meetings/links";

/**
 * Which sidebar links each person sees, grouped by job (docs/superpowers/plans/2026-10-14-portal-redesign.md).
 * Related pages share one link and a tab bar at the top of each page (a "hub", `buildHubTabs`).
 * AppShell maps each id to its icon, badge and active state; this only decides structure and order.
 */
export type SidebarNavItemId =
  | "dashboard"
  | "my-package"
  | "grades"
  | "calendar"
  | "groups"
  | "package-progress"
  | "people"
  | "meetings"
  | "extension-requests"
  | "grade-editor"
  | "show"
  | "livestreams"
  | "announcements"
  | "ideas"
  | "managers"
  | "drive"
  | "teleprompter"
  | "admin"
  | "settings";

export type SidebarNavItem = {
  id: SidebarNavItemId;
  href: string;
  label: string;
  /** Leaves the Portal app (another host or app). */
  external?: boolean;
  newTab?: boolean;
};

export type SidebarNavSection = {
  /** null: the unlabeled top group. "footer": pinned at the end of the list. */
  label: string | null;
  items: SidebarNavItem[];
};

export type SidebarNavContext = {
  /** ASSOCIATE_PRODUCER and up. */
  isProducer: boolean;
  /** Students, and producers on the current cycle's roster (`showCycleTabs` in AppShell). */
  showCycleTabs: boolean;
  /** EXECUTIVE_PRODUCER and up: Grade Editor replaces the student Grades page. */
  canManageGrades: boolean;
  /** EXECUTIVE_PRODUCER and up. */
  canManageAdmin: boolean;
  /** Apple App Review account. */
  sampleOnly: boolean;
  /** Where My package opens: the stage the person is working on (`myPackageHref`). */
  myPackageHref: string;
};

export type HubTab = {
  href: string;
  label: string;
  active: boolean;
};

type HubPage = {
  href: string;
  label: string;
  producersOnly?: boolean;
  /** Match the path exactly (its sub-pages are other tabs). */
  exact?: boolean;
};

const HUBS: Record<"show" | "people" | "calendar" | "announcements", HubPage[]> = {
  show: [
    { href: "/show-roles", label: "The Show", producersOnly: true },
    { href: "/publishing-queue", label: "Publishing Queue", producersOnly: true },
    { href: "/livestreams", label: "Livestreams" }
  ],
  people: [
    { href: "/members", label: "Members", producersOnly: true },
    { href: "/participation", label: "Participation", producersOnly: true }
  ],
  calendar: [
    { href: "/master-calendar", label: "Master Calendar" },
    { href: "/package-cycles", label: "Cycle Dates" }
  ],
  announcements: [
    { href: "/announcements", label: "Announcements", exact: true },
    { href: "/announcements/submitted", label: "Submitted" },
    { href: "/announcements/pa", label: "PA" }
  ]
};

function pageMatches(page: HubPage, pathname: string) {
  return page.exact ? pathname === page.href : pathname === page.href || pathname.startsWith(`${page.href}/`);
}

function visibleHubPages(context: SidebarNavContext, hub: HubPage[]) {
  return hub.filter((page) => !page.producersOnly || context.isProducer);
}

/** The tab bar for the hub this page belongs to, or null when there is none or only one tab to show. */
export function buildHubTabs(context: SidebarNavContext, pathname: string): HubTab[] | null {
  if (context.sampleOnly) return null;
  for (const hub of Object.values(HUBS)) {
    const pages = visibleHubPages(context, hub);
    if (pages.length < 2 || !pages.some((page) => pageMatches(page, pathname))) continue;
    return pages.map((page) => ({ href: page.href, label: page.label, active: pageMatches(page, pathname) }));
  }
  return null;
}

/** True when the path is any page of the hub (the sidebar link stays lit on every tab). */
export function isInHub(hub: keyof typeof HUBS, pathname: string) {
  return HUBS[hub].some((page) => pageMatches(page, pathname));
}

function item(id: SidebarNavItemId, href: string, label: string, extra: Partial<SidebarNavItem> = {}): SidebarNavItem {
  return { id, href, label, ...extra };
}

function section(label: string | null, items: Array<SidebarNavItem | false>): SidebarNavSection | null {
  const visible = items.filter((entry): entry is SidebarNavItem => entry !== false);
  return visible.length > 0 ? { label, items: visible } : null;
}

const settings = item("settings", "/settings", "Settings");

export function buildSidebarNav(context: SidebarNavContext): SidebarNavSection[] {
  const dashboard = item("dashboard", "/dashboard", context.isProducer ? "Packages" : "Dashboard");

  if (context.sampleOnly) {
    return [
      { label: null, items: [dashboard] },
      { label: "footer", items: [settings] }
    ];
  }

  const sections = [
    section(null, [
      dashboard,
      // The stage pages, the cycle guide and (for students) Extension Requests sit in the
      // stage bar at the top of every package page (PackageStageNav).
      context.showCycleTabs && item("my-package", context.myPackageHref, "My package"),
      !context.canManageGrades && item("grades", "/grades", "Grades"),
      item("calendar", "/master-calendar", "Calendar")
    ]),
    context.isProducer &&
      section("Producing", [
        item("groups", "/groups", "Groups"),
        item("package-progress", "/package-progress", "Package Cycle"),
        item("people", "/members", "People"),
        item("meetings", meetingsHomeUrl(), "Meetings", { external: true }),
        item("extension-requests", "/extension-requests", "Extension Requests"),
        context.canManageGrades && item("grade-editor", "/grade-editor", "Grade Editor")
      ]),
    section("Production", [
      context.isProducer
        ? item("show", "/show-roles", "The Show")
        : item("livestreams", "/livestreams", "Livestream Tracker")
    ]),
    section("Class", [
      item("announcements", "/announcements", "Announcements"),
      item("ideas", "/ideas", "Ideas"),
      item("managers", "/managers", "Managers")
    ]),
    section("Tools", [
      item("drive", "https://drive.infocuspaly.com", "InFocus Drive", { external: true, newTab: true }),
      item("teleprompter", "https://teleprompter.infocuspaly.com", "Teleprompter", { external: true })
    ]),
    section("footer", [context.canManageAdmin && item("admin", "/admin", "Admin Dashboard"), settings])
  ];

  return sections.filter((entry): entry is SidebarNavSection => Boolean(entry));
}

const PHONE_TAB_ORDER: SidebarNavItemId[] = ["dashboard", "my-package", "groups", "show", "calendar", "grades"];

/**
 * The phone tab bar (below 1024px): the first four of the person's own sidebar links in
 * PHONE_TAB_ORDER; everything else is one tap away under More (the sidebar drawer).
 */
export function buildPhoneTabs(context: SidebarNavContext): SidebarNavItem[] {
  if (context.sampleOnly) return [];
  const items = buildSidebarNav(context).flatMap((navSection) => navSection.items);
  return PHONE_TAB_ORDER.flatMap((id) => items.filter((navItem) => navItem.id === id)).slice(0, 4);
}

/** Pages that need the width: the sidebar folds to an icon rail on large screens. */
export function isRailRoute(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] === "projects") return segments.length >= 2;
  if (segments[0] === "groups") return segments.length >= 3;
  return false;
}

/** The student package pages that share the stage bar. */
export const PACKAGE_ROUTES = [
  "/information",
  "/brainstorming",
  "/a-roll",
  "/initial-cut",
  "/final-cut",
  "/extension-requests"
] as const;

export function isPackageRoute(pathname: string) {
  return PACKAGE_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

/** The latest unlocked stage; Brainstorming until A-roll/B-roll unlocks. */
export function myPackageHref(
  unlocked: { "a-roll": boolean; "initial-cut": boolean; "final-cut": boolean } | null
) {
  if (unlocked?.["final-cut"]) return "/final-cut";
  if (unlocked?.["initial-cut"]) return "/initial-cut";
  if (unlocked?.["a-roll"]) return "/a-roll";
  return "/brainstorming";
}
