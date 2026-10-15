import { describe, expect, it } from "vitest";
import { collectPages, formatRecord, latestMeetingId, parseArgs, parseDuration, recordsFromEvents } from "@/scripts/meetings-logs-lib";

describe("meetings:logs helpers", () => {
  it("parses arguments", () => {
    expect(parseArgs(["latest"])).toEqual({ target: "latest", sinceMs: 2 * 3_600_000, uid: null, json: false });
    expect(parseArgs(["m1", "--since", "30m", "--uid", "u-ab", "--json"])).toEqual({ target: "m1", sinceMs: 1_800_000, uid: "u-ab", json: true });
    expect(() => parseArgs([])).toThrow(/Usage/);
    expect(() => parseDuration("2 hours")).toThrow();
  });

  it("pages back through a full window (newest first) without losing or repeating events", async () => {
    // Fake API: newest-first, inclusive `to`, 3 events per page; two events share ms 20.
    const all = [10, 15, 20, 20, 25, 30, 35].map((timestamp, i) => ({ timestamp, source: `e${i}` }));
    const calls: number[] = [];
    const fetchPage = async (to: number) => {
      calls.push(to);
      return all.filter((e) => e.timestamp <= to).sort((a, b) => b.timestamp - a.timestamp).slice(0, 3);
    };
    const { events, truncated } = await collectPages(fetchPage, 100, 3);
    expect(events.map((e) => e.source).sort()).toEqual(all.map((e) => e.source).sort());
    expect(truncated).toBe(false);
    expect(calls[0]).toBe(100);
  });

  it("stops at the page cap and says so", async () => {
    let n = 1000;
    const fetchPage = async () => [n--, n--].map((timestamp) => ({ timestamp, source: `e${timestamp}` }));
    const { events, truncated } = await collectPages(fetchPage, 2000, 2, 3);
    expect(events).toHaveLength(6);
    expect(truncated).toBe(true);
  });

  it("reads parsed and string sources, sorts by time and finds the latest meeting", () => {
    const records = recordsFromEvents([
      { timestamp: 20, source: JSON.stringify({ evt: "proxy", mid: "m2", uid: "u-a", status: 429, route: "tracks/new" }) },
      { timestamp: 10, source: { evt: "client", mid: "m1", uid: "u-b", kind: "event", what: "pc_state", pc: "failed" } },
      { timestamp: 15, $metadata: { message: "plain text" } }
    ]);
    expect(records.map((r) => r.evt)).toEqual(["client", "raw", "proxy"]);
    expect(latestMeetingId(records)).toBe("m2");
    expect(formatRecord(records[2]!)).toMatch(/^!! .* u-a .*proxy .*status=429/);
    expect(formatRecord(records[0]!)).toMatch(/^!! .*client:pc_state .*pc=failed/);
  });
});
