import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { ActionBar } from "@/components/kit/action-bar";
import { cn } from "@/src/lib/utils";

/**
 * Heading row for a section that is not wrapped in a Panel ("Needs you", "Your groups", a card
 * grid's title): H2 or H3, a mono count, status tags, one muted line, h-8 actions on the right.
 * Pass `collapsible` to make the title a disclosure button (the caller owns the open state).
 */
export function SectionHeader({
  title,
  as: Title = "h2",
  id,
  eyebrow,
  count,
  status,
  description,
  actions,
  collapsible,
  className
}: {
  title: ReactNode;
  as?: "h2" | "h3";
  /** Id of the heading, for aria-labelledby on the section. */
  id?: string;
  eyebrow?: ReactNode;
  count?: number | null;
  status?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  collapsible?: { open: boolean; onToggle: () => void; controlsId: string };
  className?: string;
}) {
  const titleClass = cn(
    "min-w-0 font-semibold tracking-[-0.01em] text-foreground",
    Title === "h2" ? "text-lg leading-snug" : "text-base leading-snug"
  );
  const heading = collapsible ? (
    <Title id={id} className={titleClass}>
      <button
        type="button"
        aria-expanded={collapsible.open}
        aria-controls={collapsible.controlsId}
        onClick={collapsible.onToggle}
        className="-ml-1 inline-flex items-center gap-1.5 rounded-sm px-1 text-left hover:text-foreground"
      >
        <ChevronDown
          aria-hidden
          className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", !collapsible.open && "-rotate-90")}
        />
        {title}
      </button>
    </Title>
  ) : (
    <Title id={id} className={titleClass}>
      {title}
    </Title>
  );

  return (
    <div className={cn("flex min-w-0 flex-wrap items-end justify-between gap-x-4 gap-y-2", className)}>
      <div className="min-w-0 flex-1">
        {eyebrow ? <div className="eyebrow mb-1">{eyebrow}</div> : null}
        <div className="flex min-h-8 min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          {heading}
          {count != null ? (
            <span className="font-mono-broadcast text-[13px] tabular-nums text-muted-foreground">{count}</span>
          ) : null}
          {status}
        </div>
        {description ? <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? (
        <ActionBar size="sm" className="shrink-0">
          {actions}
        </ActionBar>
      ) : null}
    </div>
  );
}

/**
 * An 11px caps label for a group of fields, tiles or list rows, with an optional right-aligned
 * end slot (a mono counter, a tag) and an optional hairline running to it. One baseline.
 * Also the list group label ("TODAY", "MATERIALS … 3 of 4 in").
 */
export function SectionLabel({
  children,
  end,
  count,
  rule = false,
  as: Tag = "div",
  htmlFor,
  id,
  className
}: {
  children: ReactNode;
  end?: ReactNode;
  /** Mono count after the label. */
  count?: number | null;
  /** Draw a hairline between the label and the end slot. */
  rule?: boolean;
  /** `legend` makes the whole row the fieldset's <legend> (put it first in the <fieldset>). */
  as?: "div" | "h2" | "h3" | "h4" | "label" | "legend";
  /** Turns the label into a <label> for a field. */
  htmlFor?: string;
  id?: string;
  className?: string;
}) {
  const legend = Tag === "legend" && !htmlFor;
  // A <legend> must be the fieldset's first child to name it, so it becomes the row itself.
  const Row = legend ? "legend" : "div";
  const Label = htmlFor ? "label" : legend ? "span" : Tag;
  return (
    <Row className={cn("flex min-h-6 min-w-0 items-center gap-2", legend && "w-full", className)}>
      <Label
        id={id}
        htmlFor={htmlFor}
        className="shrink-0 text-[11px] font-medium uppercase leading-tight tracking-[0.11em] text-muted-foreground"
      >
        {children}
      </Label>
      {count != null ? (
        <span className="font-mono-broadcast text-[11px] tabular-nums text-muted-foreground">{count}</span>
      ) : null}
      {rule ? <span aria-hidden className="h-px min-w-4 flex-1 bg-border" /> : <span className="flex-1" />}
      {end ? <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">{end}</span> : null}
    </Row>
  );
}
