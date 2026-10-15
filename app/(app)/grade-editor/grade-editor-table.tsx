import type { KeyboardEvent, ReactNode } from "react";
import type { GradeScoreState } from "@prisma/client";
import { cn } from "@/src/lib/utils";
import { SCORE_GRAMMAR_HINT } from "./grade-editor-types";
import { formatPercent } from "./grade-editor-utils";

/** Presentational pieces for the Grade Editor tables. No data fetching or state. */

export type HeaderColumn = {
  label: string;
  sub?: string | null;
  /** Full name shown on hover when the label is abbreviated. */
  title?: string;
  /** Numbers are right-aligned (header and cells); text is left-aligned. */
  align?: "left" | "center" | "right";
  /** Pixel width at the table's narrowest. Omit for the reporter column (REPORTER_WIDTH). */
  width?: number;
  /** Small 16px icon after the label (a lock on a locked column). */
  icon?: ReactNode;
  /** Extra classes on the header cell (a second pinned column). */
  className?: string;
};

export type HeaderGroup = {
  label: string;
  hint?: string;
  columns: HeaderColumn[];
  /** Extra classes on the group's header cell (a second pinned column). */
  className?: string;
};

const ALIGN = { left: "text-left", center: "text-center", right: "text-right" } as const;

/** Left hairline on the first cell of every group after the first, in header and body rows. */
export const GROUP_START = "border-l border-border";

/**
 * The reporter column's width at the table's narrowest. Every <col> has a width, so on wide
 * screens the fixed layout spreads the spare room over all the columns in proportion (no empty
 * band after the names); whenever the table scrolls sideways every column is back at exactly its
 * width, so a second pinned column starts here.
 */
export const REPORTER_WIDTH = 176;
/**
 * The reporter column's inset, header and body alike: 16px, the work panel's toolbar edge, so the
 * search field, the REPORTER label and the names start on one line. Every other cell uses px-2.
 */
export const REPORTER_INSET = "pl-4 pr-2";
/** Pins a body cell beside the reporter column from lg (Total grade on the Total view). */
export const SECOND_PINNED = "lg:sticky lg:left-[176px] lg:z-10";
/** The same for its header cells (already sticky to the top). */
export const SECOND_PINNED_HEAD = "lg:left-[176px] lg:z-30";

/**
 * Fixed layout, separate borders (so sticky header rows keep their lines), every cell on the
 * card surface so pinned cells stay opaque while the table scrolls under them. The first column
 * is pinned; the header rows are pinned by GradeTableHead. Hover is Ink 3 across the row; a row
 * with `data-dirty` keeps a faint amber tint.
 */
export const TABLE_CLASS = cn(
  "w-full table-fixed border-separate border-spacing-0 text-sm text-foreground",
  "[&_td]:border-b [&_td]:border-border [&_td]:bg-card [&_tbody_tr:last-child>td]:border-b-0",
  "[&_tbody_tr:hover>td]:bg-[var(--ink-3)]",
  "[&_tbody_tr[data-dirty]>td]:bg-[color-mix(in_srgb,var(--brand-amber)_7%,hsl(var(--card)))]",
  "[&_tbody_tr[data-dirty]:hover>td]:bg-[color-mix(in_srgb,var(--brand-amber)_7%,var(--ink-3))]",
  "[&_td:first-child]:sticky [&_td:first-child]:left-0 [&_td:first-child]:z-10"
);

/** Body cell: 48px rows, h-8 controls centred. */
export const CELL = "h-12 px-2 align-middle";
export const NUM_CELL = cn(CELL, "text-right");
/** A narrow dropdown column (check-ins): 4px insets, header and body alike, so the box gets the room. */
export const TIGHT_INSET = "px-1";

/** Narrowest the table can get before it scrolls: every fixed column plus the reporter column. */
export function tableMinWidth(groups: HeaderGroup[]) {
  return groups.reduce(
    (total, group) => total + group.columns.reduce((sum, col) => sum + (col.width ?? REPORTER_WIDTH), 0),
    0
  );
}

/** How many columns the groups add up to (colSpans, skeleton cells). */
export function columnCount(groups: HeaderGroup[]) {
  return groups.reduce((total, group) => total + group.columns.length, 0);
}

/**
 * Empty, error and no-match states under the header rows. Outside the table and pinned to the
 * left, so it is centred in the visible box even when the table is wider and scrolls sideways.
 */
