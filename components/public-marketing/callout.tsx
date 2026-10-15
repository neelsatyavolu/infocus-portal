import type { ReactNode } from "react";
import { renderIcon, type KitIcon } from "@/components/kit/icon";
import { ANCHOR_OFFSET } from "@/components/public-marketing/shared";
import { cn } from "@/src/lib/utils";

const TONE = {
  info: { box: "border-[var(--brand-green)]/30 bg-[var(--brand-green)]/[0.06]", icon: "text-[var(--brand-green)]" },
  neutral: { box: "border-border bg-card", icon: "text-muted-foreground" }
} as const;

/**
 * A titled static note box (DESIGN.md §10 alert recipe: tint, a 1px line in the same hue, an
 * icon and plain words). Unlike the kit Alert it is not a live region, and its title is a real
 * H2 with an id, so it stays in the page outline and can be an anchor target. The box spans its
 * column (edges line up with the cards above); the words stop at a reading width.
 */
export function Callout({
  id,
  title,
  icon,
  tone = "info",
  className,
  children
}: {
  id: string;
  title: string;
  icon: KitIcon | ReactNode;
  tone?: keyof typeof TONE;
  className?: string;
  children: ReactNode;
}) {
  const style = TONE[tone];
  const titleId = `${id}-title`;

  return (
    <section
      id={id}
      aria-labelledby={titleId}
      className={cn("rounded-md border px-4 py-4 md:px-5", style.box, ANCHOR_OFFSET, className)}
    >
      <div className="flex items-start gap-3">
        <span className={cn("mt-0.5 flex shrink-0 [&>svg]:size-4", style.icon)}>{renderIcon(icon, "h-4 w-4")}</span>
        <div className="min-w-0 max-w-[65ch] space-y-1.5">
          <h2 id={titleId} className="text-base font-semibold leading-snug text-foreground">
            {title}
          </h2>
          <div className="text-sm leading-relaxed text-[var(--ink-text)]">{children}</div>
        </div>
      </div>
    </section>
  );
}
