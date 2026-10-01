import { describe, expect, it } from "vitest";
import {
  assignCalendarCrew,
  extractCalendarAnchors,
  extractCalendarCrew,
  extractCalendarPaAnnouncers,
  extractCalendarShowManager,
  formatPairedNames,
  omitAssignedNamesFromCalendarHtml,
  restoreAssignedNamesInCalendarHtml,
  setCalendarAnchors,
  setCalendarCrew,
  setCalendarPaAnnouncers,
  setCalendarShowManager,
  wipeCalendarAnchorNames
} from "@/src/lib/calendar-show-content";
import { PA_TEMPLATE, SHOW_TEMPLATE } from "@/src/lib/master-calendar-cells";

describe("calendar show content", () => {
  it("writes two anchor names as one Abby & Alva line", () => {
    const html = setCalendarAnchors(SHOW_TEMPLATE, ["Abby", "Alva"]);
    expect(html).toContain("<p>Abby &amp; Alva</p>");
    expect(html).not.toContain("<p>Abby</p>");
    expect(extractCalendarAnchors(html)).toEqual(["Abby", "Alva"]);
    expect(html).toContain("<strong>Package:</strong>");
    expect(html).toContain("<strong>Show Director:</strong>");
  });

  it("keeps the chosen order instead of sorting names", () => {
    expect(formatPairedNames(["Zed", "Amy"])).toBe("Zed & Amy");
    expect(setCalendarAnchors(SHOW_TEMPLATE, ["Zed", "Amy"])).toContain("<p>Zed &amp; Amy</p>");
  });

  it("still reads the older two-paragraph anchor list", () => {
    expect(
      extractCalendarAnchors(
        "<p><strong>Anchors:</strong></p><p>Iris</p><p>Lena</p><p><strong>Package:</strong></p>"
      )
    ).toEqual(["Iris", "Lena"]);
  });

  it("hides the Anchors block from the calendar editor but keeps Package", () => {
    const stored = setCalendarAnchors(SHOW_TEMPLATE, ["Abby", "Alva"]);
    const visible = omitAssignedNamesFromCalendarHtml(stored, "SHOW");
    expect(visible).not.toContain("Anchors");
    expect(visible).not.toContain("Abby");
    expect(visible).not.toContain("Show Manager");
    expect(visible).toContain("<strong>Package:</strong>");
    expect(extractCalendarAnchors(restoreAssignedNamesInCalendarHtml(visible, stored, "SHOW"))).toEqual([
      "Abby",
      "Alva"
    ]);
  });

  it("writes two anchor names into the show template", () => {
    const html = setCalendarAnchors(SHOW_TEMPLATE, ["Iris", "Lena"]);
    expect(extractCalendarAnchors(html)).toEqual(["Iris", "Lena"]);
    expect(html).toContain("<strong>Package:</strong>");
    expect(html).toContain("<strong>Show Director:</strong>");
    expect(html).toContain("<strong>Show Manager:</strong>");
  });

  it("writes a show manager without touching anchors", () => {
    const html = setCalendarShowManager(setCalendarAnchors(SHOW_TEMPLATE, ["Abby", "Alva"]), ["Neel"]);
    expect(extractCalendarShowManager(html)).toBe("Neel");
    expect(extractCalendarAnchors(html)).toEqual(["Abby", "Alva"]);
    expect(omitAssignedNamesFromCalendarHtml(html, "SHOW")).not.toContain("Show Manager");
    expect(omitAssignedNamesFromCalendarHtml(html, "SHOW")).not.toContain("Neel");
    expect(
      extractCalendarShowManager(restoreAssignedNamesInCalendarHtml(omitAssignedNamesFromCalendarHtml(html, "SHOW"), html, "SHOW"))
    ).toBe("Neel");
  });

  it("clears unused anchor slots", () => {
    const html = setCalendarAnchors(setCalendarAnchors(SHOW_TEMPLATE, ["Iris", "Lena"]), ["Mabel"]);
    expect(extractCalendarAnchors(html)).toEqual(["Mabel"]);
  });

  it("writes PA announcers as one line and hides them from the Monday editor", () => {
    const html = setCalendarPaAnnouncers(PA_TEMPLATE, ["Abby", "Otto"]);
    expect(extractCalendarPaAnnouncers(html)).toEqual(["Abby", "Otto"]);
    expect(html).toContain("<p>Abby &amp; Otto</p>");
    expect(html).toContain("<strong>PA Announcers:</strong>");
    expect(omitAssignedNamesFromCalendarHtml(html, "PA")).toBe("");
  });

  it("starts from the empty template when the cell has no content", () => {
    expect(extractCalendarAnchors(setCalendarAnchors("", ["Sage", "Kira"]))).toEqual([
      "Sage",
      "Kira"
    ]);
  });

  it("wipes assigned anchors without touching PA announcers", () => {
    const show = setCalendarAnchors(SHOW_TEMPLATE, ["Abby", "Alva"]);
    const pa = setCalendarPaAnnouncers(PA_TEMPLATE, ["Otto", "Sage"]);
    expect(extractCalendarAnchors(wipeCalendarAnchorNames(show))).toEqual([]);
    expect(wipeCalendarAnchorNames(show)).toContain("<strong>Package:</strong>");
    expect(wipeCalendarAnchorNames(pa)).toBe(pa);
    expect(wipeCalendarAnchorNames(SHOW_TEMPLATE)).toBe(SHOW_TEMPLATE);
  });
});

