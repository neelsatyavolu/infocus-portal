"use client";

import { useEffect, useState } from "react";
import {
  Hand,
  Info,
  Lock,
  MonitorUp,
  Signal,
  SignalHigh,
  SignalLow,
  SignalMedium,
  UserPlus,
  type LucideIcon
} from "lucide-react";
import { Spinner } from "@/components/kit/spinner";
import { StatusTag } from "@/components/kit/status-tag";
import type { ConnectionQuality } from "@/src/lib/meetings/client/layout";
import { formatElapsed, pacificTimeLabel } from "@/src/lib/meetings/client/time";
import { cn } from "@/src/lib/utils";
import { statusAnnouncement, type CallStatusItem } from "./call-status-model";
import { OVERLAY_PLATE } from "./overlay";
import { useElapsed } from "./use-call-helpers";

const SIGNAL_ICON: Record<ConnectionQuality, LucideIcon> = {
  good: SignalHigh,
  fair: SignalMedium,
  poor: SignalLow,
  unknown: Signal
};

function iconFor(item: CallStatusItem): LucideIcon | undefined {
  switch (item.kind) {
    case "waiting":
      return UserPlus;
    case "hands":
      return Hand;
    case "presenting":
      return MonitorUp;
    case "quality":
      return SIGNAL_ICON[item.signal ?? "unknown"];
    default:
      return undefined;
  }
}

/** Only this text re-renders every second. */
function Elapsed({ since }: { since: number }) {
  return <>{formatElapsed(useElapsed(since))}</>;
}

/** Pacific wall clock, refreshed every 15 s. */
function WallClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(timer);
  }, []);
  return <>{pacificTimeLabel(now)}</>;
}

/** Tags that open People keep the tag look, with a 44px hit area on touch screens. */
const TAG_BUTTON =
  "relative inline-flex shrink-0 rounded-sm transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-green)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--ink)] [@media(pointer:coarse)]:before:absolute [@media(pointer:coarse)]:before:-inset-x-1 [@media(pointer:coarse)]:before:-inset-y-3 [@media(pointer:coarse)]:before:content-['']";

function StatusItemTag({ item, compact, onOpenPeople }: { item: CallStatusItem; compact: boolean; onOpenPeople: () => void }) {
  const iconOnly = item.quiet || (compact && item.short === null);
  const tag = (
    <StatusTag
      tone={item.tone}
      icon={iconFor(item)}
      spinner={item.kind === "reconnecting"}
      title={item.hint ?? item.description}
      className={cn(iconOnly && "gap-0!")}
    >
      {iconOnly ? <span className="sr-only">{item.label}</span> : compact ? item.short : item.label}
    </StatusTag>
  );
  if (!item.opensPeople) return tag;
  return (
    <button type="button" onClick={onOpenPeople} aria-label={`${item.description} Open People.`} className={TAG_BUTTON}>
      {tag}
    </button>
  );
}

/**
 * The call's status tags in priority order (rule 3: status is a tag, never control-sized). The
 * connection sits after a hairline so its Danger "Poor" never touches the red Notes dot.
 * `vertical` wraps them into the 72px phone-landscape rail (Notes is too wide to share a row
 * with the connection there, so the two still never touch).
 */
export function StatusRail({
  items,
  compact = false,
  vertical = false,
  onOpenPeople,
  className
}: {
  items: readonly CallStatusItem[];
  compact?: boolean;
  vertical?: boolean;
  onOpenPeople: () => void;
  className?: string;
}) {
  const status = items.filter((item) => item.kind !== "quality");
  const quality = items.find((item) => item.kind === "quality");
  return (
    <div
      role="group"
      aria-label="Call status"
      className={cn(
        "flex",
        vertical
          ? "w-full shrink-0 flex-wrap content-start items-center justify-center gap-1"
          : // Full bar height so touch hit areas aren't clipped. The bar's title gives way first; this
            // scrolls sideways only once the title is down to its info icon.
            "min-w-0 items-center gap-1.5 self-stretch overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className
      )}
    >
      {status.map((item) => (
        <StatusItemTag key={item.kind} item={item} compact={compact} onOpenPeople={onOpenPeople} />
      ))}
      {quality ? (
        <>
          {status.length > 0 && !vertical ? <span aria-hidden className="mx-0.5 h-4 w-px shrink-0 bg-[var(--ink-4)]" /> : null}
          <StatusItemTag item={quality} compact={compact} onOpenPeople={onOpenPeople} />
        </>
      ) : null}
      <span className="sr-only" aria-live="polite">
        {statusAnnouncement(items)}
      </span>
    </div>
  );
}

