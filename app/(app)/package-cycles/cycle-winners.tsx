"use client";

import { useCallback, useEffect, useState } from "react";
import { Award, Download } from "lucide-react";
import { toast } from "sonner";
import { StatusTag } from "@/components/kit/status-tag";
import { CardGrid } from "@/components/kit/layout";
import { SectionHeader } from "@/components/kit/section";
import { certificateHref } from "@/components/package-cycle/package-of-cycle-card";
import { cachedValue, rememberValue } from "@/src/lib/client-cache";
import type { PackageOfCycleWinner } from "@/src/server/package-of-cycle";
import { cycleFullLabel } from "./cycle-dates-utils";

export type WinnersResponse = {
  viewerUserId: string;
  canDownloadAll: boolean;
  /** Executives release each cycle's winners to everyone. */
  canRelease?: boolean;
  winners: PackageOfCycleWinner[];
};

/** Cycle number → released, for every cycle with a winner (executives only; empty for everyone else). */
export function releaseStateByCycle(data: WinnersResponse | null) {
  const state = new Map<number, boolean>();
  if (!data?.canRelease) return state;
  for (const winner of data.winners) state.set(winner.cycleNumber, winner.released);
  return state;
}

const WINNERS_CACHE_KEY = "package-of-cycle-winners";
const MEMBER_ROW = "inline-flex min-h-10 items-center gap-1.5 text-sm text-foreground md:min-h-0";

/**
 * Package of the Cycle winners: the last copy at once, then a quiet refresh (src/lib/client-cache.ts).
 * Null until loaded; a failed request leaves it as it was (the page works without it).
 */
export function useCycleWinners() {
  const [data, setData] = useState<WinnersResponse | null>(() => cachedValue<WinnersResponse>(WINNERS_CACHE_KEY) ?? null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/package-cycle/package-of-cycle", { cache: "no-store" });
        const body = (await response.json()) as { data?: WinnersResponse };
        if (!response.ok || !body.data) return;
        rememberValue(WINNERS_CACHE_KEY, body.data);
        if (!cancelled) setData(body.data);
      } catch {
        // Cycle Dates still works without the winners section.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const [releasing, setReleasing] = useState<number | null>(null);

  /** Releases a cycle's winners to everyone, or hides them again (executives). */
  const setReleased = useCallback(async (cycleNumber: number, released: boolean) => {
    setReleasing(cycleNumber);
    try {
      const response = await fetch("/api/package-cycle/package-of-cycle/release", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cycleNumber, released })
      });
      const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
      if (!response.ok) {
        toast.error(body.error?.message ?? "Couldn't change who sees the winners.");
        return;
      }
      setData((previous) => {
        if (!previous) return previous;
        const next = {
          ...previous,
          winners: previous.winners.map((winner) => (winner.cycleNumber === cycleNumber ? { ...winner, released } : winner))
        };
        rememberValue(WINNERS_CACHE_KEY, next);
        return next;
      });
      toast.success(
        released
          ? `Cycle ${cycleNumber}'s Package of the Cycle is now public.`
          : `Cycle ${cycleNumber}'s Package of the Cycle is hidden again. Only executives can see it.`
      );
    } catch {
      toast.error("Couldn't change who sees the winners. Check your connection and try again.");
    } finally {
      setReleasing(null);
    }
  }, []);

  return { data, releasing, setReleased };
}

/** True when there is at least one winner to show. */
export function hasWinners(data: WinnersResponse | null): data is WinnersResponse {
  return data !== null && data.winners.length > 0;
}

/**
 * Package of the Cycle winners, newest cycle first, in the same section style as Stage dates.
 * Each winner downloads their own certificate; producers (canDownloadAll) download anyone's.
 * Executives also see unreleased cycles, tagged Not released.
 * Renders nothing until someone wins. The grid fits its box: one column in the side rail.
 */
export function CycleWinners({ data }: { data: WinnersResponse | null }) {
  if (!hasWinners(data)) return null;

  return (
    <section aria-labelledby="package-of-cycle-title" className="space-y-3">
      <SectionHeader as="h2" id="package-of-cycle-title" title="Package of the Cycle" count={data.winners.length} />
      <CardGrid>
        {data.winners.map((winner) => (
          <article key={winner.rowId} className="flex min-w-0 flex-col rounded-md border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase leading-tight tracking-[0.11em] text-[var(--brand-green)]">
                <Award aria-hidden className="h-3 w-3 shrink-0" />
                {cycleFullLabel(winner.cycleNumber)}
              </p>
              {winner.released ? null : (
                <StatusTag tone="neutral" title="Only executives see this until it's released on the cycle's row">
                  Not released
                </StatusTag>
              )}
            </div>
            <h3 className="mt-1.5 text-base font-semibold leading-snug text-foreground">
              {winner.headline ?? (winner.topic || "Untitled package")}
            </h3>
            {winner.headline && winner.topic ? (
              <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{winner.topic}</p>
            ) : null}
            <ul aria-label="Members" className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
              {winner.members.map((member) =>
                data.canDownloadAll || member.userId === data.viewerUserId ? (
                  <li key={member.userId}>
                    <a
                      href={certificateHref(winner.rowId, member.userId)}
                      aria-label={`Download ${member.name}'s certificate`}
                      title={`Download ${member.name}'s certificate`}
                      className={`${MEMBER_ROW} rounded-sm hover:text-[var(--brand-green)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
                    >
                      <Download aria-hidden className="h-4 w-4 shrink-0" />
                      {member.name}
                    </a>
                  </li>
                ) : (
                  <li key={member.userId} className={MEMBER_ROW}>
                    {member.name}
                  </li>
                )
              )}
            </ul>
          </article>
        ))}
      </CardGrid>
    </section>
  );
}