describe("calendar crew (Spirit Week filmers and editors)", () => {
  it("appends Filmers before Editors and reads any number of names", () => {
    const withEditors = setCalendarCrew(PA_TEMPLATE, "Editors", ["Sage"]);
    const html = setCalendarCrew(withEditors, "Filmers", ["Abby", "Otto", "Kira"]);
    expect(html.indexOf("Filmers:")).toBeLessThan(html.indexOf("Editors:"));
    expect(extractCalendarCrew(html, "Filmers")).toEqual(["Abby", "Otto", "Kira"]);
    expect(extractCalendarCrew(html, "Editors")).toEqual(["Sage"]);
  });

  it("keeps crew when anchors, show manager, or PA announcers change", () => {
    const crew = setCalendarCrew(setCalendarCrew(SHOW_TEMPLATE, "Filmers", ["Abby"]), "Editors", ["Otto"]);
    const show = setCalendarShowManager(setCalendarAnchors(crew, ["Iris", "Lena"]), ["Neel"]);
    expect(extractCalendarShowManager(show)).toBe("Neel");
    expect(extractCalendarAnchors(show)).toEqual(["Iris", "Lena"]);
    expect(extractCalendarCrew(show, "Filmers")).toEqual(["Abby"]);
    expect(extractCalendarCrew(show, "Editors")).toEqual(["Otto"]);

    const pa = setCalendarPaAnnouncers(setCalendarCrew(PA_TEMPLATE, "Filmers", ["Kira"]), ["Sage", "Abby"]);
    expect(extractCalendarPaAnnouncers(pa)).toEqual(["Sage", "Abby"]);
    expect(extractCalendarCrew(pa, "Filmers")).toEqual(["Kira"]);
  });

  it("does not read crew as the show manager when no manager is set", () => {
    const html = setCalendarCrew(SHOW_TEMPLATE, "Filmers", ["Abby"]);
    expect(extractCalendarShowManager(html)).toBe("");
  });

  it("removes the section when the list is cleared and survives an editor round trip", () => {
    const html = setCalendarCrew(setCalendarCrew(SHOW_TEMPLATE, "Filmers", ["Abby"]), "Editors", ["Otto"]);
    expect(setCalendarCrew(html, "Filmers", [])).not.toContain("Filmers:");
    const visible = omitAssignedNamesFromCalendarHtml(html, "SHOW");
    expect(visible).not.toContain("Filmers:");
    const restored = restoreAssignedNamesInCalendarHtml(visible, html, "SHOW");
    expect(extractCalendarCrew(restored, "Filmers")).toEqual(["Abby"]);
    expect(extractCalendarCrew(restored, "Editors")).toEqual(["Otto"]);
  });
});

