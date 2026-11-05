import { Check } from "lucide-react";
import { cn } from "@/src/lib/utils";

type StageTrackSegment = {
  key: string;
  label: string;
  state: "done" | "current" | "todo";
};

// Green marks for done, a 40% tint for the pending stage, Ink 4 for later: the three read apart
// in both themes (in Light mode --brand-fill and --brand-green are the same green).
const SEGMENT_FILL: Record<StageTrackSegment["state"], string> = {
  done: "bg-[var(--brand-green)]",
  current: "bg-[var(--brand-green)]/40",
  todo: "bg-[var(--ink-4)]"
};

/** Read-only stage bar with each segment named on hover and a spoken summary. */
export function StageTrack({ segments, className }: { segments: StageTrackSegment[]; className?: string }) {
  const done = segments.filter((segment) => segment.state === "done").length;
  const current = segments.find((segment) => segment.state === "current");
  const summary = `${done} of ${segments.length} stages done${current ? `, ${current.label} pending` : ""}`;
  return (
    <div role="img" aria-label={summary} className={cn("flex min-w-0 gap-1", className)}>
      {segments.map((segment) => (
        <span
          key={segment.key}
          title={segment.label}
          className={cn("h-1.5 min-w-0 flex-1 rounded-full", SEGMENT_FILL[segment.state])}
        />
      ))}
    </div>
  );
}

export type StageToggle = {
  key: string;
  label: string;
  /** Full name for screen readers and the hover text ("Initial Cut · media linked"). */
  title: string;
  done: boolean;
};

type StageSize = "sm" | "touch";

/**
 * The stage-cell label. Caps at 11px with light tracking so the longest short label ("A/B-roll")
 * fits a cell at the table's and a phone's width. Tracking stays tighter than the usual 0.11em
 * label style on purpose: at 0.08em three of the five labels were cut off.
 */
const CELL_TEXT = "text-[11px] font-medium uppercase leading-none tracking-[0.02em]";
const GRID_COLUMNS = (count: number) => ({ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` });

/**
 * A done stage carries a check as well as its fill, so "done" never rests on color alone.
 * `sm` (the table) puts the check before the label; `touch` (phone rows, where the cell is too
 * narrow for both on one line) stacks it above, and not-done cells keep the same empty slot so
 * every label in a row sits on one line.
 */
function StageCellContent({ label, done, size }: { label: string; done: boolean; size: StageSize }) {
  const check = <Check aria-hidden strokeWidth={2.5} className="h-3 w-3 shrink-0" />;
  if (size === "touch") {
    return (
      <span aria-hidden className="flex min-w-0 max-w-full flex-col items-center gap-0.5">
        {done ? check : <span className="h-3 w-3" />}
        <span className="max-w-full truncate">{label}</span>
      </span>
    );
  }
  return (
    <span aria-hidden className="flex min-w-0 max-w-full items-center justify-center gap-0.5">
      {done ? check : null}
      <span className="min-w-0 truncate">{label}</span>
    </span>
  );
}

/**
 * Five joined stage toggles on an equal-column grid (so a header grid can sit exactly over it).
 * Done stages use the green fill and a check. aria-pressed carries the state; the short caps
 * label is visual, the full stage name is the button's name.
 */
export function StageToggleGroup({
  stages,
  disabled = false,
  onToggle,
  size = "sm",
  ariaLabel = "Stages",
  className
}: {
  stages: StageToggle[];
  disabled?: boolean;
  onToggle: (key: string) => void;
  /** sm: 32px. touch: 40px (phone rows). */
  size?: StageSize;
  /** Names the group for screen readers, e.g. "Stages for Bike lanes". */
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        "grid min-w-0 divide-x divide-input overflow-hidden rounded-md border border-input",
        size === "touch" ? "h-10" : "h-8",
        className
      )}
      style={GRID_COLUMNS(stages.length)}
    >
      {stages.map((stage) => (
        <button
          key={stage.key}
          type="button"
          disabled={disabled}
          aria-pressed={stage.done}
          aria-label={stage.title}
          title={stage.title}
          onClick={() => onToggle(stage.key)}
          className={cn(
            "flex min-w-0 items-center justify-center px-px transition-colors focus-visible:relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
            CELL_TEXT,
            stage.done ? "bg-[var(--brand-fill)] text-[var(--on-brand)]" : "text-muted-foreground",
            disabled ? "cursor-default" : stage.done ? "hover:bg-[var(--brand-fill-hover)]" : "hover:bg-[var(--ink-3)] hover:text-foreground"
          )}
        >
          <StageCellContent label={stage.label} done={stage.done} size={size} />
        </button>
      ))}
    </div>
  );
}

/**
 * The same five stages for viewers who can't change them: status, not a control. No border,
 * no buttons, no hover; done stages are a green tag tint with a check, the rest are muted text.
 * Sits on the same equal-column grid, so the totals above still line up.
 */
export function StageStatusGroup({
  stages,
  size = "sm",
  ariaLabel = "Stages",
  className
}: {
  stages: StageToggle[];
  /** sm: 28px, check before the label. touch: 36px, check above it (phone rows). */
  size?: StageSize;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <ul
      aria-label={ariaLabel}
      className={cn("grid min-w-0 gap-0.5 border-x border-transparent", size === "touch" ? "h-9" : "h-7", className)}
      style={GRID_COLUMNS(stages.length)}
    >
      {stages.map((stage) => {
        const state = `${stage.title}: ${stage.done ? "done" : "not done"}`;
        return (
          <li
            key={stage.key}
            title={state}
            className={cn(
              "flex min-w-0 items-center justify-center rounded-[4px] px-px",
              CELL_TEXT,
              stage.done ? "bg-[var(--brand-green)]/[0.14] text-[var(--brand-green)]" : "text-muted-foreground"
            )}
          >
            <span className="sr-only">{state}</span>
            <StageCellContent label={stage.label} done={stage.done} size={size} />
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Stage totals on the same equal-column grid as StageToggleGroup: caps label, mono "8/12" and a
 * 2px bar, so every count sits over the stage it counts.
 */
export function StageTotals({
  totals,
  total,
  className,
  "aria-hidden": ariaHidden
}: {
  totals: Array<{ key: string; label: string; count: number }>;
  total: number;
  className?: string;
  /** Hide from screen readers when a nearby sr-only summary already says the totals. */
  "aria-hidden"?: boolean;
}) {
  return (
    <div
      aria-hidden={ariaHidden || undefined}
      className={cn("grid min-w-0 border-x border-transparent", className)}
      style={GRID_COLUMNS(totals.length)}
    >
      {totals.map((item) => {
        const percent = total > 0 ? Math.round((item.count / total) * 100) : 0;
        return (
          <div key={item.key} className="min-w-0 px-px text-center" title={`${item.label}: ${item.count} of ${total} done`}>
            <div className={cn(CELL_TEXT, "truncate leading-tight text-muted-foreground")}>{item.label}</div>
            <div className="mt-0.5 font-mono-broadcast text-xs tabular-nums text-foreground">
              {item.count}
              <span className="text-muted-foreground">/{total}</span>
            </div>
            <div className="mx-auto mt-1 h-0.5 w-full overflow-hidden rounded-full bg-[var(--ink-3)]">
              <div className="h-full bg-[var(--brand-green)]" style={{ width: `${percent}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
