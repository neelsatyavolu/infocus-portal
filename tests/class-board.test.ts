import { describe, expect, it } from "vitest";
import { setCalendarAnchors, setCalendarPaAnnouncers } from "@/src/lib/calendar-show-content";
import {
  buildBoardDays,
  buildBoardDeadlines,
  buildBoardLivestreams,
  buildRaceLanes,
  classBoardWindow,
  classBoardReviewDates,
  classBoardLiveFocus,
  pacificDayStart,
  type RacePackageInput
} from "@/src/lib/class-board";
import type { GroupTileStatusInput } from "@/src/lib/group-tile-status";
import { SHOW_TEMPLATE, PA_TEMPLATE } from "@/src/lib/master-calendar-cells";

function status(overrides: Partial<GroupTileStatusInput> = {}): GroupTileStatusInput {
  return {
    pitching: false,
    proofOfContact: false,
    proofCount: 0,
    brainstormDocUrl: "",
    aRollBRoll: false,
    aRollHasMedia: false,
    initialCutHasMedia: false,
    initialCutVersionNumber: null,
    initialCutNeedsRevisions: false,
    awaitingRevisedInitialCut: false,
    approvalStage: "DRAFT",
    finalCutHasMedia: false,
    queuedForAir: false,
    ...overrides
  };
}

function pack(overrides: Partial<RacePackageInput> = {}): RacePackageInput {
  return {
    id: "row",
    topic: "Campus parking",
    memberNames: ["Maya Chen"],
    producerName: "Sam Lee",
    extension: false,
    pitching: false,
    proofOfContact: false,
    aRollBRoll: false,
    initialCut: false,
    finalCut: false,
    status: status(),
    ...overrides
  };
}

