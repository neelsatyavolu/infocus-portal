"use client";

import type { ReactNode } from "react";
import { Skeleton } from "@/components/kit/skeleton";
import { ENTRY_CONTROL, ENTRY_PAD_X } from "@/components/public-entry/entry-panel";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/src/lib/utils";

export type ChannelKey = "email" | "browser";
export type CategoryKey = "announcements" | "comments" | "grades";

const CATEGORIES: readonly CategoryKey[] = ["announcements", "comments", "grades"];
const channelLabels: Record<ChannelKey, string> = { email: "Email", browser: "Browser" };
const categoryLabels: Record<CategoryKey, string> = {
  announcements: "Announcements",
  comments: "Comments",
  grades: "Grades"
};

const LABEL_CLASS = "text-[11px] font-medium uppercase leading-tight tracking-[0.11em] text-muted-foreground";
const CARD_CLASS =
  "flex min-w-0 flex-col overflow-hidden rounded-md border border-border bg-card @xl:row-span-3 @xl:grid @xl:grid-rows-subgrid @xl:gap-y-0";
// No vertical padding: the title's label fills the 56px row, so the whole header is a touch target.
const HEADER_CLASS = cn(ENTRY_PAD_X, "flex min-h-14 items-center justify-between gap-3 border-b border-border");
/** A 44px-tall hit area around the 20px master switch (DESIGN.md §10 touch targets). */
const SWITCH_HIT_AREA = "relative after:absolute after:-inset-x-2 after:-inset-y-3";

/**
 * The Email and Browser cards, laid out like Settings → Notifications (one card per channel: the
 * master switch in the header, where it goes, then a Send me list). Side by side once the column
 * is 36rem wide, sharing three rows through subgrid so the switches and lists line up.
 */
export function ChannelGrid({ children }: { children: ReactNode }) {
  return (
    <div className="@container">
      <div className="grid gap-4 @xl:grid-cols-2 @xl:gap-y-0">{children}</div>
    </div>
  );
}

/** One channel's Announcements / Comments / Grades. Each row is a 44px label for its switch. */
function SendMeList({
  channel,
  enabled,
  isOn,
  onChange
}: {
  channel: ChannelKey;
  enabled: boolean;
  isOn: (category: CategoryKey) => boolean;
  onChange: (category: CategoryKey, checked: boolean) => void;
}) {
  const word = channelLabels[channel];
  const labelId = `onboarding-${channel}-send-me`;

  return (
    <div role="group" aria-labelledby={labelId}>
      <p id={labelId} className={LABEL_CLASS}>
        Send me
      </p>
      {!enabled ? (
        <p className="mt-1.5 text-[13px] leading-snug text-muted-foreground">{word} is off. Turn it on to choose what it sends.</p>
      ) : null}
      <ul className="mt-1 divide-y divide-border">
        {CATEGORIES.map((category) => {
          const id = `onboarding-${channel}-${category}`;
          return (
            <li key={category} className="flex min-h-11 items-center justify-between gap-4">
              <label
                htmlFor={id}
                className={cn(
                  "min-w-0 flex-1 py-2.5 text-sm",
                  enabled ? "cursor-pointer text-foreground" : "cursor-not-allowed text-muted-foreground"
                )}
              >
                {categoryLabels[category]}
              </label>
              <Switch
                id={id}
                checked={isOn(category)}
                onCheckedChange={(checked) => onChange(category, checked)}
                aria-label={`${word} ${categoryLabels[category]}`}
                disabled={!enabled}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** One channel: its title labels the master switch (tap anywhere in the header), then `children`, then Send me. */
export function ChannelCard({
  channel,
  enabled,
  onEnabledChange,
  isOn,
  onCategoryChange,
  children
}: {
  channel: ChannelKey;
  enabled: boolean;
  onEnabledChange: (checked: boolean) => void;
  isOn: (category: CategoryKey) => boolean;
  onCategoryChange: (category: CategoryKey, checked: boolean) => void;
  children: ReactNode;
}) {
  const word = channelLabels[channel];
  const switchId = `onboarding-${channel}`;
  const titleId = `${switchId}-title`;

  return (
    <section aria-labelledby={titleId} className={CARD_CLASS}>
      <div className={HEADER_CLASS}>
        <h3
          id={titleId}
          className="flex min-w-0 flex-1 self-stretch text-base font-semibold leading-snug tracking-[-0.01em] text-foreground"
        >
          <label htmlFor={switchId} className="flex min-h-14 flex-1 cursor-pointer items-center">
            {word}
          </label>
        </h3>
        <Switch
          id={switchId}
          checked={enabled}
          onCheckedChange={onEnabledChange}
          aria-label={`${word} notifications`}
          className={SWITCH_HIT_AREA}
        />
      </div>
      <div className={cn(ENTRY_PAD_X, "min-w-0 pt-4")}>{children}</div>
      <div className={cn(ENTRY_PAD_X, "min-w-0 py-4")}>
        <SendMeList channel={channel} enabled={enabled} isOn={isOn} onChange={onCategoryChange} />
      </div>
    </section>
  );
}

/** A placeholder card with the same three rows, so the loaded cards don't shift. */
export function ChannelCardSkeleton() {
  return (
    <div aria-hidden className={CARD_CLASS}>
      <div className={HEADER_CLASS}>
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-5 w-9 rounded-full" />
      </div>
      <div className={cn(ENTRY_PAD_X, "space-y-2 pt-4")}>
        <Skeleton className="h-3.5 w-16" />
        <Skeleton className={cn(ENTRY_CONTROL, "w-full rounded-md")} />
        <Skeleton className="h-3 w-2/3" />
      </div>
      <div className={cn(ENTRY_PAD_X, "space-y-1 py-4")}>
        <Skeleton className="h-3 w-14" />
        {CATEGORIES.map((category) => (
          <div key={category} className="flex min-h-11 items-center justify-between gap-4">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-5 w-9 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
