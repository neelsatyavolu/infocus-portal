import { NonRetriableError } from "inngest";
import { beforeEach, expect, it, vi } from "vitest";
import { IDEA_MIN_ITEMS } from "@/src/lib/ideas";

type Context = { step: { run: (id: string, task: () => Promise<unknown>) => Promise<unknown> } };
const m = vi.hoisted(() => ({
  register: vi.fn((config: unknown, trigger: unknown, handler: (context: Context) => Promise<unknown>) => ({ config, trigger, handler })),
  due: vi.fn(), load: vi.fn(), request: vi.fn(), store: vi.fn()
}));
vi.mock("@/src/lib/inngest", () => ({ inngest: { createFunction: m.register } }));
vi.mock("@/src/server/ideas", () => ({ checkIdeaRunDue: m.due, loadIdeaFeedItems: m.load, requestIdeas: m.request, storeIdeaBatch: m.store }));
import { IDEAS_GENERATE_EVENT } from "@/src/server/ideas-schedule";

const items = Array.from({ length: IDEA_MIN_ITEMS }, (_, i) => ({ title: `Story ${i}` }));
const generated = { ideas: [{ title: "Idea" }], inputTokens: 900, outputTokens: 150 };

async function run() {
  const order: string[] = [];
  const result = await m.register.mock.calls[0][2]({ step: { run: async (id, task) => { order.push(id); return task(); } } });
  return { order, result };
}

beforeEach(() => {
  [m.due, m.load, m.request, m.store].forEach((mock) => mock.mockReset());
  m.due.mockResolvedValue({ due: true, runDate: "2026-10-10" });
  m.load.mockResolvedValue(items);
  m.request.mockResolvedValue(generated);
  m.store.mockResolvedValue({ status: "created", runDate: "2026-10-10" });
});

it("runs daily just before the neuron reset, skips a run that overlaps another, and can be asked for by event", () => {
  const [config, trigger] = m.register.mock.calls[0];
  expect(config).toEqual({ id: "ideas-generate-daily", singleton: { mode: "skip" }, retries: 1 });
  expect(trigger).toEqual([{ cron: "30 23 * * *" }, { event: IDEAS_GENERATE_EVENT }]);
});

it("checks, reads the feeds, asks the model once, then saves, each as its own step", async () => {
  const { order, result } = await run();
  expect(order).toEqual(["check-due", "load-feeds", "request-ideas", "store-batch"]);
  expect(m.request).toHaveBeenCalledTimes(1);
  expect(m.request.mock.calls[0][0]).toEqual(items);
  expect(m.store).toHaveBeenCalledWith({ runDate: "2026-10-10", itemCount: items.length, ...generated });
  expect(result).toEqual({ status: "created", runDate: "2026-10-10" });
});

it("spends nothing when a batch is not due", async () => {
  m.due.mockResolvedValue({ due: false, reason: "not_due" });
  const { order, result } = await run();
  expect(order).toEqual(["check-due"]);
  expect(result).toEqual({ status: "not_due" });
  expect(m.load).not.toHaveBeenCalled();
  expect(m.request).not.toHaveBeenCalled();
});

it("spends nothing when too few headlines came back", async () => {
  m.load.mockResolvedValue(items.slice(1));
  const { order, result } = await run();
  expect(order).toEqual(["check-due", "load-feeds"]);
  expect(result).toEqual({ status: "too_few_items", items: IDEA_MIN_ITEMS - 1 });
  expect(m.request).not.toHaveBeenCalled();
  expect(m.store).not.toHaveBeenCalled();
});

it("never retries the model call, whatever went wrong with it", async () => {
  m.request.mockRejectedValue(new Error("Workers AI reply was cut off at the token cap."));
  const failure = await run().catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(NonRetriableError);
  expect((failure as Error).message).toContain("cut off");
  expect(m.request).toHaveBeenCalledTimes(1);
  expect(m.store).not.toHaveBeenCalled();
});

it("lets a failed save be retried without asking the model again", async () => {
  m.store.mockRejectedValue(new Error("connection lost"));
  const failure = await run().catch((error: unknown) => error);
  expect(failure).not.toBeInstanceOf(NonRetriableError);
  expect((failure as Error).message).toBe("connection lost");
});
