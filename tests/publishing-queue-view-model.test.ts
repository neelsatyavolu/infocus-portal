import { describe, expect, it } from "vitest";
import {
  buildMoveOptions,
  buildQueueView,
  countOnShow,
  formatFileSize,
  formatPublishedDate,
  relativeDayLabel,
  splitShowLabel,
  youtubeStatusSentence,
  youtubeStatusView
} from "@/app/(app)/publishing-queue/queue-view-model";
import type { QueueRow, UpcomingShow } from "@/app/(app)/publishing-queue/queue-types";
import { formatShowDateLabel } from "@/src/lib/show-assignment";

const TODAY = "2026-10-15";

const UPCOMING: UpcomingShow[] = [
  { date: "2026-10-15", label: "Thursday, October 15" },
  { date: "2026-10-16", label: "Friday, October 16 · Spirit Week Recap" },
  { date: "2026-10-19", label: "Monday, October 19" },
  { date: "2026-10-20", label: "Tuesday, October 20" }
];

function row(id: string, date: string | null, status?: string, publishedAt: string | null = null): QueueRow {
  return {
    id,
    cycleNumber: 1,
    groupTopic: `Topic ${id}`,
    queuedForAirAt: null,
    queuedForShowDate: date,
    members: ["Abby", "Otto"],
    youtubePublication: status ? { status, videoId: null, publishedAt, lastError: null } : null
  };
}

// a + f on today's show, b on Monday (failed), c without a show, d in the past (failed),
// e on a future date the API did not list.
const ROWS: QueueRow[] = [
  row("a", "2026-10-15", "PUBLISHED", "2026-10-15T19:00:00.000Z"),
  row("b", "2026-10-19", "FAILED"),
  row("c", null, "UPLOADING"),
  row("d", "2026-10-10", "FAILED"),
  row("e", "2026-10-30"),
  row("f", "2026-10-15", "PROCESSING")
];

const occupiedOn = (date: string, exclude?: string | null) => countOnShow(ROWS, date, exclude);

describe("youtubeStatusView", () => {
  it("maps each status to one label and tone", () => {
    expect(youtubeStatusView("PUBLISHED")).toEqual({ key: "published", label: "On YouTube", tone: "success" });
    expect(youtubeStatusView("UPLOADING").key).toBe("uploading");
    expect(youtubeStatusView("PROCESSING").key).toBe("processing");
    expect(youtubeStatusView("FAILED")).toEqual({ key: "failed", label: "Failed", tone: "danger" });
  });

  it("reads anything unknown or missing as not published", () => {
    expect(youtubeStatusView(undefined).key).toBe("none");
    expect(youtubeStatusView("SOMETHING_NEW").key).toBe("none");
    expect(youtubeStatusSentence(null)).toBe("This package has not been published to YouTube yet.");
  });
});

describe("dates and sizes", () => {
  it("says how far a show is from today", () => {
    expect(relativeDayLabel("2026-10-15", TODAY)).toBe("Today");
    expect(relativeDayLabel("2026-10-16", TODAY)).toBe("Tomorrow");
    expect(relativeDayLabel("2026-10-20", TODAY)).toBe("In 5 days");
    expect(relativeDayLabel("2026-10-14", TODAY)).toBe("Yesterday");
    expect(relativeDayLabel("2026-10-12", TODAY)).toBe("3 days ago");
    expect(relativeDayLabel("2026-10-15", undefined)).toBeNull();
  });

  it("formats file sizes and rejects bad input", () => {
    expect(formatFileSize(500)).toBe("500 B");
    expect(formatFileSize(1536)).toBe("1.5 KB");
    expect(formatFileSize(10 * 1024 * 1024)).toBe("10 MB");
    expect(formatFileSize(-1)).toBe("");
    expect(formatFileSize(Number.NaN)).toBe("");
  });

  it("formats the published date in school time", () => {
    expect(formatPublishedDate("2026-10-15T19:00:00.000Z")).toBe("Oct 15, 2026");
    expect(formatPublishedDate(null)).toBeNull();
    expect(formatPublishedDate("not a date")).toBeNull();
  });
});

