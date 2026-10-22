import { describe, expect, it } from "vitest";
import { ACCESS_REQUESTS_CHANGED_EVENT } from "@/app/(app)/admin/admin-events";
import { PARTICIPATION_REQUESTS_CHANGED_EVENT } from "@/app/(app)/participation/participation-week";
import { isNavItemActive } from "@/components/shell/nav-items";
import { showsBreadcrumbTrail } from "@/components/shell/shell-breadcrumbs";
import { buildGenericBreadcrumbs, buildGroupsBreadcrumbs, buildProjectBreadcrumbs } from "@/src/lib/app-breadcrumbs";
import { deadlineClosesAt } from "@/src/lib/deadlines";
import {
  buildCycleCard,
  buildHubTabs,
  buildNavSignals,
  buildPhoneTabs,
  buildSidebarNav,
  currentPackageStage,
  EMPTY_NAV_STATUS,
  formatDueTag,
  hubTabCounts,
  isInHub,
  isPackageRoute,
  isRailRoute,
  isWideRoute,
  moreTabSignal,
  myPackageHref,
  navStatusPartsFor,
  navStatusRequestGroups,
  packageStatusLine,
  PAGE_STATUS_EVENTS,
  type NavPackageStatus,
  type NavStatus,
  type SidebarNavContext
} from "@/src/lib/sidebar-nav";

const student: SidebarNavContext = {
  isProducer: false,
  showCycleTabs: true,
  canManageGrades: false,
  canManageAdmin: false,
  sampleOnly: false,
  myPackageHref: "/initial-cut"
};

const associate: SidebarNavContext = { ...student, isProducer: true, showCycleTabs: false };
const executive: SidebarNavContext = { ...associate, canManageGrades: true, canManageAdmin: true };

function ids(context: SidebarNavContext) {
  return buildSidebarNav(context).map((section) => ({
    label: section.label,
    items: section.items.map((item) => item.id)
  }));
}

/** Every page reachable from the sidebar, directly or through a hub's tabs. */
function reachable(context: SidebarNavContext) {
  const hrefs = new Set<string>();
  for (const navSection of buildSidebarNav(context)) {
    for (const navItem of navSection.items) {
      hrefs.add(navItem.href);
      for (const tab of buildHubTabs(context, navItem.href) ?? []) hrefs.add(tab.href);
    }
  }
  return hrefs;
}

describe("buildSidebarNav", () => {
  it("gives a student a short sidebar grouped by job", () => {
    expect(ids(student)).toEqual([
      { label: null, items: ["dashboard", "my-package", "grades", "calendar"] },
      { label: "Class", items: ["announcements", "ideas", "managers"] },
      { label: "Production", items: ["livestreams"] },
      { label: "Tools", items: ["drive", "teleprompter"] },
      { label: "footer", items: ["settings"] }
    ]);
  });

  it("gives an associate producer the producing tools and no My package off a roster", () => {
    expect(ids(associate)).toEqual([
      { label: null, items: ["dashboard", "grades", "calendar"] },
      { label: "Producing", items: ["groups", "package-progress", "people", "meetings", "extension-requests"] },
      { label: "Class", items: ["announcements", "ideas", "managers"] },
      { label: "Production", items: ["show", "livestreams"] },
      { label: "Tools", items: ["drive", "teleprompter"] },
      { label: "footer", items: ["settings"] }
    ]);
  });

  it("shows My package to a producer on a roster", () => {
    expect(ids({ ...associate, showCycleTabs: true })[0].items).toEqual(["dashboard", "my-package", "grades", "calendar"]);
  });

  it("points My package at the stage the person is working on", () => {
    const myPackage = buildSidebarNav(student)[0].items.find((item) => item.id === "my-package");
    expect(myPackage?.href).toBe("/initial-cut");
  });

  it("gives executives the grade editor and admin instead of student grades", () => {
    const items = buildSidebarNav(executive).flatMap((navSection) => navSection.items.map((navItem) => navItem.id));
    expect(items).not.toContain("grades");
    expect(items).toContain("grade-editor");
    expect(buildSidebarNav(executive).at(-1)?.items.map((navItem) => navItem.id)).toEqual(["admin", "settings"]);
  });

  it("keeps every page the old sidebar linked, through a link or a hub tab", () => {
    const everyone = new Set([...reachable(student), ...reachable(executive)]);
    for (const href of [
      "/announcements",
      "/announcements/submitted",
      "/announcements/pa",
      "/dashboard",
      "/grades",
      "/master-calendar",
      "/package-cycles",
      "https://drive.infocuspaly.com",
      "https://teleprompter.infocuspaly.com",
      "/managers",
      "/ideas",
      "/initial-cut",
      "/extension-requests",
      "/livestreams",
      "/groups",
      "/members",
      "/package-progress",
      "/publishing-queue",
      "/grade-editor",
      "/show-roles",
      "/editing",
      "/participation",
      "/admin",
      "/settings"
    ]) {
      expect(everyone.has(href), href).toBe(true);
    }
  });

  it("limits the App Review account to Dashboard and Settings", () => {
    expect(ids({ ...student, sampleOnly: true })).toEqual([
      { label: null, items: ["dashboard"] },
      { label: "footer", items: ["settings"] }
    ]);
  });

  it("labels the dashboard Home for executives and Packages for associates", () => {
    const first = (context: SidebarNavContext) => buildSidebarNav(context)[0].items[0].label;
    expect(first(student)).toBe("Dashboard");
    expect(first(associate)).toBe("Packages");
    expect(first({ ...associate, canManageGrades: true, canManageAdmin: true })).toBe("Home");
  });
});

