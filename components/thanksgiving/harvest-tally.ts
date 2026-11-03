"use client";

import { readThanksgivingPrefs } from "@/src/lib/thanksgiving";
import { EMPTY_HARVEST, harvestYear, isEmptyHarvest, type HarvestCounts, type HarvestKind } from "@/src/lib/thanksgiving-board";

/**
 * Sends what this browser catches to the Thanksgiving leaderboard (POST /api/thanksgiving), a
 * few seconds' worth at a time so a flurry of leaves is one request. Anything still waiting goes
 * out when the tab is hidden or closed. If a send fails, its catches wait for the next one.
 */

const FLUSH_MS = 5_000;
const CARRIED_KEY = "infocus-thanksgiving-board-carried";

let pending: HarvestCounts = EMPTY_HARVEST;
let timer: number | null = null;
let listening = false;
let carrying: Promise<void> | null = null;

async function post(body: { add?: HarvestCounts; carryOver?: Pick<HarvestCounts, "leaves" | "pies"> }) {
  const response = await fetch("/api/thanksgiving", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    keepalive: true
  });
  if (!response.ok) throw new Error(`Leaderboard save failed (${response.status})`);
}

/** Sends everything waiting now. Resolves once it is saved (or has been put back to retry). */
export async function flushHarvestTally() {
  if (timer !== null) {
    window.clearTimeout(timer);
    timer = null;
  }
  if (isEmptyHarvest(pending)) return;
  const batch = pending;
  pending = EMPTY_HARVEST;
  try {
    await post({ add: batch });
  } catch {
    pending = Object.fromEntries(
      Object.entries(pending).map(([kind, count]) => [kind, count + batch[kind as HarvestKind]])
    ) as HarvestCounts;
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

/** Counts one catch for the leaderboard. */
export function tallyHarvest(kind: HarvestKind) {
  pending = { ...pending, [kind]: pending[kind] + 1 };
  listenForLeaving();
  if (timer === null) timer = window.setTimeout(() => void flushHarvestTally(), FLUSH_MS);
}

/**
 * Once per browser each year: bring the leaves and pies counted here before the leaderboard
 * existed. The server only ever raises a count to these numbers, so repeats are harmless.
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
