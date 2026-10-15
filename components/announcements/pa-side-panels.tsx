import { ExternalLink } from "@/components/announcements/external-link";
import { InlineNote } from "@/components/kit/alert";
import { KeyValueList } from "@/components/kit/key-value";
import { Panel } from "@/components/kit/panel";
import { cn } from "@/src/lib/utils";

const ANNOUNCER_SLOTS = [0, 1] as const;

/** Who reads this PA, from the Master Calendar: the rail beside the editor (xl and up only). */
export function OnTheMicPanel({ announcers, className }: { announcers: string[]; className?: string }) {
  return (
    <Panel id="pa-mic" title="On the mic" titleAs="h2" description="Assigned in the Master Calendar." className={className}>
      <KeyValueList
        dense
        labelWidth="7rem"
        items={ANNOUNCER_SLOTS.map((index) => ({
          key: `announcer-${index}`,
          label: `Announcer ${index + 1}`,
          value: announcers[index] || <span className="text-muted-foreground">Not assigned yet</span>
        }))}
      />
      {/* A new tab, so unsaved script edits stay open here. */}
      <ExternalLink variant="link" href="/master-calendar" className="mt-2">
        Master Calendar
      </ExternalLink>
    </Panel>
  );
}

const AUTOFILL_TEXT =
  "Untouched scripts auto-fill with announcements for the PA date, formatted with Gemini. Review the wording before reading. Saved edits are preserved.";

/** Where the script's announcements come from: the rail's second panel (xl and up only). */
export function AnnouncementsToReadPanel({ className }: { className?: string }) {
  return (
    <Panel id="pa-sources" title="Announcements to read" titleAs="h2" className={className}>
      <p className="text-[13px] leading-snug text-muted-foreground">{AUTOFILL_TEXT}</p>
      {/* A new tab, so unsaved script edits stay open here. */}
      <ExternalLink variant="link" href="/announcements/submitted" className="mt-2">
        Open Submitted
      </ExternalLink>
    </Panel>
  );
}

/** The same words as a quiet note under the editor below xl, where there is no rail. */
export function AnnouncementsToReadNote({ className }: { className?: string }) {
  return (
    <InlineNote className={className}>
      {AUTOFILL_TEXT}{" "}
      {/* A new tab, so unsaved script edits stay open here. */}
      <ExternalLink href="/announcements/submitted">Open Submitted</ExternalLink>
    </InlineNote>
  );
}

/**
 * The same two names as one line for the page header below xl, where there is no rail, ending with
 * the Master Calendar link (a new tab, so unsaved edits stay open).
 */
export function OnTheMicLine({ announcers, className }: { announcers: string[]; className?: string }) {
  return (
    <p className={cn("min-w-0", className)}>
      On the mic:{" "}
      {ANNOUNCER_SLOTS.map((index) => (
        <span key={index}>
          {index > 0 ? (
            <>
              <span aria-hidden className="px-1.5 text-muted-foreground">·</span>
              <span className="sr-only">and </span>
            </>
          ) : null}
          {announcers[index] ? (
            <span className="font-medium text-foreground">{announcers[index]}</span>
          ) : (
            <span className="text-muted-foreground">Announcer {index + 1} not assigned yet</span>
          )}
        </span>
      ))}
      <span aria-hidden className="px-1.5 text-muted-foreground">·</span>
      <ExternalLink href="/master-calendar">Master Calendar</ExternalLink>
    </p>
  );
}
