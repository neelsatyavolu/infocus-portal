"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { HARVEST_CONTEST, type ContestResult, type RankedEntry } from "@/src/lib/thanksgiving-board";
import { cn } from "@/src/lib/utils";
import { ContestBanner } from "./contest-banner";
import { HarvestBoard } from "./harvest-board";
import { carryOverHarvestOnce, flushHarvestTally } from "./harvest-tally";
import { LeafSprite, PieSprite, TurkeySprite } from "./sprites";

/** New with the contest, so browsers that saw the plain leaderboard popup get this one too. */
const SEEN_KEY = "infocus-thanksgiving-contest-seen";
const TOP = 5;

type Board = {
  year: number;
  rows: RankedEntry[];
  viewerId: string;
  contest: { closesAt: string; prizeDays: number; result: ContestResult | null };
};

function alreadySeen(): boolean {
  try {
    return window.localStorage.getItem(SEEN_KEY) === String(HARVEST_CONTEST.year);
  } catch {
    return true;
  }
}

function markSeen() {
  try {
    window.localStorage.setItem(SEEN_KEY, String(HARVEST_CONTEST.year));
  } catch {
    // Storage blocked: alreadySeen() says yes, so it never repeats.
  }
}

async function fetchBoard(): Promise<Board | null> {
  const response = await fetch("/api/thanksgiving", { cache: "no-store" });
  if (!response.ok) return null;
  const body = (await response.json()) as { data?: Board };
  return body.data ?? null;
}

/**
 * Once per browser: the leaderboard contest in big letters (the prize, or its winner once it has
 * closed), the top of the board and where this person stands, with a link to the whole board.
 * Waits until the welcome is closed (`ready`), so the two never stack.
 */
export function LeaderboardPopup({ ready }: { ready: boolean }) {
  const [board, setBoard] = useState<Board | null>(null);
  const [contestOpen, setContestOpen] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!ready || alreadySeen()) return;
    let cancelled = false;
    void (async () => {
      await carryOverHarvestOnce();
      await flushHarvestTally();
      const loaded = await fetchBoard().catch(() => null);
      if (cancelled || !loaded || loaded.year !== HARVEST_CONTEST.year) return;
      setBoard(loaded);
      setContestOpen(Date.now() <= Date.parse(loaded.contest.closesAt));
      setOpen(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [ready]);

  function close() {
    markSeen();
    setOpen(false);
  }

  if (!board) return null;
  const mine = board.rows.find((row) => row.userId === board.viewerId) ?? null;
  const top = board.rows.slice(0, TOP);
  const standing = mine
    ? `You're #${mine.rank} of ${board.rows.length} with ${mine.total}.`
    : "You're not on it yet. One leaf gets you there.";

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <DialogContent className="max-w-lg" hideClose>
        <div className="tg-welcome-art" aria-hidden>
          <LeafSprite variant={2} />
          <TurkeySprite />
          <PieSprite />
        </div>
        <DialogHeader>
          <DialogTitle className="text-[22px] font-medium tracking-[-0.015em]">The Thanksgiving leaderboard</DialogTitle>
          <DialogDescription>{standing}</DialogDescription>
        </DialogHeader>
        <ContestBanner
          open={contestOpen}
          result={board.contest.result}
          viewerId={board.viewerId}
        />
        {top.length > 0 ? (
          <HarvestBoard rows={top} viewerId={board.viewerId} compact />
        ) : (
          <p className="text-sm text-muted-foreground">Nobody&apos;s on the board yet. Be the first.</p>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={close} className="w-full sm:w-auto">
            Back to work
          </Button>
          <Link href="/thanksgiving" onClick={close} className={cn(buttonVariants({ variant: "accent" }), "w-full sm:w-auto")}>
            See the whole board
          </Link>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
