"use client";

import { Award, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";

export type WinnerRelease = {
  /** Cycle number → released, for cycles with a winner. Empty unless the viewer is an executive. */
  state: Map<number, boolean>;
  busyCycle: number | null;
  onSet: (cycleNumber: number, released: boolean) => void;
};

/**
 * Small control on a cycle's row: Package of the Cycle winners stay with the executives until
 * one of them releases the cycle to everyone. Renders nothing for cycles without a winner.
 */
export function ReleaseWinnersButton({ cycleNumber, release }: { cycleNumber: number; release?: WinnerRelease }) {
  const released = release?.state.get(cycleNumber);
  if (!release || released === undefined) return null;
  const busy = release.busyCycle === cycleNumber;
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-6 gap-1 px-2 text-[11px]"
      disabled={busy}
      title={
        released
          ? "Everyone can see this cycle's Package of the Cycle. Click to hide it from everyone but executives."
          : "Only executives can see this cycle's Package of the Cycle. Click to show it to everyone."
      }
      onClick={() => release.onSet(cycleNumber, !released)}
    >
      {released ? <EyeOff aria-hidden className="h-3 w-3" /> : <Award aria-hidden className="h-3 w-3" />}
      {released ? "Hide winner" : "Release winner"}
    </Button>
  );
}
