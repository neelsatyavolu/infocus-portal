import { describe, expect, it } from "vitest";
import {
  buildThreads,
  filterCounts,
  filterThreads,
  isCommentNew,
  mergeRefreshedVersions,
  newThreadIds,
  threadNumbers,
  timelineThreads,
  type ReviewComment,
  type ReviewVersion
} from "@/components/review/comment-utils";
import { canShowQuickGradesForFolder, normalizeQuickGradePoints, parseCycleFromProjectName } from "@/components/review/quick-grades";
import { reviewShortcutForKey, shouldHandleReviewShortcut, type ShortcutEventLike } from "@/components/review/review-hotkeys";
import { isVersionNewSince, markSeen, versionBaseline } from "@/components/review/use-review-seen";

function target(tagName: string, role: string | null = null, isContentEditable = false, { type = null }: { type?: string | null } = {}) {
  return {
    tagName,
    isContentEditable,
    getAttribute: (name: string) => (name === "role" ? role : name === "type" ? type : null)
  } as unknown as EventTarget;
}

function keyEvent(eventTarget: EventTarget | null, overrides: Partial<ShortcutEventLike> = {}): ShortcutEventLike {
  return {
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    defaultPrevented: false,
    isComposing: false,
    target: eventTarget,
    ...overrides
  };
}

function comment(overrides: Partial<ReviewComment> & Pick<ReviewComment, "id">): ReviewComment {
  return {
    mediaVersionId: "v1",
    body: "Note",
    authorId: "user-abby",
    authorName: "Abby",
    timeSeconds: 0,
    frameNumber: null,
    xPct: null,
    yPct: null,
    targetType: "TIMECODE",
    createdAt: "2026-10-01T10:00:00.000Z",
    resolvedAt: null,
    parentCommentId: null,
    ...overrides
  } as ReviewComment;
}

describe("review shortcuts", () => {
  it("maps keys, and gives images only C and Esc", () => {
    expect(reviewShortcutForKey(" ", false)).toBe("toggle-play");
    expect(reviewShortcutForKey("ArrowLeft", false)).toBe("seek-back");
    expect(reviewShortcutForKey(".", false)).toBe("frame-forward");
    expect(reviewShortcutForKey("c", true)).toBe("focus-composer");
    expect(reviewShortcutForKey("Escape", true)).toBe("cancel");
    expect(reviewShortcutForKey(" ", true)).toBeNull();
    expect(reviewShortcutForKey("j", false)).toBeNull();
  });

  it("plays with Space on the page and on the seek bar", () => {
    expect(shouldHandleReviewShortcut(keyEvent(null), "toggle-play", false)).toBe(true);
    expect(shouldHandleReviewShortcut(keyEvent(target("BODY")), "toggle-play", false)).toBe(true);
    expect(shouldHandleReviewShortcut(keyEvent(target("INPUT", null, false, { type: "range" })), "toggle-play", false)).toBe(true);
  });

  it("plays with Space after clicking a button, link, tab or select, instead of pressing it again", () => {
    expect(shouldHandleReviewShortcut(keyEvent(target("BUTTON")), "toggle-play", false)).toBe(true);
    expect(shouldHandleReviewShortcut(keyEvent(target("A")), "toggle-play", false)).toBe(true);
    expect(shouldHandleReviewShortcut(keyEvent(target("SUMMARY")), "toggle-play", false)).toBe(true);
    expect(shouldHandleReviewShortcut(keyEvent(target("BUTTON", "combobox")), "toggle-play", false)).toBe(true);
    expect(shouldHandleReviewShortcut(keyEvent(target("BUTTON", "tab")), "toggle-play", false)).toBe(true);
    expect(shouldHandleReviewShortcut(keyEvent(target("BUTTON", "radio")), "toggle-play", false)).toBe(true);
    expect(shouldHandleReviewShortcut(keyEvent(target("DIV", "button")), "toggle-play", false)).toBe(true);
    expect(shouldHandleReviewShortcut(keyEvent(target("DIV", "separator")), "toggle-play", false)).toBe(true);
  });

  it("never takes Space from text fields", () => {
    expect(shouldHandleReviewShortcut(keyEvent(target("TEXTAREA")), "toggle-play", false)).toBe(false);
    expect(shouldHandleReviewShortcut(keyEvent(target("INPUT", null, false, { type: "text" })), "toggle-play", false)).toBe(false);
    expect(shouldHandleReviewShortcut(keyEvent(target("INPUT")), "toggle-play", false)).toBe(false);
    expect(shouldHandleReviewShortcut(keyEvent(target("SELECT")), "toggle-play", false)).toBe(false);
    expect(shouldHandleReviewShortcut(keyEvent(target("DIV", "textbox")), "toggle-play", false)).toBe(false);
    expect(shouldHandleReviewShortcut(keyEvent(target("DIV", null, true)), "toggle-play", false)).toBe(false);
  });

  it("leaves arrows to controls that use them, but not to plain buttons", () => {
    expect(shouldHandleReviewShortcut(keyEvent(target("BUTTON")), "seek-forward", false)).toBe(true);
    expect(shouldHandleReviewShortcut(keyEvent(target("BUTTON", "tab")), "seek-forward", false)).toBe(false);
    expect(shouldHandleReviewShortcut(keyEvent(target("BUTTON", "radio")), "seek-back", false)).toBe(false);
    expect(shouldHandleReviewShortcut(keyEvent(target("DIV", "separator")), "seek-back", false)).toBe(false);
    expect(shouldHandleReviewShortcut(keyEvent(target("INPUT")), "frame-back", false)).toBe(false);
  });

  it("stays out of the way of modifiers, IME and open dialogs or menus", () => {
    expect(shouldHandleReviewShortcut(keyEvent(target("DIV"), { metaKey: true }), "toggle-play", false)).toBe(false);
    expect(shouldHandleReviewShortcut(keyEvent(target("DIV"), { isComposing: true }), "toggle-play", false)).toBe(false);
    expect(shouldHandleReviewShortcut(keyEvent(target("DIV")), "toggle-play", true)).toBe(false);
    expect(shouldHandleReviewShortcut(keyEvent(target("DIV")), "focus-composer", false)).toBe(true);
  });
});

