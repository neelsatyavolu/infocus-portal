import { describe, expect, it } from "vitest";
import {
  allowedViews,
  canRequest,
  capacityTag,
  filterSchedule,
  groupRequests,
  groupSchedule,
  managedCount,
  memberMatches,
  openSlotStats,
  personalHours,
  personalStatus,
  scheduleFilterCounts,
  scheduleFilterOptions,
  type EventRow,
  type Payload,
  type PendingSignup
} from "@/app/(app)/livestreams/livestreams-model";
import {
  CAPACITY_ERROR,
  HOURS_ERROR,
  emptyForm,
  eventPayload,
  formFromEvent,
  validateForm
} from "@/app/(app)/livestreams/livestreams-form";
import { diffSnapshots, newSince, personalSnapshot } from "@/app/(app)/livestreams/since-last-visit";

const NOW = new Date(2026, 9, 15, 12, 0);
const ME = "user-abby";

function at(day: number, hour = 18, minute = 0) {
  return new Date(2026, 9, day, hour, minute).toISOString();
}

function makeEvent(overrides: Partial<EventRow> & { id: string }): EventRow {
  const capacity = overrides.capacity ?? 4;
  const attendees = overrides.attendees ?? [];
  return {
    title: `Livestream ${overrides.id}`,
    startsAt: at(18),
    arrivesAt: at(18, 17, 15),
    location: "PAC",
    status: "SCHEDULED",
    availability: "PUBLIC",
    hours: null,
    notes: "",
    manager: null,
    attendeeCount: attendees.length,
    openSlots: Math.max(0, capacity - attendees.length),
    capacityTone: "open",
    mySignup: null,
    pendingSignupCount: 0,
    ...overrides,
    capacity,
    attendees
  };
}

function crew(id: string, creditHours: number | null = null) {
  return { id, name: `Member ${id}`, email: `${id}@example.edu`, creditHours };
}

function makePayload(events: EventRow[], overrides: Partial<Payload> = {}): Payload {
  return {
    semester: { label: "S1", start: at(1), end: at(31) },
    requiredHours: 8,
    canManage: false,
    canSignup: true,
    canAppointManagers: false,
    canViewCompletion: false,
    currentUserId: ME,
    managers: [],
    events,
    pendingSignups: [],
    mySignups: [],
    ...overrides
  };
}

describe("capacityTag", () => {
  it("names the room left on Scheduled livestreams, past ones included, in a calm tone", () => {
    expect(capacityTag(makeEvent({ id: "a", capacity: 2, attendees: [crew("x"), crew("y")] }), NOW, false)).toEqual({ label: "Full", tone: "neutral" });
    expect(capacityTag(makeEvent({ id: "b", capacity: 2, attendees: [crew("x")] }), NOW, false)).toEqual({ label: "1 open", tone: "neutral" });
    expect(capacityTag(makeEvent({ id: "c", capacity: 4 }), NOW, false)).toEqual({ label: "4 open", tone: "neutral" });
    expect(capacityTag(makeEvent({ id: "d", startsAt: at(1) }), NOW, true)).toEqual({ label: "4 open", tone: "neutral" });
  });

  it("warns managers only about a livestream within a week that is short on crew", () => {
    expect(capacityTag(makeEvent({ id: "a", startsAt: at(18) }), NOW, true)).toEqual({ label: "4 open", tone: "warning" });
    expect(capacityTag(makeEvent({ id: "b", startsAt: at(30) }), NOW, true)).toEqual({ label: "4 open", tone: "neutral" });
    expect(capacityTag(makeEvent({ id: "c", capacity: 1, attendees: [crew("x")] }), NOW, true)).toEqual({ label: "Full", tone: "neutral" });
  });

  it("has no capacity tag once a livestream is Completed or Cancelled", () => {
    expect(capacityTag(makeEvent({ id: "a", status: "COMPLETED" }), NOW, true)).toBeNull();
    expect(capacityTag(makeEvent({ id: "b", status: "CANCELLED" }), NOW, true)).toBeNull();
  });
});

describe("openSlotStats", () => {
  it("adds open seats on every Scheduled livestream, past ones included", () => {
    const events = [
      makeEvent({ id: "a", capacity: 4, attendees: [crew("x")] }),
      makeEvent({ id: "b", capacity: 2, startsAt: at(1) }),
      makeEvent({ id: "c", capacity: 1, attendees: [crew("y")] }),
      makeEvent({ id: "d", status: "COMPLETED" })
    ];
    expect(openSlotStats(events)).toEqual({ slots: 5, events: 2 });
  });
});