export function TableEmpty({ children }: { children: ReactNode }) {
  return <div className="sticky left-0 w-full">{children}</div>;
}

/** Two pinned header rows: the group labels (32px) and the column labels (36px) under them. */
export function GradeTableHead({ groups }: { groups: HeaderGroup[] }) {
  return (
    <>
      <colgroup>
        {groups.flatMap((group, groupIndex) =>
          group.columns.map((col, colIndex) => (
            <col key={`${groupIndex}-${colIndex}`} style={{ width: col.width ?? REPORTER_WIDTH }} />
          ))
        )}
      </colgroup>
      <thead>
        <tr>
          {groups.map((group, index) => (
            <th
              key={`${group.label}-${index}`}
              colSpan={group.columns.length}
              scope="colgroup"
              className={cn(
                "sticky top-0 z-20 h-8 truncate bg-card px-2 text-left align-bottom text-[11px] font-medium uppercase tracking-[0.11em] text-[var(--ink-text)]",
                index === 0 && cn("left-0 z-30", REPORTER_INSET),
                index > 0 && GROUP_START,
                group.className
              )}
            >
              {group.label}
              {group.hint ? (
                <span className="ml-2 font-normal normal-case tracking-normal text-muted-foreground">{group.hint}</span>
              ) : null}
            </th>
          ))}
        </tr>
        <tr>
          {groups.flatMap((group, groupIndex) =>
            group.columns.map((col, colIndex) => (
              <th
                key={`${group.label}-${col.label}-${colIndex}`}
                scope="col"
                title={col.title}
                className={cn(
                  "sticky top-8 z-20 h-9 truncate whitespace-nowrap border-b border-border bg-card px-2 align-middle text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground",
                  ALIGN[col.align ?? "left"],
                  groupIndex === 0 && colIndex === 0 && cn("left-0 z-30", REPORTER_INSET),
                  groupIndex > 0 && colIndex === 0 && GROUP_START,
                  col.className
                )}
              >
                <span className="inline-flex max-w-full items-center gap-1 align-middle">
                  <span className="truncate">{col.label}</span>
                  {col.sub ? <span className="font-normal normal-case tracking-normal text-muted-foreground/80">{col.sub}</span> : null}
                  {col.icon}
                </span>
              </th>
            ))
          )}
        </tr>
      </thead>
    </>
  );
}

/** Reporter name (opens their gradebook) over the email's local part and any per-person marks. */
export function ReporterCell({
  name,
  email,
  onOpen,
  children
}: {
  name: string;
  email: string | null;
  onOpen: () => void;
  /** Marks after the email on line 2 (Unsaved, Saving, Over extensions). */
  children?: ReactNode;
}) {
  return (
    <td className={cn("h-12 align-middle", REPORTER_INSET)}>
      <button
        type="button"
        onClick={onOpen}
        title={`${name}: open gradebook`}
        className="block max-w-full truncate rounded-sm text-left text-sm font-semibold leading-tight text-foreground hover:text-[var(--brand-green)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {name}
      </button>
      <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] leading-tight text-muted-foreground">
        <span className="truncate font-mono-broadcast tabular-nums">{email?.split("@")[0] ?? "—"}</span>
        {children}
      </div>
    </td>
  );
}

/** Tone by percentage of the possible points. */
export function percentTone(percent: number | null) {
  if (percent === null) return "text-muted-foreground";
  if (percent >= 80) return "text-[var(--brand-green)]";
  if (percent >= 60) return "text-[var(--brand-amber)]";
  return "text-danger";
}

/** Letter-grade tag tint, in the same tone as the percentage (theme tokens). */
export function gradeBadgeTone(percent: number | null) {
  if (percent === null) return "bg-[var(--ink-3)] text-muted-foreground";
  if (percent >= 80) return "bg-[var(--brand-green)]/[0.14] text-[var(--brand-green)]";
  if (percent >= 60) return "bg-[var(--brand-amber)]/[0.14] text-[var(--brand-amber)]";
  return "bg-danger-tint text-danger";
}

/** Text tone for one check-in dropdown: full credit plain, partial amber, zero red. */
export function checkInTone(score: number | GradeScoreState) {
  if (typeof score !== "number") return "text-muted-foreground";
  if (score >= 5) return "text-foreground";
  if (score > 0) return "text-[var(--brand-amber)]";
  return "text-danger";
}

