import { beforeEach, describe, expect, it, vi } from "vitest";

type User = { id: string; email: string | null; notificationPreference: { emailEnabled: boolean; notificationEmail: string | null } | null };

const mocks = vi.hoisted(() => ({
  meeting: null as null | Record<string, unknown>,
  participants: [] as Array<{ meetingId: string; userId: string; state: string }>,
  users: [] as User[],
  producers: [] as string[],
  updates: [] as Array<Record<string, unknown>>,
  send: vi.fn(async (_payload: Record<string, unknown>) => ({ configured: true, sent: 1, failed: 0 }))
}));

vi.mock("@/src/lib/email", () => ({ sendBrandedEmails: mocks.send }));
vi.mock("@/src/server/meetings-people", () => ({ producerUserIds: vi.fn(async () => mocks.producers) }));
vi.mock("@/src/server/meetings-keys", () => ({ readMeetingKey: vi.fn(() => null) }));
vi.mock("@/src/server/meetings-scribe", () => ({ startMeetingScribe: vi.fn(async () => true) }));
vi.mock("@/src/lib/prisma", () => ({
  prisma: {
    meeting: {
      findUnique: vi.fn(async () => mocks.meeting),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        mocks.updates.push(data);
        mocks.meeting = { ...mocks.meeting, ...data };
        return mocks.meeting;
      }),
      updateMany: vi.fn(async () => ({ count: 0 }))
    },
    meetingParticipant: {
      findMany: vi.fn(async ({ where }: { where: { meetingId: string; state: string } }) =>
        mocks.participants.filter((p) => p.meetingId === where.meetingId && p.state === where.state)
      )
    },
    user: {
      findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) => mocks.users.filter((u) => where.id.in.includes(u.id)))
    }
  }
}));

import { notesEmailHtml } from "@/src/lib/meetings/notes-markdown";
import { applyMeetingNotesUpdate } from "@/src/server/meetings-notes";
import { emailMeetingNotes, shouldEmailNotes } from "@/src/server/meetings-notes-email";

const SUMMARY = "# Pitch review\n\nPitches are due Friday.\n\n## Action items\n- [ ] **Otto** — Email the contact";

const user = (id: string, extra: Partial<User> = {}): User => ({
  id,
  email: `${id}@example.edu`,
  notificationPreference: null,
  ...extra
});

function meeting(extra: Record<string, unknown> = {}) {
  return {
    id: "m1",
    title: "InFocus Producer Meeting",
    startsAt: new Date("2026-10-08T04:15:00.000Z"),
    seriesKey: "producers",
    status: "ENDED",
    notesEnabled: true,
    notesStatus: "PROCESSING",
    notesPart: 1,
    notesDrivePaths: [],
    notesSummary: null,
    ...extra
  };
}

const sentTo = () => (mocks.send.mock.calls[0]?.[0] as { recipients: string[] } | undefined)?.recipients;

beforeEach(() => {
  mocks.send.mockClear();
  mocks.updates = [];
  mocks.producers = ["abby", "otto", "sage"];
  mocks.users = [user("abby"), user("otto"), user("sage")];
  mocks.participants = [];
  mocks.meeting = meeting();
});

describe("shouldEmailNotes", () => {
  const before = { status: "ENDED", notesStatus: "PROCESSING" as const, notesDrivePaths: [] };

  it("emails the first READY summary after the meeting ended", () => {
    expect(shouldEmailNotes(before, "READY", { notesSummary: "x", notesDrivePaths: ["a"] })).toBe(true);
  });

  it("doesn't email while the meeting is still live, without a summary, or for other statuses", () => {
    expect(shouldEmailNotes({ ...before, status: "LIVE" }, "READY", { notesSummary: "x" })).toBe(false);
    expect(shouldEmailNotes(before, "READY", {})).toBe(false);
    expect(shouldEmailNotes(before, "FAILED", { notesSummary: "x" })).toBe(false);
  });

  it("doesn't email a repeated READY for the same part, but does for a new part", () => {
    const ready = { ...before, notesStatus: "READY" as const, notesDrivePaths: ["a"] };
    expect(shouldEmailNotes(ready, "READY", { notesSummary: "x" })).toBe(false);
    expect(shouldEmailNotes(ready, "READY", { notesSummary: "x", notesDrivePaths: ["a", "b"] })).toBe(true);
  });
});

