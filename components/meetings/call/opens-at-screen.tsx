"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { StatusTag } from "@/components/kit/status-tag";
import { Button } from "@/components/ui/button";
import type { MeetingSummary } from "@/src/lib/meetings/types";
import { formatCountdown, joinOpensAtMs, pacificDayLabel, pacificTimeLabel } from "@/src/lib/meetings/client/time";
import { CallPlate, PlateData } from "./status-plate";
import { BackToMeetings } from "./status-screens";

/**
 * Before the join window: when the meeting starts, a live countdown to when Join opens (and the
 * clock time it opens at), then Join enables on time.
 */
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
    <CallPlate
      ariaLive
      eyebrow="Meeting"
      tag={
        open ? (
          <StatusTag tone="success" icon={Clock}>
            Open now
          </StatusTag>
        ) : (
          <StatusTag tone="neutral" icon={Clock}>
            Not open yet
          </StatusTag>
        )
      }
      title={meeting.title}
      body={`${pacificDayLabel(meeting.startsAt)} · ${pacificTimeLabel(meeting.startsAt)} Pacific`}
      actions={
        <>
          <BackToMeetings />
          <Button className="sm:flex-1" disabled={!open} onClick={onOpen}>
            {open ? "Join" : "Join opens soon"}
          </Button>
        </>
      }
    >
      {!open ? (
        <PlateData label="Opens in">
          {/* The plate announces when Join opens; a timer is not read out on every tick. */}
          <p role="timer" aria-label="Time until the meeting opens" className="font-mono text-3xl leading-none tabular-nums text-foreground">
            {formatCountdown(opensAt - now)}
          </p>
          <p className="mt-2 text-[13px] text-muted-foreground">Join opens at {pacificTimeLabel(new Date(opensAt))} Pacific.</p>
        </PlateData>
      ) : null}
    </CallPlate>
  );
}