describe("splitShowLabel", () => {
  it("splits a special show's calendar name from the date words", () => {
    expect(splitShowLabel("Friday, October 16 · Spirit Week Recap")).toEqual({
      dateLabel: "Friday, October 16",
      specialName: "Spirit Week Recap"
    });
    expect(splitShowLabel("Friday, October 16")).toEqual({ dateLabel: "Friday, October 16", specialName: null });
    expect(splitShowLabel("Friday, October 16 · ").specialName).toBeNull();
  });
});

describe("buildQueueView", () => {
  const view = buildQueueView(ROWS, UPCOMING, TODAY);

  it("lists the upcoming shows, then extra future dates with real date words", () => {
    expect(view.shows.map((show) => show.date)).toEqual([
      "2026-10-15",
      "2026-10-16",
      "2026-10-19",
      "2026-10-20",
      "2026-10-30"
    ]);
    expect(view.shows[0]).toMatchObject({ isNext: true, relative: "Today", upcoming: true });
    expect(view.shows[0].rows.map((item) => item.id)).toEqual(["a", "f"]);
    expect(view.shows[1]).toMatchObject({ dateLabel: "Friday, October 16", specialName: "Spirit Week Recap" });
    const extra = view.shows[4];
    expect(extra).toMatchObject({ dateLabel: formatShowDateLabel("2026-10-30"), upcoming: false, isNext: false });
    expect(extra.dateLabel).not.toBe("2026-10-30");
  });

  it("keeps packages without a show and past shows apart", () => {
    expect(view.unassigned.map((item) => item.id)).toEqual(["c"]);
    expect(view.past).toEqual([{ date: "2026-10-10", label: formatShowDateLabel("2026-10-10"), rows: [ROWS[3]] }]);
    expect(view.pastOptions.map((option) => option.date)).toEqual(["2026-10-10", ...UPCOMING.map((show) => show.date)]);
  });

  it("summarizes coverage and YouTube for the tiles", () => {
    expect(view.summary).toMatchObject({
      regularCount: 3,
      openRegular: 1,
      firstOpenRegularDate: "2026-10-20",
      openSpecial: 1,
      unassignedCount: 1,
      liveCount: 5,
      youtube: { published: 1, inFlight: 2, failed: 2 },
      firstFailed: { id: "b", past: false }
    });
    expect(view.summary.next?.date).toBe("2026-10-15");
    expect(view.recentPublished.map((item) => item.id)).toEqual(["a"]);
  });

  it("points at a failure in Past shows when none is live", () => {
    const pastOnly = buildQueueView([row("d", "2026-10-10", "FAILED")], UPCOMING, TODAY);
    expect(pastOnly.summary.firstFailed).toEqual({ id: "d", past: true });
    expect(pastOnly.summary.liveCount).toBe(0);
  });

  it("has no shows but keeps unassigned packages when no show days are coming up", () => {
    const summer = buildQueueView([row("c", null)], [], TODAY);
    expect(summer.shows).toEqual([]);
    expect(summer.unassigned.map((item) => item.id)).toEqual(["c"]);
    expect(summer.summary.next).toBeNull();
    expect(summer.summary.liveCount).toBe(1);
  });
});

describe("buildMoveOptions", () => {
  it("marks the current show and counts the moving package only there", () => {
    const options = buildMoveOptions(ROWS[0], UPCOMING, occupiedOn);
    expect(options[0]).toMatchObject({ date: "2026-10-15", current: true, count: 2, full: false });
    expect(options[1]).toMatchObject({ date: "2026-10-16", specialName: "Spirit Week Recap", count: 0, full: false });
  });

  it("disables full shows for another package", () => {
    const options = buildMoveOptions(ROWS[1], UPCOMING, occupiedOn);
    expect(options[0]).toMatchObject({ date: "2026-10-15", current: false, count: 2, full: true });
    expect(options[2]).toMatchObject({ date: "2026-10-19", current: true, count: 1 });
  });

  it("adds the current date when it is not in the list", () => {
    const options = buildMoveOptions(ROWS[4], UPCOMING, occupiedOn);
    expect(options).toHaveLength(UPCOMING.length + 1);
    expect(options[options.length - 1]).toEqual({
      date: "2026-10-30",
      dateLabel: formatShowDateLabel("2026-10-30"),
      specialName: null,
      count: 1,
      current: true,
      full: false
    });
  });
});