describe("buildHubTabs", () => {
  it("puts The Show, Editing and Publishing Queue together for producers; Livestreams has its own item", () => {
    expect(buildHubTabs(associate, "/publishing-queue/row1")?.map((tab) => tab.href)).toEqual([
      "/show-roles",
      "/editing",
      "/publishing-queue"
    ]);
    expect(buildHubTabs(associate, "/livestreams")).toBeNull();
  });

  it("gives Editing its own tab, between The Show and Publishing Queue, for producers only", () => {
    const tabs = buildHubTabs(associate, "/editing");
    expect(tabs?.map((tab) => tab.label)).toEqual(["The Show", "Editing", "Publishing Queue"]);
    expect(tabs?.find((tab) => tab.active)?.href).toBe("/editing");
    expect(buildHubTabs(executive, "/show-roles")?.map((tab) => tab.href)).toContain("/editing");
    expect(buildHubTabs(student, "/editing")).toBeNull();
    expect(reachable(student).has("/editing")).toBe(false);
    expect(reachable(associate).has("/editing")).toBe(true);
  });

  it("shows no tab bar where a person has only one page of a hub", () => {
    expect(buildHubTabs(student, "/livestreams")).toBeNull();
  });

  it("groups Members with Participation, and the calendars together", () => {
    expect(buildHubTabs(associate, "/participation")?.map((tab) => tab.label)).toEqual(["Members", "Participation"]);
    expect(buildHubTabs(student, "/package-cycles")?.map((tab) => tab.label)).toEqual(["Master Calendar", "Cycle Dates"]);
  });

  it("matches Announcements exactly so its sub-pages pick their own tab", () => {
    const tabs = buildHubTabs(student, "/announcements/pa");
    expect(tabs?.map((tab) => tab.href)).toEqual(["/announcements", "/announcements/submitted", "/announcements/pa"]);
    expect(tabs?.find((tab) => tab.active)?.href).toBe("/announcements/pa");
  });

  it("returns null outside any hub", () => {
    expect(buildHubTabs(associate, "/groups")).toBeNull();
  });
});

describe("isRailRoute", () => {
  it("folds the sidebar on project and group stage pages", () => {
    expect(isRailRoute("/projects/p1")).toBe(true);
    expect(isRailRoute("/projects/p1/review/m1")).toBe(true);
    expect(isRailRoute("/groups/row1/initial-cut")).toBe(true);
  });

  it("keeps the full sidebar everywhere else", () => {
    expect(isRailRoute("/groups")).toBe(false);
    expect(isRailRoute("/dashboard")).toBe(false);
    expect(isRailRoute("/initial-cut")).toBe(false);
  });
});

