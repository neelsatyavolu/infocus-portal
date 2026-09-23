import { afterEach, describe, expect, it } from "vitest";
import {
  buildGroupsBreadcrumbs,
  formatSegmentLabel,
  getGroupBreadcrumbTopic,
  publishedGroupTopicForRow,
  publishGroupBreadcrumbTopic
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
      { label: "A Roll" }
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

