import { beforeEach, describe, expect, it } from "vitest";
import {
  classBoardPinCookieMatches,
  classBoardPinHashesMatch,
  createClassBoardPinToken,
  decryptClassBoardPin,
  encryptClassBoardPin,
  generateClassBoardPin,
  getClassBoardPinCookieMeta,
  hashClassBoardPin,
  isClassBoardPin,
  nextPinFailure,
  pinAttemptLocked,
  readClassBoardPinToken
} from "@/src/lib/class-board-pin";

const SECRET = "test-secret";

describe("class board pin", () => {
  beforeEach(() => {
    process.env.APP_AUTH_SECRET = SECRET;
  });

  it("creates a 6-digit pin that can be stored and read back", () => {
    const pin = generateClassBoardPin();
    expect(isClassBoardPin(pin)).toBe(true);
    expect(decryptClassBoardPin(encryptClassBoardPin(pin, SECRET), SECRET)).toBe(pin);
    expect(decryptClassBoardPin(encryptClassBoardPin(pin, SECRET), "other")).toBeNull();
  });

  it("accepts a cookie only for the current pin", () => {
    const pin = "482193";
    const hash = hashClassBoardPin(pin);
    const token = createClassBoardPinToken(hash, SECRET, 1_000);
    expect(readClassBoardPinToken(token, SECRET, 1_000)?.pinHash).toBe(hash);
    expect(classBoardPinCookieMatches(token, hash, SECRET, 1_000)).toBe(true);
    expect(classBoardPinCookieMatches(token, hashClassBoardPin("000000"), SECRET, 1_000)).toBe(false);
    expect(classBoardPinCookieMatches(`${token}x`, hash, SECRET, 1_000)).toBe(false);
    expect(classBoardPinHashesMatch(hash, hashClassBoardPin(pin))).toBe(true);
  });

  it("limits the cookie to the class board path", () => {
    expect(getClassBoardPinCookieMeta().path).toBe("/class-board");
  });

  it("locks after the failure window fills and resets once it expires", () => {
    const now = new Date("2026-09-21T20:00:00.000Z");
    expect(pinAttemptLocked({ failures: 19, failureAt: now, now: now.getTime() })).toBe(false);
    expect(pinAttemptLocked({ failures: 20, failureAt: now, now: now.getTime() + 60_000 })).toBe(true);
    expect(nextPinFailure({ failures: 4, failureAt: now, now })).toEqual({ failures: 5, failureAt: now });
    const later = new Date(now.getTime() + 16 * 60 * 1000);
    expect(nextPinFailure({ failures: 20, failureAt: now, now: later })).toEqual({ failures: 1, failureAt: later });
    expect(pinAttemptLocked({ failures: 20, failureAt: now, now: later.getTime() })).toBe(false);
  });
});