describe("class board race", () => {
  it("puts the current dot on the first open stage and draws the line up to it", () => {
    const [lane] = buildRaceLanes([
      pack({
        pitching: true,
        proofOfContact: true,
        aRollBRoll: false,
        status: status({ pitching: true, proofOfContact: true, aRollBRoll: false })
      })
    ]);

    expect(lane.dots).toEqual(["done", "done", "current", "upcoming", "upcoming", "upcoming", "upcoming"]);
    expect(lane.segments).toEqual(["done", "current", "upcoming", "upcoming", "upcoming", "upcoming"]);
    expect(lane.detail).toBe("Maya · AP Sam");
    expect(lane.statusLabel).toBe("A-roll/B-roll Pending");
    expect(lane.place).toBe(1);
  });

  it("ranks needs revisions ahead of pending at the same stage", () => {
    const now = Date.parse("2026-09-21T20:00:00.000Z");
    const baseFlags = { pitching: true, proofOfContact: true, aRollBRoll: false as const };
    const lanes = buildRaceLanes([
      pack({
        id: "pending",
        topic: "Alpha",
        ...baseFlags,
        status: status({ ...baseFlags, aRollHasMedia: false })
      }),
      pack({
        id: "revisions",
        topic: "Zulu",
        ...baseFlags,
        status: status({ ...baseFlags, aRollHasMedia: true, aRollNeedsChanges: true })
      }),
      pack({
        id: "review",
        topic: "Middle",
        ...baseFlags,
        status: status({
          ...baseFlags,
          aRollHasMedia: true,
          reviewReadyAt: { "a-roll": "2026-09-21T18:00:00.000Z" }
        })
      }),
      pack({
        id: "cut-pending",
        topic: "Cut pending",
        pitching: true,
        proofOfContact: true,
        aRollBRoll: true,
        status: status({ pitching: true, proofOfContact: true, aRollBRoll: true, initialCutHasMedia: false })
      }),
      pack({
        id: "cut-revisions",
        topic: "Cut revisions",
        pitching: true,
        proofOfContact: true,
        aRollBRoll: true,
        status: status({
          pitching: true,
          proofOfContact: true,
          aRollBRoll: true,
          initialCutHasMedia: true,
          initialCutNeedsRevisions: true,
          initialCutVersionNumber: 1
        })
      })
    ], now);

    expect(lanes.map((lane) => lane.topic)).toEqual([
      "Cut revisions",
      "Cut pending",
      "Zulu",
      "Middle",
      "Alpha"
    ]);
    expect(lanes.find((lane) => lane.topic === "Zulu")!.place).toBeLessThan(
      lanes.find((lane) => lane.topic === "Alpha")!.place
    );
    expect(lanes.find((lane) => lane.topic === "Cut revisions")!.place).toBeLessThan(
      lanes.find((lane) => lane.topic === "Cut pending")!.place
    );
  });

  it("ranks version 2 needs revisions ahead of version 2 pending review", () => {
    const flags = { pitching: true, proofOfContact: true, aRollBRoll: true };
    const cutStatus = status({
      ...flags,
      initialCutHasMedia: true,
      initialCutVersionNumber: 2,
      approvalStage: "ASSOCIATE_REVIEW"
    });
    const lanes = buildRaceLanes([
      pack({ id: "pending", topic: "Alpha", ...flags, status: cutStatus }),
      pack({
        id: "revisions", topic: "Zulu", ...flags,
        status: { ...cutStatus, initialCutNeedsRevisions: true }
      })
    ]);

    expect(lanes.map((lane) => [lane.id, lane.place])).toEqual([
      ["revisions", 1],
      ["pending", 2]
    ]);
    expect(lanes[0].statusLabel).toContain("Needs Revisions");
    expect(lanes[1].statusLabel).toContain("Pending Review");
  });

  it("ranks newer revision requests ahead and ties matching versions", () => {
    const flags = { pitching: true, proofOfContact: true, aRollBRoll: true };
    const lanes = buildRaceLanes([
      ...[
        { id: "v1", topic: "Alpha", version: 1 },
        { id: "v2", topic: "Zulu", version: 2 },
        { id: "v2-tie", topic: "Middle", version: 2 }
      ].map(({ id, topic, version }) => pack({
        id, topic, ...flags,
        status: status({
          ...flags,
          initialCutHasMedia: true,
          initialCutNeedsRevisions: true,
          initialCutVersionNumber: version,
          approvalStage: "ASSOCIATE_REVIEW"
        })
      })),
      pack({
        id: "later-stage", topic: "Later stage", ...flags,
        status: status({ ...flags, initialCutHasMedia: true, approvalStage: "ADVISER_REVIEW" })
      })
    ]);

    expect(lanes.map((lane) => [lane.id, lane.place])).toEqual([
      ["later-stage", 1],
      ["v2-tie", 2],
      ["v2", 2],
      ["v1", 4]
    ]);
  });

  it("ranks cleared stages ahead and gives ties the same place", () => {
    const lanes = buildRaceLanes([
      pack({ id: "early", topic: "Zebra", pitching: false, status: status() }),
      pack({
        id: "lead",
        topic: "Alpha",
        pitching: true,
        proofOfContact: true,
        aRollBRoll: true,
        initialCut: true,
        status: status({ pitching: true, proofOfContact: true, aRollBRoll: true, approvalStage: "ADVISER_REVIEW" })
      }),
      pack({
        id: "tie",
        topic: "Beta",
        pitching: true,
        proofOfContact: true,
        aRollBRoll: true,
        initialCut: true,
        status: status({ pitching: true, proofOfContact: true, aRollBRoll: true, approvalStage: "ADVISER_REVIEW" })
      })
    ]);

    expect(lanes.map((lane) => [lane.topic, lane.place, lane.doneCount])).toEqual([
      ["Alpha", 1, 4],
      ["Beta", 1, 4],
      ["Zebra", 3, 0]
    ]);
    expect(lanes[0].dots.every((dot) => dot === "done" || dot === "upcoming" || dot === "current")).toBe(true);
    expect(lanes[0].dots[4]).toBe("current");
  });

  it.each([
    ["DRAFT", 3],
    ["ASSOCIATE_REVIEW", 3],
    ["ADVISER_REVIEW", 4],
    ["EXECUTIVE_REVIEW", 5],
    ["APPROVED", 6]
  ])("uses current %s approval despite a retained initial-cut check-in", (approvalStage, doneCount) => {
    const [lane] = buildRaceLanes([pack({
      pitching: true, proofOfContact: true, aRollBRoll: true,
      initialCut: true,
      status: status({ approvalStage })
    })]);
    expect(lane.dots).toHaveLength(7);
    expect(lane.doneCount).toBe(doneCount);
    expect(lane.dots[doneCount]).toBe("current");
    expect(lane.dots.slice(doneCount + 1).every((dot) => dot === "upcoming")).toBe(true);
  });

  it("keeps adviser revision feedback at Init 2 after the workflow resets to DRAFT", () => {
    const [lane] = buildRaceLanes([pack({
      pitching: true, proofOfContact: true, aRollBRoll: true,
      initialCutReviewStage: "ADVISER_REVIEW",
      status: status({
        pitching: true, proofOfContact: true, aRollBRoll: true,
        approvalStage: "DRAFT", initialCutHasMedia: true,
        initialCutVersionNumber: 2, initialCutNeedsRevisions: true
      })
    })]);
    expect(lane.dots).toEqual(["done", "done", "done", "done", "current", "upcoming", "upcoming"]);
    expect(lane.doneCount).toBe(4);
    expect(lane.statusLabel).toContain("Needs Revisions");
  });

  it("does not restore an old review stage without a current revision request", () => {
    const [lane] = buildRaceLanes([pack({
      pitching: true, proofOfContact: true, aRollBRoll: true,
      initialCutReviewStage: "ADVISER_REVIEW",
      status: status({ approvalStage: "DRAFT", initialCutNeedsRevisions: false })
    })]);
    expect(lane.dots[3]).toBe("current");
    expect(lane.doneCount).toBe(3);
  });

  it("completes Final Cut separately after all three initial approvals", () => {
    const [lane] = buildRaceLanes([pack({
      pitching: true, proofOfContact: true, aRollBRoll: true,
      initialCut: true, finalCut: true,
      status: status({ approvalStage: "APPROVED" })
    })]);
    expect(lane.doneCount).toBe(7);
    expect(lane.dots).toEqual(Array(7).fill("done"));
  });

  it("drops empty roster rows", () => {
    expect(
      buildRaceLanes([
        pack({
          id: "empty",
          topic: "  ",
          memberNames: [],
          producerName: null,
          pitching: false
        })
      ])
    ).toEqual([]);
  });
});

