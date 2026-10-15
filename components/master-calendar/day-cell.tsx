"use client";

import { memo, type MouseEvent, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { StatusTag } from "@/components/kit/status-tag";
import {
  DAY_PANEL_ID,
  NOTES_TEXT_STYLES,
  SCENIC_IMAGE_ALT,
  WEEKDAYS,
  crewSummary,
  formatLongDate,
  queueLabel,
  type DayModel
} from "@/components/master-calendar/calendar-model";
import { scenicImageForDate } from "@/src/lib/master-calendar-cells";
import { cn } from "@/src/lib/utils";

// Container-query switch for the board (classes are written out in full so Tailwind finds them):
// below 58rem of board width each day is an agenda row (date rail, summary, thumbnail or chevron);
// from 58rem it is a cell in the 5-column month grid. Inner pieces use their own named
// containers (/tags, /lines), so they adapt to the cell's width, not the board's.

type DayStatus = { saving: boolean; failed: boolean };

type Tag = { key: string; node: ReactNode };

/**
 * Header tags in priority order (status first). Cells show up to two (one in a narrow cell);
 * the Day panel (`panel`) shows them all, plus Today and what the day still needs.
 */
export function dayTags(day: DayModel, status: DayStatus, { panel = false } = {}): Tag[] {
  const tags: Tag[] = [];
  if (status.failed) tags.push({ key: "failed", node: <StatusTag tone="danger">Not saved</StatusTag> });
  else if (status.saving) {
    tags.push({
      key: "saving",
      node: (
        <StatusTag tone="neutral" spinner>
          Saving…
        </StatusTag>
      )
    });
  }
  if (panel && day.isToday) tags.push({ key: "today", node: <StatusTag tone="success">Today</StatusTag> });
  if (panel && day.anchorsNeeded) tags.push({ key: "anchors-needed", node: <StatusTag tone="warning">Anchors needed</StatusTag> });
  if (panel && day.paNeeded) tags.push({ key: "pa-needed", node: <StatusTag tone="warning">PA needed</StatusTag> });
  if (day.specialLabel) tags.push({ key: "special", node: <StatusTag tone="success">{day.specialLabel}</StatusTag> });
  // On the board a day off already prints its label; the tag only adds something over custom notes.
  if (day.holidayLabel && (panel || day.customNotes)) {
    tags.push({ key: "holiday", node: <StatusTag tone="muted">Holiday</StatusTag> });
  }
  if (day.patternTag) tags.push({ key: "pattern", node: <StatusTag tone="neutral">{day.patternTag}</StatusTag> });
  return tags;
}

function kindWords(day: DayModel) {
  if (day.kind === "SHOW") return day.specialLabel ? `show, ${day.specialLabel}` : "show";
  if (day.kind === "PA") return "PA day";
  if (day.kind === "HOLIDAY") return day.label || "no school";
  return day.label || "class day";
}

/** "Wednesday, October 21, show, anchors needed" for the cell's button. */
export function dayAccessibleLabel(day: DayModel, status: DayStatus) {
  const parts = [formatLongDate(day.dateKey)];
  if (day.isToday) parts.push("today");
  parts.push(kindWords(day));
  if (day.anchorsNeeded) parts.push("anchors needed");
  if (day.paNeeded) parts.push("PA announcers needed");
  if (status.failed) parts.push("not saved");
  else if (status.saving) parts.push("saving");
  return parts.join(", ");
}

function NeededTag() {
  return <StatusTag tone="warning">Needed</StatusTag>;
}

function NamesValue({ names, needed }: { names: string[]; needed: boolean }) {
  const text = names.join(" & ");
  if (text && !needed) return <>{text}</>;
  if (text) {
    return (
      <span className="inline-flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
        <span>{text}</span>
        <NeededTag />
      </span>
    );
  }
  return needed ? <NeededTag /> : <span className="text-muted-foreground">Not set</span>;
}

/**
 * Label/value lines, shared by cells and agenda rows. From 10rem of width the labels sit in one
 * fixed 4rem column (so values line up across the week); narrower, each label stacks above its value.
 */
function CellLines({ items, past }: { items: Array<{ label: string; value: ReactNode }>; past: boolean }) {
  if (items.length === 0) return null;
  return (
    <div className="@container/lines min-w-0">
      <dl
        className={cn(
          "space-y-1.5 text-[13px] leading-5",
          "@min-[10rem]/lines:grid @min-[10rem]/lines:grid-cols-[4rem_minmax(0,1fr)] @min-[10rem]/lines:gap-x-2 @min-[10rem]/lines:gap-y-1 @min-[10rem]/lines:space-y-0",
          past ? "text-muted-foreground" : "text-foreground"
        )}
      >
        {items.map((item) => (
          <div key={item.label} className="min-w-0 @min-[10rem]/lines:contents">
            <dt className="text-[11px] font-medium uppercase leading-5 tracking-[0.11em] text-muted-foreground">{item.label}</dt>
            <dd className="min-w-0 break-words">{item.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function summaryLines(day: DayModel, canEdit: boolean) {
  const items: Array<{ label: string; value: ReactNode }> = [];
  if (day.kind === "SHOW") {
    items.push({ label: "Anchors", value: <NamesValue names={day.anchors} needed={day.anchorsNeeded} /> });
    items.push({
      label: "SM",
      value: day.manager?.name ? (
        <>
          {day.manager.name}
          {canEdit && day.manager.source === "rotation" ? <span className="text-muted-foreground"> · auto</span> : null}
        </>
      ) : (
        <span className="text-muted-foreground">Not set</span>
      )
    });
    const shown = day.queue.slice(0, 2);
    items.push({
      label: "Queue",
      value:
        day.queue.length === 0 ? (
          <span className="text-muted-foreground">None yet</span>
        ) : (
          <span className="block min-w-0">
            {shown.map((row) => (
              <span key={row.id} className="block truncate" title={queueLabel(row)}>
                {queueLabel(row)}
              </span>
            ))}
            {day.queue.length > shown.length ? (
              <span className="block text-muted-foreground">+{day.queue.length - shown.length} more</span>
            ) : null}
          </span>
        )
    });
  }
  if (day.kind === "PA") {
    items.push({ label: "PA", value: <NamesValue names={day.paNames} needed={day.paNeeded} /> });
  }
  if (day.spirit) {
    items.push({ label: "Spirit", value: <span className="text-[var(--brand-green)]">{day.spirit.theme}</span> });
    const crew = crewSummary(day.spirit);
    items.push({ label: "Crew", value: crew || <span className="text-muted-foreground">None yet</span> });
  }
  return items;
}

/** The stretched date button: it covers the whole cell, so any click on the cell selects the day. */
function DateButton({
  day,
  label,
  selected,
  onSelect
}: {
  day: DayModel;
  label: string;
  selected: boolean;
  onSelect: (dateKey: string, fromKeyboard: boolean) => void;
}) {
  return (
    <button
      type="button"
      id={`master-calendar-day-${day.dateKey}`}
      aria-label={label}
      aria-current={day.isToday ? "date" : undefined}
      aria-controls={selected ? DAY_PANEL_ID : undefined}
      // detail 0: Enter or Space (or a screen reader), not a pointer click.
      onClick={(event) => onSelect(day.dateKey, event.detail === 0)}
      className={cn(
        "flex shrink-0 flex-col items-center justify-center rounded-sm font-semibold tabular-nums leading-none outline-none",
        "after:absolute after:inset-0 after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring",
        "h-11 w-12 gap-1",
        "@min-[58rem]:h-6 @min-[58rem]:w-auto @min-[58rem]:min-w-6 @min-[58rem]:flex-row @min-[58rem]:gap-0 @min-[58rem]:px-1",
        day.isToday ? "bg-[var(--brand-fill)] text-[var(--on-brand)]" : "text-foreground"
      )}
    >
      <span className={cn("text-[11px] font-medium uppercase tracking-[0.11em]", "@min-[58rem]:hidden", !day.isToday && "text-muted-foreground")}>
        {WEEKDAYS[day.weekdayIndex].slice(0, 3)}
      </span>
      <span className={cn("text-lg", "@min-[58rem]:text-sm")}>{Number(day.dateKey.slice(8))}</span>
    </button>
  );
}

function cellSurface(day: DayModel, selected: boolean, showSelection: boolean) {
  const dayOff = day.kind === "HOLIDAY";
  return cn(
    "relative grid min-w-0 items-start gap-x-3 px-3 py-2.5 transition-colors",
    "min-h-14 grid-cols-[3rem_minmax(0,1fr)_auto]",
    "@min-[58rem]:grid-cols-[auto_minmax(0,1fr)] @min-[58rem]:content-start @min-[58rem]:gap-x-2 @min-[58rem]:gap-y-2 @min-[58rem]:p-3",
    // A day off is one line, so a week of them stays a short row.
    dayOff ? "bg-background @min-[58rem]:min-h-12" : "bg-card @min-[58rem]:min-h-24",
    "hover:bg-[var(--ink-3)]",
    showSelection && selected && [
      "bg-[var(--ink-3)] before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-[var(--brand-green)] before:content-['']",
      "@min-[58rem]:before:hidden @min-[58rem]:outline-2 @min-[58rem]:-outline-offset-2 @min-[58rem]:outline-[var(--brand-green)]"
    ]
  );
}

/** One weekday on the board: a grid cell from 58rem of board width, an agenda row below. */
export const DayCell = memo(function DayCell({
  day,
  saving,
  failed,
  selected,
  showSelection,
  canEdit,
  onSelect,
  onImageMenu
}: {
  day: DayModel;
  saving: boolean;
  failed: boolean;
  selected: boolean;
  showSelection: boolean;
  canEdit: boolean;
  onSelect: (dateKey: string, fromKeyboard: boolean) => void;
  onImageMenu?: (dateKey: string, event: MouseEvent<HTMLDivElement>) => void;
}) {
  const status: DayStatus = { saving, failed };
  const tags = dayTags(day, status);
  const isClassDay = day.kind === "NONE";
  const showImage = isClassDay && !day.imageHidden;
  const lines = summaryLines(day, canEdit);
  const showNotes = (isClassDay || day.kind === "HOLIDAY") && day.displayHtml;
  const hasText = lines.length > 0 || Boolean(showNotes);
  // A day off with just its label prints it beside the date, like a run of days off does.
  const inlineText = day.kind === "HOLIDAY" && !day.customNotes && tags.length === 0;

  return (
    <div
      className={cellSurface(day, selected, showSelection)}
      onContextMenu={isClassDay && onImageMenu ? (event) => onImageMenu(day.dateKey, event) : undefined}
    >
      <DateButton day={day} label={dayAccessibleLabel(day, status)} selected={selected && showSelection} onSelect={onSelect} />

      {/* Agenda: one column beside the date rail. Grid: its children join the cell's grid. */}
      <div className={cn("flex min-w-0 flex-col gap-1.5 self-center", "@min-[58rem]:contents")}>
        {tags.length > 0 ? (
          <div className={cn("@container/tags flex min-w-0 items-center gap-1.5 overflow-hidden", "@min-[58rem]:col-start-2 @min-[58rem]:row-start-1 @min-[58rem]:h-6")}>
            {tags.slice(0, 2).map((tag, index) => (
              <span key={tag.key} className={cn("min-w-0 shrink", index === 0 ? "flex" : "hidden @min-[9rem]/tags:flex")}>
                {tag.node}
              </span>
            ))}
          </div>
        ) : null}
        {showImage ? (
          // eslint-disable-next-line @next/next/no-img-element -- a remote royalty-free image (also used in the Google Doc)
          <img
            src={scenicImageForDate(day.dateKey)}
            alt={SCENIC_IMAGE_ALT}
            loading="lazy"
            className={cn("hidden h-16 w-full rounded-sm object-cover", "@min-[58rem]:col-span-2 @min-[58rem]:block")}
          />
        ) : null}
        {hasText ? (
          <div
            className={cn(
              "min-w-0 space-y-1.5",
              inlineText ? "@min-[58rem]:col-start-2 @min-[58rem]:row-start-1 @min-[58rem]:self-center" : "@min-[58rem]:col-span-2"
            )}
          >
            <CellLines items={lines} past={day.isPast} />
            {showNotes ? (
              <div
                className={cn(NOTES_TEXT_STYLES, "line-clamp-3", (day.kind === "HOLIDAY" || day.isPast) && "text-muted-foreground")}
                dangerouslySetInnerHTML={{ __html: day.displayHtml }}
              />
            ) : null}
          </div>
        ) : isClassDay && tags.length === 0 ? (
          <span className={cn("text-[13px] text-muted-foreground", "@min-[58rem]:hidden")}>{day.label || "Class"}</span>
        ) : null}
      </div>

      {/* Agenda only: the class day's photo, else a chevron. */}
      <div className={cn("col-start-3 row-start-1 flex items-center self-center", "@min-[58rem]:hidden")}>
        {showImage ? (
          // eslint-disable-next-line @next/next/no-img-element -- a remote royalty-free image (also used in the Google Doc)
          <img src={scenicImageForDate(day.dateKey)} alt={SCENIC_IMAGE_ALT} loading="lazy" className="h-12 w-16 rounded-sm object-cover" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
        )}
      </div>
    </div>
  );
});
