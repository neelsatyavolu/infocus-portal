import { countWords } from "@/src/lib/applications/answers";
import { cn } from "@/src/lib/utils";

/** "112 / 150" under an answer: Danger over the limit, a soft nudge under `softMin`. */
export function WordCount({ value, max, softMin = 0, id }: { value: string; max: number; softMin?: number; id?: string }) {
  const words = countWords(value);
  const over = words > max;
  const short = words > 0 && words < softMin;
  return (
    <p id={id} aria-live="polite" className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-muted-foreground">
      <span>{over ? `${words - max} over the limit` : short ? `A bit short. Most strong answers use at least ${softMin} words.` : " "}</span>
      <span className={cn("font-mono tabular-nums", over ? "font-medium text-danger" : short ? "text-[var(--brand-amber)]" : undefined)}>
        {words} / {max}
      </span>
    </p>
  );
}