describe("isPackageRoute", () => {
  it("covers the five stage pages, the cycle guide and extension requests", () => {
    for (const path of ["/information", "/brainstorming", "/a-roll", "/initial-cut", "/final-cut", "/extension-requests"]) {
      expect(isPackageRoute(path), path).toBe(true);
    }
    expect(isPackageRoute("/groups")).toBe(false);
    expect(isPackageRoute("/dashboard")).toBe(false);
  });

  it("leaves out extension requests when asked (a producer's approval queue)", () => {
    const producer = { includeExtensionRequests: false };
    expect(isPackageRoute("/extension-requests", producer)).toBe(false);
    expect(isPackageRoute("/extension-requests/r1", producer)).toBe(false);
    expect(isPackageRoute("/initial-cut", producer)).toBe(true);
    expect(isPackageRoute("/information", producer)).toBe(true);
  });
});

describe("isNavItemActive", () => {
  const myPackage = buildSidebarNav(student)[0].items.find((navItem) => navItem.id === "my-package")!;
  const requests = buildSidebarNav(associate)
    .flatMap((navSection) => navSection.items)
    .find((navItem) => navItem.id === "extension-requests")!;

  it("lights My package on every package page for a student, Extension Requests included", () => {
    expect(isNavItemActive(myPackage, "/a-roll", false, false)).toBe(true);
    expect(isNavItemActive(myPackage, "/extension-requests", false, false)).toBe(true);
  });

  it("lights only Extension Requests on a producer's approval queue", () => {
    expect(isNavItemActive(myPackage, "/extension-requests", false, true)).toBe(false);
    expect(isNavItemActive(requests, "/extension-requests", false, true)).toBe(true);
    expect(isNavItemActive(myPackage, "/initial-cut", false, true)).toBe(true);
  });

  it("keeps a hub's link lit on every tab, and Meetings lit on the meet host's home", () => {
    const people = buildSidebarNav(associate).flatMap((navSection) => navSection.items).find((navItem) => navItem.id === "people")!;
    const meetings = buildSidebarNav(associate).flatMap((navSection) => navSection.items).find((navItem) => navItem.id === "meetings")!;
    expect(isNavItemActive(people, "/participation", false, true)).toBe(true);
    expect(isNavItemActive(people, "/editing", false, true)).toBe(false);
    expect(isNavItemActive(meetings, "/", true, true)).toBe(true);
    expect(isNavItemActive(meetings, "/", false, true)).toBe(false);
  });

  it("keeps The Show lit on Editing, as on the Publishing Queue", () => {
    const show = buildSidebarNav(associate).flatMap((navSection) => navSection.items).find((navItem) => navItem.id === "show")!;
    expect(show.href).toBe("/show-roles");
    for (const path of ["/show-roles", "/editing", "/publishing-queue", "/publishing-queue/row1"]) {
      expect(isNavItemActive(show, path, false, true), path).toBe(true);
    }
    expect(isNavItemActive(show, "/editing-other", false, true)).toBe(false);
    expect(isInHub("show", "/editing")).toBe(true);
  });
});

describe("myPackageHref", () => {
  it("opens the latest unlocked stage", () => {
    expect(myPackageHref(null)).toBe("/brainstorming");
    expect(myPackageHref({ "a-roll": true, "initial-cut": false, "final-cut": false })).toBe("/a-roll");
    expect(myPackageHref({ "a-roll": true, "initial-cut": true, "final-cut": true })).toBe("/final-cut");
  });
});

describe("buildPhoneTabs", () => {
  it("gives students Home, My package, Calendar and Grades", () => {
    expect(buildPhoneTabs(student).map((tab) => tab.id)).toEqual(["dashboard", "my-package", "calendar", "grades"]);
  });

  it("gives producers Packages, Groups, The Show and Calendar", () => {
    expect(buildPhoneTabs(associate).map((tab) => tab.id)).toEqual(["dashboard", "groups", "show", "calendar"]);
  });

  it("puts My package first for a producer on a roster", () => {
    expect(buildPhoneTabs({ ...associate, showCycleTabs: true }).map((tab) => tab.id)).toEqual([
      "dashboard",
      "my-package",
      "groups",
      "show"
    ]);
  });

  it("has no tab bar for the App Review account", () => {
    expect(buildPhoneTabs({ ...student, sampleOnly: true })).toEqual([]);
  });
});

