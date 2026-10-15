import type { ReactNode } from "react";
import { cn } from "@/src/lib/utils";

/**
 * The page nameplate (DESIGN.md §10): a square Ink 2 plate with the green strip, an eyebrow,
 * the title, one line of context, and at most one primary action on the right.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("brand-hero-panel flex flex-wrap items-end gap-4 px-5 py-5 md:px-6", className)}>
      <div className="min-w-0 flex-[1_1_320px]">
        {eyebrow ? <div className="eyebrow flex items-center gap-2">{eyebrow}</div> : null}
        <h1 className="display-md mt-1.5 text-foreground">{title}</h1>
        {description ? <p className="mt-1.5 text-sm text-[var(--ink-text)]">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </section>
  );
}
