import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensurePackageProgressDefaults: vi.fn(),
  loadRequiredFinalCutGraders: vi.fn(),
  canManageLivestreams: vi.fn(),
  prisma: {
    packageExtensionRequest: { findMany: vi.fn() },
    participationGradeRequest: { aggregate: vi.fn() },
    platformAccessRequest: { aggregate: vi.fn() },
    livestreamSignupRequest: { aggregate: vi.fn() },
    packageProgressRow: { findMany: vi.fn() },
    packageGrade: { findMany: vi.fn() },
    auditLog: { findMany: vi.fn() },
    schoolCalendarDay: { findMany: vi.fn() },
    masterCalendarEntry: { findMany: vi.fn() },
    livestreamEvent: { findMany: vi.fn() }
  }
}));

vi.mock("@/src/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/src/server/package-progress-data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/src/server/package-progress-data")>()),
  ensurePackageProgressDefaults: mocks.ensurePackageProgressDefaults,
  loadRequiredFinalCutGraders: mocks.loadRequiredFinalCutGraders
}));
vi.mock("@/src/server/livestream-access", () => ({ canManageLivestreams: mocks.canManageLivestreams }));

import { buildCalendarPart } from "@/components/home/executive-calendar";
import { buildAllCyclesPart, buildGroupsPart, loadExecutiveDashboard } from "@/src/server/executive-dashboard";
import { setCalendarAnchors } from "@/src/lib/calendar-show-content";
import { SHOW_TEMPLATE } from "@/src/lib/master-calendar-cells";

// Thursday, Oct 15, 2026 at noon Pacific.
const NOW = new Date("2026-10-15T19:00:00.000Z");
const EXEC = { userId: "exec-1", role: "EXECUTIVE_PRODUCER" as const };
const DOC = "https://docs.google.com/document/d/abc123/edit";

const utc = (dateKey: string) => new Date(`${dateKey}T00:00:00.000Z`);

const CYCLE = {
  cycleNumber: 1,
  focus: "",
  pitchingDate: utc("2026-09-20"),
  proofOfContactDate: utc("2026-09-27"),
  aRollBRollDate: utc("2026-10-04"),
  initialCutDate: utc("2026-10-11"),
  finalCutDate: utc("2026-10-30")
};
const CYCLE_DATES = {
  pitching: CYCLE.pitchingDate.toISOString(),
  proofOfContact: CYCLE.proofOfContactDate.toISOString(),
  aRollBRoll: CYCLE.aRollBRollDate.toISOString(),
  initialCut: CYCLE.initialCutDate.toISOString(),
  finalCut: CYCLE.finalCutDate.toISOString()
};

type Overrides = Record<string, unknown>;

function record(id: string, fields: Overrides = {}) {
  return {
    id,
    groupTopic: id,
    groupMembers: "",
    groupType: "",
    category: null,
    pitching: true,
    proofOfContact: true,
    aRollBRoll: true,
    initialCut: false,
    finalCut: false,
    extension: false,
    assignedProducerUserId: "ap-1",
    assignedExecutiveProducerUserId: null,
    brainstormDocUrl: DOC,
    initialCutMediaItemId: null,
    finalCutMediaItemId: null,
    queuedForAirAt: null,
    awaitingRevisedInitialCut: false,
    assignedProducer: { name: "Rowan", nickname: null, email: null },
    assignedExecutiveProducer: null,
    members: [{ userId: `${id}-member`, user: { name: `Abby ${id}`, nickname: null, email: null } }],
    proofOfContacts: [],
    approval: null,
    initialCutMediaItem: null,
    finalCutMediaItem: null,
    stageMedia: [],
    stageComments: [],
    finalCutScores: [],
    extensionRequests: [],
    ...fields
  };
}

const proofs = [1, 2, 3].map((slot) => ({
  id: `proof-${slot}`,
  slot,
  fileName: `proof-${slot}.png`,
  mimeType: "image/png",
  updatedAt: utc("2026-09-25")
}));