describe("scheduleFilterOptions", () => {
  it("gives students Open and Mine", () => {
    expect(scheduleFilterOptions({ canManage: false, canSignup: true })).toEqual(["all", "open", "mine"]);
  });

  it("gives appointed managers Needs action only", () => {
    expect(scheduleFilterOptions({ canManage: true, canSignup: false })).toEqual(["all", "action"]);
  });

  it("gives producers who can also sign up every filter", () => {
    expect(scheduleFilterOptions({ canManage: true, canSignup: true })).toEqual(["all", "action", "open", "mine"]);
  });
});

describe("canRequest and personalStatus", () => {
  const payload = makePayload([]);

  it("allows a request on an open Scheduled livestream", () => {
    expect(canRequest(makeEvent({ id: "a" }), payload)).toBe(true);
  });

  it("blocks full, finished, crewed and pending livestreams", () => {
    expect(canRequest(makeEvent({ id: "a", capacity: 1, attendees: [crew("x")] }), payload)).toBe(false);
    expect(canRequest(makeEvent({ id: "b", status: "COMPLETED" }), payload)).toBe(false);
    expect(canRequest(makeEvent({ id: "c", attendees: [crew(ME)] }), payload)).toBe(false);
    expect(canRequest(makeEvent({ id: "d", mySignup: { id: "s", status: "PENDING", availableFullEvent: true } }), payload)).toBe(false);
  });

  it("offers Request again after a denial, and nothing to appointed managers", () => {
    const denied = makeEvent({ id: "a", mySignup: { id: "s", status: "DENIED", availableFullEvent: true } });
    expect(canRequest(denied, payload)).toBe(true);
    expect(personalStatus(denied, ME, [])).toBe("denied");
    expect(canRequest(makeEvent({ id: "b" }), makePayload([], { canSignup: false }))).toBe(false);
  });

  it("falls back to mySignups when the event has no copy of my request", () => {
    const event = makeEvent({ id: "a" });
    const mySignups = [{ id: "s", eventId: "a", status: "PENDING" }];
    expect(personalStatus(event, ME, mySignups)).toBe("pending");
    expect(canRequest(event, makePayload([], { mySignups }))).toBe(false);
  });
});

describe("filterSchedule and scheduleFilterCounts", () => {
  const events = [
    makeEvent({ id: "open" }),
    makeEvent({ id: "full", capacity: 1, attendees: [crew("x")] }),
    makeEvent({ id: "mine", attendees: [crew(ME)] }),
    makeEvent({ id: "asked", mySignup: { id: "s", status: "PENDING", availableFullEvent: true }, pendingSignupCount: 1 }),
    makeEvent({ id: "past", startsAt: at(2), arrivesAt: at(2, 17) }),
    makeEvent({ id: "done", startsAt: at(3), status: "COMPLETED", hours: 3 })
  ];
  const payload = makePayload(events, { canManage: true });
  const ids = (list: EventRow[]) => list.map((event) => event.id);

  it("Open shows upcoming livestreams I can still request", () => {
    expect(ids(filterSchedule(events, "open", payload, NOW))).toEqual(["open"]);
  });

  it("Mine shows crews and requests", () => {
    expect(ids(filterSchedule(events, "mine", payload, NOW))).toEqual(["mine", "asked"]);
  });

  it("Needs action shows requests to review and past livestreams still Scheduled", () => {
    expect(ids(filterSchedule(events, "action", payload, NOW))).toEqual(["asked", "past"]);
  });

  it("counts match what each filter shows", () => {
    expect(scheduleFilterCounts(payload, NOW)).toEqual({ all: 6, open: 1, mine: 2, action: 2 });
  });
});

describe("groupSchedule", () => {
  it("puts today and later first, then past livestreams to close out, then the rest newest first", () => {
    const events = [
      makeEvent({ id: "old-done", startsAt: at(1), status: "COMPLETED" }),
      makeEvent({ id: "old-open", startsAt: at(2) }),
      makeEvent({ id: "recent-done", startsAt: at(10), status: "COMPLETED" }),
      makeEvent({ id: "recent-open", startsAt: at(12) }),
      makeEvent({ id: "today", startsAt: at(15, 9) }),
      makeEvent({ id: "later", startsAt: at(20) })
    ];
    const groups = groupSchedule(events, NOW);
    expect(groups.upcoming.map((event) => event.id)).toEqual(["today", "later"]);
    expect(groups.earlier.map((event) => event.id)).toEqual(["recent-open", "old-open", "recent-done", "old-done"]);
  });
});

