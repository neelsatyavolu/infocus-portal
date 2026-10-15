"use client";

import { memo } from "react";
import { CalendarDays } from "lucide-react";
import { KeyValueList } from "@/components/kit/key-value";
import { Panel } from "@/components/kit/panel";
import { Skeleton } from "@/components/kit/skeleton";
import { StatusTag } from "@/components/kit/status-tag";
import { Button } from "@/components/ui/button";
import { cn } from "@/src/lib/utils";
import { producersMeetingUrl } from "@/src/lib/meetings/links";
import { formatDuration, pacificTimeLabel } from "@/src/lib/meetings/client/time";
import { PRODUCER_SERIES } from "@/src/lib/meetings/schedule";
import type { MeetingSummary } from "@/src/lib/meetings/types";
import { CopyLinkButton } from "./copy-link-button";
import { shortDateLabel, wallTimeLabel, weekdayListLabel } from "./day-label";
import { ROW_CONTROL } from "./meeting-row-parts";

/** Narrow card: the two buttons share its width. Wide card (the strip): their natural width. */
const BUTTON_WIDTH = "flex-auto @min-[36rem]:flex-none";

const CADENCE = `${weekdayListLabel(PRODUCER_SERIES.weekdays)} · ${wallTimeLabel(PRODUCER_SERIES.hour, PRODUCER_SERIES.minute)} · ${formatDuration(PRODUCER_SERIES.durationMinutes)}`;

/**
 * The recurring InFocus Producer Meeting in one card: its cadence, an "On now" tag while one is
 * on (neutral, no red dot: the Join now row carries the one LIVE dot), when it meets next, its
 * stable link with Copy link, and the Calendar invites sheet (its Google Calendar guest list). Shown from the first paint, before the meetings list loads (or if it
 * fails), so the link and the invites are always in reach; only "Next" waits for the list.
 * The card is its own container: in the 22rem rail and on phones the two buttons sit under Next
 * and Link and share the card's width; once the card is 36rem wide (stacked under the main
 * column on laptops and tablets) it is one strip, Next and Link on the left and the buttons at
 * their natural width on the Link row's line at the right.
 */
export const ProducerSeriesCard = memo(function ProducerSeriesCard({
  live,
  next,
  loading,
  onOpenInvites
}: {
  live: boolean;
  /** The next scheduled series meeting; null when none is listed, undefined without a list. */
  next: Pick<MeetingSummary, "startsAt"> | null | undefined;
  /** The list is loading: "Next" shows a placeholder (without a list and not loading: "—"). */
  loading: boolean;
  onOpenInvites: () => void;
}) {
  const url = producersMeetingUrl();
  return (
    <Panel
      id="meetings-series"
      title={PRODUCER_SERIES.title}
      titleAs="h2"
      status={live ? <StatusTag tone="neutral">On now</StatusTag> : null}
      description={CADENCE}
      className="@container"
    >
      <div className="grid min-w-0 gap-3 @min-[36rem]:grid-cols-[minmax(0,1fr)_auto] @min-[36rem]:items-end @min-[36rem]:gap-x-6">
        <KeyValueList
          dense
          labelWidth="3.5rem"
          items={[
            {
              label: "Next",
              value: loading ? (
                <Skeleton className="h-3.5 w-32" />
              ) : next === undefined ? (
                "—"
              ) : next ? (
                `${shortDateLabel(next.startsAt)} · ${pacificTimeLabel(next.startsAt)}`
              ) : (
                "Not scheduled"
              )
            },
            {
              label: "Link",
              value: (
                <span className="block truncate font-mono text-[13px] tabular-nums text-[var(--ink-text)]" title={url}>
                  {url.replace(/^https?:\/\//, "")}
                </span>
              )
            }
          ]}
        />
        <div className="flex min-w-0 gap-2">
          <CopyLinkButton url={url} className={cn(BUTTON_WIDTH, ROW_CONTROL)} />
          <Button variant="outline" size="sm" onClick={onOpenInvites} className={cn(BUTTON_WIDTH, ROW_CONTROL)}>
            <CalendarDays aria-hidden />
            Calendar invites
          </Button>
        </div>
      </div>
    </Panel>
  );
});