/** Stage 3: the adviser approved Stage 2 on Oct 13, so every executive owes a sign-off. */
const stage3 = record("Robotics", {
  initialCut: true,
  initialCutMediaItemId: "cut-1",
  initialCutMediaItem: {
    currentVersion: { id: "v1", createdAt: utc("2026-10-09"), versionNumber: 1, approvalStatus: "IN_REVIEW" }
  },
  approval: {
    stage: "EXECUTIVE_REVIEW",
    controversial: false,
    signoffs: [
      {
        userId: "adviser-1",
        stage: "ADVISER_REVIEW",
        approved: true,
        mediaItemId: "cut-1",
        createdAt: new Date("2026-10-13T18:00:00.000Z"),
        user: { name: "Sage", nickname: null, email: null }
      }
    ]
  }
});
/** Assigned to the viewer, brainstorm ready since Sep 26, Proof of Contact closed Sep 27. */
const brainstorm = record("Garden", {
  proofOfContact: false,
  aRollBRoll: false,
  assignedProducerUserId: "exec-1",
  proofOfContacts: proofs
});
/** Pitch not approved and not the viewer's: waiting on someone else, and behind. */
const pitch = record("Theater", { pitching: false, proofOfContact: false, aRollBRoll: false, brainstormDocUrl: "" });
/** Every check-in in and graded. */
const done = record("Bakery", {
  initialCut: true,
  finalCut: true,
  finalCutMediaItemId: "final-1",
  finalCutMediaItem: { createdAt: utc("2026-10-12") },
  approval: { stage: "APPROVED", controversial: false, signoffs: [] }
});
/** A blank roster row (hidden on Groups). */
const blank = record("", {
  pitching: false,
  proofOfContact: false,
  aRollBRoll: false,
  assignedProducerUserId: null,
  brainstormDocUrl: "",
  members: []
});

const RECORDS = [stage3, brainstorm, pitch, done, blank];
const GRADES = [{ userId: "Bakery-member", awardedFinalCutPoints: 40, revisionCount: 0 }];
const READY = new Map([["Garden:brainstorming", new Date("2026-09-26T17:00:00.000Z")]]);

describe("buildGroupsPart", () => {
  it("lists only the groups waiting on this executive, at the stage the Groups page opens", () => {
    // The fixture matches the Prisma payload at runtime; the cast skips spelling out every relation type.
    const { needs } = buildGroupsPart(RECORDS as never, GRADES, READY, EXEC, CYCLE_DATES, NOW);
    expect(needs).toEqual([
      {
        key: "group-Robotics",
        kind: "group",
        title: "Robotics",
        need: "Stage 3 sign-off",
        href: "/groups/Robotics/initial-stage-3",
        // Class Board Stage 3 date: Final Cut minus 3 days, closing 11:59 PM Pacific.
        dueAt: "2026-10-28T06:59:59.999Z",
        waitingSince: "2026-10-13T18:00:00.000Z"
      },
      {
        key: "group-Garden",
        kind: "group",
        title: "Garden",
        need: "Brainstorm to review",
        href: "/groups/Garden/brainstorming",
        dueAt: "2026-09-28T06:59:59.999Z",
        waitingSince: "2026-09-26T17:00:00.000Z"
      }
    ]);
  });

  it("gives the adviser only the Stage 2 queue", () => {
    const stage2 = record("Robotics", {
      ...stage3,
      approval: { stage: "ADVISER_REVIEW", controversial: false, signoffs: [] }
    });
    const { needs } = buildGroupsPart([stage2, brainstorm] as never, [], new Map(), { userId: "adviser-1", role: "ADVISER" }, CYCLE_DATES, NOW);
    expect(needs.map((need) => [need.title, need.need])).toEqual([["Robotics", "Stage 2 review"]]);
  });

  it("counts the visible groups by pending stage, behind schedule and revisions", () => {
    const revisions = record("Harbor", {
      initialCutMediaItemId: "cut-2",
      initialCutMediaItem: {
        currentVersion: { id: "v2", createdAt: utc("2026-10-10"), versionNumber: 1, approvalStatus: "NEEDS_CHANGES" }
      },
      approval: { stage: "DRAFT", controversial: false, signoffs: [] }
    });
    const { overview } = buildGroupsPart([...RECORDS, revisions] as never, GRADES, READY, EXEC, CYCLE_DATES, NOW);
    expect(overview.total).toBe(5);
    expect(Object.fromEntries(overview.stages.map((stage) => [stage.key, stage.count]))).toEqual({
      pitching: 1,
      brainstorming: 1,
      "a-roll": 0,
      "initial-stage-1": 1,
      "initial-stage-2": 0,
      "initial-stage-3": 1,
      "final-cut": 0,
      done: 1
    });
    // Theater (pitch), Garden (contact) and Harbor (Stage 1 closed Oct 11) missed a deadline.
    expect(overview.behind).toBe(3);
    expect(overview.revisions).toBe(1);
  });
});

