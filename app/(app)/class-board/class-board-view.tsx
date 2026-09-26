"use client";

import { BrandWordmark } from "@/components/brand-wordmark";
import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
import type { CapacityTone } from "@/src/lib/livestream";
import { classBoardLiveFocus, formatGateDate, type ClassBoardLane, type ClassBoardModel, type RaceDot } from "@/src/lib/class-board";
import type { GroupTileStatusTone } from "@/src/lib/group-tile-status";
import { extensionBadgeLabel } from "@/src/lib/package-extensions";
import type { ScheduleKind } from "@/src/lib/school-schedule";
import { cn } from "@/src/lib/utils";

const TONE_TEXT: Record<GroupTileStatusTone, string> = {
  neutral: "text-[var(--ink-text)]",
  warn: "text-[var(--brand-amber)]",
  review: "text-foreground",
  danger: "text-danger",
  approved: "text-[var(--brand-green)]"
};

const KIND_TEXT: Record<ScheduleKind, string> = {
  SHOW: "text-[var(--brand-green)]",
  PA: "text-[var(--brand-amber)]",
  HOLIDAY: "text-danger",
  NONE: "text-[var(--ink-text)]"
};

const KIND_MARK: Record<ScheduleKind, string> = {
  SHOW: "bg-[var(--brand-green)]",
  PA: "bg-[var(--brand-amber)]",
  HOLIDAY: "bg-danger-fill",
  NONE: "bg-[var(--ink-4)]"
};

const LANE_GRID =
  "grid w-full grid-cols-[1.75rem_minmax(0,1.2fr)_minmax(0,1.7fr)_minmax(0,0.95fr)] gap-x-2 px-3";

const TV_GATE_LABELS: Record<string, string> = {
  pitching: "Pitch",
  brainstorming: "Contact",
  "a-roll": "A/B",
  "initial-stage-1": "Init 1",
  "initial-stage-2": "Init 2",
  "initial-stage-3": "Init 3",
  "final-cut": "Final"
};

function segmentClass(state: RaceDot, tone: GroupTileStatusTone) {
  if (state === "done") return "bg-[var(--brand-green)]";
  if (state === "upcoming") return "bg-[var(--ink-3)]";
  if (tone === "warn") return "bg-[var(--brand-amber)]";
  if (tone === "danger") return "bg-danger-fill";
  if (tone === "approved") return "bg-[var(--brand-green)]";
  return "bg-foreground/75";
}

function dotClass(state: RaceDot, tone: GroupTileStatusTone) {
  const size = "h-[clamp(0.45rem,calc(72dvh/var(--lanes)*0.28),0.95rem)] w-[clamp(0.45rem,calc(72dvh/var(--lanes)*0.28),0.95rem)]";
  if (state === "done") return cn(size, "bg-[var(--brand-green)]");
  if (state === "upcoming") return cn(size, "border-2 border-[var(--ink-4)] bg-card");
  const current = "h-[clamp(0.6rem,calc(72dvh/var(--lanes)*0.38),1.2rem)] w-[clamp(0.6rem,calc(72dvh/var(--lanes)*0.38),1.2rem)] ring-2";
  if (tone === "warn") return cn(current, "bg-[var(--brand-amber)] ring-[var(--brand-amber)]/35");
  if (tone === "danger") return cn(current, "bg-danger-fill ring-danger-fill/40");
  if (tone === "approved") return cn(current, "bg-[var(--brand-green)] ring-[var(--brand-green)]/35");
  return cn(current, "bg-foreground ring-foreground/25");
}

function slotClass(tone: CapacityTone) {
  if (tone === "full") return "text-[var(--brand-amber)]";
  if (tone === "one") return "text-orange-300";
  return "text-danger";
}