describe("isWideRoute", () => {
  it("gives workspaces and tools the full width", () => {
    for (const path of [
      "/projects/p1",
      "/projects/p1/review/m1",
      "/groups/row1",
      "/groups/row1/initial-cut",
      "/master-calendar",
      "/master-calendar/2026-10",
      "/grade-editor",
      "/package-progress",
      "/class-board",
      "/teleprompter",
      "/teleprompter/run"
    ]) {
      expect(isWideRoute(path), path).toBe(true);
    }
  });

  it("keeps every tab of a hub that has a wide page wide, so the tab bar never jumps", () => {
    expect(isWideRoute("/package-cycles")).toBe(true);
  });

  it("keeps standard pages in the content column", () => {
    for (const path of [
      "/",
      "/groups",
      "/dashboard",
      "/initial-cut",
      "/brainstorming",
      "/members",
      "/participation",
      "/show-roles",
      "/editing",
      "/publishing-queue",
      "/livestreams",
      "/announcements",
      "/announcements/pa",
      "/settings",
      "/admin",
      "/grades",
      "/meetings"
    ]) {
      expect(isWideRoute(path), path).toBe(false);
    }
  });

  it("compares whole segments, not string prefixes", () => {
    expect(isWideRoute("/master-calendar-x")).toBe(false);
    expect(isWideRoute("/grade-editors")).toBe(false);
    expect(isWideRoute("/package-cycles-old")).toBe(false);
  });
});

describe("currentPackageStage", () => {
  it("matches My package's link", () => {
    expect(currentPackageStage(null)).toBe("brainstorming");
    expect(currentPackageStage({ "a-roll": true, "initial-cut": true, "final-cut": false })).toBe("initial-cut");
    expect(myPackageHref({ "a-roll": true, "initial-cut": true, "final-cut": false })).toBe("/initial-cut");
  });
});

describe("navStatusPartsFor", () => {
  it("asks only for what each role's sidebar shows", () => {
    expect(navStatusPartsFor(null)).toEqual(["package", "extensions", "livestreams", "grades"]);
    expect(navStatusPartsFor("ASSOCIATE_PRODUCER")).toEqual([
      "package",
      "extensions",
      "meetings",
      "people",
      "livestreams",
      "grades"
    ]);
    for (const role of ["EXECUTIVE_PRODUCER", "ADVISER", "SUPER_ADMIN"] as const) {
      expect(navStatusPartsFor(role), role).toEqual([
        "package",
        "extensions",
        "groups",
        "meetings",
        "people",
        "livestreams",
        "admin"
      ]);
    }
  });
});

// Initial Cut due Friday Oct 16, 2026: closes 11:59 PM Pacific (PDT) = 06:59:59.999Z Oct 17.
const dueFriday = deadlineClosesAt(new Date("2026-10-16T00:00:00.000Z")).toISOString();

describe("navStatusRequestGroups", () => {
  it("asks for the stage bar's parts on their own, beside the rest", () => {
    expect(navStatusRequestGroups(["package", "extensions", "groups", "meetings", "grades"])).toEqual([
      ["package", "extensions"],
      ["groups", "meetings", "grades"]
    ]);
  });

  it("drops empty groups", () => {
    expect(navStatusRequestGroups(["package"])).toEqual([["package"]]);
    expect(navStatusRequestGroups(["people", "admin"])).toEqual([["people", "admin"]]);
    expect(navStatusRequestGroups([])).toEqual([]);
  });
});

describe("formatDueTag", () => {
  it("names the Pacific day within 72 hours of the close", () => {
    expect(formatDueTag(dueFriday, new Date("2026-10-16T17:00:00.000Z"))).toBe("Due today");
    expect(formatDueTag(dueFriday, new Date("2026-10-15T17:00:00.000Z"))).toBe("Due tomorrow");
    expect(formatDueTag(dueFriday, new Date("2026-10-14T17:00:00.000Z"))).toBe("Due Fri");
  });

  it("uses the deadline time zone around 11:59 PM, not UTC or the browser's day", () => {
    // 11:59 PM Pacific on Thursday: still "tomorrow", though it is already Friday in UTC.
    expect(formatDueTag(dueFriday, new Date("2026-10-16T06:59:00.000Z"))).toBe("Due tomorrow");
    // Midnight Pacific: Friday has started.
    expect(formatDueTag(dueFriday, new Date("2026-10-16T07:00:00.000Z"))).toBe("Due today");
    // 11:59 PM Pacific on Friday: the last minute is still today.
    expect(formatDueTag(dueFriday, new Date("2026-10-17T06:59:00.000Z"))).toBe("Due today");
  });

  it("says nothing once closed, too far out, or without a date", () => {
    expect(formatDueTag(dueFriday, new Date("2026-10-17T07:00:00.000Z"))).toBeNull();
    expect(formatDueTag(dueFriday, new Date("2026-10-13T17:00:00.000Z"))).toBeNull();
    expect(formatDueTag(null, new Date("2026-10-16T17:00:00.000Z"))).toBeNull();
    expect(formatDueTag("not a date", new Date("2026-10-16T17:00:00.000Z"))).toBeNull();
  });
});