describe("buildCalendarPart", () => {
  const overrides = [
    { date: "2026-10-16", kind: "SHOW", label: "" },
    { date: "2026-10-19", kind: "PA", label: "" },
    { date: "2026-10-21", kind: "SHOW", label: "" }
  ];

  it("flags show days without anchors or a queued package and PA days without announcers", () => {
    const { needs } = buildCalendarPart(
      {
        overrides,
        entries: [{ date: "2026-10-16", content: setCalendarAnchors(SHOW_TEMPLATE, ["Abby", "Otto"]) }],
        queued: [{ id: "row-1", groupTopic: "Robotics", cycleNumber: 1, queuedForShowDate: "2026-10-16" }],
        livestreams: []
      },
      "2026-10-15"
    );
    const keys = needs.map((need) => need.key);
    expect(keys).not.toContain("anchors-2026-10-16");
    expect(keys).not.toContain("queue-2026-10-16");
    expect(keys).toEqual(expect.arrayContaining(["announcers-2026-10-19", "anchors-2026-10-21", "queue-2026-10-21"]));
    const anchors = needs.find((need) => need.key === "anchors-2026-10-21");
    expect(anchors).toMatchObject({ title: "Anchors for Wed, Oct 21", need: "None set", href: "/master-calendar" });
    expect(needs.find((need) => need.key === "queue-2026-10-21")?.href).toBe("/publishing-queue");
  });

  it("lists the week's shows and livestreams by day", () => {
    const { events } = buildCalendarPart(
      {
        overrides,
        entries: [],
        queued: [],
        livestreams: [
          {
            id: "ls-1",
            title: "Football vs. Gunn",
            startsAt: new Date("2026-10-17T01:00:00.000Z"),
            capacity: 4,
            _count: { attendees: 3, signups: 2 }
          }
        ]
      },
      "2026-10-15"
    );
    const shown = events.map((event) => event.key);
    expect(shown.indexOf("show-2026-10-16")).toBeLessThan(shown.indexOf("livestream-ls-1"));
    expect(shown.indexOf("livestream-ls-1")).toBeLessThan(shown.indexOf("show-2026-10-21"));
    expect(events.find((event) => event.key === "livestream-ls-1")?.title).toBe("Football vs. Gunn");
  });
});

