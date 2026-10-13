import type { ReactNode } from "react";
import type { GradeScoreState } from "@prisma/client";
import { cn } from "@/src/lib/utils";

/** Presentational pieces for the Grade Editor tables. No data fetching or state. */

export type HeaderColumn = {
  label: string;
  sub?: string | null;
  align?: "left" | "center" | "right";
  width?: string;
};

export type HeaderGroup = {
  label: string;
  hint?: string;
  columns: HeaderColumn[];
};

const ALIGN = { left: "text-left", center: "text-center", right: "text-right" } as const;

/** Left border on the first cell of every group after the first, in both header rows and body rows. */
export const GROUP_START = "border-l border-[hsl(var(--border))]";

/** The reporter column stays put while the wide table scrolls sideways. */
export const TABLE_CLASS = cn(
  "w-full border-collapse text-sm text-foreground",
  "[&_tr>*:first-child]:sticky [&_tr>*:first-child]:left-0 [&_tr>*:first-child]:z-10",
  "[&_td:first-child]:bg-card [&_th:first-child]:bg-[hsl(var(--background))]",
  "max-lg:[&_td:first-child]:w-[150px]"
);

export function GradeTableHead({ groups }: { groups: HeaderGroup[] }) {
  return (
    <thead>
      <tr>
        {groups.map((group, index) => (
          <th
            key={`${group.label}-${index}`}
            colSpan={group.columns.length}
            scope="colgroup"
            className={cn(
              "bg-[hsl(var(--background))] px-3 pt-3 pb-1 text-left text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--brand-green)]",
              index > 0 && GROUP_START
            )}
          >
            {group.label}
            {group.hint ? (
              <span className="ml-2 normal-case tracking-normal text-[var(--ink-text)]">{group.hint}</span>
            ) : null}
          </th>
        ))}
      </tr>
      <tr className="border-b border-[hsl(var(--border))]">
        {groups.flatMap((group, groupIndex) =>
          group.columns.map((col, colIndex) => (
            <th
              key={`${group.label}-${col.label}-${colIndex}`}
              scope="col"
              style={col.width ? { width: col.width, minWidth: col.width } : undefined}
              className={cn(
                "bg-[hsl(var(--background))] px-3 pb-3 pt-1 text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground",
                ALIGN[col.align ?? "left"],
                groupIndex > 0 && colIndex === 0 && GROUP_START
              )}
            >
              {col.label}
              {col.sub ? <span className="ml-1 normal-case tracking-normal text-[var(--ink-4)]">{col.sub}</span> : null}
            </th>
          ))
        )}
      </tr>
    </thead>
  );
}

const AVATAR_PALETTE = ["av-green", "av-red", "av-blue", "av-purple", "av-gray"] as const;

export function initialsFor(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "??"
  );
}

export function ReporterCell({
  name,
  email,
  rowIndex,
  onOpen,
  children
}: {
  name: string;
  email: string | null;
  rowIndex: number;
  onOpen: () => void;
  children?: ReactNode;
}) {
  return (
    <td className="w-[220px] min-w-[200px] px-3 py-3 align-middle">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 border-[var(--ink-3)] text-[11px] font-bold max-lg:hidden",
            AVATAR_PALETTE[rowIndex % AVATAR_PALETTE.length]
          )}
        >
          {initialsFor(name)}
        </div>
        <div className="min-w-0">
          <button
            type="button"
            onClick={onOpen}
            className="block truncate text-left text-[15px] font-semibold leading-tight text-foreground hover:text-[var(--brand-green)] hover:underline"
          >
            {name}
          </button>
          <div className="mt-0.5 flex items-center gap-2 font-mono-broadcast text-[11px] tabular-nums text-muted-foreground">
            <span className="truncate">{email?.split("@")[0] ?? "—"}</span>
            {children}
          </div>
        </div>
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

