"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";
import { dueTone, relativeDaysLabel } from "@/components/kit/tone";
import {
  classBoardLiveFocus,
  type ClassBoardClassSession,
  type ClassBoardDay,
  type ClassBoardDeadline
} from "@/src/lib/class-board";
import { cn } from "@/src/lib/utils";
import { formatBoardClock, formatBoardDate, formatBoardShortDate, formatBoardTime } from "./board-format";
import { clearBoardRetries } from "./board-retry";
import { BOARD_TEXT, PLATE_GRID, PLATE_MARK } from "./board-scale";
import { BoardTag } from "./board-tag";
import { BoardWordmark } from "./board-wordmark";

/** Fresh board data (server re-render, no full page load). */
const BOARD_REFRESH_MS = 30_000;
/** Full reload now and then so an always-on kiosk still picks up new deploys. */
const BOARD_HARD_RELOAD_MS = 3 * 60 * 60 * 1000;
/** Offline at reload time: check again this often rather than strand the TV on an offline page. */
const OFFLINE_RECHECK_MS = 60_000;
/** Four missed refreshes in a row and the board says it is not updating. */
const STALE_AFTER_MS = 2 * 60 * 1000;
/** The countdown turns amber for the last ten minutes of class. */
const COUNTDOWN_WARN_SECONDS = 600;

/** Phone: its own block under a rule. lg: its children join the plate grid. */
const FOCUS_BLOCK = "grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-1 border-t border-border pt-3 lg:contents";

type LiveFocus = NonNullable<ReturnType<typeof classBoardLiveFocus>>;

type BoardLiveHeaderProps = {
  generatedAt: string;
  classSessions: ClassBoardClassSession[];
  days: ClassBoardDay[];
  deadlines: ClassBoardDeadline[];
  cycleNumber: number;
  cycleFocus: string;
  laneCount: number;
};

/**
 * The nameplate, and the only part of the board that ticks: the clock, the Period 1 focus and
 * countdown, the freshness status, the 30-second data refresh and the 3-hour reload. Keeping the
 * 1s tick here means the race and the rail never re-render every second.
 */
