import { Award, Flag } from "lucide-react";
import type { CSSProperties } from "react";
import { EmptyState } from "@/components/kit/empty-state";
import type { ClassBoardGate, ClassBoardLane, RaceDot } from "@/src/lib/class-board";
import type { GroupTileStatusTone } from "@/src/lib/group-tile-status";
import { extensionBadgeLabel } from "@/src/lib/package-extensions";
import { cn } from "@/src/lib/utils";
import { gateTvLabel, lastClearedGateLabel } from "./board-format";
import { RecentClearTag } from "./board-recent-clear";
import { BOARD_TEXT } from "./board-scale";
import { BoardTag } from "./board-tag";

/**
 * One grid for the column header and every lane. Phone: place | package, with the status under
 * the topic and the track across the whole lane below. From md (tablets): place | package |
 * track | status on one row. xl (1280–1535px) gives the track a little more room so its one row
 * of stage names stays about 11px; 2xl and up (the 1080p TV) keeps the original proportions.
 */
const LANE_GRID = [
  "grid grid-cols-[calc(var(--b)*1.75)_minmax(0,1fr)] gap-x-3 px-4",
  "md:grid-cols-[calc(var(--b)*1.75)_minmax(0,1.2fr)_minmax(0,1.75fr)_minmax(0,1.05fr)] md:gap-x-4",
  "lg:grid-cols-[calc(var(--b)*2.75)_minmax(0,1.2fr)_minmax(0,1.75fr)_minmax(0,1.05fr)]",
  "xl:grid-cols-[calc(var(--b)*2.75)_minmax(0,1.1fr)_minmax(0,2fr)_minmax(0,1fr)]",
  "2xl:grid-cols-[calc(var(--b)*2.75)_minmax(0,1.2fr)_minmax(0,1.75fr)_minmax(0,1.05fr)]"
].join(" ");

/** Where the gate heads and every lane's track sit: a full-width row on phones, the track column from md. */
const TRACK_CELL = "col-span-full min-w-0 md:col-span-1";

/**
 * Lane sizes. On lg each lane is a size container: --lane-h is its full height (content box,
 * the 0.2b top and bottom padding and the rule), and each size follows it, clamped in --b units,
 * so six lanes get big type and twenty still fit. The small sizes never go under DESIGN.md's 11px
 * label floor (the topic, 12px), even on a short laptop window. The lane's font size is --b, so
 * the `em` in the lane's height queries below is one board unit.
 */
const LANE_SCALE = [
  "text-[length:var(--b)]",
  "[--lane-place:calc(var(--b)*1.2)] [--lane-title:calc(var(--b)*1.07)] [--lane-meta:calc(var(--b)*0.875)]",
  "[--lane-tag:calc(var(--b)*0.75)] [--dot:calc(var(--b)*0.6)] [--dot-now:calc(var(--b)*0.9)]",
  "lg:[container-type:size] lg:[--lane-h:calc(100cqh_+_var(--b)*0.4_+_1px)]",
  "lg:[--lane-place:clamp(calc(var(--b)*0.9),calc(var(--lane-h)*0.34),calc(var(--b)*2.1))]",
  "lg:[--lane-title:clamp(max(12px,calc(var(--b)*0.8)),calc(var(--lane-h)*0.25),calc(var(--b)*1.75))]",
  "lg:[--lane-meta:clamp(max(11px,calc(var(--b)*0.7)),calc(var(--lane-h)*0.18),calc(var(--b)*1.1))]",
  "lg:[--lane-tag:clamp(max(11px,calc(var(--b)*0.7)),calc(var(--lane-title)*0.72),calc(var(--b)*1.1))]",
  "lg:[--dot:clamp(calc(var(--b)*0.5),calc(var(--lane-h)*0.2),calc(var(--b)*0.95))]",
  "lg:[--dot-now:clamp(calc(var(--b)*0.7),calc(var(--lane-h)*0.28),calc(var(--b)*1.25))]"
].join(" ");

/*
 * What a lane shows follows its real height on lg (height queries on the lane, in --b units), so
 * text is never cut partway through a line, whatever the lane count or screen:
 * - 3.6b or taller: a two-line topic, then the names line.
 * - under 3.6b: the topic keeps to one line.
 * - under 2.15b: the topic and the names share one line, and the status keeps to one line
 *   (board-tag.tsx). Below lg no lane is a size container, so none of these apply.
 */

