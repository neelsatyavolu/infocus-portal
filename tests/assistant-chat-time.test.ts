import { describe, expect, it } from "vitest";
import {
  dayLabel,
  daysAgo,
  groupThread,
  inboxTimeLabel,
  RUN_GAP_MS,
  showsTimeAfter
} from "@/components/assistant/chat-time";

// Local-time dates, so the tests hold in any time zone.
function at(year: number, month: number, day: number, hour = 12, minute = 0) {
  return new Date(year, month - 1, day, hour, minute);
}

function iso(date: Date) {
  return date.toISOString();
}

function message(id: string, authorId: string, date: Date) {
  return { id, authorId, createdAt: iso(date) };
}

describe("daysAgo", () => {
  it("counts calendar days, not 24-hour blocks", () => {
    const now = at(2026, 10, 15, 0, 30);
    expect(daysAgo(at(2026, 10, 15, 0, 5), now)).toBe(0);
    expect(daysAgo(at(2026, 10, 14, 23, 55), now)).toBe(1);
    expect(daysAgo(at(2026, 10, 8, 9), now)).toBe(7);
  });

  it("rounds over a daylight-saving change", () => {
    // US clocks fall back on Nov 1, 2026 (a 25-hour day there); every zone still gets 2.
    expect(daysAgo(at(2026, 10, 31, 12), at(2026, 11, 2, 12))).toBe(2);
  });
});

describe("inboxTimeLabel", () => {
  const now = at(2026, 10, 15, 16);

  it("shows nothing for a never-opened chat or a bad date", () => {
    expect(inboxTimeLabel(null, now)).toBe("");
    expect(inboxTimeLabel("not a date", now)).toBe("");
  });

  it("shows the time today", () => {
    const date = at(2026, 10, 15, 14, 14);
    expect(inboxTimeLabel(iso(date), now)).toBe(
      date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    );
  });

  it("shows the weekday within the last 6 days", () => {
    for (const day of [14, 9]) {
      const date = at(2026, 10, day, 9);
      expect(inboxTimeLabel(iso(date), now)).toBe(date.toLocaleDateString(undefined, { weekday: "short" }));
    }
  });

  it("shows the month and day after that", () => {
    const date = at(2026, 10, 8, 9);
    expect(inboxTimeLabel(iso(date), now)).toBe(
      date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
    );
  });
});

describe("dayLabel", () => {
  const now = at(2026, 10, 15, 16);

  it("names today and yesterday", () => {
    expect(dayLabel(iso(at(2026, 10, 15, 1)), now)).toBe("Today");
    expect(dayLabel(iso(at(2026, 10, 14, 23)), now)).toBe("Yesterday");
  });

  it("dates older days", () => {
    const date = at(2026, 10, 3, 9);
    expect(dayLabel(iso(date), now)).toBe(
      date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
    );
  });
});

describe("groupThread", () => {
  const now = at(2026, 10, 15, 18);

  it("keeps one author's quick messages in one run and marks mine", () => {
    const days = groupThread(
      [
        message("a1", "abby", at(2026, 10, 15, 9, 0)),
        message("a2", "abby", at(2026, 10, 15, 9, 2)),
        message("m1", "me", at(2026, 10, 15, 9, 3))
      ],
      "me",
      now
    );
    expect(days).toHaveLength(1);
    expect(days[0].label).toBe("Today");
    expect(days[0].runs.map((run) => run.messages.map((item) => item.id))).toEqual([["a1", "a2"], ["m1"]]);
    expect(days[0].runs.map((run) => run.mine)).toEqual([false, true]);
  });

  it("splits a run that would span more than RUN_GAP_MS from its first message", () => {
    expect(RUN_GAP_MS).toBe(5 * 60 * 1000);
    // Each message is 3 minutes after the one before, so a chained run would never end.
    const days = groupThread(
      [
        message("o1", "otto", at(2026, 10, 15, 10, 0)),
        message("o2", "otto", at(2026, 10, 15, 10, 3)),
        message("o3", "otto", at(2026, 10, 15, 10, 6)),
        message("o4", "otto", at(2026, 10, 15, 10, 9))
      ],
      "me",
      now
    );
    expect(days[0].runs.map((run) => run.messages.map((item) => item.id))).toEqual([
      ["o1", "o2"],
      ["o3", "o4"]
    ]);
  });

  it("starts a new run when the author changes, even within the gap", () => {
    const days = groupThread(
      [
        message("s1", "sage", at(2026, 10, 15, 11, 0)),
        message("o1", "otto", at(2026, 10, 15, 11, 1)),
        message("s2", "sage", at(2026, 10, 15, 11, 2))
      ],
      "me",
      now
    );
    expect(days[0].runs).toHaveLength(3);
  });

  it("starts a new day (and run) across midnight", () => {
    const days = groupThread(
      [message("s1", "sage", at(2026, 10, 14, 23, 58)), message("s2", "sage", at(2026, 10, 15, 0, 1))],
      "me",
      now
    );
    expect(days.map((day) => day.label)).toEqual(["Yesterday", "Today"]);
    expect(days.map((day) => day.runs.length)).toEqual([1, 1]);
  });

  it("does not change the messages it is given", () => {
    const input = [message("a1", "abby", at(2026, 10, 15, 9)), message("a2", "abby", at(2026, 10, 15, 9, 1))];
    const copy = structuredClone(input);
    groupThread(input, "me", now);
    expect(input).toEqual(copy);
  });
});

describe("showsTimeAfter", () => {
  function stamped(...dates: Date[]) {
    return dates.map((date) => ({ createdAt: iso(date) }));
  }

  it("labels the last message of a run", () => {
    const run = stamped(at(2026, 10, 15, 9, 0));
    expect(showsTimeAfter(run, 0)).toBe(true);
  });

  it("shares one label among messages sent in the same minute", () => {
    const run = stamped(new Date(2026, 9, 15, 9, 0, 5), new Date(2026, 9, 15, 9, 0, 40), at(2026, 10, 15, 9, 0));
    expect(run.map((_, index) => showsTimeAfter(run, index))).toEqual([false, false, true]);
  });

  it("labels each message whose next message falls in a later minute", () => {
    const run = stamped(at(2026, 10, 15, 9, 0), at(2026, 10, 15, 9, 2), new Date(2026, 9, 15, 9, 2, 30));
    expect(run.map((_, index) => showsTimeAfter(run, index))).toEqual([true, false, true]);
  });
});
