import { describe, expect, it } from "vitest";
import { editingHref, editSummaryStatus, parseEditingView, type ShowEditSummary } from "@/src/lib/show-editor-views";

function summary(patch: Partial<ShowEditSummary> = {}): ShowEditSummary {
  return { status: null, stage: null, publicationStatus: null, ...patch };
}

describe("Editing tab views", () => {
  it("reads ?view=, defaulting to Show", () => {
    expect(parseEditingView(null)).toBe("show");
    expect(parseEditingView("show")).toBe("show");
    expect(parseEditingView("machines")).toBe("machines");
    expect(parseEditingView("settings")).toBe("settings");
    expect(parseEditingView("Machines")).toBe("show");
    expect(parseEditingView("anything")).toBe("show");
  });

  it("opens Machines for a link code, whatever ?view= says", () => {
    expect(parseEditingView(null, "ABCD-2345")).toBe("machines");
    expect(parseEditingView("settings", "ABCD-2345")).toBe("machines");
    expect(parseEditingView("settings", "")).toBe("settings");
  });

  it("builds /editing links with only what differs from the defaults", () => {
    expect(editingHref()).toBe("/editing");
    expect(editingHref({ view: "show" })).toBe("/editing");
    expect(editingHref({ date: "2026-10-21" })).toBe("/editing?date=2026-10-21");
    expect(editingHref({ date: "2026-10-21", view: "settings" })).toBe("/editing?date=2026-10-21&view=settings");
    expect(editingHref({ link: "ABCD-2345" })).toBe("/editing?link=ABCD-2345");
    expect(editingHref({ date: null, view: "machines", link: "ABCD-2345" })).toBe("/editing?view=machines&link=ABCD-2345");
  });

  it("encodes what it's given", () => {
    expect(editingHref({ link: "AB&view=x" })).toBe("/editing?link=AB%26view%3Dx");
  });
});

describe("The Show's automatic editing summary", () => {
  it("says Not started with no edit, or after a cancelled one", () => {
    expect(editSummaryStatus(summary())).toEqual({ tone: "neutral", label: "Not started" });
    expect(editSummaryStatus(summary({ status: "CANCELLED" }))).toEqual({ tone: "neutral", label: "Not started" });
  });

  it("names the stage while editing", () => {
    expect(editSummaryStatus(summary({ status: "QUEUED" })).label).toBe("Editing: Waiting for the editing machine");
    expect(editSummaryStatus(summary({ status: "RUNNING" })).label).toBe("Editing: Starting");
    expect(editSummaryStatus(summary({ status: "RUNNING", stage: "render" }))).toEqual({ tone: "info", label: "Editing: Rendering" });
  });

  it("says Ready for review, Failed and Scheduled", () => {
    expect(editSummaryStatus(summary({ status: "REVIEW", publicationStatus: "DRAFT" }))).toEqual({ tone: "review", label: "Ready for review" });
    expect(editSummaryStatus(summary({ status: "FAILED" }))).toEqual({ tone: "danger", label: "Failed" });
    expect(editSummaryStatus(summary({ status: "PUBLISHED" }))).toEqual({ tone: "success", label: "Scheduled" });
  });

  it("counts a show sent to YouTube as Scheduled, edited or uploaded by hand", () => {
    expect(editSummaryStatus(summary({ status: "REVIEW", publicationStatus: "UPLOADING" })).label).toBe("Scheduled");
    expect(editSummaryStatus(summary({ status: "FAILED", publicationStatus: "SCHEDULED" })).label).toBe("Scheduled");
    expect(editSummaryStatus(summary({ publicationStatus: "SCHEDULED" })).label).toBe("Scheduled");
    expect(editSummaryStatus(summary({ publicationStatus: "DRAFT" })).label).toBe("Not started");
  });
});