describe("comment threads", () => {
  const comments = [
    comment({ id: "late", timeSeconds: 30 }),
    comment({ id: "early", timeSeconds: 5, resolvedAt: "2026-10-02T00:00:00.000Z" }),
    comment({ id: "general", targetType: "GENERAL" }),
    comment({ id: "reply", parentCommentId: "late", createdAt: "2026-10-03T00:00:00.000Z", authorId: "user-otto" })
  ];
  const threads = buildThreads(comments);
  const timeline = timelineThreads(threads, false);

  it("orders timeline threads by time and numbers them stably", () => {
    expect(timeline.map((thread) => thread.root.id)).toEqual(["early", "late"]);
    expect(threadNumbers(timeline).get("late")).toBe(2);
    expect(timeline[1].replies.map((reply) => reply.id)).toEqual(["reply"]);
  });

  it("filters and counts open and resolved threads", () => {
    expect(filterCounts(timeline)).toEqual({ ALL: 2, OPEN: 1, RESOLVED: 1 });
    expect(filterThreads(timeline, "OPEN").map((thread) => thread.root.id)).toEqual(["late"]);
  });

  it("marks threads new since the last visit, never the viewer's own", () => {
    const rule = { baseline: "2026-10-02T12:00:00.000Z", localIds: new Set<string>(), currentUserId: "user-abby" };
    expect([...newThreadIds(threads, rule)]).toEqual(["late"]);
    expect(isCommentNew(comments[3], { ...rule, currentUserId: "user-otto" })).toBe(false);
    expect(isCommentNew(comments[3], { ...rule, baseline: null })).toBe(false);
  });
});

describe("refreshed versions", () => {
  const version = (id: string, url: string | null) =>
    ({ id, playbackUrl: url, thumbnailUrl: url ? `${url}/thumb` : null, status: "READY" }) as unknown as ReviewVersion;
  const current = [version("v2", "old-2"), version("v1", "old-1")];

  it("keeps only the playing version's URL and takes fresh links for the rest", () => {
    const merged = mergeRefreshedVersions(current, [version("v3", "new-3"), version("v2", "new-2"), version("v1", "new-1")], "v2");
    expect(merged.map((item) => item.playbackUrl)).toEqual(["new-3", "old-2", "new-1"]);
    expect(merged[1].thumbnailUrl).toBe("old-2/thumb");
  });

  it("takes every fresh link when nothing is playing yet or the selection moves", () => {
    const next = [version("v2", "new-2"), version("v1", "new-1")];
    expect(mergeRefreshedVersions([version("v2", null)], next, "v2").map((item) => item.playbackUrl)).toEqual(["new-2", "new-1"]);
    expect(mergeRefreshedVersions(current, next, null).map((item) => item.playbackUrl)).toEqual(["new-2", "new-1"]);
  });
});

describe("seen record", () => {
  it("uses the version's own time, else the last visit", () => {
    const record = markSeen(null, "v1", "2026-10-05T00:00:00.000Z");
    expect(versionBaseline(record, "v1")).toBe("2026-10-05T00:00:00.000Z");
    expect(versionBaseline({ ...record, versions: {} }, "v2")).toBe("2026-10-05T00:00:00.000Z");
    expect(versionBaseline(null, "v1")).toBeNull();
  });

  it("calls a version new only when uploaded after the visit and not opened", () => {
    const record = markSeen(null, "v1", "2026-10-05T00:00:00.000Z");
    expect(isVersionNewSince(record, { id: "v2", createdAt: "2026-10-06T00:00:00.000Z" })).toBe(true);
    expect(isVersionNewSince(record, { id: "v1", createdAt: "2026-10-06T00:00:00.000Z" })).toBe(false);
    expect(isVersionNewSince(null, { id: "v2", createdAt: "2026-10-06T00:00:00.000Z" })).toBe(false);
  });
});

describe("quick grades rules", () => {
  it("reads the cycle from the project name and shows only in Final Cut folders", () => {
    expect(parseCycleFromProjectName("Package Cycle 2")).toBe(2);
    expect(parseCycleFromProjectName("Package Cycle 9")).toBeNull();
    expect(canShowQuickGradesForFolder("Final Cut")).toBe(true);
    expect(canShowQuickGradesForFolder("Initial Cut")).toBe(false);
  });

  it("clamps points and treats blanks as empty", () => {
    expect(normalizeQuickGradePoints("30", 25)).toBe(25);
    expect(normalizeQuickGradePoints("  ", 25)).toBeNull();
    expect(normalizeQuickGradePoints("7.6", 15)).toBe(8);
  });
});