const noUnread = { brainstorming: 0, "a-roll": 0, "initial-cut": 0, "final-cut": 0 };

function packageStatus(overrides: Partial<NavPackageStatus> = {}): NavPackageStatus {
  return {
    hasRow: true,
    cycleNumber: 3,
    unlocked: { "a-roll": true, "initial-cut": true, "final-cut": false },
    statuses: { brainstorming: "approved", "a-roll": "approved", "initial-cut": "pending", "final-cut": "locked" },
    unread: noUnread,
    remainingExecutiveSignoffs: null,
    currentStage: "initial-cut",
    dueAt: dueFriday,
    ...overrides
  };
}

const thursdayNoon = new Date("2026-10-15T19:00:00.000Z");
const studentLine = { extensionRequestsAwaiting: 0, showExtensionRequests: true, now: thursdayNoon };

describe("packageStatusLine", () => {
  it("shows the stage and a due tag when the current stage still owes work soon", () => {
    expect(packageStatusLine(packageStatus(), studentLine)).toMatchObject({
      stage: "initial-cut",
      stageLabel: "Initial Cut",
      tag: { label: "Due tomorrow", tone: "warning" }
    });
  });

  it("puts revisions first, on whichever reachable stage asked for them", () => {
    const line = packageStatusLine(
      packageStatus({ statuses: { brainstorming: "approved", "a-roll": "needs-revisions", "initial-cut": "pending", "final-cut": "locked" } }),
      { ...studentLine, extensionRequestsAwaiting: 2 }
    );
    expect(line).toMatchObject({ stage: "a-roll", tag: { label: "Revisions", tone: "danger" } });
  });

  it("flags an extension request waiting on a student, but not on a producer", () => {
    expect(packageStatusLine(packageStatus(), { ...studentLine, extensionRequestsAwaiting: 1 })?.tag.label).toBe("Extension");
    expect(
      packageStatusLine(packageStatus(), { ...studentLine, extensionRequestsAwaiting: 1, showExtensionRequests: false })?.tag.label
    ).toBe("Due tomorrow");
  });

  it("stays quiet when there is nothing to act on", () => {
    const submitted = packageStatus({
      statuses: { brainstorming: "approved", "a-roll": "approved", "initial-cut": "submitted", "final-cut": "locked" }
    });
    expect(packageStatusLine(submitted, studentLine)).toBeNull();
    expect(packageStatusLine(packageStatus({ dueAt: null }), studentLine)).toBeNull();
    expect(packageStatusLine(packageStatus({ hasRow: false }), studentLine)).toBeNull();
    expect(packageStatusLine(null, studentLine)).toBeNull();
  });
});

function navStatus(overrides: Partial<NavStatus> = {}): NavStatus {
  return { ...EMPTY_NAV_STATUS, ...overrides };
}

