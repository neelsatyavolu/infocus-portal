"use client";

import { Lock, Signal } from "lucide-react";
import type { ConnectionQuality } from "@/src/lib/meetings/client/layout";
import { formatElapsed } from "@/src/lib/meetings/client/time";
import { cn } from "@/src/lib/utils";

const QUALITY: Record<ConnectionQuality, { label: string; dot: string }> = {
  good: { label: "Good connection", dot: "bg-[var(--brand-green)]" },
  fair: { label: "Unstable connection", dot: "bg-[var(--brand-amber)]" },
  poor: { label: "Poor connection", dot: "bg-[var(--danger-text)]" },
  unknown: { label: "Checking connection", dot: "bg-[var(--ink-5)]" }
};

export function TopBar({
  title,
  elapsedMs,
  notesOn,
  quality,
  reconnecting
}: {
  title: string;
  elapsedMs: number;
  notesOn: boolean;
  quality: ConnectionQuality;
  reconnecting: boolean;
}) {
  const q = QUALITY[quality];
  return (
    <header className="flex min-h-11 items-center gap-3 border-b border-[var(--ink-4)] bg-[var(--ink)] pb-2 pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] pt-[max(0.5rem,env(safe-area-inset-top))] md:pl-4 md:pr-4">
      <h1 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{title}</h1>
      {notesOn ? (
        <span className="status-pill status-live" title="The Drive Scribe is taking notes">
          Notes on
        </span>
      ) : null}
      <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:inline-flex" title="End-to-end encrypted">
        <Lock className="h-3.5 w-3.5" aria-hidden /> Encrypted
      </span>
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" title={q.label}>
        <Signal className="h-3.5 w-3.5" aria-hidden />
        <span className={cn("h-2 w-2 rounded-full", q.dot)} aria-hidden />
        <span className="sr-only">{q.label}</span>
      </span>
      <span className="font-mono text-xs tabular-nums text-[var(--ink-text)]" aria-label="Time in call">
        {formatElapsed(elapsedMs)}
      </span>
      {reconnecting ? (
        <span className="status-pill status-warn" role="status">
          Reconnecting
        </span>
      ) : null}
    </header>
  );
}