/** A 24px letter tag (A–F) in the percentage's tone. A tag, not a button. */
export function LetterGradeTag({ percent, letter }: { percent: number | null; letter: string | null }) {
  return (
    <span
      role="img"
      aria-label={letter === null ? "No letter grade yet" : `Letter grade ${letter}`}
      className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-sm text-xs font-semibold leading-none", gradeBadgeTone(percent))}
    >
      {letter ?? "—"}
    </span>
  );
}

/**
 * "13/20 65.0%" readout in Geist Mono (one decimal, as before the redesign, so it agrees with
 * the letter grade beside it). `earned` as a string shows a state word (Exempt) instead of a
 * number. Right-aligned by default so numbers line up down a column. `stacked` puts the
 * percentage under the points (as before the redesign), for narrow table columns.
 */
export function PointsReadout({
  earned,
  possible,
  title,
  stacked = false,
  align = "right",
  className
}: {
  earned: number | string | null;
  possible: number | null;
  title?: string;
  stacked?: boolean;
  align?: "left" | "right";
  className?: string;
}) {
  const numeric = typeof earned === "number" ? earned : null;
  const percent = numeric !== null && possible && possible > 0 ? (numeric / possible) * 100 : null;
  return (
    <span
      title={title}
      className={cn(
        "inline-flex min-w-0 whitespace-nowrap font-mono-broadcast text-[13px] tabular-nums leading-none",
        stacked ? "flex-col gap-1" : "items-baseline gap-1.5",
        stacked ? (align === "right" ? "items-end" : "items-start") : align === "right" && "justify-end",
        className
      )}
    >
      <span>
        <span className={cn("font-medium", numeric === null ? "text-muted-foreground" : "text-foreground")}>
          {earned === null ? "—" : earned}
        </span>
        {possible !== null ? <span className="text-muted-foreground">/{possible}</span> : null}
      </span>
      {possible !== null ? (
        <span className={cn("text-[11px]", !stacked && "w-11 text-right", percentTone(percent))}>{formatPercent(percent)}</span>
      ) : null}
    </span>
  );
}

/** Moves focus to the same score box in the next or previous row (Enter / Shift+Enter). */
function moveInColumn(input: HTMLInputElement, direction: 1 | -1) {
  const key = input.dataset.gradeNav;
  if (!key) return;
  const all = Array.from(document.querySelectorAll<HTMLInputElement>(`input[data-grade-nav="${CSS.escape(key)}"]`));
  const next = all[all.indexOf(input) + direction];
  if (next) {
    next.focus();
    next.select();
  }
}

/** A table field: 3:1 field border, transparent fill, focus ring (DESIGN.md §10). */
export const FIELD_BOX =
  "rounded-md border border-input bg-transparent font-medium tabular-nums text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";
/** The same in Geist Mono, for numbers and dates. */
export const MONO_FIELD = cn(FIELD_BOX, "font-mono-broadcast text-[13px]");

/** Typed score box: digits, `-` for ungraded, `\` for exempt. Fixed width so boxes line up. */
export function ScoreInput({
  value,
  onChange,
  max,
  label,
  placeholder = "—",
  dashed = false,
  width = "w-12",
  size = "sm",
  navKey,
  title = SCORE_GRAMMAR_HINT,
  inputMode = "decimal",
  disabled
}: {
  value: string;
  onChange: (raw: string) => void;
  /** Shown after the box ("/60"); null for none. */
  max: number | string | null;
  label: string;
  placeholder?: string;
  /** Dashed border: a temporary, unsaved override. */
  dashed?: boolean;
  width?: string;
  /** sm: 32px (tables). touch: 40px (phone sheets). */
  size?: "sm" | "touch";
  /** Enter / Shift+Enter move between boxes that share this key (one column). */
  navKey?: string;
  title?: string;
  inputMode?: "decimal" | "numeric";
  disabled?: boolean;
}) {
  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" || !navKey) return;
    event.preventDefault();
    moveInColumn(event.currentTarget, event.shiftKey ? -1 : 1);
  }

  return (
    <span className="inline-flex items-center gap-1">
      <input
        aria-label={label}
        title={title}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        inputMode={inputMode}
        disabled={disabled}
        data-grade-nav={navKey}
        className={cn(
          MONO_FIELD,
          "shrink-0 px-1 text-center",
          size === "touch" ? "h-10 text-base md:text-[13px]" : "h-8",
          dashed && "border-dashed",
          width
        )}
      />
      {max !== null ? <span className="font-mono-broadcast text-xs tabular-nums text-muted-foreground">/{max}</span> : null}
    </span>
  );
}
