import type { PlatformRole } from "@prisma/client";
import { pacificDateKey } from "@/src/lib/deadlines";
import { meetingsHomeUrl } from "@/src/lib/meetings/links";
import type { StageCommentUnread } from "@/src/lib/package-stage-comments";
import type { CycleStageStatus } from "@/src/lib/package-stage-status";

/**
 * Which sidebar links each person sees, grouped by job (docs/superpowers/plans/2026-10-14-portal-redesign.md).
 * Related pages share one link and a tab bar at the top of each page (a "hub", `buildHubTabs`).
 * This decides structure, order, the content column width (`isWideRoute`), the nav status
 * contract (GET /api/nav/status) and which signal each item shows (`buildNavSignals`).
 * components/shell/nav-items.ts maps each id to its icon and active state.
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
    { href: "/publishing-queue", label: "Publishing Queue", producersOnly: true }
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
  // Executives' /dashboard is the class Home; associates' is their packages; students' their own.
  const dashboard = item(
    "dashboard",
    "/dashboard",
    context.canManageGrades ? "Home" : context.isProducer ? "Packages" : "Dashboard"
  );

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
    // Class sits between Producing and Production (the mockup's order), so the two look-alike
    // headings never stack.
    section("Class", [
      item("announcements", "/announcements", "Announcements"),
      item("ideas", "/ideas", "Ideas"),
      item("managers", "/managers", "Managers")
    ]),
    // Livestreams is its own item for everyone; producers also get The Show (with Publishing Queue).
    section("Production", [
      context.isProducer && item("show", "/show-roles", "The Show"),
      item("livestreams", "/livestreams", "Livestream Tracker")
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

function pathSegments(pathname: string) {
  return pathname.split("/").filter(Boolean);
}

/** Pages that need the width: the sidebar folds to an icon rail on large screens. */
export function isRailRoute(pathname: string) {
  const segments = pathSegments(pathname);
  if (segments[0] === "projects") return segments.length >= 2;
  if (segments[0] === "groups") return segments.length >= 3;
  return false;
}

/** Workspaces and tools that use the whole main width instead of the standard content column. */
const WIDE_SECTIONS = new Set(["master-calendar", "grade-editor", "package-progress", "class-board", "teleprompter"]);

function isWideSection(segments: string[]) {
  const [first] = segments;
  if (!first) return false;
  if (first === "projects" || first === "groups") return segments.length >= 2;
  return WIDE_SECTIONS.has(first);
}

/** Every page of a hub that holds a wide page is wide too, so the hub's tab bar never jumps. */
const WIDE_HUB_PAGES: HubPage[] = Object.values(HUBS).flatMap((hub) =>
  hub.some((page) => isWideSection(pathSegments(page.href))) ? hub : []
);

/**
 * The shell's content column: standard pages sit in one centred column (`max-w-[80rem]`);
 * these routes use the full main width. Compared by path segment, never by string prefix.
 */