describe("class board window", () => {
  it("covers fourteen Pacific days from today", () => {
    const window = classBoardWindow(new Date("2026-09-21T20:00:00.000Z"));
    expect(window.today).toBe("2026-09-21");
    expect(window.end).toBe("2026-10-05");
    expect(pacificDayStart("2026-09-21").toISOString()).toBe("2026-09-21T07:00:00.000Z");
    expect(pacificDayStart("2026-12-18").toISOString()).toBe("2026-12-18T08:00:00.000Z");
  });
});

describe("class board deadlines", () => {
  it("includes the September Cycle 1 review dates in chronological order", () => {
    const cycle = {
      cycleNumber: 1,
      pitching: null,
      proofOfContact: null,
      aRollBRoll: null,
      initialCut: "2026-09-15",
      finalCut: "2026-09-29"
    };
    const rows = buildBoardDeadlines([cycle], "2026-09-21");
    expect(rows.map((row) => [row.label, row.dateKey, row.when])).toEqual([
      ["Initial Cut · Stage 2", "2026-09-22", "1d"],
      ["Initial Cut · Stage 3", "2026-09-26", "5d"],
      ["Final Cut", "2026-09-29", "8d"]
    ]);
    expect(buildBoardDeadlines([cycle], "2026-09-26").map((row) => [row.label, row.when])).toEqual([
      ["Initial Cut · Stage 3", "Today"],
      ["Final Cut", "3d"]
    ]);
  });

  it.each([
    [new Date("2026-09-29T00:00:00Z"), "2026-09-22", "2026-09-26"],
    ["2026-11-03", "2026-10-27", "2026-10-31"],
    ["2027-01-05", "2026-12-29", "2027-01-02"],
    ["2027-03-16", "2027-03-09", "2027-03-13"]
  ])("derives review dates from final cut %s across month, year, and DST boundaries", (finalCut, stage2, stage3) => {
    expect(classBoardReviewDates(finalCut)).toEqual({
      initialCutStage2: stage2,
      initialCutStage3: stage3
    });
  });

  it("leaves review dates unset when Final Cut has no date", () => {
    expect(classBoardReviewDates(null)).toEqual({ initialCutStage2: null, initialCutStage3: null });
  });

  it("adds future-cycle review reminders while preserving the regular Initial Cut and stored dates", () => {
    const cycle = Object.freeze({
      cycleNumber: 2,
      pitching: null,
      proofOfContact: null,
      aRollBRoll: null,
      initialCut: "2026-10-20",
      finalCut: "2026-11-03"
    });
    expect(buildBoardDeadlines([cycle], "2026-10-19").map((row) => [row.label, row.dateKey])).toEqual([
      ["Initial Cut", "2026-10-20"],
      ["Initial Cut · Stage 2", "2026-10-27"],
      ["Initial Cut · Stage 3", "2026-10-31"],
      ["Final Cut", "2026-11-03"]
    ]);
    expect(cycle.initialCut).toBe("2026-10-20");
    expect(cycle.finalCut).toBe("2026-11-03");
  });

  it("lists upcoming stage dates soonest first and skips dates already past", () => {
    const rows = buildBoardDeadlines(
      [
        {
          cycleNumber: 3,
          pitching: "2026-08-27T00:00:00.000Z",
          proofOfContact: "2026-09-01T00:00:00.000Z",
          aRollBRoll: "2026-09-21T00:00:00.000Z",
          initialCut: "2026-09-29T00:00:00.000Z",
          finalCut: "2026-09-29T00:00:00.000Z"
        },
        {
          cycleNumber: 2,
          pitching: "2026-10-06T00:00:00.000Z",
          proofOfContact: null,
          aRollBRoll: null,
          initialCut: null,
          finalCut: null
        }
      ],
      "2026-09-21"
    );

    expect(rows.map((row) => [row.label, row.cycleNumber, row.when])).toEqual([
      ["A-roll & b-roll", 3, "Today"],
      ["Initial Cut · Stage 2", 3, "1d"],
      ["Initial Cut · Stage 3", 3, "5d"],
      ["Initial Cut", 3, "8d"],
      ["Final Cut", 3, "8d"],
      ["Pitching", 2, "15d"]
    ]);
  });
});