/** Letter-grade badge: tinted border and text in the same tone as the percentage. */
export function gradeBadgeTone(percent: number | null) {
  if (percent === null) return "border-border text-muted-foreground";
  if (percent >= 80) return "border-[rgb(43,179,110,0.35)] bg-[rgb(43,179,110,0.10)] text-[var(--brand-green)]";
  if (percent >= 60) return "border-[rgb(242,165,22,0.40)] bg-[rgb(242,165,22,0.12)] text-[var(--brand-amber)]";
  return "border-danger/40 bg-danger-tint text-danger";
}

/** Text tone for one check-in dropdown: full credit plain, partial amber, zero red. */
export function checkInTone(score: number | GradeScoreState) {
  if (typeof score !== "number") return "text-muted-foreground";
  if (score >= 5) return "text-foreground";
  if (score > 0) return "text-[var(--brand-amber)]";
  return "text-danger";
}

export function Meter({ percent, className }: { percent: number | null; className?: string }) {
  const value = percent === null ? 0 : Math.max(0, Math.min(100, percent));
  const fill =
    percent === null
      ? "bg-[var(--ink-4)]"
      : percent >= 80
        ? "bg-[var(--brand-green)]"
        : percent >= 60
          ? "bg-[var(--brand-amber)]"
          : "bg-danger-fill";
  return (
    <div className={cn("h-1 w-full overflow-hidden rounded-full bg-[var(--ink-2)]", className)}>
      <div className={cn("h-full rounded-full", fill)} style={{ width: `${value}%` }} />
    </div>
  );
}

/**
 * "13 / 20" readout with the percentage underneath and a thin meter.
 * `earned` as a string shows a state label (Exempt, —) instead of a number.
 */
export function PointsReadout({
  earned,
  possible,
  caption,
  title,
  emphasis = false,
  meter = true
}: {
  earned: number | string | null;
  possible: number | null;
  caption?: string;
  title?: string;
  emphasis?: boolean;
  meter?: boolean;
}) {
  const numeric = typeof earned === "number" ? earned : null;
  const percent = numeric !== null && possible && possible > 0 ? (numeric / possible) * 100 : null;
  return (
    <div className="min-w-[72px]" title={title}>
      <div className={cn("font-mono-broadcast tabular-nums leading-none", emphasis ? "text-lg font-semibold" : "text-[15px] font-semibold")}>
        <span className={numeric === null ? "text-muted-foreground" : "text-foreground"}>
          {earned === null ? "—" : earned}
        </span>
        {possible !== null ? (
          <span className="ml-1 text-xs font-normal text-muted-foreground">/{possible}</span>
        ) : null}
      </div>
      {possible !== null ? (
        <div className={cn("mt-1 font-mono-broadcast text-[11px] font-semibold leading-none tabular-nums", percentTone(percent))}>
          {percent === null ? "—" : `${percent.toFixed(1)}%`}
        </div>
      ) : null}
      {caption ? <div className="mt-1 text-[11px] leading-none text-muted-foreground">{caption}</div> : null}
      {meter && possible !== null ? <Meter percent={percent} className="mt-1.5 max-w-[88px]" /> : null}
    </div>
  );
}

/** Typed score box: digits, `-` for ungraded, `\` for exempt. */
export function ScoreInput({
  value,
  onChange,
  max,
  label,
  placeholder = "—",
  dashed = false,
  width = "w-14"
}: {
  value: string;
  onChange: (raw: string) => void;
  max: number | string | null;
  label: string;
  placeholder?: string;
  dashed?: boolean;
  width?: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <input
        aria-label={label}
        title="Enter points, - for ungraded, or \ for exempt"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        inputMode="decimal"
        className={cn(
          "h-9 rounded-md border bg-[var(--ink)] px-2 text-center font-mono-broadcast text-sm font-semibold tabular-nums text-foreground outline-none transition focus:border-[var(--brand-green)] focus:ring-1 focus:ring-[var(--brand-green)]",
          dashed ? "border-dashed border-[var(--ink-4)]" : "border-border",
          width
        )}
      />
      {max !== null ? (
        <span className="font-mono-broadcast text-xs tabular-nums text-muted-foreground">/{max}</span>
      ) : null}
    </div>
  );
}