function BoardLiveHeader({ board }: { board: ClassBoardModel }) {
  const [now, setNow] = useState(board.generatedAt);

  useEffect(() => {
    const tick = window.setInterval(() => setNow(new Date().toISOString()), 1000);
    const reload = window.setInterval(() => window.location.reload(), 30_000);
    return () => {
      window.clearInterval(tick);
      window.clearInterval(reload);
    };
  }, []);

  const date = new Date(now);
  const focus = classBoardLiveFocus(board, date);
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit"
  }).format(date);
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "long",
    month: "long",
    day: "numeric"
  }).format(date);

  return (
    <>
      {focus ? (
        <div className="col-start-2 row-start-1 flex h-full min-w-0 items-center justify-center gap-3">
          <div className="min-w-0 text-center">
            <p className="truncate text-[0.65rem] font-medium uppercase tracking-[0.18em] text-[var(--brand-green)]">
              Class focus <span className="text-muted-foreground">· {focus.detail}</span>
            </p>
            <p className="mt-0.5 truncate text-[clamp(0.8rem,1vw,1.1rem)] font-semibold leading-tight" title={focus.text}>
              {focus.text}
            </p>
          </div>
          <div className={cn("w-[5.5rem] shrink-0", focus.remainingSeconds <= 600 ? "text-[var(--brand-amber)]" : "text-[var(--brand-green)]")}>
            <p className="text-center font-mono-broadcast text-xl font-medium tabular-nums leading-none" aria-label={`${focus.countdown} remaining in class`}>
              {focus.countdown}
            </p>
            <p className="mt-1 text-center text-[0.6rem] font-medium uppercase tracking-[0.11em] text-muted-foreground">left in class</p>
            <div className="mt-1 h-0.5 overflow-hidden rounded-full bg-[var(--ink-3)]" aria-hidden="true">
              <div className="h-full bg-current" style={{ width: `${focus.remainingFraction * 100}%` }} />
            </div>
          </div>
        </div>
      ) : null}
      <div className="col-start-3 row-start-1 min-w-0 justify-self-end text-right">
        <p className="font-mono-broadcast text-[clamp(1.25rem,1.7vw,2rem)] font-medium tabular-nums leading-none text-foreground">
          {time}
        </p>
        <p className="mt-1 text-sm text-[var(--ink-text)]">{day}</p>
      </div>
    </>
  );
}

function RaceTrack({ lane }: { lane: ClassBoardLane }) {
  const count = Math.max(lane.dots.length, 1);
  return (
    <div
      className="relative grid min-w-0 items-center"
      style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}
    >
      <div
        className="pointer-events-none absolute top-1/2 flex h-[3px] -translate-y-1/2"
        style={{ left: `${50 / count}%`, right: `${50 / count}%` }}
      >
        {lane.segments.map((segment, index) => (
          <div key={index} className={cn("h-full flex-1", segmentClass(segment, lane.tone))} />
        ))}
      </div>
      {lane.dots.map((dot, index) => (
        <span
          key={index}
          className={cn("relative z-10 justify-self-center rounded-full", dotClass(dot, lane.tone))}
        />
      ))}
    </div>
  );
}

