import type { ReactNode } from "react";
import { Skeleton } from "@/components/kit/skeleton";
import { StatusTag } from "@/components/kit/status-tag";
import type { SettingsNavStatus } from "@/components/settings-layout";
import { cn } from "@/src/lib/utils";

/**
 * The pair of notification channel cards. From a 42rem content column they sit side by side and
 * share four rows through subgrid (header, body, Send me, footer), so the switches, the Send me
 * lists and the footers line up across both cards.
 */
export function ChannelGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 @2xl:grid-cols-2 @2xl:gap-y-0">{children}</div>;
}

/** A header switch is 20×36px; this grows its touch area to 44×60px inside the 56px header row. */
export const HEADER_SWITCH_CLASS = "relative after:absolute after:-inset-3";

const CARD_CLASS =
  "flex min-w-0 flex-col overflow-hidden rounded-md border border-border bg-card @2xl:row-span-4 @2xl:grid @2xl:grid-rows-subgrid @2xl:gap-y-0";
const HEADER_CLASS = "flex min-h-14 items-center justify-between gap-3 border-b border-border px-4 py-3 md:px-5";
const FOOTER_CLASS =
  "mt-auto flex min-h-14 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border px-4 py-2.5 md:px-5";

/**
 * One channel (Email, Browser, {Mac|iPhone} app): title, an exception tag and the master switch
 * (or the app's Turn on); then where it goes; then what it sends; then a footer with its test and
 * setup buttons (all h-9).
 */
export function ChannelCard({
  id,
  title,
  tag,
  control,
  controlId,
  children,
  sendMe,
  footerStart,
  footerActions
}: {
  id: string;
  title: string;
  /** Only for exceptions the switch doesn't already show (Blocked, Not set up…). */
  tag?: SettingsNavStatus | null;
  control?: ReactNode;
  /** The header switch's id: the title becomes its clickable label, like every other switch row. */
  controlId?: string;
  children: ReactNode;
  sendMe: ReactNode;
  footerStart?: ReactNode;
  footerActions?: ReactNode;
}) {
  const titleId = `${id}-title`;
  return (
    <section id={id} aria-labelledby={titleId} className={CARD_CLASS}>
      <div className={HEADER_CLASS}>
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <h3 id={titleId} className="text-base font-semibold leading-snug tracking-[-0.01em] text-foreground">
            {controlId ? (
              <label htmlFor={controlId} className="cursor-pointer">
                {title}
              </label>
            ) : (
              title
            )}
          </h3>
          {tag ? <StatusTag tone={tag.tone}>{tag.label}</StatusTag> : null}
        </div>
        {control ? <div className="flex shrink-0 items-center">{control}</div> : null}
      </div>
      <div className="min-w-0 px-4 pt-4 md:px-5">{children}</div>
      <div className="min-w-0 px-4 pb-4 pt-4 md:px-5">{sendMe}</div>
      <div className={FOOTER_CLASS}>
        <div className="min-w-0 flex-1 text-[13px] leading-snug text-muted-foreground">{footerStart}</div>
        {footerActions ? (
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2 text-foreground">{footerActions}</div>
        ) : null}
      </div>
    </section>
  );
}

/**
 * The SEND ME caption over a card's three category rows. `note` ("when Email is on") stays on the
 * same line and truncates rather than wraps, so a card whose channel is off keeps its rows level
 * with the other card.
 */
export function SendMeLabel({ id, note }: { id: string; note?: string | null }) {
  return (
    <p
      id={id}
      className="flex min-w-0 gap-1.5 text-[11px] font-medium uppercase leading-tight tracking-[0.11em] text-muted-foreground"
    >
      <span className="shrink-0">Send me</span>
      {note ? <span className="min-w-0 truncate">· {note}</span> : null}
    </p>
  );
}

/**
 * Placeholder card with the same rows, so no default switch values flash before the GET returns.
 * `still` stops the pulse after a failed first load: nothing is loading until Try again.
 */
export function ChannelCardSkeleton({ still = false }: { still?: boolean }) {
  const block = (className: string) => <Skeleton className={cn(className, still && "motion-safe:animate-none")} />;
  return (
    <div aria-hidden className={CARD_CLASS}>
      <div className={HEADER_CLASS}>
        {block("h-4 w-24")}
        {block("h-5 w-9 rounded-full")}
      </div>
      <div className="space-y-2 px-4 pt-4 md:px-5">
        {block("h-3.5 w-16")}
        {block("h-9 w-full rounded-md")}
        {block("h-3 w-2/3")}
      </div>
      <div className="space-y-1 px-4 pb-4 pt-4 md:px-5">
        {block("h-3 w-14")}
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="flex min-h-11 items-center justify-between gap-4">
            {block("h-3.5 w-28")}
            {block("h-5 w-9 rounded-full")}
          </div>
        ))}
      </div>
      <div className={FOOTER_CLASS}>
        {block("h-3 w-40")}
        {block("h-9 w-24 rounded-md")}
      </div>
    </div>
  );
}
