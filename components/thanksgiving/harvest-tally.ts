"use client";

import { readThanksgivingPrefs } from "@/src/lib/thanksgiving";
import { harvestYear, type HarvestKind } from "@/src/lib/thanksgiving-board";
import { MAX_CATCHES_PER_BATCH, type CatchInput } from "@/src/lib/thanksgiving-guard";

/**
 * Sends what this browser catches to the Thanksgiving leaderboard (POST /api/thanksgiving), a
 * few seconds' worth at a time so a flurry of leaves is one request. Each catch goes with when it
 * happened and how long its visitor had been on screen, which the server's cheat checks use
 * (src/lib/thanksgiving-guard.ts). Anything still waiting goes out when the tab is hidden or
 * closed. If a send fails for a passing reason, its catches wait for the next one.
 */

const FLUSH_MS = 5_000;
/** Beyond this much unsent play (a long time offline), the oldest catches are dropped. */
const MAX_PENDING = 1_000;
const CARRIED_KEY = "infocus-thanksgiving-board-carried";

let pending: CatchInput[] = [];
let timer: number | null = null;
let listening = false;
let carrying: Promise<void> | null = null;

class SaveError extends Error {
  constructor(readonly status: number) {
    super(`Leaderboard save failed (${status})`);
  }
}

/** Worth sending again later: offline, the server busy, or too many sends at once. */
function retryable(error: unknown) {
  return !(error instanceof SaveError) || error.status >= 500 || error.status === 429;
}

async function post(body: { catches?: CatchInput[]; carryOver?: { leaves: number; pies: number } }) {
  const response = await fetch("/api/thanksgiving", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, sentAt: Date.now(), automation: navigator.webdriver === true }),
    keepalive: true
  });
  if (!response.ok) throw new SaveError(response.status);
}

/** Sends everything waiting now. Resolves once it is saved (or has been put back to retry). */
export async function flushHarvestTally() {
  if (timer !== null) {
    window.clearTimeout(timer);
    timer = null;
  }
  while (pending.length > 0) {
    const batch = pending.slice(0, MAX_CATCHES_PER_BATCH);
    pending = pending.slice(batch.length);
    try {
      await post({ catches: batch });
    } catch (error) {
      if (retryable(error)) pending = [...batch, ...pending].slice(-MAX_PENDING);
      return;
    }
  }
}

function listenForLeaving() {
  if (listening) return;
  listening = true;
  window.addEventListener("pagehide", () => void flushHarvestTally());
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) void flushHarvestTally();
  });
}

function queue(entry: CatchInput) {
  pending = [...pending, entry].slice(-MAX_PENDING);
  listenForLeaving();
  if (timer === null) timer = window.setTimeout(() => void flushHarvestTally(), FLUSH_MS);
}

/**
 * Counts one clicked catch for the leaderboard. `bornAt` is when its visitor appeared
 * (Date.now() then); without it the catch isn't sent, since the server would take it for a script.
 */
export function tallyCatch(kind: Exclude<HarvestKind, "giantTurkeys">, bornAt: number | undefined) {
  if (bornAt === undefined) return;
  const at = Date.now();
  queue({ kind, at, age: at - bornAt });
}

/** Counts a giant turkey that walked in on its own. */
export function tallyGiantTurkey() {
  queue({ kind: "giantTurkeys", at: Date.now(), age: null });
}

/**
 * Once per browser each year: bring the leaves and pies counted here before the leaderboard
 * existed. The server takes it once per person and caps it, so repeats are harmless.
 */
export function carryOverHarvestOnce(): Promise<void> {
  carrying ??= carryOver();
  return carrying;
}

async function carryOver() {
  const year = String(harvestYear(new Date()));
  try {
    if (window.localStorage.getItem(CARRIED_KEY) === year) return;
  } catch {
    return;
  }
  const { leaves, pies } = readThanksgivingPrefs();
  try {
    if (leaves > 0 || pies > 0) await post({ carryOver: { leaves, pies } });
    window.localStorage.setItem(CARRIED_KEY, year);
  } catch {
    // Try again on the next visit.
  }
}