describe("groupRequests", () => {
  function signup(id: string, eventId: string, createdDay: number, event: PendingSignup["event"]): PendingSignup {
    return {
      id,
      eventId,
      status: "PENDING",
      availableFullEvent: true,
      note: "",
      createdAt: at(createdDay, 9),
      user: { id: `u-${id}`, name: `Member ${id}`, email: null },
      event
    };
  }

  it("groups by livestream, upcoming first, oldest request first, unknown livestreams last", () => {
    const soon = makeEvent({ id: "soon", startsAt: at(18) });
    const past = makeEvent({ id: "past", startsAt: at(5) });
    const pending = [
      signup("r1", "soon", 14, { id: "soon", title: soon.title, startsAt: soon.startsAt }),
      signup("r2", "gone", 13, null),
      signup("r3", "past", 4, { id: "past", title: past.title, startsAt: past.startsAt }),
      signup("r4", "soon", 12, { id: "soon", title: soon.title, startsAt: soon.startsAt }),
      signup("r5", "other", 3, { id: "other", title: "Last semester", startsAt: at(20) })
    ];
    const groups = groupRequests(pending, [soon, past], NOW);
    expect(groups.map((group) => group.key)).toEqual(["soon", "other", "past", "unknown-gone"]);
    expect(groups[0].requests.map((request) => request.id)).toEqual(["r4", "r1"]);
    expect(groups[0].event?.id).toBe("soon");
    expect(groups[1].otherSemester).toBe(true);
    expect(groups[3]).toMatchObject({ title: "Event", startsAt: null, event: null, otherSemester: false });
  });
});

describe("personalHours and managedCount", () => {
  const events = [
    makeEvent({ id: "a", status: "COMPLETED", hours: 3, attendees: [crew(ME)] }),
    makeEvent({ id: "b", status: "COMPLETED", hours: 3, attendees: [crew(ME, 1.5)] }),
    makeEvent({ id: "c", status: "COMPLETED", hours: 0, attendees: [crew(ME, 2)], manager: { id: ME, name: "Abby", email: null } }),
    makeEvent({ id: "d", startsAt: at(2), attendees: [crew(ME)] }),
    makeEvent({ id: "e", status: "COMPLETED", hours: 2, manager: { id: ME, name: "Abby", email: null } }),
    makeEvent({ id: "f", status: "COMPLETED", hours: 4, attendees: [crew("someone-else")] })
  ];

  it("adds my credited hours from Completed livestreams and counts ones still waiting", () => {
    expect(personalHours(events, ME, NOW)).toEqual({ hours: 4.5, completed: 3, waiting: 1 });
  });

  it("counts Completed livestreams I managed that award credit", () => {
    expect(managedCount(events, ME)).toBe(1);
  });
});

describe("memberMatches", () => {
  const member = { id: "m", name: "Sage Example", nickname: "Otto", email: "sage@example.edu" };

  it("finds a member by nickname, legal name or email", () => {
    expect(memberMatches(member, "otto")).toBe(true);
    expect(memberMatches(member, "sage ex")).toBe(true);
    expect(memberMatches(member, "@example.edu")).toBe(true);
    expect(memberMatches(member, "abby")).toBe(false);
    expect(memberMatches(member, "  ")).toBe(true);
  });
});

describe("allowedViews", () => {
  it("shows Sign ups and Completion only to people who can use them", () => {
    expect(allowedViews(null)).toEqual(["schedule"]);
    expect(allowedViews({ canManage: false, canViewCompletion: false })).toEqual(["schedule"]);
    expect(allowedViews({ canManage: true, canViewCompletion: false })).toEqual(["schedule", "signups"]);
    expect(allowedViews({ canManage: true, canViewCompletion: true })).toEqual(["schedule", "signups", "completion"]);
  });
});