describe("loadExecutiveDashboard", () => {
  let inFlight = 0;
  let peak = 0;

  /** A mock query that resolves on a later tick, so overlapping calls show up in `peak`. */
  function query<T>(value: T | (() => T)) {
    return vi.fn(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight -= 1;
      return typeof value === "function" ? (value as () => T)() : value;
    });
  }

  beforeEach(() => {
    inFlight = 0;
    peak = 0;
    mocks.ensurePackageProgressDefaults.mockImplementation(query([CYCLE]));
    mocks.canManageLivestreams.mockResolvedValue(true);
    mocks.loadRequiredFinalCutGraders.mockImplementation(
      query([
        { userId: "exec-1", name: "Otto", email: null, category: null },
        { userId: "exec-2", name: "Sage", email: null, category: null }
      ])
    );
    mocks.prisma.packageExtensionRequest.findMany.mockImplementation(
      query([
        {
          createdAt: new Date("2026-10-12T19:00:00.000Z"),
          producerGranted: true,
          memberConsents: [],
          approvals: [],
          progressRow: { assignedProducerUserId: "ap-1", members: [{ userId: "student-1" }] }
        },
        {
          // Members haven't all agreed yet, so it doesn't wait on producers.
          createdAt: new Date("2026-10-01T19:00:00.000Z"),
          producerGranted: false,
          memberConsents: [],
          approvals: [],
          progressRow: { assignedProducerUserId: "ap-1", members: [{ userId: "student-2" }] }
        }
      ])
    );
    mocks.prisma.participationGradeRequest.aggregate.mockImplementation(
      query(() => {
        throw new Error("participation down");
      })
    );
    mocks.prisma.platformAccessRequest.aggregate.mockImplementation(
      query({ _count: { _all: 2 }, _min: { requestedAt: new Date("2026-10-14T19:00:00.000Z") } })
    );
    mocks.prisma.livestreamSignupRequest.aggregate.mockImplementation(query({ _count: { _all: 0 }, _min: { createdAt: null } }));
    // The roster (by cycle) and the week's queued packages (no cycle) share this mock.
    mocks.prisma.packageProgressRow.findMany.mockImplementation(async ({ where }: { where: { cycleNumber?: number } }) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight -= 1;
      return where.cycleNumber ? RECORDS : [];
    });
    mocks.prisma.packageGrade.findMany.mockImplementation(query(GRADES));
    mocks.prisma.auditLog.findMany.mockImplementation(
      query([{ targetId: "Garden", metadata: { kind: "ready", stage: "brainstorming" }, createdAt: new Date("2026-09-26T17:00:00.000Z") }])
    );
    mocks.prisma.schoolCalendarDay.findMany.mockImplementation(query([]));
    mocks.prisma.masterCalendarEntry.findMany.mockImplementation(query([]));
    mocks.prisma.livestreamEvent.findMany.mockImplementation(query([]));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("orders every kind together, renders the rest when one part fails, and stays within 5 queries at once", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const dashboard = await loadExecutiveDashboard(EXEC, NOW);

    expect(dashboard.cycleNumber).toBe(1);
    expect(dashboard.failed).toEqual(["participation"]);
    expect(error).toHaveBeenCalledWith("Executive dashboard part failed: participation", expect.any(Error));
    const keys = dashboard.needs.map((need) => need.key);
    // Garden is overdue; this week's show days come before Robotics (due Oct 27); then the
    // counted kinds by how long they've waited.
    expect(keys[0]).toBe("group-Garden");
    expect(keys.indexOf("anchors-2026-10-16")).toBeLessThan(keys.indexOf("group-Robotics"));
    expect(keys.indexOf("group-Robotics")).toBeLessThan(keys.indexOf("extensions"));
    expect(keys).toContain("extensions");
    expect(keys.indexOf("extensions")).toBeLessThan(keys.indexOf("access"));
    expect(keys).not.toContain("livestreams");
    expect(dashboard.needs.find((need) => need.key === "extensions")?.need).toBe("1 waiting on you");
    expect(dashboard.overview?.total).toBe(4);
    expect(dashboard.deadlines?.map((deadline) => deadline.label)).toEqual(["Initial Cut · Stage 2", "Initial Cut · Stage 3"]);
    expect(dashboard.events).not.toBeNull();
    expect(dashboard.reviewQueue?.map((row) => row.topic)).toContain("Robotics");
    expect(dashboard.gradersLoaded).toBe(true);
    expect(dashboard.showDays).not.toBeNull();
    expect(peak).toBeLessThanOrEqual(5);
  });

  it("marks the groups as failed when the cycles can't load", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.ensurePackageProgressDefaults.mockRejectedValue(new Error("db down"));
    const dashboard = await loadExecutiveDashboard(EXEC, NOW);
    expect(dashboard.cycleNumber).toBeNull();
    expect(dashboard.failed).toEqual(expect.arrayContaining(["cycle", "groups", "participation"]));
    expect(dashboard.overview).toBeNull();
    expect(dashboard.deadlines).toBeNull();
    expect(dashboard.needs.some((need) => need.kind === "access")).toBe(true);
  });
});