export function isWideRoute(pathname: string) {
  const segments = pathSegments(pathname);
  if (isWideSection(segments)) return true;
  const normalized = `/${segments.join("/")}`;
  return WIDE_HUB_PAGES.some((page) => pageMatches({ ...page, exact: false }, normalized));
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

/**
 * True on a page with the student stage bar. For producers, /extension-requests is their approval
 * queue, not a package page, so pass `includeExtensionRequests: false` for them.
 */
export function isPackageRoute(pathname: string, options: { includeExtensionRequests?: boolean } = {}) {
  const includeExtensionRequests = options.includeExtensionRequests ?? true;
  return PACKAGE_ROUTES.some(
    (route) =>
      (includeExtensionRequests || route !== "/extension-requests") &&
      (pathname === route || pathname.startsWith(`${route}/`))
  );
}

export type PackageStageSlug = "brainstorming" | "a-roll" | "initial-cut" | "final-cut";
export type PackageUnlocked = { "a-roll": boolean; "initial-cut": boolean; "final-cut": boolean };

export const PACKAGE_STAGE_LABELS: Record<PackageStageSlug, string> = {
  brainstorming: "Brainstorming",
  "a-roll": "A-roll/B-roll",
  "initial-cut": "Initial Cut",
  "final-cut": "Final Cut"
};

const PACKAGE_STAGE_ORDER: PackageStageSlug[] = ["brainstorming", "a-roll", "initial-cut", "final-cut"];

/** The stage the person is working on: the latest unlocked one, Brainstorming until A-roll/B-roll unlocks. */
export function currentPackageStage(unlocked: PackageUnlocked | null): PackageStageSlug {
  if (unlocked?.["final-cut"]) return "final-cut";
  if (unlocked?.["initial-cut"]) return "initial-cut";
  if (unlocked?.["a-roll"]) return "a-roll";
  return "brainstorming";
}

/** The latest unlocked stage; Brainstorming until A-roll/B-roll unlocks. */
export function myPackageHref(unlocked: PackageUnlocked | null) {
  return `/${currentPackageStage(unlocked)}`;
}

// ---------------------------------------------------------------------------------------------
// Sidebar statuses: the one nav status payload (GET /api/nav/status) and the signals drawn from it.
// ---------------------------------------------------------------------------------------------

export const NAV_STATUS_PARTS = [
  "package",
  "extensions",
  "groups",
  "meetings",
  "people",
  "livestreams",
  "grades",
  "admin"
] as const;
export type NavStatusPart = (typeof NAV_STATUS_PARTS)[number];

export type NavPackageStatus = {
  /** On a package roster for the person's current cycle. */
  hasRow: boolean;
  cycleNumber: number | null;
  /** The two cycles a student held on the previous one may switch between (studentCycleChoice). */
  cycleChoices?: number[] | null;
  unlocked: PackageUnlocked;
  statuses: Record<PackageStageSlug, CycleStageStatus> | null;
  unread: StageCommentUnread | null;
  remainingExecutiveSignoffs: number | null;
  currentStage: PackageStageSlug | null;
  /** When the current stage closes (ISO), only while it still owes work. */
  dueAt: string | null;
  /** When each stage closes (ISO, extension days counted); for the sidebar's This cycle list. */
  dueDates?: Partial<Record<PackageStageSlug, string | null>> | null;
};

export type NavStatus = {
  package: NavPackageStatus | null;
  extensionRequestsAwaiting: number | null;
  groupsNeedYou: number | null;
  liveMeetings: number | null;
  participationApprovals: number | null;
  livestreamSignups: number | null;
  latestGradePublishedAt: string | null;
  accessRequests: number | null;
};

export type NavStatusResponse = NavStatus & {
  parts: NavStatusPart[];
  /** Parts that failed to load; the client keeps what it had for them. */
  failed: NavStatusPart[];
};

/** The response field each part fills. */
export const NAV_STATUS_FIELD: Record<NavStatusPart, keyof NavStatus> = {
  package: "package",
  extensions: "extensionRequestsAwaiting",
  groups: "groupsNeedYou",
  meetings: "liveMeetings",
  people: "participationApprovals",
  livestreams: "livestreamSignups",
  grades: "latestGradePublishedAt",
  admin: "accessRequests"
};

export const EMPTY_NAV_STATUS: NavStatus = {
  package: null,
  extensionRequestsAwaiting: null,
  groupsNeedYou: null,
  liveMeetings: null,
  participationApprovals: null,
  livestreamSignups: null,
  latestGradePublishedAt: null,
  accessRequests: null
};

/** How long each part stays fresh before a route change or tab focus refetches it. */
export const NAV_STATUS_FRESH_MS: Record<NavStatusPart, number> = {
  package: 15_000,
  extensions: 15_000,
  groups: 60_000,
  meetings: 60_000,
  people: 60_000,
  livestreams: 60_000,
  admin: 60_000,
  grades: 5 * 60_000
};

/**
 * Other screens dispatch this (detail: { parts }) after a change the sidebar counts, e.g. a
 * participation approval: `window.dispatchEvent(new CustomEvent(NAV_STATUS_CHANGED_EVENT, { detail: { parts: ["people"] } }))`.
 */
export const NAV_STATUS_CHANGED_EVENT = "infocus-nav-status-changed";

export function requestNavStatusRefresh(parts: NavStatusPart[]) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(NAV_STATUS_CHANGED_EVENT, { detail: { parts } }));
}

/**
 * Change events other pages already dispatch, by their exact names, so the shell listens without
 * importing page modules (tests/sidebar-nav.test.ts keeps them equal to the pages' constants):
 * Participation after saving or deciding a request, Admin with `detail.pending` after an access
 * request is approved or denied.
 */
export const PAGE_STATUS_EVENTS = {
  participation: "infocus-participation-requests-changed",
  accessRequests: "infocus-access-requests-changed"
} as const;

/** The parts the package stage bar and the My package link wait on. */
export const STAGE_BAR_PARTS: readonly NavStatusPart[] = ["package", "extensions"];

/**
 * One status refresh as separate requests: the stage bar's parts on their own, so the stage
 * bar's locks and statuses never wait on the sidebar's other counts, and the rest beside them.
 * Empty groups are dropped; each group keeps the canonical part order.
 */
