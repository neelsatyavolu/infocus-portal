"use client";

import { useRouter } from "next/navigation";
import { PrizePicker, type PrizeChooser, type PrizeOption } from "./prize-picker";

/**
 * On /thanksgiving after the reveal: the prize picker for a winner whose group already turned in,
 * or, for an exec, one per winner still to pick (they can choose on the winner's behalf).
 */
export function PrizePanel({
  choosers,
  options,
  viewerId
}: {
  choosers: PrizeChooser[];
  options: PrizeOption[];
  viewerId: string;
}) {
  const router = useRouter();
  if (choosers.length === 0) return null;
  return (
    <section aria-label="Give the prize" className="space-y-4 rounded-lg border border-border bg-card p-4 sm:p-5">
      {choosers.map((chooser) => (
        <div key={chooser.userId} className="space-y-2">
          <h2 className="text-base font-semibold text-foreground">
            {chooser.userId === viewerId ? "Give your prize" : `Give ${chooser.name}'s prize`}
          </h2>
          <PrizePicker chooser={chooser} options={options} forSelf={chooser.userId === viewerId} onGiven={() => router.refresh()} />
        </div>
      ))}
    </section>
  );
}