describe("emailMeetingNotes", () => {
  it("sends the producer meeting's notes to every producer, attended or not", async () => {
    mocks.meeting = meeting({ notesSummary: SUMMARY, notesDrivePaths: ["a"] });
    mocks.participants = [{ meetingId: "m1", userId: "abby", state: "ADMITTED" }];
    await emailMeetingNotes("m1");
    expect(sentTo()).toEqual(["abby@example.edu", "otto@example.edu", "sage@example.edu"]);
    const payload = mocks.send.mock.calls[0][0] as Record<string, string>;
    expect(payload.subject).toBe("Notes: InFocus Producer Meeting · Wednesday, Oct 7");
    expect(payload.ctaUrl).toMatch(/\/meetings\/m1$/);
    expect(payload.idempotencyKey).toBe("meeting-notes/m1/1");
    expect(payload.extraHtml).toContain("Pitches are due Friday.");
  });

  it("sends any other meeting's notes only to the people let in (not removed, not the lobby)", async () => {
    mocks.meeting = meeting({ seriesKey: null, title: "Cycle 3 pitches", notesSummary: SUMMARY, notesDrivePaths: ["a"] });
    mocks.participants = [
      { meetingId: "m1", userId: "abby", state: "ADMITTED" },
      { meetingId: "m1", userId: "otto", state: "REMOVED" },
      { meetingId: "m1", userId: "sage", state: "WAITING" },
      { meetingId: "other", userId: "sage", state: "ADMITTED" }
    ];
    await emailMeetingNotes("m1");
    expect(sentTo()).toEqual(["abby@example.edu"]);
  });

  it("skips people who turned email off and uses a notification email when set", async () => {
    mocks.users = [
      user("abby", { notificationPreference: { emailEnabled: false, notificationEmail: null } }),
      user("otto", { notificationPreference: { emailEnabled: true, notificationEmail: "otto.notify@example.edu" } }),
      user("sage")
    ];
    mocks.meeting = meeting({ notesSummary: SUMMARY, notesDrivePaths: ["a"] });
    await emailMeetingNotes("m1");
    expect(sentTo()).toEqual(["otto.notify@example.edu", "sage@example.edu"]);
  });

  it("sends nothing without a summary or recipients, and never throws", async () => {
    mocks.meeting = meeting({ notesSummary: "  " });
    await emailMeetingNotes("m1");
    mocks.meeting = meeting({ seriesKey: null, notesSummary: SUMMARY });
    await emailMeetingNotes("m1");
    expect(mocks.send).not.toHaveBeenCalled();
    mocks.meeting = meeting({ notesSummary: SUMMARY });
    mocks.send.mockRejectedValueOnce(new Error("resend down"));
    await expect(emailMeetingNotes("m1")).resolves.toBeUndefined();
  });
});

describe("notes callback", () => {
  it("emails once when the notes become READY after the meeting ended", async () => {
    await applyMeetingNotesUpdate("m1", { status: "READY", summaryMarkdown: SUMMARY, drivePath: "a" });
    expect(mocks.send).toHaveBeenCalledTimes(1);
    await applyMeetingNotesUpdate("m1", { status: "READY", summaryMarkdown: SUMMARY, drivePath: "a" });
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it("waits while the meeting is still live (a part finished mid-call)", async () => {
    mocks.meeting = meeting({ status: "LIVE" });
    await applyMeetingNotesUpdate("m1", { status: "READY", summaryMarkdown: SUMMARY, drivePath: "a" });
    expect(mocks.send).not.toHaveBeenCalled();
  });
});

describe("notesEmailHtml", () => {
  it("renders headings, bullets, bold and action boxes, escaping everything", () => {
    const html = notesEmailHtml("# T\n\nSay <script>x</script> & **go**\n\n## Action items\n- [ ] **Otto** — Email");
    expect(html).toContain("&lt;script&gt;x&lt;/script&gt; &amp; <strong>go</strong>");
    expect(html).toContain("<li style=\"margin:0 0 4px\">☐ <strong>Otto</strong> — Email</li>");
    expect(html).not.toContain("<script>");
  });
});
