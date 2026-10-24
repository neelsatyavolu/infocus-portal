import { describe, expect, it, vi } from "vitest";

vi.mock("pg", () => ({ Client: class {} }));

import {
  escalationOf, escalationStep, isAutoStarted, portalChecks, publishSlotNotBefore, reviewDeadline, withEscalation
} from "@/src/lib/show-editor-escalation";
import { showEditTickWindow } from "@/src/lib/show-editor-tick-precheck";

// Friday 2026-10-23 airs; Pacific is UTC−7 (PDT), so the 8:00 AM deadline is 15:00Z.
const SHOW = "2026-10-23";
const at = (iso: string) => new Date(iso);

function job(overrides: Record<string, unknown> = {}) {
  return { status: "REVIEW", showDate: SHOW, version: 1, finishedAt: at("2026-10-21T17:00:00Z"), checks: null, ...overrides } as {
    status: string; showDate: string; version: number; finishedAt: Date | null; checks: unknown;
  };
}

describe("escalationStep", () => {
  it("the deadline is 8:00 AM Pacific on show day", () => {
    expect(reviewDeadline(SHOW).toISOString()).toBe("2026-10-23T15:00:00.000Z");
  });

  it("escalates an hour after it reached Review, even days before the show", () => {
    // finishedAt 17:00Z is 10 AM Pacific on Wednesday.
    const early = job();
    expect(escalationStep(early, at("2026-10-21T17:59:00Z"))).toBe("none");
    expect(escalationStep(early, at("2026-10-21T18:00:00Z"))).toBe("escalate");
  });

  it("never between 2:00 and 6:00 AM Pacific", () => {
    const early = job();
    expect(escalationStep(early, at("2026-10-23T08:59:00Z"))).toBe("escalate");
    expect(escalationStep(early, at("2026-10-23T09:00:00Z"))).toBe("none");
    expect(escalationStep(early, at("2026-10-23T12:59:00Z"))).toBe("none");
    expect(escalationStep(early, at("2026-10-23T13:00:00Z"))).toBe("escalate");
  });

  it("finished at 11 PM the night before: escalates an hour later", () => {
    const late = job({ finishedAt: at("2026-10-23T06:00:00Z") });
    expect(escalationStep(late, at("2026-10-23T06:59:00Z"))).toBe("none");
    expect(escalationStep(late, at("2026-10-23T07:00:00Z"))).toBe("escalate");
  });

  it("finished after 7 AM on show day: no escalation, scheduled at 8:00", () => {
    const morning = job({ finishedAt: at("2026-10-23T14:10:00Z") });
    expect(escalationStep(morning, at("2026-10-23T14:59:00Z"))).toBe("none");
    expect(escalationStep(morning, at("2026-10-23T15:00:00Z"))).toBe("auto-schedule");
  });

  it("already escalated: again an hour later; at the deadline it still auto-schedules, once", () => {
    const escalated = job({ checks: { escalation: { version: 1, producersAt: "2026-10-23T03:01:00Z" } } });
    expect(escalationStep(escalated, at("2026-10-23T04:00:00Z"))).toBe("none");
    expect(escalationStep(escalated, at("2026-10-23T04:01:00Z"))).toBe("escalate");
    expect(escalationStep(escalated, at("2026-10-23T15:00:00Z"))).toBe("auto-schedule");
    const scheduled = job({ checks: { escalation: { version: 1, autoScheduledAt: "2026-10-23T15:00:00Z" } } });
    expect(escalationStep(scheduled, at("2026-10-23T15:01:00Z"))).toBe("none");
    const failed = job({ checks: { escalation: { version: 1, autoScheduleError: "Pick a season first: use Change details." } } });
    expect(escalationStep(failed, at("2026-10-23T15:01:00Z"))).toBe("none");
  });

  it("a new version (after Send back) starts the clock again", () => {
    const resent = job({
      version: 2, finishedAt: at("2026-10-23T04:00:00Z"),
      checks: { escalation: { version: 1, producersAt: "2026-10-23T03:01:00Z" } }
    });
    expect(escalationStep(resent, at("2026-10-23T04:30:00Z"))).toBe("none");
    expect(escalationStep(resent, at("2026-10-23T05:00:00Z"))).toBe("escalate");
  });

  it("only an edit at Review with a finish time counts", () => {
    expect(escalationStep(job({ status: "QUEUED" }), at("2026-10-23T15:00:00Z"))).toBe("none");
    expect(escalationStep(job({ status: "PUBLISHED" }), at("2026-10-23T15:00:00Z"))).toBe("none");
    expect(escalationStep(job({ finishedAt: null }), at("2026-10-23T15:00:00Z"))).toBe("none");
  });
});

describe("escalation record in checks", () => {
  it("updates this version's record and keeps every other key", () => {
    const checks = { coversClean: true, debugLogs: [{ version: 1 }], escalation: { version: 1, producersAt: "a" } };
    expect(withEscalation(checks, { version: 1, autoScheduledAt: "b" })).toEqual({
      coversClean: true, debugLogs: [{ version: 1 }],
      escalation: { version: 1, producersAt: "a", autoScheduledAt: "b", autoScheduleError: null }
    });
  });

  it("an earlier version's record is replaced, not merged", () => {
    expect(withEscalation({ escalation: { version: 1, producersAt: "a" } }, { version: 2, producersAt: "c" }).escalation)
      .toEqual({ version: 2, producersAt: "c", autoScheduledAt: null, autoScheduleError: null });
    expect(escalationOf({ escalation: { version: 1, producersAt: "a" } }, 2)).toBeNull();
    expect(escalationOf({ escalation: "junk" }, 1)).toBeNull();
  });

  it("auto-started is the one key the Portal keeps when a complete replaces checks", () => {
    expect(isAutoStarted({ autoStarted: true })).toBe(true);
    expect(isAutoStarted({ autoStarted: "yes" })).toBe(false);
    expect(portalChecks({ autoStarted: true, coversClean: true })).toEqual({ autoStarted: true });
    expect(portalChecks(null)).toEqual({});
  });
});

describe("publishSlotNotBefore", () => {
  it("is the Pacific date and HH:MM, rounded up to the minute", () => {
    expect(publishSlotNotBefore(at("2026-10-23T15:20:30Z"))).toEqual({ publishDate: SHOW, publishTime: "08:21" });
    expect(publishSlotNotBefore(at("2026-10-24T06:50:00Z"))).toEqual({ publishDate: SHOW, publishTime: "23:50" });
  });
});

describe("showEditTickWindow (Worker pre-check)", () => {
  it("is today and tomorrow (Pacific)", () => {
    expect(showEditTickWindow(at("2026-10-22T18:00:00Z"))).toEqual(["2026-10-22", SHOW]);
    expect(showEditTickWindow(at("2026-10-23T14:00:00Z"))).toEqual([SHOW, "2026-10-24"]);
  });
});
