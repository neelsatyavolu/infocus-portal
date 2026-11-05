"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { HARVEST_CONTEST } from "@/src/lib/thanksgiving-board";
import { HARVEST_HOUR_WINDOW, inHarvestHourWindow } from "@/src/lib/thanksgiving-harvest-hour";
import { formatCountdown, inFinalHour } from "@/src/lib/thanksgiving-standings";
import { cn } from "@/src/lib/utils";
import { LeafSprite } from "./sprites";

const POLL_MS = 60_000;
const SECOND_MS = 1_000;
/** A sleeping laptop can stretch a long timer, so the next window is checked at least hourly. */
const MAX_WAIT_MS = 60 * 60_000;

/** The next moment this strip might have something to show (a window opening), or null after the last. */
function nextWake(now: number): number | null {
  const starts = [HARVEST_HOUR_WINDOW.from.getTime(), HARVEST_CONTEST.hiddenFrom.getTime()];
  const upcoming = starts.filter((start) => start > now);
  return upcoming.length > 0 ? Math.min(...upcoming) : null;
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    return ((await response.json()) as { data?: T }).data ?? null;
  } catch {
    return null;
  }
}

/** Runs `run` now and every POLL_MS while `active`, skipping a hidden tab. */
function usePoll(active: boolean, run: () => void) {
  useEffect(() => {
    if (!active) return;
    run();
    const id = window.setInterval(() => {
      if (!document.hidden) run();
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [active, run]);
}

/**
 * A strip under the top bar for the contest's big moments: harvest hour (everything counts double;
 * the server only reveals it once it has started) and the dark final hour before the close, with
 * the viewer's own points (nobody sees the standings then). Shows nothing the rest of the time.
 */
export function ContestCountdown() {
  const [now, setNow] = useState(() => Date.now());
  const [hourEndsAt, setHourEndsAt] = useState<number | null>(null);
  const [mine, setMine] = useState<string | null>(null);

  const harvestWindow = inHarvestHourWindow(now);
  const finalHour = inFinalHour(now);
  const harvestLive = hourEndsAt !== null && now < hourEndsAt;

  // The clock: every second inside a window, otherwise asleep until the next one opens.
  useEffect(() => {
    if (harvestWindow || finalHour) {
      const id = window.setInterval(() => setNow(Date.now()), SECOND_MS);
      return () => window.clearInterval(id);
    }
    const wake = nextWake(Date.now());
    if (wake === null) return;
    const id = window.setTimeout(() => setNow(Date.now()), Math.min(wake - Date.now(), MAX_WAIT_MS));
    return () => window.clearTimeout(id);
  }, [harvestWindow, finalHour, now]);

  const announced = useRef(false);
  const checkHour = useCallback(async () => {
    const status = await fetchJson<{ harvestHour: { endsAt: string } | null }>("/api/thanksgiving/status");
    if (!status?.harvestHour) return;
    setHourEndsAt(Date.parse(status.harvestHour.endsAt));
    if (announced.current) return;
    announced.current = true;
    toast("Harvest hour!", { description: "For the next hour every catch counts double. Go, go, go." });
  }, []);
  const checkPoints = useCallback(async () => {
    const board = await fetchJson<{ viewerTotal: number }>("/api/thanksgiving");
    if (board) setMine(`You have ${board.viewerTotal} ${board.viewerTotal === 1 ? "point" : "points"}`);
  }, []);
  usePoll(harvestWindow && !harvestLive, checkHour);
  usePoll(finalHour, checkPoints);

  if (!harvestLive && !finalHour) return null;
  const left = harvestLive ? (hourEndsAt ?? now) - now : HARVEST_CONTEST.closesAt.getTime() - now;
  const parts = harvestLive
    ? ["Harvest hour", "Everything counts double", `${formatCountdown(left)} left`]
    : ["Final hour", `${formatCountdown(left)} left`, "The board is dark", mine];

  return (
    // No live region: it ticks every second. The toast announces harvest hour.
    <div className="border-t border-border bg-[var(--brand-fill)]/15">
      <Link
        href="/thanksgiving"
        className={cn(
          "mx-auto flex min-h-9 max-w-[80rem] flex-wrap items-center justify-center gap-x-2 gap-y-0.5 px-4 py-1.5 text-center text-sm text-foreground md:px-6",
          "hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        )}
      >
        <LeafSprite variant={harvestLive ? 2 : 0} className="h-4 w-4 shrink-0" />
        {parts.filter(Boolean).map((part, index) => (
          <span key={index} className={cn(index === 0 ? "font-medium text-[var(--brand-green)]" : "", index > 0 && "before:mr-2 before:text-muted-foreground before:content-['·']")}>
            {index === (harvestLive ? 2 : 1) ? <span className="font-mono-broadcast tabular-nums">{part}</span> : part}
          </span>
        ))}
      </Link>
    </div>
  );
}
