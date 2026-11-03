"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { harvestYear, type RankedEntry } from "@/src/lib/thanksgiving-board";
import { cn } from "@/src/lib/utils";
import { HarvestBoard } from "./harvest-board";
import { carryOverHarvestOnce, flushHarvestTally } from "./harvest-tally";
import { LeafSprite, PieSprite, TurkeySprite } from "./sprites";

const SEEN_KEY = "infocus-thanksgiving-leaderboard-seen";
const TOP = 5;

type Board = { rows: RankedEntry[]; viewerId: string };

function alreadySeen(): boolean {
  try {
    return window.localStorage.getItem(SEEN_KEY) === String(harvestYear(new Date()));
  } catch {
    return true;
  }
}

function markSeen() {
  try {
    window.localStorage.setItem(SEEN_KEY, String(harvestYear(new Date())));
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
 * Once per browser each November, after the welcome: the top of the Thanksgiving leaderboard and
 * where this person stands, with a link to the whole board. A browser getting the welcome this visit
 * (`skip`) sees it on its next visit instead, so the two never stack.
 */
export function LeaderboardPopup({ skip }: { skip: boolean }) {
  const [board, setBoard] = useState<Board | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (skip || alreadySeen()) return;
    let cancelled = false;
    void (async () => {
      await carryOverHarvestOnce();
      await flushHarvestTally();
      const loaded = await fetchBoard().catch(() => null);
      if (cancelled || !loaded) return;
      setBoard(loaded);
      setOpen(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [skip]);

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
      <DialogContent className="max-w-md" hideClose>
        <div className="tg-welcome-art" aria-hidden>
          <LeafSprite variant={2} />
          <TurkeySprite />
          <PieSprite />
        </div>
        <DialogHeader>
          <DialogTitle className="text-[22px] font-medium tracking-[-0.015em]">The Thanksgiving leaderboard</DialogTitle>
          <DialogDescription>
            Leaves, pies, wishbones, giant turkey sightings and pardoned turkeys all count. {standing}
          </DialogDescription>
        </DialogHeader>
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
