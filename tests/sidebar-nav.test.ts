import { describe, expect, it } from "vitest";
import {
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

function allIds(context: SidebarNavContext) {
  return buildSidebarNav(context).flatMap((section) => section.items.map((item) => item.id));
}

describe("buildSidebarNav", () => {
  it("groups a student's sidebar by job", () => {
    expect(ids(student)).toEqual([
      { label: null, items: ["dashboard", "my-package", "grades", "master-calendar"] },
      { label: "Production", items: ["livestreams"] },
      { label: "Class", items: ["announcements", "announcements-submitted", "announcements-pa", "ideas", "managers", "package-cycles"] },
      { label: "Tools", items: ["drive", "teleprompter"] },
      { label: "footer", items: ["settings"] }
    ]);
  });

  it("gives an associate producer the producing tools and no My package section off a roster", () => {
    expect(ids(associate)).toEqual([
      { label: null, items: ["dashboard", "grades", "master-calendar"] },
      {
        label: "Producing",
        items: ["groups", "package-progress", "members", "participation", "meetings", "extension-requests"]
      },
      { label: "Production", items: ["show-roles", "publishing-queue", "livestreams"] },
      { label: "Class", items: ["announcements", "announcements-submitted", "announcements-pa", "ideas", "managers", "package-cycles"] },
      { label: "Tools", items: ["drive", "teleprompter"] },
      { label: "footer", items: ["settings"] }
    ]);
  });

  it("shows My package to a producer on a roster", () => {
    expect(ids({ ...associate, showCycleTabs: true })[0].items).toEqual([
      "dashboard",
      "my-package",
      "grades",
      "master-calendar"
    ]);
  });

  it("points My package at the stage the person is working on", () => {
    const myPackage = buildSidebarNav(student)[0].items.find((item) => item.id === "my-package");
    expect(myPackage?.href).toBe("/initial-cut");
  });

  it("gives executives the grade editor and admin instead of student grades", () => {
    const items = allIds(executive);
    expect(items).not.toContain("grades");
    expect(items).toContain("grade-editor");
    expect(buildSidebarNav(executive).at(-1)?.items.map((item) => item.id)).toEqual(["admin", "settings"]);
  });

  it("keeps every link the old sidebar had", () => {
    const everyone = new Set([...allIds(student), ...allIds(executive)]);
    for (const id of [
      "announcements",
      "dashboard",
      "grades",
      "master-calendar",
      "package-cycles",
      "drive",
      "teleprompter",
      "managers",
      "ideas",
      "my-package",
      "extension-requests",
      "livestreams",
      "groups",
      "members",
      "meetings",
      "package-progress",
      "publishing-queue",
      "grade-editor",
      "show-roles",
      "participation",
      "announcements-submitted",
      "announcements-pa",
      "admin",
      "settings"
    ]) {
      expect(everyone.has(id as never), id).toBe(true);
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