describe("class queues", () => {
  const studio = record("Studio", {
    initialCut: true,
    finalCut: true,
    finalCutMediaItemId: "final-2",
    finalCutMediaItem: { createdAt: utc("2026-10-14") },
    queuedForAirAt: utc("2026-10-14"),
    approval: { stage: "APPROVED", controversial: false, signoffs: [] },
    finalCutScores: [
      { graderUserId: "exec-2", memberUserId: "Studio-member", points: 40, qualityPoints: 20, effortPoints: 20 }
    ]
  });
  const graders = [
    { userId: "exec-1", name: "Otto", email: null },
    { userId: "exec-2", name: "Sage", email: null }
  ];

  it("lists every group waiting on a review, overdue first, then longest waiting", () => {
    const { reviewQueue } = buildGroupsPart([...RECORDS, studio] as never, GRADES, READY, EXEC, CYCLE_DATES, NOW, graders);
    expect(reviewQueue.map((row) => [row.topic, row.stage])).toEqual([
      ["Theater", "Pitch"],
      ["Garden", "Brainstorm"],
      ["Bakery", "Final Cut to queue"],
      ["Robotics", "Initial Cut · Stage 3"]
    ]);
    const garden = reviewQueue.find((row) => row.topic === "Garden");
    expect(garden).toMatchObject({ waitingOn: "Rowan", forViewer: true, href: "/groups/Garden/brainstorming" });
    expect(garden?.members).toBe("Abby");
    expect(reviewQueue.find((row) => row.topic === "Robotics")?.waitingOn).toMatch(/^Execs/);
    expect(reviewQueue.find((row) => row.topic === "Theater")?.forViewer).toBe(false);
  });

  it("shows who still owes Final Cut scores, then graded groups not yet published", () => {
    const { gradingQueue } = buildGroupsPart([...RECORDS, studio] as never, GRADES, READY, EXEC, CYCLE_DATES, NOW, graders);
    expect(gradingQueue).toEqual([
      expect.objectContaining({
        topic: "Studio",
        state: "scoring",
        owing: ["Otto"],
        scored: 1,
        graders: 2,
        href: "/groups/Studio/final-cut",
        forViewer: true
      }),
      expect.objectContaining({ topic: "Bakery", state: "unpublished", href: "/grade-editor" })
    ]);
  });

  it("drops published groups from the grading queue", () => {
    const published = [{ ...GRADES[0], publishedAt: utc("2026-10-14") }];
    const { gradingQueue, activity } = buildGroupsPart(RECORDS as never, published, READY, EXEC, CYCLE_DATES, NOW, graders);
    expect(gradingQueue).toEqual([]);
    expect(activity[0]).toMatchObject({ topic: "Bakery", text: "Grades published" });
  });

  it("builds recent activity from sign-offs and uploads, newest first", () => {
    const { activity } = buildGroupsPart(RECORDS as never, GRADES, READY, EXEC, CYCLE_DATES, NOW, graders);
    expect(activity.map((entry) => [entry.topic, entry.text])).toEqual([
      ["Robotics", "Sage approved Stage 2"],
      ["Bakery", "Final Cut turned in"],
      ["Robotics", "Initial Cut V1 uploaded"],
      ["Garden", "Brainstorm sent for review"]
    ]);
  });
});