describe("Spirit Week brunch, lunch, and night rally filmers", () => {
  const heading = (label: string) => `<strong>${label}:</strong>`;

  it("keeps unsorted, brunch, lunch, and night rally filmers in order before editors", () => {
    let html = setCalendarCrew(PA_TEMPLATE, "Editors", ["Sage"]);
    html = setCalendarCrew(html, "Night Rally Filmers", ["Iris"]);
    html = setCalendarCrew(html, "Brunch Filmers", ["Abby"]);
    html = setCalendarCrew(html, "Lunch Filmers", ["Otto"]);
    html = setCalendarCrew(html, "Filmers", ["Kira"]);
    const positions = ["Filmers", "Brunch Filmers", "Lunch Filmers", "Night Rally Filmers", "Editors"].map((label) =>
      html.indexOf(heading(label))
    );
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(extractCalendarCrew(html, "Filmers")).toEqual(["Kira"]);
    expect(extractCalendarCrew(html, "Brunch Filmers")).toEqual(["Abby"]);
    expect(extractCalendarCrew(html, "Lunch Filmers")).toEqual(["Otto"]);
    expect(extractCalendarCrew(html, "Night Rally Filmers")).toEqual(["Iris"]);
    expect(extractCalendarCrew(html, "Editors")).toEqual(["Sage"]);
  });

  it("does not read the new filmer lists as anchors, show manager, or PA announcers", () => {
    const pa = setCalendarCrew(setCalendarPaAnnouncers(PA_TEMPLATE, ["Sage"]), "Brunch Filmers", ["Abby"]);
    expect(extractCalendarPaAnnouncers(pa)).toEqual(["Sage"]);
    expect(extractCalendarShowManager(setCalendarCrew(SHOW_TEMPLATE, "Lunch Filmers", ["Otto"]))).toBe("");
    const anchors = setCalendarCrew("<p><strong>Anchors:</strong></p><p>Iris</p>", "Night Rally Filmers", ["Otto"]);
    expect(extractCalendarAnchors(anchors)).toEqual(["Iris"]);
  });

  it("takes people off the unsorted list when they join brunch, lunch, or night rally", () => {
    const legacy = setCalendarCrew(PA_TEMPLATE, "Filmers", ["Abby", "Otto", "Kira"]);
    const brunch = assignCalendarCrew(legacy, "Brunch Filmers", ["Abby"]);
    expect(extractCalendarCrew(brunch, "Brunch Filmers")).toEqual(["Abby"]);
    expect(extractCalendarCrew(brunch, "Filmers")).toEqual(["Otto", "Kira"]);

    const sorted = assignCalendarCrew(assignCalendarCrew(brunch, "Lunch Filmers", ["Otto"]), "Night Rally Filmers", ["Kira"]);
    expect(sorted).not.toContain(heading("Filmers"));
    expect(extractCalendarCrew(sorted, "Night Rally Filmers")).toEqual(["Kira"]);

    expect(extractCalendarCrew(assignCalendarCrew(legacy, "Editors", ["Abby"]), "Filmers")).toEqual(["Abby", "Otto", "Kira"]);
  });

  it("survives an editor round trip", () => {
    const html = setCalendarCrew(setCalendarCrew(SHOW_TEMPLATE, "Brunch Filmers", ["Abby"]), "Night Rally Filmers", ["Otto"]);
    const visible = omitAssignedNamesFromCalendarHtml(html, "SHOW");
    expect(visible).not.toContain("Filmers:");
    const restored = restoreAssignedNamesInCalendarHtml(visible, html, "SHOW");
    expect(extractCalendarCrew(restored, "Brunch Filmers")).toEqual(["Abby"]);
    expect(extractCalendarCrew(restored, "Night Rally Filmers")).toEqual(["Otto"]);
  });
});
