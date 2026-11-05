import type { ReactNode } from "react";
import type { MeetingSummary } from "@/src/lib/meetings/types";
import { cn } from "@/src/lib/utils";
import { AccessTag } from "./meeting-rows";

/**
 * One grid for every meeting row on the tab (Now, Upcoming): lead | title block | actions from
 * md, so the lead column, titles and action slots line up across panels (the panels share one
 * ⋯ slot decision, see anyRowMenu). On phones the lead (day or status, and time) is its own line
 * above the title, so the title gets the width beside the actions. The side padding matches the
 * Panel header and footer (px-4, px-5 from md), so every left edge in a card is the same. A
 * phone-only Join line spans the whole row (MeetingRowActions).
 * The 5.5rem lead fits the widest lead tag ("Starting") without truncating.
 */
export const MEETING_ROW_GRID =
  "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 px-4 py-3 md:grid-cols-[5.5rem_minmax(0,1fr)_auto] md:gap-y-2 md:px-5";

/**
 * The Past row: the same lead column, then the title block and a chevron. Its columns follow the
 * list's own width (a container query; the list is the `@container`), not the viewport: in the
 * 22rem rail the lead is a line above the title, as on phones, so titles get the row's width.
 * From 28rem wide (the stacked layout on tablets and up) the lead is a column again. The side
 * padding still follows the viewport, to match the Panel header and footer.
 */
export const PAST_ROW_GRID =
  "grid grid-cols-[minmax(0,1fr)_1rem] items-center gap-x-3 gap-y-1.5 px-4 py-3 md:px-5 @min-[28rem]:grid-cols-[5.5rem_minmax(0,1fr)_1rem]";

/** Row side padding on its own (inline empty states). */
export const ROW_INSET = "px-4 md:px-5";

/** Row controls: 40px touch targets on phones, 32px from md (every control in a row matches). */
export const ROW_CONTROL = "h-10 md:h-8";

/** RowLead's column form, from md (Now, Upcoming) or from a 28rem-wide list (Past). */
const LEAD_LAYOUT = {
  viewport: {
    lead: "md:col-span-1 md:flex-col md:items-start md:gap-1 md:self-start",
    caps: "md:pt-[3px]"
  },
  container: {
    lead: "@min-[28rem]:col-span-1 @min-[28rem]:flex-col @min-[28rem]:items-start @min-[28rem]:gap-1 @min-[28rem]:self-start",
    caps: "@min-[28rem]:pt-[3px]"
  }
} as const;

/**
 * The lead: a caps day label (or a status tag) and the mono start time. As a column (from md, or
 * with `layout="container"` once the list is 28rem wide) it's two lines; otherwise it's one line
 * across the row, with `phoneAside` (the "Opens 9:10 PM" time) at its right end, over the actions.
 */
export function RowLead({
  label,
  time,
  phoneAside,
  layout = "viewport"
}: {
  label: ReactNode;
  time?: string;
  phoneAside?: ReactNode;
  layout?: keyof typeof LEAD_LAYOUT;
}) {
  const caps = typeof label === "string";
  return (
    // As a column, top-aligned with the title line: a caps label sits 3px down to share its
    // baseline; a tag is as tall as the title line already.
    <div
      className={cn(
        "col-span-2 flex min-w-0 items-center gap-2",
        LEAD_LAYOUT[layout].lead,
        caps && LEAD_LAYOUT[layout].caps
      )}
    >
      {caps ? (
        <span className="max-w-full truncate text-[11px] font-medium uppercase leading-tight tracking-[0.11em] text-muted-foreground">
          {label}
        </span>
      ) : (
        label
      )}
      {time ? <span className="font-mono text-[13px] leading-tight tabular-nums text-[var(--ink-text)]">{time}</span> : null}
      {phoneAside ? <span className="ml-auto whitespace-nowrap text-xs text-muted-foreground md:hidden">{phoneAside}</span> : null}
    </div>
  );
}

/** Title (up to two lines), then a meta line with the access tag in the status zone beside it. */
export function RowTitle({
  meeting,
  meta,
  className
}: {
  meeting: Pick<MeetingSummary, "title" | "access" | "inviteeCount">;
  meta: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="line-clamp-2 break-words text-sm font-medium text-foreground" title={meeting.title}>
        {meeting.title}
      </p>
      <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span className="min-w-0 truncate">{meta}</span>
        <AccessTag meeting={meeting} size="sm" />
      </div>
    </div>
  );
}

/** "1 h · Sage": the creator only for one-off meetings (the series has no single creator). */
export function durationAndCreator(meeting: Pick<MeetingSummary, "createdByName" | "seriesKey">, duration: string) {
  return meeting.createdByName && !meeting.seriesKey ? `${duration} · ${meeting.createdByName}` : duration;
}