/**
 * Gate heads are sized from their own column (the gate grid is an inline-size container) so
 * neighbours never run into each other, with an 11px floor (10px for dates) from the room the
 * layout gives them. Below xl the track is too narrow for seven heads in a row, so the heads
 * alternate between two rows (first, third, fifth, seventh on top) and each can use two columns.
 */
const GATE_LABEL = [
  "whitespace-nowrap font-medium uppercase leading-[1.2] tracking-normal text-foreground",
  "text-[length:min(max(11px,var(--b-label)),6.4cqw)] xl:text-[length:min(max(11px,var(--b-label)),3.2cqw)]"
].join(" ");
const GATE_DATE = [
  "mt-0.5 whitespace-nowrap font-mono-broadcast tabular-nums leading-[1.2] text-muted-foreground xl:mt-1",
  "text-[length:min(max(10px,calc(var(--b)*0.75)),7cqw)] xl:text-[length:min(max(10px,calc(var(--b)*0.75)),3.5cqw)]"
].join(" ");

function segmentClass(state: RaceDot, tone: GroupTileStatusTone) {
  if (state === "done") return "bg-[var(--brand-green)]";
  if (state === "upcoming") return "bg-[var(--ink-5)]/60";
  if (tone === "warn") return "bg-[var(--brand-amber)]";
  if (tone === "danger") return "bg-danger-fill";
  if (tone === "approved") return "bg-[var(--brand-green)]";
  return "bg-foreground/75";
}

function dotClass(state: RaceDot, tone: GroupTileStatusTone) {
  if (state === "done") return "size-[var(--dot)] bg-[var(--brand-green)]";
  // Ink 5 (about 3.4:1 on the card) so the seven stops still read from across the room.
  if (state === "upcoming") return "size-[var(--dot)] border-2 border-[var(--ink-5)] bg-card";
  const current = "size-[var(--dot-now)] ring-2 lg:ring-[3px]";
  if (tone === "warn") return cn(current, "bg-[var(--brand-amber)] ring-[var(--brand-amber)]/35");
  if (tone === "danger") return cn(current, "bg-danger-fill ring-danger-fill/40");
  if (tone === "approved") return cn(current, "bg-[var(--brand-green)] ring-[var(--brand-green)]/35");
  return cn(current, "bg-foreground ring-foreground/25");
}

function gridColumns(count: number): CSSProperties {
  return { gridTemplateColumns: `repeat(${Math.max(count, 1)}, minmax(0, 1fr))` };
}

/**
 * The race: every package's place, seven stage dots and status. The TV's hero, left two thirds.
 * Every lane is on screen at every size; on the TV the lanes share the height and their type
 * shrinks with it.
 */
export function BoardRace({ gates, lanes }: { gates: ClassBoardGate[]; lanes: ClassBoardLane[] }) {
  return (
    <section
      aria-label="Package race"
      // Clipped only on lg: below it the page scrolls and the column heads stick to the top.
      className="flex min-h-0 flex-col rounded-md border border-border bg-card lg:overflow-hidden"
    >
      <RaceHeader gates={gates} />
      {lanes.length === 0 ? (
        <EmptyState
          icon={Flag}
          title="No packages on this cycle yet."
          description="Packages appear once the roster has a topic or members."
          className="flex-1 justify-center"
        />
      ) : (
        <div className="flex min-h-0 flex-col lg:flex-1">
          {lanes.map((lane) => (
            <Lane key={lane.id} lane={lane} gates={gates} />
          ))}
        </div>
      )}
    </section>
  );
}

/** Column heads. The gate heads use the lanes' exact track grid (no gap), so each dot sits under its head. */
function RaceHeader({ gates }: { gates: ClassBoardGate[] }) {
  return (
    <div
      className={cn(
        LANE_GRID,
        "sticky top-0 z-20 shrink-0 items-center gap-y-2 rounded-t-md border-b border-border bg-card py-2.5",
        "md:gap-y-0 lg:static lg:h-[var(--b-head-tall)] lg:rounded-none lg:py-0"
      )}
    >
      <span className={cn(BOARD_TEXT.label, "text-right")}>#</span>
      <span className={BOARD_TEXT.label}>Package</span>
      <div
        className={cn(TRACK_CELL, "row-start-2 grid gap-y-0.5 [container-type:inline-size] md:row-start-auto xl:gap-y-0")}
        style={gridColumns(gates.length)}
      >
        {gates.map((gate, index) => (
          // Flex centering, so a head wider than its column still centers over its dot.
          <div
            key={gate.key}
            className={cn("flex min-w-0 flex-col items-center", index % 2 === 1 && "max-xl:row-start-2")}
            style={{ gridColumnStart: index + 1 }}
          >
            <p className={GATE_LABEL}>{gateTvLabel(gate)}</p>
            <p className={GATE_DATE}>{gate.dateLabel ?? "—"}</p>
          </div>
        ))}
      </div>
      <span className={cn(BOARD_TEXT.label, "hidden md:block")}>Status</span>
    </div>
  );
}