describe("class board live focus", () => {
  const board = {
    classSessions: [{ date: "2026-09-22", startsAt: "2026-09-22T16:00:00Z", endsAt: "2026-09-22T17:30:00Z" }],
    days: [{ date: "2026-09-22", weekday: "TUE", dayNum: "22", kind: "NONE" as const, kindLabel: "Class", lines: [] }],
    deadlines: buildBoardDeadlines([{
      cycleNumber: 1, pitching: null, proofOfContact: null, aRollBRoll: null,
      initialCut: "2026-09-15", finalCut: "2026-09-29"
    }], "2026-09-21")
  };

  it("shows the nearest deadline and a live countdown only inside Period 1", () => {
    expect(classBoardLiveFocus(board, new Date("2026-09-22T15:59:59Z"))).toBeNull();
    expect(classBoardLiveFocus(board, new Date("2026-09-22T16:00:00Z"))).toMatchObject({
      text: "Revise your Initial Cut for adviser review",
      detail: "Cycle 1 · Due today", countdown: "90:00", remainingSeconds: 5400, remainingFraction: 1
    });
    expect(classBoardLiveFocus(board, new Date("2026-09-22T17:29:59Z"))).toMatchObject({ countdown: "0:01" });
    expect(classBoardLiveFocus(board, new Date("2026-09-22T17:30:00Z"))).toBeNull();
  });

  it("hides on calendar holidays even if a stale feed includes a period", () => {
    expect(classBoardLiveFocus({ ...board, days: [{ ...board.days[0], kind: "HOLIDAY" }] }, new Date("2026-09-22T16:30:00Z"))).toBeNull();
    expect(classBoardLiveFocus({ ...board, classSessions: [] }, new Date("2026-09-22T16:30:00Z"))).toBeNull();
  });

  it("ignores expired deadlines and supports future-cycle focus without mutating the list", () => {
    const deadlines = buildBoardDeadlines([{
      cycleNumber: 2, pitching: "2026-09-23", proofOfContact: null, aRollBRoll: null, initialCut: null, finalCut: null
    }], "2026-09-21");
    expect(classBoardLiveFocus({ ...board, deadlines }, new Date("2026-09-22T16:30:00Z"))).toMatchObject({
      text: "Develop your pitch and confirm your group", detail: "Cycle 2 · Due tomorrow"
    });
    expect(classBoardLiveFocus({ ...board, deadlines: [{ ...deadlines[0], dateKey: "2026-09-21" }] }, new Date("2026-09-22T16:30:00Z"))).toMatchObject({
      text: "Plan your next package steps", detail: "Period 1 · Class focus"
    });
  });
});

