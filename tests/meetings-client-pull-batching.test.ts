import { describe, expect, it } from "vitest";
import * as partytracks from "partytracks/client";

/**
 * patches/partytracks+0.0.56.patch: pulls that arrive while an earlier negotiation is in flight
 * join ONE next batch (not one round trip each). Push/close (no scheduler) keep setTimeout(0).
 */
type Scheduler = { schedule: <T>(task: () => Promise<T>) => Promise<T> };
type Dispatcher = { doBulkRequest: <P, R>(params: P, run: (batch: P[]) => Promise<R>) => Promise<R> };
const patched = partytracks as unknown as {
  FIFOScheduler: new () => Scheduler;
  BulkRequestDispatcher: new (limit?: number, scheduler?: Scheduler | null) => Dispatcher;
};

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function fakeNegotiation(scheduler: Scheduler) {
  const batches: string[][] = [];
  const releases: Array<() => void> = [];
  const run = (batch: string[]) =>
    scheduler.schedule(async () => {
      batches.push([...batch]);
      await new Promise<void>((resolve) => releases.push(resolve));
      return batch.length;
    });
  return { batches, releases, run };
}

describe("partytracks pull batching (patched)", () => {
  it("is applied (the patch exports the dispatcher)", () => {
    expect(typeof patched.BulkRequestDispatcher).toBe("function");
    expect(typeof patched.FIFOScheduler).toBe("function");
  });

  it("queues every pull that arrives during an in-flight request into one next batch", async () => {
    const scheduler = new patched.FIFOScheduler();
    const pulls = new patched.BulkRequestDispatcher(32, scheduler);
    const { batches, releases, run } = fakeNegotiation(scheduler);

    const first = pulls.doBulkRequest("p1", run);
    await tick();
    await tick();
    expect(batches).toEqual([["p1"]]);

    // Eight more publishers appear, one at a time, while p1's negotiation is still running.
    const later: Array<Promise<number>> = [];
    for (let i = 2; i <= 9; i += 1) {
      later.push(pulls.doBulkRequest(`p${i}`, run));
      await tick();
    }
    expect(batches).toHaveLength(1);

    releases[0]();
    await first;
    await tick();
    await tick();
    expect(batches).toHaveLength(2);
    expect(batches[1]).toEqual(["p2", "p3", "p4", "p5", "p6", "p7", "p8", "p9"]);
    releases[1]();
    expect(await Promise.all(later)).toEqual(new Array(8).fill(8));
  });

  it("still batches pulls from the same tick together when idle", async () => {
    const scheduler = new patched.FIFOScheduler();
    const pulls = new patched.BulkRequestDispatcher(32, scheduler);
    const { batches, releases, run } = fakeNegotiation(scheduler);
    const all = [pulls.doBulkRequest("a", run), pulls.doBulkRequest("b", run), pulls.doBulkRequest("c", run)];
    await tick();
    await tick();
    expect(batches).toEqual([["a", "b", "c"]]);
    releases[0]();
    expect(await Promise.all(all)).toEqual([3, 3, 3]);
  });

  it("respects the batch size limit", async () => {
    const scheduler = new patched.FIFOScheduler();
    const pulls = new patched.BulkRequestDispatcher(2, scheduler);
    const { batches, releases, run } = fakeNegotiation(scheduler);
    const all = ["a", "b", "c"].map((p) => pulls.doBulkRequest(p, run));
    // Two gates (one per full batch) each wait a macrotask in the queue.
    await tick();
    await tick();
    await tick();
    expect(batches).toEqual([["a", "b"]]);
    releases[0]();
    await tick();
    await tick();
    await tick();
    expect(batches[1]).toEqual(["c"]);
    releases[1]();
    expect(await Promise.all(all)).toEqual([2, 2, 1]);
  });

  it("without a scheduler (push, close) dispatches after one macrotask as before", async () => {
    const pushes = new patched.BulkRequestDispatcher(32);
    const sent: string[][] = [];
    const run = async (batch: string[]) => {
      sent.push([...batch]);
      return batch.length;
    };
    const a = pushes.doBulkRequest("x", run);
    const b = pushes.doBulkRequest("y", run);
    expect(sent).toEqual([]);
    expect(await Promise.all([a, b])).toEqual([2, 2]);
    expect(sent).toEqual([["x", "y"]]);
  });
});
