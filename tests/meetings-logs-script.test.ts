import { describe, expect, it } from "vitest";
import { formatRecord, latestMeetingId, parseArgs, parseDuration, recordsFromEvents } from "@/scripts/meetings-logs-lib";

describe("meetings:logs helpers", () => {
  it("parses arguments", () => {
    expect(parseArgs(["latest"])).toEqual({ target: "latest", sinceMs: 2 * 3_600_000, uid: null, json: false });
    expect(parseArgs(["m1", "--since", "30m", "--uid", "u-ab", "--json"])).toEqual({ target: "m1", sinceMs: 1_800_000, uid: "u-ab", json: true });
    expect(() => parseArgs([])).toThrow(/Usage/);
    expect(() => parseDuration("2 hours")).toThrow();
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
