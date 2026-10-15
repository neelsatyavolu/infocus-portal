import { meetingsHomeUrl } from "@/src/lib/meetings/links";

/**
 * Which sidebar links each person sees, grouped by job (docs/superpowers/plans/2026-10-14-portal-redesign.md).
 * AppShell maps each id to its icon, badge and active state; this only decides structure and order.
 */
export type SidebarNavItemId =
  | "dashboard"
  | "grades"
  | "my-package"
  | "master-calendar"
  | "extension-requests"
  | "groups"
  | "package-progress"
  | "members"
  | "participation"
  | "meetings"
  | "grade-editor"
  | "show-roles"
  | "publishing-queue"
  | "livestreams"
  | "announcements"
  | "announcements-submitted"
  | "announcements-pa"
  | "ideas"
  | "managers"
  | "package-cycles"
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
  /** null: the unlabeled top group. "footer": pinned below the scrolling list. */
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
      item("master-calendar", "/master-calendar", "Master Calendar")
    ]),
    context.isProducer &&
      section("Producing", [
        item("groups", "/groups", "Groups"),
        item("package-progress", "/package-progress", "Package Cycle"),
        item("members", "/members", "Members"),
        item("participation", "/participation", "Participation"),
        item("meetings", meetingsHomeUrl(), "Meetings", { external: true }),
        item("extension-requests", "/extension-requests", "Extension Requests"),
        context.canManageGrades && item("grade-editor", "/grade-editor", "Grade Editor")
      ]),
    section("Production", [
      context.isProducer && item("show-roles", "/show-roles", "The Show"),
      context.isProducer && item("publishing-queue", "/publishing-queue", "Publishing Queue"),
      item("livestreams", "/livestreams", "Livestream Tracker")
    ]),
    section("Class", [
      item("announcements", "/announcements", "Announcements"),
      item("announcements-submitted", "/announcements/submitted", "Submitted"),
      item("announcements-pa", "/announcements/pa", "PA"),
      item("ideas", "/ideas", "Ideas"),
      item("managers", "/managers", "Managers"),
      item("package-cycles", "/package-cycles", "Cycle Dates")
    ]),
    section("Tools", [
      item("drive", "https://drive.infocuspaly.com", "InFocus Drive", { external: true, newTab: true }),
      item("teleprompter", "https://teleprompter.infocuspaly.com", "Teleprompter", { external: true })
    ]),
    section("footer", [context.canManageAdmin && item("admin", "/admin", "Admin Dashboard"), settings])
  ];

  return sections.filter((entry): entry is SidebarNavSection => Boolean(entry));
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
