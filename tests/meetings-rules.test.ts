import { describe, expect, it, vi } from "vitest";

vi.mock("@/src/lib/prisma", () => ({ prisma: {} }));

import {
  canSeeMeeting,
  decideAdmission,
  isMeetingHost,
  isMeetingOpen,
  isMeetingProducer
} from "@/src/server/meetings-rules";

describe("isMeetingProducer", () => {
  it("allows associate producers and up, never people without a role", () => {
    expect(isMeetingProducer("ASSOCIATE_PRODUCER")).toBe(true);
    expect(isMeetingProducer("EXECUTIVE_PRODUCER")).toBe(true);
    expect(isMeetingProducer("ADVISER")).toBe(true);
    expect(isMeetingProducer("SUPER_ADMIN")).toBe(true);
    expect(isMeetingProducer(null)).toBe(false);
  });
});

describe("isMeetingHost", () => {
  const meeting = { access: "OPEN" as const, createdById: "creator", inviteeUserIds: [] };

  it("makes execs, the adviser and the super admin hosts of every meeting", () => {
    for (const role of ["EXECUTIVE_PRODUCER", "ADVISER", "SUPER_ADMIN"] as const) {
      expect(isMeetingHost({ userId: "someone", role }, meeting)).toBe(true);
    }
  });

  it("makes the creator a host, and no other associate producer", () => {
    expect(isMeetingHost({ userId: "creator", role: "ASSOCIATE_PRODUCER" }, meeting)).toBe(true);
    expect(isMeetingHost({ userId: "other", role: "ASSOCIATE_PRODUCER" }, meeting)).toBe(false);
    expect(isMeetingHost({ userId: "other", role: "ASSOCIATE_PRODUCER" }, { ...meeting, createdById: null })).toBe(false);
  });

  it("INVITE_ONLY: the creator and invited execs host; uninvited execs don't", () => {
    const invite = { access: "INVITE_ONLY" as const, createdById: "creator", inviteeUserIds: ["exec-in", "ap-in"] };
    expect(isMeetingHost({ userId: "creator", role: "EXECUTIVE_PRODUCER" }, invite)).toBe(true);
    expect(isMeetingHost({ userId: "exec-in", role: "EXECUTIVE_PRODUCER" }, invite)).toBe(true);
    expect(isMeetingHost({ userId: "ap-in", role: "ASSOCIATE_PRODUCER" }, invite)).toBe(false);
    expect(isMeetingHost({ userId: "exec-out", role: "SUPER_ADMIN" }, invite)).toBe(false);
  });
});

describe("EXECS_ONLY", () => {
  const execsOnly = { access: "EXECS_ONLY" as const, createdById: "u-sage", inviteeUserIds: [] };

  it("only execs (EP, adviser, super admin) can see it or host it", () => {
    for (const role of ["EXECUTIVE_PRODUCER", "ADVISER", "SUPER_ADMIN"] as const) {
      expect(canSeeMeeting({ userId: "any-exec", role }, execsOnly)).toBe(true);
      expect(isMeetingHost({ userId: "any-exec", role }, execsOnly)).toBe(true);
    }
    expect(canSeeMeeting({ userId: "u-abby", role: "ASSOCIATE_PRODUCER" }, execsOnly)).toBe(false);
    expect(isMeetingHost({ userId: "u-abby", role: "ASSOCIATE_PRODUCER" }, execsOnly)).toBe(false);
    // A creator who is no longer an exec loses access too.
    expect(canSeeMeeting({ userId: "u-sage", role: "ASSOCIATE_PRODUCER" }, execsOnly)).toBe(false);
  });
});

describe("canSeeMeeting", () => {
  it("shows OPEN meetings to every producer", () => {
    expect(canSeeMeeting({ userId: "x", role: "ASSOCIATE_PRODUCER" }, { access: "OPEN", createdById: null, inviteeUserIds: [] })).toBe(true);
  });

  it("shows INVITE_ONLY meetings only to the creator and invitees, never to uninvited execs", () => {
    const invite = { access: "INVITE_ONLY" as const, createdById: "creator", inviteeUserIds: ["ap-in"] };
    expect(canSeeMeeting({ userId: "creator", role: "EXECUTIVE_PRODUCER" }, invite)).toBe(true);
    expect(canSeeMeeting({ userId: "ap-in", role: "ASSOCIATE_PRODUCER" }, invite)).toBe(true);
    expect(canSeeMeeting({ userId: "ap-out", role: "ASSOCIATE_PRODUCER" }, invite)).toBe(false);
    expect(canSeeMeeting({ userId: "exec-out", role: "ADVISER" }, invite)).toBe(false);
  });
});

describe("decideAdmission", () => {
  it("always admits hosts, even after a removal", () => {
    expect(decideAdmission({ isHost: true, quickAccess: false, previous: null })).toBe("ADMITTED");
    expect(decideAdmission({ isHost: true, quickAccess: false, previous: "REMOVED" })).toBe("ADMITTED");
  });

  it("keeps an admitted participant admitted on rejoin", () => {
    expect(decideAdmission({ isHost: false, quickAccess: false, previous: "ADMITTED" })).toBe("ADMITTED");
  });

  it("lets new or waiting producers straight in with quick access, never someone denied or removed", () => {
    expect(decideAdmission({ isHost: false, quickAccess: true, previous: null })).toBe("ADMITTED");
    expect(decideAdmission({ isHost: false, quickAccess: true, previous: "WAITING" })).toBe("ADMITTED");
    expect(decideAdmission({ isHost: false, quickAccess: true, previous: "DENIED" })).toBe("WAITING");
    expect(decideAdmission({ isHost: false, quickAccess: true, previous: "REMOVED" })).toBe("WAITING");
  });

  it("makes everyone else knock", () => {
    for (const previous of [null, "WAITING", "DENIED", "REMOVED"] as const) {
      expect(decideAdmission({ isHost: false, quickAccess: false, previous })).toBe("WAITING");
    }
  });
});

describe("isMeetingOpen", () => {
  it("is open until ended or cancelled", () => {
    expect(isMeetingOpen("SCHEDULED")).toBe(true);
    expect(isMeetingOpen("LIVE")).toBe(true);
    expect(isMeetingOpen("ENDED")).toBe(false);
    expect(isMeetingOpen("CANCELED")).toBe(false);
  });
});
