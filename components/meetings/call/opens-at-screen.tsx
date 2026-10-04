"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MeetingSummary } from "@/src/lib/meetings/types";
import { formatCountdown, joinOpensAtMs, pacificDayLabel, pacificTimeLabel } from "@/src/lib/meetings/client/time";

/** Before the join window: "Opens at 9:10 PM" with a live countdown that enables Join on time. */
export function OpensAtScreen({
  meeting,
  opensAt = joinOpensAtMs(meeting),
  onOpen
}: {
  meeting: MeetingSummary;
  /** Overrides `joinOpensAt` (the server said "not yet" though our clock disagrees). */
  opensAt?: number;
  onOpen: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const open = now >= opensAt;

  useEffect(() => {
    if (open) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [open]);

  return (
    <main className="flex h-dvh items-center justify-center overflow-hidden px-4 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
      <section className="w-full max-w-md space-y-4 border border-[var(--ink-4)] bg-[var(--ink-2)] p-6" aria-live="polite">
        <div className="eyebrow">Meeting</div>
        <h1 className="display-sm text-foreground">{meeting.title}</h1>
        <p className="text-sm text-muted-foreground">
          {pacificDayLabel(meeting.startsAt)} · {pacificTimeLabel(meeting.startsAt)} Pacific
        </p>
        <div className="flex items-center gap-3">
          <Clock className="h-5 w-5 text-[var(--brand-green)]" aria-hidden />
          <div>
            <p className="text-sm font-medium text-foreground">Opens at {pacificTimeLabel(new Date(opensAt))}</p>
            {!open ? (
              <p className="font-mono text-2xl tabular-nums text-foreground" aria-label="Time until the meeting opens">
                {formatCountdown(opensAt - now)}
              </p>
            ) : null}
          </div>
        </div>
        <Button size="lg" className="h-11 w-full" disabled={!open} onClick={onOpen}>
          {open ? "Join" : "Join opens soon"}
        </Button>
      </section>
    </main>
  );
}