describe("buildNavSignals", () => {
  const options = { gradesSeenAt: Date.parse("2026-10-10T00:00:00.000Z"), now: thursdayNoon, showExtensionRequests: true };

  it("has nothing to say when nothing happened", () => {
    expect(buildNavSignals(navStatus({ package: packageStatus({ dueAt: null }) }), options)).toEqual({});
  });

  it("counts unread feedback on My package and adds the stage line", () => {
    const signals = buildNavSignals(
      navStatus({ package: packageStatus({ unread: { ...noUnread, "a-roll": 1, "initial-cut": 2 } }) }),
      options
    );
    expect(signals["my-package"]).toMatchObject({
      count: 3,
      countLabel: "3 unread comments",
      line: { tag: { label: "Due tomorrow" } },
      dotTone: "new"
    });
    expect(signals["my-package"]?.label).toBe("3 unread comments · Initial Cut due tomorrow");
  });

  it("counts what waits on producers and marks a live meeting", () => {
    const signals = buildNavSignals(
      navStatus({
        groupsNeedYou: 2,
        extensionRequestsAwaiting: 1,
        liveMeetings: 1,
        participationApprovals: 4,
        livestreamSignups: 3,
        accessRequests: 5
      }),
      { ...options, showExtensionRequests: false }
    );
    expect(signals.groups).toMatchObject({ count: 2, label: "2 groups need you" });
    expect(signals["extension-requests"]).toMatchObject({ count: 1, label: "1 extension request waiting on you" });
    expect(signals.meetings).toMatchObject({ tag: { label: "Live", tone: "live" }, dotTone: "live" });
    expect(signals.people?.count).toBe(4);
    expect(signals.show).toBeUndefined();
    expect(signals.livestreams?.count).toBe(3);
    expect(signals.admin).toMatchObject({ count: 5, label: "5 access requests waiting" });
  });

  it("leaves Extension Requests to the stage bar for students", () => {
    expect(buildNavSignals(navStatus({ extensionRequestsAwaiting: 2 }), options)["extension-requests"]).toBeUndefined();
  });

  it("shows a new-grades dot only for grades published after the last visit", () => {
    expect(buildNavSignals(navStatus({ latestGradePublishedAt: "2026-10-12T00:00:00.000Z" }), options).grades).toMatchObject({
      dot: true,
      label: "New grades released"
    });
    expect(buildNavSignals(navStatus({ latestGradePublishedAt: "2026-10-01T00:00:00.000Z" }), options).grades).toBeUndefined();
    expect(
      buildNavSignals(navStatus({ latestGradePublishedAt: "2026-10-12T00:00:00.000Z" }), { ...options, gradesSeenAt: null }).grades
    ).toBeUndefined();
  });
});

describe("moreTabSignal", () => {
  it("counts signals on items the person can see that are not in the tab bar", () => {
    const signals = buildNavSignals(navStatus({ groupsNeedYou: 1, liveMeetings: 1, livestreamSignups: 2 }), {
      gradesSeenAt: null,
      now: thursdayNoon,
      showExtensionRequests: false
    });
    // Producers have The Show in the tab bar and no Livestream Tracker item.
    expect(moreTabSignal(signals, ["dashboard", "groups", "show", "calendar"], ["dashboard", "groups", "show", "calendar", "meetings"])).toEqual({
      count: 1,
      live: true
    });
    expect(moreTabSignal({}, ["dashboard"], ["dashboard"])).toEqual({ count: 0, live: false });
  });
});

describe("hubTabCounts", () => {
  it("puts waiting counts on the Participation and Livestreams tabs", () => {
    expect(hubTabCounts(navStatus({ participationApprovals: 2, livestreamSignups: 0 }))).toEqual({
      "/participation": { count: 2, label: "2 changes waiting for approval" }
    });
  });
});

describe("PAGE_STATUS_EVENTS", () => {
  it("uses the exact event names the Participation and Admin pages dispatch", () => {
    expect(PAGE_STATUS_EVENTS.participation).toBe(PARTICIPATION_REQUESTS_CHANGED_EVENT);
    expect(PAGE_STATUS_EVENTS.accessRequests).toBe(ACCESS_REQUESTS_CHANGED_EVENT);
  });
});

