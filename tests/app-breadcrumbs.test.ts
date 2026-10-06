import { afterEach, describe, expect, it } from "vitest";
import {
  buildGenericBreadcrumbs,
  buildGroupsBreadcrumbs,
  formatSegmentLabel,
  getGroupBreadcrumbTopic,
  publishedGroupTopicForRow,
  publishGroupBreadcrumbTopic,
  segmentLabel
} from "@/src/lib/app-breadcrumbs";

describe("buildGroupsBreadcrumbs", () => {
  it("returns null for non-groups routes", () => {
    expect(buildGroupsBreadcrumbs(["dashboard"])).toBeNull();
  });

  it("labels the groups index", () => {
    expect(buildGroupsBreadcrumbs(["groups"])).toEqual([{ label: "Groups" }]);
  });

  it("uses the group topic instead of the row id", () => {
    expect(
      buildGroupsBreadcrumbs(["groups", "cmq0hy8270000oi90ayhdrayuy", "a-roll"], "Lunch line wait times")
    ).toEqual([
      { label: "Groups", href: "/groups" },
      { label: "Lunch line wait times", href: "/groups/cmq0hy8270000oi90ayhdrayuy" },
      { label: "A-roll/B-roll" }
    ]);
  });

  it("falls back to Group when the topic is missing", () => {
    expect(buildGroupsBreadcrumbs(["groups", "cmq0hy8270000oi90ayhdrayuy", "initial-cut"], "  ")).toEqual([
      { label: "Groups", href: "/groups" },
      { label: "Group", href: "/groups/cmq0hy8270000oi90ayhdrayuy" },
      { label: "Initial Cut" }
    ]);
  });
});

describe("formatSegmentLabel", () => {
  it("title-cases hyphenated slugs", () => {
    expect(formatSegmentLabel("final-cut")).toBe("Final Cut");
  });
});

describe("segmentLabel", () => {
  it("uses the sidebar names", () => {
    expect(segmentLabel("show-roles")).toBe("The Show");
    expect(segmentLabel("package-progress")).toBe("Package Cycle");
    expect(segmentLabel("package-cycles")).toBe("Cycle Dates");
    expect(segmentLabel("a-roll")).toBe("A-roll/B-roll");
    expect(segmentLabel("pa")).toBe("PA");
  });

  it("falls back to the title-cased slug", () => {
    expect(segmentLabel("extension-requests")).toBe("Extension Requests");
  });

  it("shows ids as Details", () => {
    expect(segmentLabel("cmq0hy8270000oi90ayhdrayuy")).toBe("Details");
    expect(segmentLabel("3f2a9c4e-1b7d-4e8a-9c0f-5d6e7f8a9b0c")).toBe("Details");
  });
});

describe("buildGenericBreadcrumbs", () => {
  it("labels the root as Dashboard", () => {
    expect(buildGenericBreadcrumbs([])).toEqual([{ label: "Dashboard" }]);
  });

  it("links a parent crumb that has its own page", () => {
    expect(buildGenericBreadcrumbs(["announcements", "pa"])).toEqual([
      { label: "Announcements", href: "/announcements" },
      { label: "PA" }
    ]);
  });

  it("shows a record id as Details under a linked parent", () => {
    expect(buildGenericBreadcrumbs(["publishing-queue", "cmq0hy8270000oi90ayhdrayuy"])).toEqual([
      { label: "Publishing Queue", href: "/publishing-queue" },
      { label: "Details" }
    ]);
  });

  it("never links the last crumb", () => {
    expect(buildGenericBreadcrumbs(["show-roles"])).toEqual([{ label: "The Show" }]);
  });
});

describe("publishedGroupTopicForRow", () => {
  it("does not treat a missing row as a match when nothing is published", () => {
    expect(publishedGroupTopicForRow(null, undefined)).toBeNull();
  });

  it("returns the topic only for the matching row", () => {
    const published = { rowId: "row-1", topic: "Lunch line" };
    expect(publishedGroupTopicForRow(published, "row-1")).toBe("Lunch line");
    expect(publishedGroupTopicForRow(published, "row-2")).toBeNull();
    expect(publishedGroupTopicForRow(published, undefined)).toBeNull();
  });
});

describe("publishGroupBreadcrumbTopic", () => {
  afterEach(() => {
    publishGroupBreadcrumbTopic("row-1", null);
  });

  it("stores a trimmed topic and clears it", () => {
    publishGroupBreadcrumbTopic("row-1", "  Lunch line  ");
    expect(getGroupBreadcrumbTopic()).toEqual({ rowId: "row-1", topic: "Lunch line" });
    publishGroupBreadcrumbTopic("row-1", null);
    expect(getGroupBreadcrumbTopic()).toBeNull();
  });
});

