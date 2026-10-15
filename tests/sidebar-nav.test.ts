import { describe, expect, it } from "vitest";
import {
  buildHubTabs,
  buildSidebarNav,
  isPackageRoute,
  isRailRoute,
  myPackageHref,
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
      { label: "Production", items: ["livestreams"] },
      { label: "Class", items: ["announcements", "ideas", "managers"] },
      { label: "Tools", items: ["drive", "teleprompter"] },
      { label: "footer", items: ["settings"] }
    ]);
  });

  it("gives an associate producer the producing tools and no My package off a roster", () => {
    expect(ids(associate)).toEqual([
      { label: null, items: ["dashboard", "grades", "calendar"] },
      { label: "Producing", items: ["groups", "package-progress", "people", "meetings", "extension-requests"] },
      { label: "Production", items: ["show"] },
      { label: "Class", items: ["announcements", "ideas", "managers"] },
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

  it("labels the dashboard Packages for producers", () => {
    const first = (context: SidebarNavContext) => buildSidebarNav(context)[0].items[0].label;
    expect(first(student)).toBe("Dashboard");
    expect(first(associate)).toBe("Packages");
  });
});

describe("buildHubTabs", () => {
  it("puts The Show, Publishing Queue and Livestreams together for producers", () => {
    expect(buildHubTabs(associate, "/publishing-queue/row1")?.map((tab) => tab.href)).toEqual([
      "/show-roles",
      "/publishing-queue",
      "/livestreams"
    ]);
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
});

describe("myPackageHref", () => {
  it("opens the latest unlocked stage", () => {
    expect(myPackageHref(null)).toBe("/brainstorming");
    expect(myPackageHref({ "a-roll": true, "initial-cut": false, "final-cut": false })).toBe("/a-roll");
    expect(myPackageHref({ "a-roll": true, "initial-cut": true, "final-cut": true })).toBe("/final-cut");
  });
});