/**
 * Phones: "Reconnecting" in words, as a tag over the top of the stage (the phone bar and the
 * 72px rail are too narrow for the word, and a dropped connection is the status people most need
 * to read). Video stays dark in both themes, so the tag keeps the fixed dark overlay hex.
 * Always mounted, so the polite live region announces the change.
 */
export function ReconnectingNotice({ on, className }: { on: boolean; className?: string }) {
  return (
    <div role="status" className={cn("pointer-events-none absolute inset-x-0 z-10 flex justify-center px-2", className)}>
      {on ? (
        <span
          className={cn(
            "inline-flex h-6 items-center gap-1.5 rounded-sm px-2.5 text-[11px] font-medium uppercase leading-none tracking-[0.11em]",
            OVERLAY_PLATE
          )}
        >
          <Spinner size="sm" className="text-[#F2A516]" />
          Reconnecting
        </span>
      ) : null}
    </div>
  );
}

/** Lock and time in call, the one line every form shows (the 1 Hz timer stays inside <Elapsed>). */
function CallClock({ since, className }: { since: number; className?: string }) {
  return (
    <span className={cn("flex shrink-0 items-center gap-1 whitespace-nowrap font-mono tabular-nums text-muted-foreground", className)}>
      <Lock role="img" aria-label="End-to-end encrypted" className="h-3 w-3 shrink-0">
        <title>End-to-end encrypted</title>
      </Lock>
      <span role="timer" aria-label="Time in call">
        <Elapsed since={since} />
      </span>
    </span>
  );
}

/**
 * Phone on its side has no top bar: the top of the right-hand rail carries what it would. The
 * title is a heading for screen readers (on screen it is in Meeting details, under More), then
 * the lock and time in call, then the status tags. It shrinks and scrolls before the controls
 * under it ever do.
 */
export function CallRailStatus({
  title,
  since,
  items,
  onOpenPeople
}: {
  title: string;
  /** Call start (epoch ms). */
  since: number;
  items: readonly CallStatusItem[];
  onOpenPeople: () => void;
}) {
  return (
    <header className="flex min-h-0 w-full flex-col items-center gap-1.5 overflow-y-auto overscroll-contain px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <h1 className="sr-only">{title}</h1>
      <CallClock since={since} className="h-5 text-[11px]" />
      <StatusRail items={items} compact vertical onOpenPeople={onOpenPeople} />
    </header>
  );
}

/**
 * Top of the call (48px + top safe area). Left: the meeting title (opens Meeting details), the
 * encryption lock (from 640px), then the Pacific clock (desktop) and time in call. Right: the
 * status rail.
 */
export function CallStatusBar({
  title,
  since,
  items,
  mobile,
  onOpenDetails,
  onOpenPeople
}: {
  title: string;
  /** Call start (epoch ms). */
  since: number;
  items: readonly CallStatusItem[];
  mobile: boolean;
  onOpenDetails: () => void;
  onOpenPeople: () => void;
}) {
  return (
    <header className="shrink-0 border-b border-[var(--ink-4)] bg-[var(--ink)] pt-[env(safe-area-inset-top)]">
      {/*
        One flex row. The title gives way first: its shrink weight dwarfs the rail's, so it truncates
        down to its info icon (min-w-8) before any status tag moves. The tags stay whole and
        right-aligned (ml-auto), as the old bar kept them; they scroll only past that point.
      */}
      <div className="flex h-12 items-center gap-2 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] md:pl-6 md:pr-6">
        <h1 className="min-w-8 shrink-[1000]">
          <button
            type="button"
            onClick={onOpenDetails}
            className={cn(
              "-ml-2 inline-flex max-w-full items-center gap-1.5 rounded-md px-2 text-foreground transition-colors hover:bg-[var(--ink-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-green)]",
              mobile ? "h-11" : "h-9"
            )}
          >
            <span className="truncate text-sm font-semibold">{title}</span>
            <Info className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="sr-only">. Meeting details</span>
          </button>
        </h1>
        {/* Narrow phones leave the lock to Meeting details, as the old bar did, so the title has room. */}
        <Lock role="img" aria-label="End-to-end encrypted" className="h-4 w-4 shrink-0 text-muted-foreground max-sm:hidden">
          <title>End-to-end encrypted</title>
        </Lock>
        <span aria-hidden className="h-4 w-px shrink-0 bg-[var(--ink-4)]" />
        <span className="shrink-0 whitespace-nowrap font-mono text-[13px] tabular-nums text-muted-foreground">
          {!mobile ? (
            <>
              <span title="Pacific time">
                <WallClock />
              </span>
              <span aria-hidden> · </span>
            </>
          ) : null}
          <span role="timer" aria-label="Time in call">
            <Elapsed since={since} />
          </span>
        </span>
        <StatusRail items={items} compact={mobile} onOpenPeople={onOpenPeople} className="ml-auto pl-1" />
      </div>
    </header>
  );
}
