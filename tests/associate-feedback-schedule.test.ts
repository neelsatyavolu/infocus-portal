import { beforeEach, expect, it, vi } from "vitest";
type Context = { event: { ts: number }; step: { run: (id: string, task: () => Promise<unknown>) => Promise<unknown>; sleep: (id: string, duration: string) => Promise<void> } };
const m = vi.hoisted(() => ({
  register: vi.fn((config: unknown, trigger: unknown, handler: (context: Context) => Promise<unknown>) => ({ config, trigger, handler })),
  producers: vi.fn(), rows: vi.fn(), load: vi.fn()
}));
vi.mock("@/src/lib/inngest", () => ({ inngest: { createFunction: m.register } }));
vi.mock("@/src/lib/prisma", () => ({ prisma: { packageProgressRow: { findMany: m.rows } } }));
vi.mock("@/src/server/package-progress-data", () => ({ loadAssignableProducers: m.producers }));
vi.mock("@/src/server/associate-performance", () => ({ loadAssociatePerformance: m.load }));
import "@/src/server/associate-feedback-schedule";

beforeEach(() => {
  m.load.mockReset();
  m.producers.mockResolvedValue([{ userId: "b", name: "Blake" }, { userId: "a", name: "Alex" }, { userId: "c", name: "Casey" }]);
  m.rows.mockResolvedValue([{ assignedProducerUserId: "b", cycleNumber: 1 }, { assignedProducerUserId: "a", cycleNumber: 2 }, { assignedProducerUserId: "a", cycleNumber: 1 }]);
  m.load.mockResolvedValue({ associates: [] });
});
it("registers the daily Pacific cron and spaces producers by 30 minutes", async () => {
  const [config, trigger, handler] = m.register.mock.calls[0];
  expect(config).toMatchObject({ id: "associate-feedback-quality-daily" });
  expect(trigger).toEqual({ cron: "TZ=America/Los_Angeles 0 0 * * *" });
  const order: string[] = [];
  await handler({ event: { ts: Date.parse("2026-09-13T07:00:00Z") }, step: {
    run: async (id, task) => { order.push(id); return task(); },
    sleep: async (_id, duration) => { order.push(`sleep:${duration}`); }
  } });
  expect(order).toEqual(["build-refresh-queue", "refresh-a-1", "sleep:1m", "refresh-a-2", "sleep:30m", "refresh-b-1"]);
  expect(m.load.mock.calls).toEqual([
    [1, { evaluateUserId: "a", refreshDay: "2026-09-13" }],
    [2, { evaluateUserId: "a", refreshDay: "2026-09-13" }],
    [1, { evaluateUserId: "b", refreshDay: "2026-09-13" }]
  ]);
});
it("does no work or waiting when no associates have groups", async () => {
  m.rows.mockResolvedValue([]);
  const sleep = vi.fn();
  await m.register.mock.calls[0][2]({ event: { ts: Date.now() }, step: { run: async (_id, task) => task(), sleep } });
  expect(sleep).not.toHaveBeenCalled();
  expect(m.load).not.toHaveBeenCalled();
});
