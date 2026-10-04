import { describe, expect, it } from "vitest";
import { MEETING_EMPTY_END_MS } from "../../../src/lib/meetings/protocol";
import {
  afterEmptyReportFailed,
  checkTicket,
  emptyDeadline,
  endedState,
  EMPTY_REPORT_FIRST_RETRY_MS,
  initialState,
  isEmptyDue,
  joinParticipant,
  leaveParticipant,
  type RoomState
} from "../src/room-state";
import { host } from "./fixtures";

/** A started room that just became empty at t=1000. */
function emptyRoom(): RoomState {
  const joined = joinParticipant(initialState("m1"), host, 10).state;
  return leaveParticipant(joined, host.uid, 1_000).state;
}

describe("empty report retries", () => {
  it("gives up at once when the Portal says the meeting is unknown or deleted", () => {
    expect(afterEmptyReportFailed(emptyRoom(), 404, 2_000).giveUp).toBe(true);
    expect(afterEmptyReportFailed(emptyRoom(), 410, 2_000).giveUp).toBe(true);
  });

  it("backs off 1, 2, 4, 8, 16, 32 minutes (about an hour), then gives up", () => {
    let state = emptyRoom();
    const delays: number[] = [];
    let now = 1_000 + MEETING_EMPTY_END_MS;
    for (;;) {
      const failed = afterEmptyReportFailed(state, 500, now);
      if (failed.giveUp) break;
      state = failed.state;
      delays.push(state.emptyRetryAt! - now);
      // The one alarm is scheduled at the retry time, and the report is due again then.
      expect(emptyDeadline(state)).toBe(state.emptyRetryAt);
      expect(isEmptyDue(state, state.emptyRetryAt! - 1)).toBe(false);
      now = state.emptyRetryAt!;
      expect(isEmptyDue(state, now)).toBe(true);
    }
    expect(delays).toEqual([1, 2, 4, 8, 16, 32].map((minutes) => minutes * EMPTY_REPORT_FIRST_RETRY_MS));
    expect(afterEmptyReportFailed(state, null, now).giveUp).toBe(true);
  });

  it("someone coming back resets the retries", () => {
    const failing = afterEmptyReportFailed(emptyRoom(), 500, 70_000).state;
    const back = joinParticipant(failing, host, 80_000).state;
    expect(back).toMatchObject({ emptySince: null, emptyReportFailures: 0, emptyRetryAt: null });
    expect(emptyDeadline(back)).toBeNull();
  });

  it("giving up leaves an ended room that rejects later tickets", () => {
    const ended = endedState(emptyRoom(), 5_000);
    expect(ended.endedAt).toBe(5_000);
    expect(emptyDeadline(ended)).toBeNull();
    expect(checkTicket(ended, { uid: host.uid, iat: 9_000 })).toEqual({ ok: false, reason: "ended" });
  });
});