function Lane({ lane, gates }: { lane: ClassBoardLane; gates: ClassBoardGate[] }) {
  return (
    <article
      className={cn(
        LANE_GRID,
        LANE_SCALE,
        "items-center gap-y-2 border-b border-border py-3 last:border-b-0 md:gap-y-0",
        "lg:min-h-0 lg:flex-1 lg:overflow-hidden lg:py-[calc(var(--b)*0.2)]",
        lane.packageOfCycle && "bg-[var(--brand-green)]/[0.08]"
      )}
    >
      <p
        className={cn(
          "self-start text-right font-mono-broadcast text-[length:var(--lane-place)] font-medium leading-[1.15] tabular-nums md:self-center",
          lane.place === 1 ? "text-[var(--brand-green)]" : "text-[var(--ink-text)]"
        )}
      >
        {lane.place}
      </p>
      <div className="min-w-0 [@container(max-height:2.15em)]:flex [@container(max-height:2.15em)]:items-baseline [@container(max-height:2.15em)]:gap-[0.6em]">
        <h2
          className={cn(
            "line-clamp-2 break-words text-[length:var(--lane-title)] font-semibold leading-[1.2] text-foreground",
            "[@container(max-height:3.6em)]:line-clamp-1",
            "[@container(max-height:2.15em)]:max-w-[62%] [@container(max-height:2.15em)]:shrink-0"
          )}
        >
          {lane.topic}
        </h2>
        {/* The names, then the extension ("10 Day Extension"): the names truncate first. */}
        <div
          className={cn(
            "mt-[0.25em] flex min-w-0 items-center gap-[0.5em] text-[length:var(--lane-meta)]",
            "[@container(max-height:2.15em)]:mt-0 [@container(max-height:2.15em)]:flex-1"
          )}
        >
          <p className="min-w-0 truncate leading-[1.3] text-[var(--ink-text)]">{lane.detail}</p>
          {lane.extension ? (
            <BoardTag size="inline" tone="warning">
              {extensionBadgeLabel(lane.extensionDays)}
            </BoardTag>
          ) : null}
        </div>
      </div>
      <RaceTrack lane={lane} />
      {/*
        The status slot, always one row: the status (wraps to two lines inside its tag), then a
        "Cleared …" tag for ten minutes after the lane clears a stage.
      */}
      <div className="col-start-2 row-start-2 flex min-w-0 items-center gap-[calc(var(--lane-tag)*0.4)] md:col-start-auto md:row-start-auto">
        <span className="sr-only">
          {lane.doneCount} of {gates.length} stages cleared.{" "}
        </span>
        <BoardTag
          size="lane"
          tone={lane.tone}
          wrap
          className="shrink"
          icon={lane.packageOfCycle ? <Award aria-hidden="true" /> : null}
        >
          {lane.statusLabel}
        </BoardTag>
        <RecentClearTag doneCount={lane.doneCount} label={lastClearedGateLabel(lane.dots, gates)} />
      </div>
    </article>
  );
}

/** Dots (done filled, current larger and ringed in the status tone, upcoming hollow) on a colored line. */
function RaceTrack({ lane }: { lane: ClassBoardLane }) {
  const count = Math.max(lane.dots.length, 1);
  return (
    <div
      aria-hidden="true"
      className={cn(TRACK_CELL, "relative row-start-3 grid min-h-[calc(var(--dot-now)+6px)] items-center md:row-start-auto")}
      style={gridColumns(count)}
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
        <span key={index} className={cn("relative z-10 justify-self-center rounded-full", dotClass(dot, lane.tone))} />
      ))}
    </div>
  );
}
