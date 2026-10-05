"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import { Lock } from "lucide-react";
import type { ConnectionQuality } from "@/src/lib/meetings/client/layout";
import { formatElapsed } from "@/src/lib/meetings/client/time";
import { cn } from "@/src/lib/utils";
import { useElapsed } from "./use-call-helpers";
import { Avatar } from "./avatar";

/** The 56px bar shared by pre-join and the call (plus the top safe area). */
export function MeetBar({ left, right }: { left: ReactNode; right?: ReactNode }) {
  return (
    <header className="shrink-0 border-b border-[var(--ink-4)] bg-[var(--ink)] pt-[env(safe-area-inset-top)]">
      <div className="flex h-14 items-center justify-between gap-4 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] md:pl-6 md:pr-6">
        <div className="flex min-w-0 items-center gap-3">{left}</div>
        {right ? <div className="flex shrink-0 items-center gap-2">{right}</div> : null}
      </div>
    </header>
  );
}

/** Pre-join bar: logo mark + "Meetings" left, the signed-in person right. */
export function PreJoinBar({ userName }: { userName: string }) {
  return (
    <MeetBar
      left={
        <>
          <Image src="/favicon/infocus-hub-icon.png" alt="" width={24} height={24} className="h-6 w-6 rounded-sm" />
          <span className="text-sm font-semibold text-foreground">Meetings</span>
        </>
      }
      right={
        <>
          <span className="hidden max-w-48 truncate text-sm text-[var(--ink-text)] sm:inline">{userName}</span>
          <Avatar name={userName} size="sm" />
        </>
      }
    />
  );
}

const QUALITY: Record<ConnectionQuality, { label: string; dot: string }> = {
  good: { label: "Good connection", dot: "bg-[var(--brand-green)]" },
  fair: { label: "Unstable connection", dot: "bg-[var(--brand-amber)]" },
  poor: { label: "Poor connection", dot: "bg-[var(--danger-text)]" },
  unknown: { label: "Checking connection", dot: "bg-[var(--ink-5)]" }
};

const TAG = "inline-flex h-7 items-center gap-1.5 rounded-sm border border-[var(--ink-4)] px-2 text-[11px] font-medium uppercase leading-none tracking-[0.11em]";

/** Only this text re-renders every second. */
function Elapsed({ since }: { since: number }) {
  return <>{formatElapsed(useElapsed(since))}</>;
}

export function TopBar({
  title,
  since,
  notesOn,
  quality,
  reconnecting
}: {
  title: string;
  /** Call start (epoch ms). The 1 Hz timer lives here, so it doesn't re-render the whole call. */
  since: number;
  notesOn: boolean;
  quality: ConnectionQuality;
  reconnecting: boolean;
}) {
  const q = QUALITY[quality];
  return (
    <MeetBar
      left={
        <>
          <h1 className="min-w-0 truncate text-sm font-semibold text-foreground">{title}</h1>
          <span className="font-mono text-[13px] tabular-nums text-muted-foreground" aria-label="Time in call">
            <Elapsed since={since} />
          </span>
        </>
      }
      right={
        <>
          {reconnecting ? (
            <span className={cn(TAG, "border-[var(--brand-amber)]/50 text-[var(--brand-amber)]")} role="status">
              Reconnecting
            </span>
          ) : null}
          {notesOn ? (
            <span className={cn(TAG, "text-foreground")} title="The Drive Scribe is taking notes">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--brand-red)]" aria-hidden />
              Notes on
            </span>
          ) : null}
          <span className={cn(TAG, "hidden text-muted-foreground sm:inline-flex")} title="End-to-end encrypted">
            <Lock className="h-3 w-3" aria-hidden />
            Encrypted
          </span>
          <span className={cn(TAG, "px-2.5")} title={q.label}>
            <span className={cn("h-2 w-2 rounded-full", q.dot)} aria-hidden />
            <span className="sr-only">{q.label}</span>
          </span>
        </>
      }
    />
  );
}
