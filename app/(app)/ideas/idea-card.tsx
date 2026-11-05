import { ArrowUpRight } from "lucide-react";
import { fieldLabelClass } from "@/components/kit/field";
import type { IdeaSuggestion } from "@/src/lib/ideas";
import { cn } from "@/src/lib/utils";
import type { IdeaCardWide } from "./idea-grid";

/**
 * A card alone in its row (see ideaCardLayout) fills the width with two columns: title and pitch
 * on the left, the Paly angle and sources on the right. Literal classes so Tailwind sees them;
 * "two-across" applies only while the grid is 2 across (@2xl up to @6xl).
 */
const WIDE: Record<Exclude<IdeaCardWide, "never">, { card: string; side: string }> = {
  always: {
    card: "@2xl:row-span-1 @2xl:grid-cols-2 @2xl:grid-rows-[auto_1fr] @2xl:gap-x-6",
    side: "@2xl:col-start-2 @2xl:row-[1/span_2] @2xl:flex @2xl:flex-col @2xl:gap-3"
  },
  "two-across": {
    card: "@2xl:@max-6xl:row-span-1 @2xl:@max-6xl:grid-cols-2 @2xl:@max-6xl:grid-rows-[auto_1fr] @2xl:@max-6xl:gap-x-6",
    side: "@2xl:@max-6xl:col-start-2 @2xl:@max-6xl:row-[1/span_2] @2xl:@max-6xl:flex @2xl:@max-6xl:flex-col @2xl:@max-6xl:gap-3"
  }
};

/**
 * One idea. The card is a 4-row subgrid of its section grid (title / pitch / Paly angle / sources),
 * so in a row of cards the pitches, the angle blocks and the "Based on" rules all start on one line.
 */
export function IdeaCard({ idea, wide = "never", className }: { idea: IdeaSuggestion; wide?: IdeaCardWide; className?: string }) {
  const layout = wide === "never" ? null : WIDE[wide];
  return (
    <article
      className={cn(
        "row-span-4 grid grid-rows-subgrid gap-y-3 rounded-md border border-border bg-card p-4 sm:p-5",
        layout?.card,
        className
      )}
    >
      <h3 className="text-balance text-lg font-semibold leading-snug tracking-tight text-foreground">{idea.title}</h3>
      <p className="max-w-[68ch] text-[15px] leading-relaxed text-[var(--ink-text)]">{idea.pitch}</p>
      {/* Not a box of its own in a normal card (its two blocks are rows of the subgrid). */}
      <div className={cn("contents", layout?.side)}>
        <div className="self-start border-l-2 border-[var(--brand-fill)] pl-3">
          <p className={cn(fieldLabelClass, "text-[var(--brand-green)]")}>Paly angle</p>
          <p className="mt-1 max-w-[68ch] text-sm leading-relaxed text-foreground">{idea.angle}</p>
        </div>
        <div className="border-t border-border pt-3">
          <p className={fieldLabelClass}>Based on</p>
          <ul className="mt-1">
            {idea.sources.map((source) => (
              <li key={source.url}>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex min-h-10 items-start gap-1.5 rounded-sm py-2.5 text-sm leading-snug text-[var(--ink-text)] hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-green)] md:min-h-8 md:py-1.5"
                >
                  <ArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--brand-green)]" aria-hidden />
                  <span className="min-w-0">
                    <span className="underline-offset-2 group-hover:underline">{source.title}</span>
                    <span className="text-muted-foreground"> · {source.outlet}</span>
                    <span className="sr-only"> (opens in a new tab)</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </article>
  );
}