describe("class board side panels", () => {
  const window = classBoardWindow(new Date("2026-09-21T20:00:00.000Z"));

  it("keeps scheduled livestreams inside the next two weeks", () => {
    const rows = buildBoardLivestreams(
      [
        {
          id: "soon",
          title: "Football",
          startsAt: "2026-09-23T22:30:00.000Z",
          location: "Field",
          status: "SCHEDULED",
          availability: "PUBLIC",
          capacity: 4,
          attendeeNames: ["Maya Chen", "Jordan Blake"]
        },
        {
          id: "later",
          title: "Too far",
          startsAt: "2026-10-20T22:30:00.000Z",
          location: "",
          status: "SCHEDULED",
          availability: "UNCONFIRMED",
          capacity: 4,
          attendeeNames: []
        },
        {
          id: "done",
          title: "Finished",
          startsAt: "2026-09-22T22:30:00.000Z",
          location: "",
          status: "COMPLETED",
          availability: "UNLISTED",
          capacity: 4,
          attendeeNames: []
        }
      ],
      window,
      new Date("2026-09-21T20:00:00.000Z")
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      title: "Football",
      dayLabel: "Wed, Sep 23",
      crew: "Maya, Jordan",
      openLabel: "2 open",
      tone: "open",
      availability: "Public",
      where: "Field",
      started: false
    });
  });

  it("lists show anchors, the show manager, and queued packages on calendar days", () => {
    const days = buildBoardDays({
      today: "2026-09-21",
      end: "2026-09-26",
      schedule: [
        { date: "2026-09-21", kind: "NONE", label: "" },
        { date: "2026-09-23", kind: "SHOW", label: "" },
        { date: "2026-09-25", kind: "PA", label: "" }
      ],
      entries: [
        { date: "2026-09-23", content: setCalendarAnchors(SHOW_TEMPLATE, ["Maya", "Jordan"]) },
        { date: "2026-09-25", content: setCalendarPaAnnouncers(PA_TEMPLATE, ["Sam"]) }
      ],
      showManagers: { "2026-09-23": { name: "Neel" } },
      queued: [{ date: "2026-09-23", title: "Campus parking" }]
    });

    expect(days.map((day) => day.kindLabel)).toEqual(["Class", "Show", "PA"]);
    expect(days[1].lines).toEqual(["Anchors  Maya · Jordan", "Manager  Neel", "On air  Campus parking"]);
    expect(days[2].lines).toEqual(["Announcers  Sam"]);
  });
});