export function navStatusRequestGroups(parts: NavStatusPart[]): NavStatusPart[][] {
  const stageBar = parts.filter((part) => STAGE_BAR_PARTS.includes(part));
  const rest = parts.filter((part) => !STAGE_BAR_PARTS.includes(part));
  return [stageBar, rest].filter((group) => group.length > 0);
}

/** Only the parts this role can see, so the endpoint never loads what the sidebar won't show. */
export function navStatusPartsFor(role: PlatformRole | null): NavStatusPart[] {
  const producer = role !== null;
  const executive = role === "EXECUTIVE_PRODUCER" || role === "ADVISER" || role === "SUPER_ADMIN";
  return NAV_STATUS_PARTS.filter((part) => {
    if (part === "groups" || part === "admin") return executive;
    if (part === "meetings" || part === "people") return producer;
    if (part === "grades") return !executive;
    return true;
  });
}

/** "Due today" / "Due tomorrow" / "Due Thu" within 72 hours, by the Pacific calendar day. */
const DUE_SOON_MS = 72 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const pacificWeekday = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", weekday: "short" });

function dayNumber(dateKey: string) {
  return Math.round(Date.parse(`${dateKey}T00:00:00.000Z`) / DAY_MS);
}

export function formatDueTag(dueAt: string | null, now: Date) {
  const due = dueAt ? new Date(dueAt) : null;
  if (!due || Number.isNaN(due.getTime())) return null;
  const remaining = due.getTime() - now.getTime();
  if (remaining < 0 || remaining > DUE_SOON_MS) return null;
  const days = dayNumber(pacificDateKey(due)) - dayNumber(pacificDateKey(now));
  if (days <= 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `Due ${pacificWeekday.format(due)}`;
}

export type NavTag = { label: string; tone: "danger" | "warning" | "live" };

export type PackageStatusLine = {
  stage: PackageStageSlug;
  stageLabel: string;
  tag: NavTag;
  /** Screen-reader words. */
  description: string;
};

/**
 * The My package second line, only when there is something to act on: revisions first, then an
 * extension request waiting on the student, then the current stage closing within 72 hours.
 */
export function packageStatusLine(
  pkg: NavPackageStatus | null,
  options: { extensionRequestsAwaiting: number; showExtensionRequests: boolean; now: Date }
): PackageStatusLine | null {
  if (!pkg?.hasRow) return null;
  const current = pkg.currentStage ?? currentPackageStage(pkg.unlocked);
  const reachable = PACKAGE_STAGE_ORDER.slice(0, PACKAGE_STAGE_ORDER.indexOf(current) + 1).reverse();
  const revising = reachable.find((stage) => pkg.statuses?.[stage] === "needs-revisions");
  if (revising) {
    return {
      stage: revising,
      stageLabel: PACKAGE_STAGE_LABELS[revising],
      tag: { label: "Revisions", tone: "danger" },
      description: `${PACKAGE_STAGE_LABELS[revising]}: revisions requested`
    };
  }
  const stageLabel = PACKAGE_STAGE_LABELS[current];
  if (options.showExtensionRequests && options.extensionRequestsAwaiting > 0) {
    return {
      stage: current,
      stageLabel,
      tag: { label: "Extension", tone: "warning" },
      description: "An extension request needs your answer"
    };
  }
  const status = pkg.statuses?.[current];
  const due = status === "pending" ? formatDueTag(pkg.dueAt, options.now) : null;
  if (due) {
    return { stage: current, stageLabel, tag: { label: due, tone: "warning" }, description: `${stageLabel} ${due.toLowerCase()}` };
  }
  return null;
}

export type CycleCardTone = "success" | "warning" | "danger" | "review" | "neutral";

/** The sidebar's "This cycle" card: where the person's package stands, at a glance. */
export type CycleCard = {
  cycleNumber: number | null;
  /** Set when the person may switch the cycle their tabs show. */
  cycleChoices: number[] | null;
  href: string;
  stageLabel: string;
  /** One cell per package stage, in order. */
  segments: Array<"done" | "current" | "later">;
  doneCount: number;
  tag: { label: string; tone: CycleCardTone };
  /** Each stage with where it stands: its result, or when it is due. */
  stages: CycleCardStage[];
};

export type CycleCardStage = {
  slug: PackageStageSlug;
  label: string;
  state: "done" | "current" | "later" | "revisions";
  /** "Approved", "Submitted", "Due Thu", "Due Oct 28"… */
  detail: string | null;
  tone: CycleCardTone;
  /** Null while the stage is still locked. */
  href: string | null;
};

const pacificMonthDay = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  month: "short",
  day: "numeric"
});

