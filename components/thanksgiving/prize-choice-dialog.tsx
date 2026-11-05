"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { HARVEST_CONTEST } from "@/src/lib/thanksgiving-board";
import { PrizePicker, type PrizeChooser, type PrizeOption } from "./prize-picker";

/** Asked only from the reveal through November. */
const ASK_UNTIL = new Date("2026-12-01T00:00:00-08:00");

type Pending = { chooser: PrizeChooser; options: PrizeOption[] };

/**
 * When the Thanksgiving winner opens the Portal after the reveal and their own Cycle 2 group has
 * already turned in its Final Cut: a dialog to pick the group that gets the prize. "Later" closes
 * it; it asks again the next time the Portal loads, until they pick.
 */
export function PrizeChoiceDialog() {
  const [pending, setPending] = useState<Pending | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const now = Date.now();
    if (now < HARVEST_CONTEST.revealAt.getTime() || now >= ASK_UNTIL.getTime()) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/thanksgiving/prize", { cache: "no-store" });
        if (!response.ok) return;
        const body = (await response.json()) as {
          data?: { viewerId: string; choosers: PrizeChooser[]; options: PrizeOption[] };
        };
        const mine = body.data?.choosers.find((chooser) => chooser.userId === body.data?.viewerId);
        if (cancelled || !mine || !body.data) return;
        setPending({ chooser: mine, options: body.data.options });
        setOpen(true);
      } catch {
        // Offline: it asks again next time.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!pending) return null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-[22px] font-medium tracking-[-0.015em]">You won the Thanksgiving leaderboard</DialogTitle>
          <DialogDescription>Pick who gets your {HARVEST_CONTEST.prizeDays} extension days.</DialogDescription>
        </DialogHeader>
        <PrizePicker chooser={pending.chooser} options={pending.options} forSelf onGiven={() => setOpen(false)} />
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} className="w-full sm:w-auto">
            Later
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