export default function ClassBoardView({ board }: { board: ClassBoardModel }) {
  const focus = board.cycleFocus ? ` · ${board.cycleFocus}` : "";

  return (
    <div className="flex h-dvh min-h-0 w-full shrink-0 flex-col gap-3 overflow-hidden bg-background p-4">
      <header className="grid h-14 shrink-0 grid-cols-[minmax(0,1fr)_minmax(0,1.7fr)_minmax(0,1fr)] items-center gap-4 overflow-hidden">
        <div className="col-start-1 row-start-1 flex min-w-0 items-center gap-4">
          <Link href={"/dashboard" as never} className="inline-flex shrink-0 items-center" aria-label="InFocus Portal">
            <BrandWordmark alt="" className="h-10 w-auto object-contain" priority />
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-[clamp(1.35rem,1.8vw,2.15rem)] font-semibold leading-none tracking-tight">
              Class Board
            </h1>
            <p className="eyebrow mt-1 truncate">
              Cycle {board.cycleNumber}
              {focus}
              <span className="mx-2 text-[var(--ink-4)]">/</span>
              <span className="text-[var(--ink-text)]">{board.lanes.length} packages</span>
            </p>
          </div>
        </div>
        <BoardLiveHeader board={board} />
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-3">
        <section
          className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card"
          style={{ "--lanes": Math.max(board.lanes.length, 1) } as CSSProperties}
        >
          <div className={cn(LANE_GRID, "shrink-0 items-end border-b border-border py-2")}>
            <span className="eyebrow-muted text-[0.65rem]">#</span>
            <span className="eyebrow-muted text-[0.65rem]">Package</span>
            <div
              className="grid min-w-0 gap-1"
              style={{ gridTemplateColumns: `repeat(${Math.max(board.gates.length, 1)}, minmax(0, 1fr))` }}
            >
              {board.gates.map((gate) => (
                <div key={gate.key} className="min-w-0 text-center">
                  <div className="whitespace-nowrap text-[clamp(0.62rem,0.68vw,0.82rem)] font-semibold uppercase leading-none tracking-[0.11em] text-foreground">
                    {TV_GATE_LABELS[gate.key] ?? gate.label}
                  </div>
                  <div className="mt-1 whitespace-nowrap font-mono-broadcast text-[clamp(0.55rem,0.58vw,0.72rem)] tabular-nums leading-none text-[var(--ink-5)]">
                    {gate.dateLabel ?? "—"}
                  </div>
                </div>
              ))}
            </div>
            <span className="eyebrow-muted text-right text-[0.65rem]">Now</span>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {board.lanes.length === 0 ? (
              <p className="px-6 py-10 text-[clamp(1rem,1.1vw,1.25rem)] text-[var(--ink-text)]">
                No packages on this cycle yet.
              </p>
            ) : (
              board.lanes.map((lane) => (
                <article
                  key={lane.id}
                  className={cn(LANE_GRID, "min-h-0 flex-1 items-center overflow-hidden border-b border-border last:border-b-0")}
                >
                  <p
                    className={cn(
                      "font-mono-broadcast text-[clamp(0.8rem,calc(80dvh/var(--lanes)*0.38),1.55rem)] font-medium tabular-nums leading-none",
                      lane.place === 1 ? "text-[var(--brand-green)]" : "text-[var(--ink-text)]"
                    )}
                  >
                    {lane.place}
                  </p>
                  <div className="min-w-0 overflow-hidden">
                    <h2 className="line-clamp-2 break-words text-[clamp(0.78rem,calc(80dvh/var(--lanes)*0.30),1.35rem)] font-semibold leading-tight text-foreground">
                      {lane.topic}
                    </h2>
                    <p className="truncate text-[clamp(0.65rem,calc(80dvh/var(--lanes)*0.20),1rem)] leading-tight text-[var(--ink-text)]">
                      {lane.detail}
                      {lane.extension ? <span className="text-[var(--brand-amber)]"> · {extensionBadgeLabel(lane.extensionDays)}</span> : null}
                    </p>
                  </div>
                  <RaceTrack lane={lane} />
                  <p
                    className={cn(
                      "min-w-0 line-clamp-2 break-words text-right text-[clamp(0.65rem,calc(80dvh/var(--lanes)*0.26),1.05rem)] font-semibold uppercase leading-tight tracking-[0.11em]",
                      TONE_TEXT[lane.tone]
                    )}
                  >
                    <span className="sr-only">{lane.doneCount} of {board.gates.length} stages cleared. </span>
                    {lane.statusLabel}
                  </p>
                </article>
              ))
            )}
          </div>
        </section>

        <div className="grid min-h-0 grid-rows-[fit-content(45%)_minmax(0,1.45fr)_minmax(0,1fr)] gap-3 overflow-hidden">
          <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card">
            <div className="flex shrink-0 items-baseline justify-between gap-3 border-b border-border px-[clamp(0.85rem,1vw,1.2rem)] py-[clamp(0.6rem,0.8vw,0.9rem)]">
              <h2 className="text-[clamp(1rem,1.2vw,1.45rem)] font-semibold tracking-tight">
                Livestreams
              </h2>
              <p className="eyebrow-muted text-[clamp(0.65rem,0.75vw,0.85rem)]">Next 14 days</p>
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 py-1">
              {board.livestreams.length === 0 ? (
                <p className="py-3 text-sm text-[var(--ink-text)]">No livestreams in the next two weeks.</p>
              ) : (
                board.livestreams.map((item) => (
                  <div key={item.id} className="flex shrink-0 flex-col gap-0.5 border-b border-border py-[clamp(0.4rem,0.55vw,0.65rem)] last:border-b-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="min-w-0 truncate text-[clamp(0.8rem,0.9vw,1.05rem)] font-semibold leading-tight">
                        {item.title}
                      </h3>
                      <p className="shrink-0 font-mono-broadcast text-[clamp(0.7rem,0.78vw,0.9rem)] tabular-nums text-foreground">
                        {item.started ? "Started " : ""}
                        {item.timeLabel}
                      </p>
                    </div>
                    <p className="truncate text-[clamp(0.68rem,0.75vw,0.85rem)] leading-tight text-[var(--ink-text)]">
                      {item.dayLabel}
                      <span className="text-[var(--ink-4)]"> · </span>
                      {item.crew}
                      {item.where ? ` · ${item.where}` : ""}
                      <span className={cn("font-semibold", slotClass(item.tone))}> · {item.openLabel}</span>
                      <span> · {item.availability}</span>
                    </p>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card">
            <div className="flex shrink-0 items-baseline justify-between gap-3 border-b border-border px-[clamp(0.85rem,1vw,1.2rem)] py-[clamp(0.6rem,0.8vw,0.9rem)]">
              <h2 className="text-[clamp(1rem,1.2vw,1.45rem)] font-semibold tracking-tight">
                Next deadlines
              </h2>
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 py-1">
              {board.deadlines.length === 0 ? (
                <p className="py-3 text-sm text-[var(--ink-text)]">No upcoming deadlines.</p>
              ) : (
                board.deadlines.map((deadline) => (
                  <div key={deadline.id} className="flex min-h-0 flex-1 items-center justify-between gap-2 overflow-hidden border-b border-border last:border-b-0">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--brand-amber)]" />
                      <div className="min-w-0">
                        <p className="truncate text-[clamp(0.75rem,0.85vw,1rem)] font-semibold leading-tight text-foreground">
                          {deadline.label}
                        </p>
                        <p className="truncate font-mono-broadcast text-[clamp(0.6rem,0.7vw,0.8rem)] tabular-nums leading-tight text-muted-foreground">
                          <time dateTime={deadline.dateKey}>{formatGateDate(deadline.dateKey)}</time>
                          {` · Cycle ${deadline.cycleNumber}`}
                        </p>
                      </div>
                    </div>
                    <span className="status-pill status-warn shrink-0 tabular-nums">
                      {deadline.daysUntil === 0 ? "Today" : `in ${deadline.when}`}
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card">
            <div className="flex shrink-0 items-baseline justify-between gap-3 border-b border-border px-[clamp(0.85rem,1vw,1.2rem)] py-[clamp(0.6rem,0.8vw,0.9rem)]">
              <h2 className="text-[clamp(1rem,1.2vw,1.45rem)] font-semibold tracking-tight">
                Master Calendar
              </h2>
              <p className="eyebrow-muted text-[clamp(0.65rem,0.75vw,0.85rem)]">Next 14 days</p>
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {board.days.map((day) => (
                <article
                  key={day.date}
                  className="grid min-h-0 flex-1 grid-cols-[4.6rem_minmax(0,1fr)] items-center gap-x-2 overflow-hidden border-b border-border px-3 last:border-b-0"
                >
                  <p className="font-mono-broadcast text-[clamp(0.62rem,0.7vw,0.8rem)] leading-none text-[var(--ink-5)]">
                    {day.weekday}
                    <span className="ml-1 text-[1.15em] font-medium tabular-nums text-foreground">
                      {day.dayNum}
                    </span>
                  </p>
                  <p className="min-w-0 truncate text-[clamp(0.68rem,0.75vw,0.88rem)] leading-tight">
                    <span className={cn("mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle", KIND_MARK[day.kind])} />
                    <span className={cn("font-semibold uppercase tracking-[0.11em]", KIND_TEXT[day.kind])}>
                      {day.kindLabel}
                    </span>
                    {day.lines.length > 0 ? (
                      <span className="text-[var(--ink-text)]"> · {day.lines.join(" · ")}</span>
                    ) : null}
                  </p>
                </article>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