/** "Due Thu" within 72 hours, else "Due Oct 28"; null without a date or once it has passed. */
function stageDueLabel(dueAt: string | null | undefined, now: Date) {
  if (!dueAt) return null;
  const soon = formatDueTag(dueAt, now);
  if (soon) return soon;
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime()) || due.getTime() < now.getTime()) return null;
  return `Due ${pacificMonthDay.format(due)}`;
}

const CYCLE_CARD_STATUS: Partial<Record<CycleStageStatus, { label: string; tone: CycleCardTone }>> = {
  approved: { label: "Approved", tone: "success" },
  "stage-1-approved": { label: "Stage 1 approved", tone: "success" },
  queued: { label: "Queued", tone: "review" },
  submitted: { label: "Submitted", tone: "warning" },
  "needs-revisions": { label: "Revisions", tone: "danger" },
  "stage-2": { label: "Stage 2", tone: "review" },
  "stage-3": { label: "Stage 3", tone: "review" }
};

const STAGE_DONE: ReadonlySet<CycleStageStatus> = new Set(["approved", "queued"]);

/**
 * The card for anyone on a package roster this cycle (null otherwise): the four stages as a
 * strip, the stage being worked on, and one tag. Revisions come first, then "Due …" within 72
 * hours, then the stage's own status, then "In progress".
 */
export function buildCycleCard(pkg: NavPackageStatus | null, now: Date): CycleCard | null {
  if (!pkg?.hasRow) return null;
  const current = pkg.currentStage ?? currentPackageStage(pkg.unlocked);
  const currentIndex = PACKAGE_STAGE_ORDER.indexOf(current);
  const statusOf = (stage: PackageStageSlug) => pkg.statuses?.[stage];
  const segments = PACKAGE_STAGE_ORDER.map((stage, index) => {
    const status = statusOf(stage);
    if (status && STAGE_DONE.has(status)) return "done" as const;
    if (index === currentIndex) return "current" as const;
    return index < currentIndex ? ("done" as const) : ("later" as const);
  });
  const revising = PACKAGE_STAGE_ORDER.slice(0, currentIndex + 1)
    .reverse()
    .find((stage) => statusOf(stage) === "needs-revisions");
  const stage = revising ?? current;
  const status = statusOf(stage);
  const due = !revising && status === "pending" ? formatDueTag(pkg.dueAt, now) : null;
  const tag = revising
    ? { label: "Revisions", tone: "danger" as const }
    : due
      ? { label: due, tone: "warning" as const }
      : ((status && CYCLE_CARD_STATUS[status]) ?? { label: "In progress", tone: "neutral" as const });
  const stages: CycleCardStage[] = PACKAGE_STAGE_ORDER.map((slug, index) => {
    const stageStatus = statusOf(slug);
    const unlocked = slug === "brainstorming" || Boolean(pkg.unlocked?.[slug as keyof PackageUnlocked]);
    const known = stageStatus ? CYCLE_CARD_STATUS[stageStatus] : undefined;
    const dueLabel = stageDueLabel(pkg.dueDates?.[slug] ?? (slug === current ? pkg.dueAt : null), now);
    const state: CycleCardStage["state"] =
      stageStatus === "needs-revisions"
        ? "revisions"
        : segments[index] === "done"
          ? "done"
          : index === currentIndex
            ? "current"
            : "later";
    const pendingDetail = dueLabel ?? (index === currentIndex ? "In progress" : null);
    const detail = stageStatus && stageStatus !== "pending" && stageStatus !== "locked" && known ? known.label : pendingDetail;
    const tone: CycleCardTone =
      stageStatus && stageStatus !== "pending" && stageStatus !== "locked" && known
        ? known.tone
        : index === currentIndex && dueLabel && formatDueTag(pkg.dueDates?.[slug] ?? pkg.dueAt, now)
          ? "warning"
          : "neutral";
    return { slug, label: PACKAGE_STAGE_LABELS[slug], state, detail, tone, href: unlocked ? `/${slug}` : null };
  });
  return {
    cycleNumber: pkg.cycleNumber,
    cycleChoices: pkg.cycleChoices ?? null,
    href: `/${stage}`,
    stageLabel: PACKAGE_STAGE_LABELS[stage],
    segments,
    doneCount: segments.filter((segment) => segment === "done").length,
    tag,
    stages
  };
}