describe("event form", () => {
  it("starts a new event Unconfirmed, Scheduled, with room for 4", () => {
    const form = emptyForm();
    expect(form).toMatchObject({ status: "SCHEDULED", availability: "UNCONFIRMED", capacity: "4", hours: "", managerUserId: "" });
    expect(form.startsAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });

  it("checks the three required fields", () => {
    expect(validateForm({ ...emptyForm(), title: " ", startsAt: "", arrivalTime: "" })).toEqual({
      title: "Title is required.",
      startsAt: "Event start time is required.",
      arrivalTime: "Arrival time is required."
    });
    expect(validateForm({ ...emptyForm(), title: "Game", arrivalTime: "17:00" })).toEqual({});
  });

  it("checks the number limits the browser used to enforce", () => {
    const base = { ...emptyForm(), title: "Game", arrivalTime: "17:00" };
    expect(validateForm({ ...base, hours: "", capacity: "" })).toEqual({});
    expect(validateForm({ ...base, hours: "2.25", capacity: "50" })).toEqual({});
    expect(validateForm({ ...base, hours: "1.3" })).toEqual({ hours: HOURS_ERROR });
    expect(validateForm({ ...base, hours: "25" })).toEqual({ hours: HOURS_ERROR });
    expect(validateForm({ ...base, capacity: "0" })).toEqual({ capacity: CAPACITY_ERROR });
    expect(validateForm({ ...base, capacity: "60" })).toEqual({ capacity: CAPACITY_ERROR });
    expect(validateForm({ ...base, capacity: "2.5" })).toEqual({ capacity: CAPACITY_ERROR });
    expect(
      validateForm({ ...base, attendeeUserIds: ["x", "y", "z"], attendeeCredits: { x: "", y: "30", z: "-1" } })
    ).toEqual({ credits: ["y", "z"] });
  });

  it("Complete… presets Completed and keeps every other field", () => {
    const event = makeEvent({ id: "a", hours: 2, attendees: [crew("x", 1)], manager: { id: "m", name: "Otto", email: null } });
    const form = formFromEvent(event, true);
    expect(form).toMatchObject({ status: "COMPLETED", hours: "2", capacity: "4", managerUserId: "m", attendeeUserIds: ["x"] });
    expect(form.attendeeCredits).toEqual({ x: "1" });
    expect(formFromEvent(event).status).toBe("SCHEDULED");
  });

  it("maps the form to the same request body as before", () => {
    const body = eventPayload({
      ...emptyForm(),
      title: "  Varsity Game  ",
      startsAt: "2026-10-18T18:00",
      arrivalTime: "17:15",
      location: " Gym ",
      hours: "",
      capacity: "",
      notes: "Bring tripods",
      managerUserId: "",
      attendeeUserIds: ["x", "y"],
      attendeeCredits: { x: "2.5", y: " " }
    });
    expect(body).toEqual({
      title: "Varsity Game",
      startsAt: new Date("2026-10-18T18:00").toISOString(),
      arrivesAt: new Date("2026-10-18T17:15").toISOString(),
      location: "Gym",
      status: "SCHEDULED",
      availability: "UNCONFIRMED",
      hours: null,
      capacity: 4,
      notes: "Bring tripods",
      managerUserId: null,
      attendeeCredits: [
        { userId: "x", creditHours: 2.5 },
        { userId: "y", creditHours: null }
      ],
      attendeeUserIds: ["x", "y"]
    });
    expect(eventPayload({ ...emptyForm(), title: "T", hours: "0", capacity: "6", arrivalTime: "10:00" })).toMatchObject({ hours: 0, capacity: 6 });
  });
});

describe("since last visit", () => {
  it("reports new crews, denials and hours, but not my own new requests", () => {
    const before = [makeEvent({ id: "a" }), makeEvent({ id: "b" }), makeEvent({ id: "c" })];
    const previous = personalSnapshot(makePayload(before), NOW);
    const after = [
      makeEvent({ id: "a", title: "Choir", attendees: [crew(ME)] }),
      makeEvent({ id: "b", title: "Game", mySignup: { id: "s", status: "DENIED", availableFullEvent: true } }),
      makeEvent({ id: "c", mySignup: { id: "t", status: "PENDING", availableFullEvent: true } }),
      makeEvent({ id: "d", status: "COMPLETED", hours: 3, attendees: [crew(ME)] })
    ];
    const next = personalSnapshot(makePayload(after), NOW);
    const changes = diffSnapshots(previous, next, after);
    expect(changes.eventIds).toEqual(["a", "b", "d"]);
    expect(changes.lines).toEqual(["On crew for Choir", "Request denied for Game", "On crew for Livestream d", "+3 h"]);
    expect(changes.hasDenial).toBe(true);
  });

  it("finds requests that arrived after the last visit", () => {
    const items = [{ createdAt: at(10) }, { createdAt: at(14) }];
    expect(newSince(items, null)).toEqual([]);
    expect(newSince(items, new Date(2026, 9, 12).getTime())).toEqual([{ createdAt: at(14) }]);
  });
});
