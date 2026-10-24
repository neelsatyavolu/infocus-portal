import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  jobs: vi.fn(), updateMany: vi.fn(), publication: vi.fn(), schedule: vi.fn(), notify: vi.fn(), cron: vi.fn()
}));

vi.mock("@/src/lib/prisma", () => ({ prisma: {
  showEditJob: { findMany: mocks.jobs, updateMany: mocks.updateMany },
  showPublication: { findUnique: mocks.publication }
} }));
vi.mock("@/src/server/show-editor", async (original) => ({
  ...await original<typeof import("@/src/server/show-editor")>(),
  scheduleWithDefaults: mocks.schedule
}));
vi.mock("@/src/server/show-editor-notify", () => ({ notifyShowEditEscalation: mocks.notify }));
vi.mock("@/src/lib/cron-auth", () => ({ isCronRequest: mocks.cron }));

import { POST } from "@/app/api/service/show-editor/tick/route";
import { ShowEditError } from "@/src/server/show-editor";
import { runShowEditEscalations } from "@/src/server/show-editor-escalation";

// Friday 2026-10-23 airs; the 8:00 AM Pacific deadline is 15:00Z.
const SHOW = "2026-10-23";
const OUT = "Package Storage/Shows/2026-10-23/x.mp4";
const NIGHT_BEFORE = new Date("2026-10-23T05:00:00Z");
const DEADLINE = new Date("2026-10-23T15:00:00Z");

function job(overrides: Record<string, unknown> = {}) {
  return {
    id: "job1", showDate: SHOW, status: "REVIEW", version: 1, outputNasPath: OUT, createdById: "u1",
    finishedAt: new Date("2026-10-22T20:00:00Z"), checks: { coversClean: true }, ...overrides
  };
}

describe("approval escalation run", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.jobs.mockResolvedValue([job()]);
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.publication.mockResolvedValue({ status: "DRAFT", nasPath: OUT });
    mocks.schedule.mockResolvedValue(new Date("2026-10-23T15:30:00Z"));
    mocks.notify.mockResolvedValue(undefined);
  });

  it("looks at edits at Review for today's and tomorrow's show (Pacific)", async () => {
    mocks.jobs.mockResolvedValue([]);
    await runShowEditEscalations(new Date("2026-10-22T20:00:00Z"));
    expect(mocks.jobs).toHaveBeenCalledWith({ where: { status: "REVIEW", showDate: { gte: "2026-10-22", lte: SHOW } } });
  });

  it("escalates: records it for this version (keeping checks), then tells the producers", async () => {
    expect(await runShowEditEscalations(NIGHT_BEFORE)).toEqual({ checked: 1, escalated: 1, scheduled: 0, failed: 0 });
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: "job1", status: "REVIEW", version: 1 },
      data: { checks: { coversClean: true, escalation: { version: 1, producersAt: NIGHT_BEFORE.toISOString(), autoScheduledAt: null, autoScheduleError: null } } }
    });
    expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({ id: "job1" }), { kind: "escalate", at: NIGHT_BEFORE.toISOString() });
  });

  it("sends nothing when a producer acted in the meantime (the record didn't save)", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    expect((await runShowEditEscalations(NIGHT_BEFORE)).escalated).toBe(0);
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it("skips an edit that is no longer the show's draft", async () => {
    mocks.publication.mockResolvedValue({ status: "SCHEDULED", nasPath: OUT });
    await runShowEditEscalations(NIGHT_BEFORE);
    mocks.publication.mockResolvedValue({ status: "DRAFT", nasPath: "Package Storage/Shows/2026-10-23/upload.mp4" });
    await runShowEditEscalations(DEADLINE);
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.schedule).not.toHaveBeenCalled();
  });

  it("at the deadline: schedules no sooner than 15 minutes out, marks it PUBLISHED and tells the starter and show manager", async () => {
    expect(await runShowEditEscalations(DEADLINE)).toEqual({ checked: 1, escalated: 0, scheduled: 1, failed: 0 });
    expect(mocks.schedule).toHaveBeenCalledWith(SHOW, "u1", DEADLINE, new Date("2026-10-23T15:15:00Z"));
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: "job1", status: "REVIEW", version: 1 },
      data: expect.objectContaining({ status: "PUBLISHED", checks: expect.objectContaining({ escalation: expect.objectContaining({ autoScheduledAt: DEADLINE.toISOString() }) }) })
    });
    expect(mocks.notify).toHaveBeenCalledWith(expect.anything(), { kind: "auto-scheduled", publishAt: new Date("2026-10-23T15:30:00Z") });
  });

  it("a failed auto-schedule is recorded with its reason and reported once", async () => {
    mocks.schedule.mockRejectedValue(new ShowEditError("Pick a season first: use Change details.", 409));
    expect((await runShowEditEscalations(DEADLINE)).failed).toBe(1);
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { checks: expect.objectContaining({ escalation: expect.objectContaining({ autoScheduleError: "Pick a season first: use Change details." }) }) }
    }));
    expect(mocks.notify).toHaveBeenCalledWith(expect.anything(), { kind: "auto-schedule-failed", reason: "Pick a season first: use Change details." });

    // The next minute sees the recorded failure and leaves it alone.
    vi.clearAllMocks();
    mocks.jobs.mockResolvedValue([job({ checks: { escalation: { version: 1, autoScheduleError: "Pick a season first: use Change details." } } })]);
    await runShowEditEscalations(new Date("2026-10-23T15:01:00Z"));
    expect(mocks.schedule).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it("the tick route needs the cron secret", async () => {
    mocks.jobs.mockResolvedValue([]);
    mocks.cron.mockReturnValue(false);
    expect((await POST(new Request("https://portal.example.edu/api/service/show-editor/tick", { method: "POST" }))).status).toBe(401);
    expect(mocks.jobs).not.toHaveBeenCalled();
    mocks.cron.mockReturnValue(true);
    const response = await POST(new Request("https://portal.example.edu/api/service/show-editor/tick", { method: "POST" }));
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({ checked: 0, escalated: 0, scheduled: 0, failed: 0 });
  });
});