export type NavSignal = {
  /** Mono count in the status slot (unread, waiting on you). */
  count?: number;
  /** The count in words, when `label` says more than the count (My package). */
  countLabel?: string;
  /** A tag in the status slot (LIVE). */
  tag?: NavTag;
  /** A "something new" dot when there is no count or tag. */
  dot?: boolean;
  /** My package's second line. */
  line?: PackageStatusLine;
  /** The signal in words, for screen readers and the rail tooltip. */
  label: string;
  /** Rail and phone tab dot: Record Red only for something live, Green on Dark otherwise. */
  dotTone: "new" | "live";
};

export type NavSignals = Partial<Record<SidebarNavItemId, NavSignal>>;

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

function countSignal(count: number | null | undefined, label: (count: number) => string): NavSignal | null {
  return count && count > 0 ? { count, label: label(count), dotTone: "new" } : null;
}

/** Total unread feedback over the four stages. */
export function packageUnreadTotal(unread: StageCommentUnread | null | undefined) {
  if (!unread) return 0;
  return PACKAGE_STAGE_ORDER.reduce((total, stage) => total + (unread[stage] ?? 0), 0);
}

/**
 * One calm signal per sidebar item where something needs the person or changed. Items with
 * nothing to say are left out.
 */
export function buildNavSignals(
  status: NavStatus,
  options: { gradesSeenAt: number | null; now: Date; showExtensionRequests: boolean }
): NavSignals {
  const signals: NavSignals = {};
  const unread = packageUnreadTotal(status.package?.unread);
  const line = packageStatusLine(status.package, {
    extensionRequestsAwaiting: status.extensionRequestsAwaiting ?? 0,
    showExtensionRequests: options.showExtensionRequests,
    now: options.now
  });
  if (unread > 0 || line) {
    const words = [unread > 0 ? plural(unread, "unread comment", "unread comments") : null, line?.description ?? null];
    signals["my-package"] = {
      count: unread > 0 ? unread : undefined,
      countLabel: words[0] ?? undefined,
      line: line ?? undefined,
      label: words.filter(Boolean).join(" · "),
      dotTone: "new"
    };
  }

  const groups = countSignal(status.groupsNeedYou, (count) => `${plural(count, "group needs", "groups need")} you`);
  if (groups) signals.groups = groups;

  if (!options.showExtensionRequests) {
    const requests = countSignal(status.extensionRequestsAwaiting, (count) =>
      `${plural(count, "extension request", "extension requests")} waiting on you`
    );
    if (requests) signals["extension-requests"] = requests;
  }

  if (status.liveMeetings && status.liveMeetings > 0) {
    signals.meetings = {
      tag: { label: "Live", tone: "live" },
      label: status.liveMeetings === 1 ? "A meeting is live now" : `${status.liveMeetings} meetings are live now`,
      dotTone: "live"
    };
  }

  const people = countSignal(status.participationApprovals, (count) =>
    `${plural(count, "participation change", "participation changes")} waiting for approval`
  );
  if (people) signals.people = people;

  const signups = countSignal(status.livestreamSignups, (count) =>
    `${plural(count, "livestream sign-up request", "livestream sign-up requests")} waiting`
  );
  if (signups) signals.livestreams = signups;

  const latestGrade = status.latestGradePublishedAt ? Date.parse(status.latestGradePublishedAt) : NaN;
  if (Number.isFinite(latestGrade) && options.gradesSeenAt !== null && latestGrade > options.gradesSeenAt) {
    signals.grades = { dot: true, label: "New grades released", dotTone: "new" };
  }

  const access = countSignal(status.accessRequests, (count) =>
    `${plural(count, "access request", "access requests")} waiting`
  );
  if (access) signals.admin = access;

  return signals;
}

/** Signals for items that are not in the phone tab bar, so More can show a dot. */
export function moreTabSignal(signals: NavSignals, tabIds: SidebarNavItemId[], visibleIds: SidebarNavItemId[]) {
  const shown = new Set(tabIds);
  const visible = new Set(visibleIds);
  const hidden = (Object.keys(signals) as SidebarNavItemId[]).filter((id) => visible.has(id) && !shown.has(id));
  return {
    count: hidden.length,
    live: hidden.some((id) => signals[id]?.dotTone === "live")
  };
}

/** Counts for hub tabs (Participation), keyed by tab href. */
export function hubTabCounts(status: NavStatus): Record<string, { count: number; label: string }> {
  const counts: Record<string, { count: number; label: string }> = {};
  if (status.participationApprovals && status.participationApprovals > 0) {
    counts["/participation"] = {
      count: status.participationApprovals,
      label: `${plural(status.participationApprovals, "change", "changes")} waiting for approval`
    };
  }
  return counts;
}