describe("shell breadcrumbs", () => {
  const folders = [
    { id: "f1", name: "Interviews" },
    { id: "f2", name: "Interviews/Sage" }
  ];

  it("builds a project asset page trail with the open folder's path, its last segment unlinked", () => {
    expect(
      buildProjectBreadcrumbs({
        projectId: "p1",
        mediaId: null,
        workspace: { id: "w1", name: "Class" },
        projectName: "Cycle 3",
        folders,
        currentAsset: null,
        currentFolderName: "Interviews/Sage"
      })
    ).toEqual([
      { label: "Class", href: "/dashboard?workspaceId=w1" },
      { label: "Cycle 3", href: "/projects/p1" },
      { label: "Assets", href: "/projects/p1" },
      { label: "Interviews", href: "/projects/p1?scope=active&folderId=f1" },
      { label: "Sage" }
    ]);
  });

  it("shows a trail only with two or more crumbs (one would repeat the page title)", () => {
    expect(showsBreadcrumbTrail(buildGenericBreadcrumbs(["dashboard"]))).toBe(false);
    expect(showsBreadcrumbTrail(buildGroupsBreadcrumbs(["groups"]) ?? [])).toBe(false);
    expect(showsBreadcrumbTrail(buildGroupsBreadcrumbs(["groups", "row1"], "Robotics") ?? [])).toBe(true);
    expect(showsBreadcrumbTrail(buildGenericBreadcrumbs(["announcements", "pa"]))).toBe(true);
  });

  it("builds a review trail through the asset's folders to the asset", () => {
    const crumbs = buildProjectBreadcrumbs({
      projectId: "p1",
      mediaId: "m1",
      workspace: null,
      projectName: null,
      folders,
      currentAsset: { title: "Robotics A-roll", folderName: "Interviews/Sage" },
      currentFolderName: null
    });
    expect(crumbs).toEqual([
      { label: "Workspace", href: "/dashboard" },
      { label: "Project", href: "/projects/p1" },
      { label: "Interviews", href: "/projects/p1?scope=active&folderId=f1" },
      { label: "Sage", href: "/projects/p1?scope=active&folderId=f2" },
      { label: "Robotics A-roll", href: "/projects/p1/review/m1" }
    ]);
  });
});

describe("buildCycleCard", () => {
  it("lists each stage with its result or due date, and links only unlocked stages", () => {
    const card = buildCycleCard(
      packageStatus({
        dueDates: {
          brainstorming: "2026-09-20T06:59:00.000Z",
          "a-roll": "2026-10-02T06:59:00.000Z",
          "initial-cut": dueFriday,
          "final-cut": "2026-10-29T06:59:00.000Z"
        }
      }),
      thursdayNoon
    );
    expect(card?.stages).toEqual([
      { slug: "brainstorming", label: "Brainstorming", state: "done", detail: "Approved", tone: "success", href: "/brainstorming" },
      { slug: "a-roll", label: "A-roll/B-roll", state: "done", detail: "Approved", tone: "success", href: "/a-roll" },
      { slug: "initial-cut", label: "Initial Cut", state: "current", detail: "Due tomorrow", tone: "warning", href: "/initial-cut" },
      { slug: "final-cut", label: "Final Cut", state: "later", detail: "Due Oct 28", tone: "neutral", href: null }
    ]);
  });

  it("marks a stage sent back for revisions", () => {
    const card = buildCycleCard(
      packageStatus({ statuses: { brainstorming: "approved", "a-roll": "needs-revisions", "initial-cut": "pending", "final-cut": "locked" } }),
      thursdayNoon
    );
    expect(card?.stages[1]).toMatchObject({ state: "revisions", detail: "Revisions", tone: "danger" });
  });

  it("shows the four stages, the current stage and its due tag", () => {
    expect(buildCycleCard(packageStatus(), thursdayNoon)).toMatchObject({
      cycleNumber: 3,
      href: "/initial-cut",
      stageLabel: "Initial Cut",
      segments: ["done", "done", "current", "later"],
      doneCount: 2,
      tag: { label: "Due tomorrow", tone: "warning" }
    });
  });

  it("points at the stage that asked for revisions", () => {
    const card = buildCycleCard(
      packageStatus({ statuses: { brainstorming: "approved", "a-roll": "needs-revisions", "initial-cut": "pending", "final-cut": "locked" } }),
      thursdayNoon
    );
    expect(card).toMatchObject({ href: "/a-roll", stageLabel: "A-roll/B-roll", tag: { label: "Revisions", tone: "danger" } });
  });

  it("uses the stage's own status when nothing is due soon", () => {
    const card = buildCycleCard(
      packageStatus({ statuses: { brainstorming: "approved", "a-roll": "approved", "initial-cut": "submitted", "final-cut": "locked" } }),
      thursdayNoon
    );
    expect(card?.tag).toEqual({ label: "Submitted", tone: "warning" });
    expect(buildCycleCard(packageStatus({ dueAt: null }), thursdayNoon)?.tag).toEqual({ label: "In progress", tone: "neutral" });
  });

  it("is hidden for people without a package this cycle", () => {
    expect(buildCycleCard(null, thursdayNoon)).toBeNull();
    expect(buildCycleCard(packageStatus({ hasRow: false }), thursdayNoon)).toBeNull();
  });
});
