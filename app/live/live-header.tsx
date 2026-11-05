import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeftRight, ChevronDown, ChevronLeft } from "lucide-react";
import { Skeleton } from "@/components/kit/skeleton";
import { BrandWordmark } from "@/components/brand-wordmark";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/src/lib/utils";
import type { LiveEventSummary } from "@/src/server/live-graphics";
import { eventContext, formatEventOption } from "./live-status";

/**
 * "Switch livestream": looks like an outline button, but it is the native <select id="live-event">
 * laid over it, so phones keep their own picker. It never repeats the event (the title does).
 */
function SwitchLivestream({
  eventId,
  events,
  pastEvents,
  onChange
}: {
  eventId: string | null;
  events: LiveEventSummary[] | null;
  pastEvents: LiveEventSummary[];
  onChange: (eventId: string | null) => void;
}) {
  const disabled = events === null || (events.length === 0 && pastEvents.length === 0);
  return (
    <div
      className={cn(
        buttonVariants({ variant: "outline" }),
        "relative h-11 px-3 focus-within:ring-2 focus-within:ring-ring md:h-9",
        disabled && "pointer-events-none opacity-50"
      )}
    >
      <ArrowLeftRight aria-hidden />
      <span className="sm:hidden">Switch</span>
      <span className="hidden sm:inline">Switch livestream</span>
      <ChevronDown aria-hidden className="opacity-60" />
      <select
        id="live-event"
        aria-label="Switch livestream"
        value={eventId ?? ""}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value || null)}
        className="absolute inset-0 h-full w-full cursor-pointer appearance-none rounded-md text-base opacity-0 disabled:cursor-not-allowed [&>optgroup]:bg-popover [&>option]:bg-popover [&>option]:text-popover-foreground"
      >
        {events === null ? <option value="">Loading…</option> : null}
        {events?.length === 0 ? <option value="">No upcoming livestreams</option> : null}
        {events?.map((event) => (
          <option key={event.id} value={event.id}>
            {formatEventOption(event)}
          </option>
        ))}
        {pastEvents.length ? (
          <optgroup label="Past livestreams">
            {pastEvents.map((event) => (
              <option key={event.id} value={event.id}>
                {formatEventOption(event)}
              </option>
            ))}
          </optgroup>
        ) : null}
      </select>
    </div>
  );
}

/**
 * The /live nameplate: a square Ink 2 plate with the green strip, like every Portal page header,
 * compact so the scoring surface fits on a laptop screen. Wordmark | eyebrow + status tags,
 * the event as the title, when and where | Switch livestream and Back.
 * Phones: wordmark and the two actions on one row, then the event.
 */
export function LiveHeader({
  event,
  loading,
  status,
  signedIn,
  eventId,
  events,
  pastEvents,
  onEventChange
}: {
  event: LiveEventSummary | null;
  loading: boolean;
  status?: ReactNode;
  signedIn: boolean;
  eventId: string | null;
  events: LiveEventSummary[] | null;
  pastEvents: LiveEventSummary[];
  onEventChange: (eventId: string | null) => void;
}) {
  const context = event ? eventContext(event) : "";
  return (
    <header className="brand-hero-panel grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-4 py-3 [grid-template-areas:'logo_actions'_'id_id'] md:grid-cols-[auto_minmax(0,1fr)_auto] md:gap-x-5 md:px-6 md:[grid-template-areas:'logo_id_actions']">
      <div className="flex items-center [grid-area:logo] md:self-stretch md:border-r md:border-border md:pr-5">
        <BrandWordmark className="h-5 w-auto shrink-0 object-contain md:h-7" priority />
      </div>

      <div className="min-w-0 [grid-area:id]">
        <div className="flex min-h-5 flex-wrap items-center gap-x-3 gap-y-1">
          <p className="eyebrow">Livestream dashboard</p>
          {status ? <div className="flex flex-wrap items-center gap-1.5">{status}</div> : null}
        </div>
        {loading ? (
          <>
            <h1 className="sr-only">Livestream dashboard</h1>
            <Skeleton className="mt-1.5 h-6 w-64 max-w-full" />
          </>
        ) : (
          <h1 className="display-sm mt-1 min-w-0 truncate text-foreground">{event?.title || "No livestream selected"}</h1>
        )}
        {context ? <p className="mt-1 min-w-0 truncate text-sm text-[var(--ink-text)]">{context}</p> : null}
      </div>

      <div className="flex items-center gap-2 justify-self-end [grid-area:actions]">
        <SwitchLivestream eventId={eventId} events={events} pastEvents={pastEvents} onChange={onEventChange} />
        {signedIn ? (
          <Link
            href="/livestreams"
            aria-label="Back to Livestreams"
            className={cn(buttonVariants({ variant: "ghost" }), "h-11 w-11 px-0 md:h-9 md:w-auto md:px-3")}
          >
            <ChevronLeft aria-hidden />
            <span className="hidden md:inline">Back to Livestreams</span>
          </Link>
        ) : null}
      </div>
    </header>
  );
}
