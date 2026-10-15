"use client";

import { Button } from "@/components/ui/button";
import type { MeetingWaitingView } from "@/src/lib/meetings/protocol";
import { cn } from "@/src/lib/utils";
import { Avatar } from "./avatar";
import { CallCount } from "./call-count";
import { admitAll, admitOne, denyOne } from "./host-actions";

/**
 * Hosts only, while People is closed: someone is waiting to be let in. One person gets
 * Deny / Admit; several get View (opens People) / Admit all. Same calls and toasts as the People
 * panel. Admit stays clickable after a press: pressing it again re-sends the "come in".
 */
export function WaitingBanner({
  meetingId,
  waiting,
  mobile,
  onView,
  className
}: {
  meetingId: string;
  waiting: readonly MeetingWaitingView[];
  mobile: boolean;
  onView: () => void;
  className?: string;
}) {
  if (waiting.length === 0) return null;
  const control = mobile ? "h-11" : "h-8";
  const one = waiting.length === 1 ? waiting[0] : null;
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex shrink-0 items-center gap-3 border-b border-l-[3px] border-[var(--ink-4)] border-l-[#F2A516] bg-[var(--ink-2)] pl-3 pr-2",
        mobile ? "min-h-14 py-1.5" : "min-h-11 py-1.5",
        className
      )}
    >
      {one ? <Avatar name={one.name} size="sm" /> : <CallCount count={waiting.length} tone="warn" />}
      <p className="min-w-0 flex-1 truncate text-sm text-foreground">
        {one ? (
          <>
            <span className="font-medium">{one.name}</span> wants to join
          </>
        ) : (
          `${waiting.length} people want to join`
        )}
      </p>
      <span className="flex shrink-0 items-center gap-1.5">
        {one ? (
          <>
            <Button size="sm" variant="ghost" className={control} onClick={() => void denyOne(meetingId, one.uid, one.name)}>
              Deny
            </Button>
            <Button size="sm" className={control} onClick={() => void admitOne(meetingId, one.uid, one.name)}>
              Admit
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="outline" className={control} onClick={onView}>
              View
            </Button>
            <Button size="sm" className={control} onClick={() => void admitAll(meetingId)}>
              Admit all
            </Button>
          </>
        )}
      </span>
    </div>
  );
}
