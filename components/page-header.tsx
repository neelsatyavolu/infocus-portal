import type { ReactNode } from "react";
import { ActionBar } from "@/components/kit/action-bar";
import { cn } from "@/src/lib/utils";

const TITLE_CLASS = {
  compact: "display-sm",
  default: "display-md",
  display: "display-lg"
} as const;

/**
 * The page nameplate (DESIGN.md §10): a square Ink 2 plate with the green strip, an eyebrow,
 * the title, one line of context, and at most one primary action on the right.
 *
 * - `status`: small StatusTags shown in the eyebrow row, next to the eyebrow. Status never goes
 *   in `actions` (rule 3).
 * - `actions`: controls only, held to one height (h-9). One primary (filled) button at most, last.
 *   Below sm the actions take the full width and share it.
 * - `size`: `compact` for tool pages that need the height (review player), `display` for landing
 *   heroes.
 */
export function PageHeader({
  eyebrow,
  status,
  title,
  description,
  actions,
  size = "default",
  className
}: {
  eyebrow?: ReactNode;
  /** StatusTags (stage, Read only, LIVE…), shown after the eyebrow. */
  status?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  size?: "compact" | "default" | "display";
  className?: string;
}) {
  return (
    <section
      className={cn(
        "brand-hero-panel flex flex-wrap items-end gap-x-6 gap-y-4 px-4 md:px-6",
        size === "compact" ? "py-4" : "py-5",
        className
      )}
    >
      <div className="min-w-0 flex-[1_1_320px]">
        {eyebrow || status ? (
          <div className="flex min-h-5 flex-wrap items-center gap-x-3 gap-y-1">
            {eyebrow ? <div className="eyebrow flex min-w-0 items-center gap-2">{eyebrow}</div> : null}
            {status ? <div className="flex flex-wrap items-center gap-1.5">{status}</div> : null}
          </div>
        ) : null}
        <h1 className={cn(TITLE_CLASS[size], "min-w-0 break-words text-foreground", (eyebrow || status) && "mt-1.5")}>{title}</h1>
        {description ? <div className="mt-1.5 max-w-3xl text-sm text-[var(--ink-text)]">{description}</div> : null}
      </div>
      {actions ? (
        <ActionBar fullWidthOnPhone className="sm:justify-end">
          {actions}
        </ActionBar>
      ) : null}
    </section>
  );
}
