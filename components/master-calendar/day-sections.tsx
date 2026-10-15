import type { ReactNode } from "react";
import { EmptyState } from "@/components/kit/empty-state";
import { SectionLabel } from "@/components/kit/section";
import {
  CREW_LABELS,
  NOTES_TEXT_STYLES,
  SCENIC_IMAGE_ALT,
  queueLabel,
  type DayModel
} from "@/components/master-calendar/calendar-model";
import { scenicImageForDate } from "@/src/lib/master-calendar-cells";
import { cn } from "@/src/lib/utils";

/** One Day panel section: an h-8 caps label row (one action or tag on the right) and its body. */
export function DaySection({
  label,
  labelId,
  count,
  end,
  children,
  className
}: {
  label: string;
  /** Id for the heading, so a group of fields can be named by it. */
  labelId?: string;
  count?: number | null;
  end?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-2", className)}>
      <SectionLabel as="h3" id={labelId} count={count} end={end} className="min-h-8">
        {label}
      </SectionLabel>
      {children}
    </section>
  );
}

function NamesText({ names, empty = "Not set" }: { names: string[]; empty?: string }) {
  const text = names.filter(Boolean).join(" & ");
  return <p className={cn("text-sm", text ? "text-foreground" : "text-muted-foreground")}>{text || empty}</p>;
}

export function QueueSection({ day }: { day: DayModel }) {
  return (
    <DaySection label="Queue" count={day.queue.length > 0 ? day.queue.length : null}>
      {day.queue.length > 0 ? (
        <ul className="divide-y divide-border rounded-md border border-border">
          {day.queue.map((row) => (
            <li key={row.id} className="flex min-h-9 items-center px-3 text-sm text-foreground">
              <span className="truncate">{queueLabel(row)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">None yet</p>
      )}
    </DaySection>
  );
}

export function SpiritThemeLine({ theme }: { theme: string }) {
  return <p className="text-sm font-medium text-[var(--brand-green)]">{theme}</p>;
}

export function ScenicPreview({ day }: { day: DayModel }) {
  if (day.imageHidden) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a remote royalty-free image (also used in the Google Doc)
    <img
      src={scenicImageForDate(day.dateKey)}
      alt={SCENIC_IMAGE_ALT}
      loading="lazy"
      className="h-28 w-full rounded-sm border border-border object-cover"
    />
  );
}

function NotesText({ html }: { html: string }) {
  return <div className={NOTES_TEXT_STYLES} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Everything a viewer sees for the selected day; a day with nothing to show says so in one line. */
export function DayReadSections({ day }: { day: DayModel }) {
  const isClassDay = day.kind === "NONE";
  const hasNotes = (isClassDay || day.kind === "HOLIDAY") && Boolean(day.displayHtml);
  const hasSections = day.kind === "SHOW" || day.kind === "PA" || Boolean(day.spirit) || (isClassDay && !day.imageHidden) || hasNotes;
  if (!hasSections) {
    return (
      <EmptyState
        size="inline"
        title={day.kind === "HOLIDAY" ? day.label || "No school" : "Nothing scheduled"}
        description={day.kind === "HOLIDAY" ? "No class, show or PA." : "A class day with no notes."}
        className="px-0 py-0"
      />
    );
  }
  return (
    <>
      {day.kind === "SHOW" ? (
        <>
          <DaySection label="Anchors">
            <NamesText names={day.anchors} />
          </DaySection>
          <DaySection label="Show manager">
            <NamesText names={day.manager?.name ? [day.manager.name] : []} />
          </DaySection>
          <QueueSection day={day} />
        </>
      ) : null}

      {day.kind === "PA" ? (
        <DaySection label="PA announcers">
          <NamesText names={day.paNames} />
        </DaySection>
      ) : null}

      {day.spirit ? (
        <DaySection label="Spirit Week">
          <div className="space-y-3">
            <SpiritThemeLine theme={day.spirit.theme} />
            {day.spirit.unsorted.length > 0 ? (
              <div className="space-y-1">
                <SectionLabel as="h4">{CREW_LABELS.Filmers.label}</SectionLabel>
                <NamesList names={day.spirit.unsorted} />
              </div>
            ) : null}
            {day.spirit.lists.map((list) => (
              <div key={list.role} className="space-y-1">
                <SectionLabel as="h4">{CREW_LABELS[list.role].label}</SectionLabel>
                <NamesList names={list.names} />
              </div>
            ))}
          </div>
        </DaySection>
      ) : null}

      {isClassDay && !day.imageHidden ? (
        <DaySection label="Scenic image">
          <ScenicPreview day={day} />
        </DaySection>
      ) : null}

      {hasNotes ? (
        <DaySection label="Notes">
          <NotesText html={day.displayHtml} />
        </DaySection>
      ) : null}
    </>
  );
}

/** A read-only name chip (crew lists). */
export const NAME_CHIP_CLASS = "inline-flex h-8 items-center rounded-sm bg-[var(--ink-3)] px-2.5 text-[13px] text-foreground";

function NamesList({ names }: { names: string[] }) {
  if (names.length === 0) return <p className="text-sm text-muted-foreground">Not set</p>;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {names.map((name) => (
        <li key={name} className={NAME_CHIP_CLASS}>
          {name}
        </li>
      ))}
    </ul>
  );
}