describe("upcoming show days and livestreams", () => {
  it("lists two weeks of show and PA days with who's on air, what's queued and what's missing", () => {
    const { showDays, livestreams } = buildCalendarPart(
      {
        overrides: [
          { date: "2026-10-16", kind: "SHOW", label: "" },
          { date: "2026-10-26", kind: "PA", label: "" },
          { date: "2026-10-28", kind: "SHOW", label: "Spirit Week Recap" }
        ],
        entries: [{ date: "2026-10-16", content: setCalendarAnchors(SHOW_TEMPLATE, ["Abby"]) }],
        queued: [{ id: "row-1", groupTopic: "Robotics", cycleNumber: 1, queuedForShowDate: "2026-10-28" }],
        livestreams: [
          { id: "ls-1", title: "Volleyball", startsAt: new Date("2026-10-27T01:00:00.000Z"), capacity: 4, _count: { attendees: 4, signups: 0 } },
          // Past the 14 days.
          { id: "ls-2", title: "Later", startsAt: new Date("2026-11-05T01:00:00.000Z"), capacity: 4, _count: { attendees: 0, signups: 1 } }
        ]
      },
      "2026-10-15"
    );
    const byDate = Object.fromEntries(showDays.map((row) => [row.dateKey, row]));
    expect(byDate["2026-10-16"]).toMatchObject({ kind: "SHOW", anchors: ["Abby"], missing: ["1 anchor", "Nothing queued"] });
    expect(byDate["2026-10-26"]).toMatchObject({ kind: "PA", missing: ["No PA"] });
    expect(byDate["2026-10-28"]).toMatchObject({
      label: "Spirit Week Recap",
      packages: [{ id: "row-1", title: "Robotics" }],
      missing: ["No anchors"]
    });
    expect(showDays.every((row) => row.dateKey < "2026-10-29")).toBe(true);
    expect(livestreams).toEqual([
      expect.objectContaining({ id: "ls-1", crew: 4, capacity: 4, openLabel: "Full", pending: 0 })
    ]);
  });
});

describe("buildAllCyclesPart", () => {
  it("keeps an earlier cycle's cut in review in the queue, tagged with its cycle, while the overview stays on this cycle", () => {
    const earlier = { ...stage3, id: "old-robotics", cycleNumber: 1, groupTopic: "Old Robotics" };
    const current = RECORDS.map((entry) => ({ ...entry, cycleNumber: 2 }));
    const cycles = [
      { cycleNumber: 1, pitchingDate: null, proofOfContactDate: null, aRollBRollDate: null, initialCutDate: null, finalCutDate: null },
      { cycleNumber: 2, pitchingDate: null, proofOfContactDate: null, aRollBRollDate: null, initialCutDate: null, finalCutDate: null }
    ];
    const part = buildAllCyclesPart(
      [earlier, ...current] as never,
      [],
      READY,
      EXEC,
      cycles as never,
      2,
      NOW
    );
    const old = part.reviewQueue.find((row) => row.topic === "Old Robotics");
    expect(old?.cycleLabel).toBe("Cycle 1");
    expect(old?.waitingOn).toMatch(/^Execs/);
    expect(part.reviewQueue.filter((row) => row.cycleLabel === null).length).toBeGreaterThan(0);
    const totalCurrent = buildGroupsPart(current as never, [], READY, EXEC, null, NOW).overview.total;
    expect(part.overview.total).toBe(totalCurrent);
  });

  it("leaves out cycle 0 (custom Publishing Queue packages)", () => {
    const custom = { ...stage3, id: "custom-1", cycleNumber: 0, groupTopic: "Puppy Yoga" };
    const part = buildAllCyclesPart([custom] as never, [], READY, EXEC, [] as never, 2, NOW);
    expect(part.reviewQueue).toEqual([]);
    expect(part.needs).toEqual([]);
  });
});
