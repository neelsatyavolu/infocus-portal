import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HARVEST_CONTEST } from "@/src/lib/thanksgiving-board";

export type PrizeOption = { id: string; topic: string; members: string[] };
export type PrizeChooser = { userId: string; name: string };

async function give(winnerId: string, rowId: string): Promise<string | null> {
  try {
    const response = await fetch("/api/thanksgiving/prize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ winnerId, rowId })
    });
    if (response.ok) return null;
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    return body?.error ?? "That didn't go through. Try again.";
  } catch {
    return "You're offline. Try again in a moment.";
  }
}

/**
 * Picks the Cycle 2 group that gets a winner's prize, for a winner whose own group already turned
 * in its Final Cut (src/server/thanksgiving-prize.ts). `forSelf` words it for the winner; an exec
 * picking for someone else sees their name. Used inside client components only (prize-panel.tsx,
 * prize-choice-dialog.tsx), so it has no "use client" of its own.
 */
export function PrizePicker({
  chooser,
  options,
  forSelf,
  onGiven
}: {
  chooser: PrizeChooser;
  options: readonly PrizeOption[];
  forSelf: boolean;
  onGiven: () => void;
}) {
  const [rowId, setRowId] = useState("");
  const [busy, setBusy] = useState(false);
  const picked = options.find((option) => option.id === rowId) ?? null;
  const days = `${HARVEST_CONTEST.prizeDays} extension days`;

  async function submit() {
    if (!picked) return;
    setBusy(true);
    const error = await give(chooser.userId, picked.id);
    setBusy(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success(`${days} given to ${picked.topic}`, { description: "The group gets an email, and it's on Extension Requests." });
    onGiven();
  }

  if (options.length === 0) {
    return <p className="text-sm text-muted-foreground">Every Cycle 2 group has turned in its Final Cut, so there&apos;s no one to give the days to. An exec will sort it out.</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-[var(--ink-text)]">
        {forSelf
          ? `Your Cycle 2 group already turned in its Final Cut, so you get to give your ${days} to a group still working on theirs.`
          : `${chooser.name}'s group already turned in its Final Cut. Pick the group that gets the ${days} for them.`}
      </p>
      <Select value={rowId} onValueChange={setRowId}>
        <SelectTrigger aria-label="Group to give the extension days to" className="h-11 md:h-9">
          <SelectValue placeholder="Pick a Cycle 2 group" />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.topic}
              {option.members.length > 0 ? <span className="text-muted-foreground">{` · ${option.members.join(", ")}`}</span> : null}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button onClick={submit} disabled={!picked || busy} className="w-full sm:w-auto">
          {picked ? `Give ${HARVEST_CONTEST.prizeDays} days to ${picked.topic}` : "Give the days"}
        </Button>
        <p className="text-xs text-muted-foreground">This can&apos;t be undone.</p>
      </div>
    </div>
  );
}