export function BoardLiveHeader({
  generatedAt,
  classSessions,
  days,
  deadlines,
  cycleNumber,
  cycleFocus,
  laneCount
}: BoardLiveHeaderProps) {
  const router = useRouter();
  // Starts from the server's time so the first render matches the server markup.
  const [nowMs, setNowMs] = useState(() => Date.parse(generatedAt));
  // When this browser got the current data (client clock, so clock skew doesn't matter).
  const [receivedAt, setReceivedAt] = useState<number | null>(null);

  useEffect(() => {
    setReceivedAt(Date.now());
    clearBoardRetries();
  }, [generatedAt]);

  useEffect(() => {
    const tick = window.setInterval(() => setNowMs(Date.now()), 1000);
    const refresh = window.setInterval(() => {
      // Offline, a refresh can fall back to a full navigation and leave the TV on an offline page.
      if (navigator.onLine) router.refresh();
    }, BOARD_REFRESH_MS);
    let reload = 0;
    const reloadWhenOnline = () => {
      if (navigator.onLine) window.location.reload();
      else reload = window.setTimeout(reloadWhenOnline, OFFLINE_RECHECK_MS);
    };
    reload = window.setTimeout(reloadWhenOnline, BOARD_HARD_RELOAD_MS);
    return () => {
      window.clearInterval(tick);
      window.clearInterval(refresh);
      window.clearTimeout(reload);
    };
  }, [router]);

  const now = new Date(nowMs);
  const focus = classBoardLiveFocus({ classSessions, days, deadlines }, now);
  const next = focus ? null : (deadlines[0] ?? null);
  const stale = receivedAt !== null && nowMs - receivedAt > STALE_AFTER_MS;
  // With nothing in the focus slot, the identity takes the whole left side (no empty half-plate).
  const identityColumn = focus || next ? "lg:col-[2/3]" : "lg:col-[2/5]";

  return (
    <header
      className={cn(
        "brand-hero-panel flex shrink-0 flex-col gap-3 px-[var(--b-inset)] py-3",
        "lg:grid lg:items-baseline lg:gap-x-4 lg:gap-y-[calc(var(--b)*0.2)] lg:px-0 lg:py-[calc(var(--b)*0.7)]",
        PLATE_GRID
      )}
    >
      <div className="flex items-start justify-between gap-4 lg:contents">
        {/* min-h-10: the board's only way out, so a full-size touch target on phones. */}
        <Link
          href={"/dashboard" as never}
          aria-label="InFocus Portal"
          className={cn(PLATE_MARK, "min-h-10 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}
        >
          <BoardWordmark className="h-8 lg:h-[calc(var(--b)*2.5)]" />
        </Link>
        <div className="min-w-0 text-right lg:contents">
          {/* Phones get the short date ("Thu, Oct 15"); the long one wraps beside the wordmark. */}
          <p className={cn(BOARD_TEXT.label, "text-muted-foreground lg:col-[5/6] lg:row-start-1 lg:pr-[var(--b-inset)]")}>
            <span suppressHydrationWarning className="lg:hidden">
              {formatBoardShortDate(now)}
            </span>
            <span suppressHydrationWarning className="hidden lg:inline">
              {formatBoardDate(now)}
            </span>
          </p>
          <p suppressHydrationWarning className={cn(BOARD_TEXT.clock, "mt-1 text-foreground lg:col-[5/6] lg:row-start-2 lg:mt-0 lg:pr-[var(--b-inset)]")}>
            {formatBoardClock(now)}
          </p>
          <div className="mt-1 flex justify-end lg:col-[5/6] lg:row-start-3 lg:mt-0 lg:pr-[var(--b-inset)]">
            <Freshness generatedAt={generatedAt} stale={stale} />
          </div>
        </div>
      </div>

      <div className="min-w-0 lg:contents">
        <p className={cn(BOARD_TEXT.label, "truncate text-[var(--brand-green)] lg:row-start-1", identityColumn)}>
          Class Board
          <span className="text-muted-foreground">
            {" · "}
            {laneCount} {laneCount === 1 ? "package" : "packages"}
          </span>
        </p>
        <h1 className={cn(BOARD_TEXT.h1, "mt-1 truncate lg:row-start-2 lg:mt-0", identityColumn)}>Cycle {cycleNumber}</h1>
        {/*
          The cycle's focus on its own Mist line under the title (plate row 3, beside "Updated"), so
          it gets the column's full width rather than what's left after "Cycle 3 · ". Phones show
          it whole over two lines.
        */}
        {cycleFocus ? (
          <p
            className={cn(BOARD_TEXT.meta, "mt-1 line-clamp-2 break-words text-[var(--ink-text)] lg:row-start-3 lg:mt-0 lg:line-clamp-1", identityColumn)}
            title={cycleFocus}
          >
            {cycleFocus}
          </p>
        ) : null}
      </div>

      {focus ? <ClassFocus focus={focus} /> : next ? <UpNext deadline={next} /> : null}
    </header>
  );
}

/** Period 1: what to work on, and how much class is left. */
function ClassFocus({ focus }: { focus: LiveFocus }) {
  const tone = focus.remainingSeconds <= COUNTDOWN_WARN_SECONDS ? "text-[var(--brand-amber)]" : "text-[var(--brand-green)]";
  const fraction = Math.min(1, Math.max(0, focus.remainingFraction));
  return (
    <div className={FOCUS_BLOCK}>
      <p className={cn(BOARD_TEXT.label, "col-start-1 row-start-1 min-w-0 truncate text-[var(--brand-green)] lg:col-[3/4]")}>
        Class focus<span className="text-muted-foreground"> · {focus.detail}</span>
      </p>
      <p
        className={cn(BOARD_TEXT.focus, "col-start-1 row-start-2 line-clamp-2 min-w-0 break-words lg:col-[3/4]")}
        title={focus.text}
      >
        {focus.text}
      </p>
      <p className={cn(BOARD_TEXT.label, "col-start-2 row-start-1 text-right text-muted-foreground lg:col-[4/5] lg:pr-[var(--b-inset)]")}>
        Left in class
      </p>
      <p
        role="timer"
        aria-label={`${focus.countdown} remaining in class`}
        className={cn(BOARD_TEXT.countdown, tone, "col-start-2 row-start-2 text-right lg:col-[4/5] lg:pr-[var(--b-inset)]")}
      >
        {focus.countdown}
      </p>
      <div
        aria-hidden="true"
        className={cn("col-span-2 row-start-3 h-[3px] overflow-hidden rounded-full bg-[var(--ink-3)] lg:col-[4/5] lg:mr-[var(--b-inset)] lg:self-center", tone)}
      >
        <div className="h-full bg-current" style={{ width: `${fraction * 100}%` }} />
      </div>
    </div>
  );
}

/**
 * Outside Period 1: the soonest deadline's next step, so the plate never has an empty half. Only
 * the countdown and the step: the stage, date and cycle are the first Due next row just below.
 */
function UpNext({ deadline }: { deadline: ClassBoardDeadline }) {
  return (
    <div className={FOCUS_BLOCK}>
      <p className={cn(BOARD_TEXT.label, "col-span-2 row-start-1 flex min-w-0 items-baseline gap-[0.6em] text-[var(--brand-green)] lg:col-[3/5] lg:pr-[var(--b-inset)]")}>
        <span className="shrink-0">Up next</span>
        <BoardTag tone={dueTone(deadline.daysUntil)}>{relativeDaysLabel(deadline.daysUntil)}</BoardTag>
      </p>
      <p
        className={cn(BOARD_TEXT.focus, "col-span-2 row-start-2 line-clamp-2 min-w-0 break-words lg:col-[3/5] lg:pr-[var(--b-inset)]")}
        title={deadline.focus}
      >
        {deadline.focus}
      </p>
    </div>
  );
}

/** Quiet "Updated 10:42 AM" while data arrives; a warning tag once it stops. */
function Freshness({ generatedAt, stale }: { generatedAt: string; stale: boolean }) {
  const time = formatBoardTime(generatedAt);
  if (stale) {
    return (
      <BoardTag tone="warning" icon={<AlertTriangle aria-hidden="true" />}>
        {`Not updated since ${time}`}
      </BoardTag>
    );
  }
  return (
    <p className={cn(BOARD_TEXT.meta, "text-muted-foreground")}>
      Updated{" "}
      <time suppressHydrationWarning dateTime={generatedAt}>
        {time}
      </time>
    </p>
  );
}
