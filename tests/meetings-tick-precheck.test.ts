import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ connect: vi.fn(), query: vi.fn(), end: vi.fn(), options: [] as unknown[] }));

vi.mock("pg", () => ({
  Client: class {
    constructor(options: unknown) {
      mocks.options.push(options);
    }
    connect = mocks.connect;
    query = mocks.query;
    end = mocks.end;
  }
}));
vi.mock("@/src/lib/prisma", () => ({ prisma: {} }));

import { MEETING_REMINDERS } from "@/src/server/meetings-notify";
import { TICK_REMINDER_HORIZON_MINUTES, meetingTickHasWork } from "@/src/lib/meetings/tick-precheck";

const NOW = new Date("2026-10-17T22:00:00Z");

describe("meetingTickHasWork (Worker pre-check)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.options.length = 0;
  });

  it("covers the longest reminder lead", () => {
    expect(TICK_REMINDER_HORIZON_MINUTES).toBe(Math.max(...MEETING_REMINDERS.map((reminder) => reminder.minutes)));
  });

  it("queries the window from now to the reminder horizon and closes the connection", async () => {
    mocks.query.mockResolvedValue({ rows: [] });
    await expect(meetingTickHasWork("postgres://hyperdrive", NOW)).resolves.toBe(false);
    expect(mocks.options).toEqual([{ connectionString: "postgres://hyperdrive" }]);
    expect(mocks.query.mock.calls[0][1]).toEqual([NOW, new Date("2026-10-17T22:15:00Z")]);
    expect(mocks.end).toHaveBeenCalledOnce();
  });

  it("reports work when a meeting matches", async () => {
    mocks.query.mockResolvedValue({ rows: [{ "?column?": 1 }] });
    await expect(meetingTickHasWork("postgres://hyperdrive", NOW)).resolves.toBe(true);
  });

  it("closes the connection when the query fails", async () => {
    mocks.query.mockRejectedValue(new Error("down"));
    await expect(meetingTickHasWork("postgres://hyperdrive", NOW)).rejects.toThrow("down");
    expect(mocks.end).toHaveBeenCalledOnce();
  });
});
