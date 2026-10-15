import { cn } from "@/src/lib/utils";

/**
 * One grid for every category, so card edges line up from section to section: 1 column, 2 from
 * @2xl, and 3 from @6xl (as 6 tracks, so a short last row can split into halves).
 * Container queries, so it follows the real column width with the sidebar open or folded.
 */
export const IDEA_GRID = "grid grid-cols-1 gap-4 @2xl:grid-cols-2 @6xl:grid-cols-6";

/** When a card is alone in its row and lays its text out in two columns. */
export type IdeaCardWide = "never" | "two-across" | "always";

/**
 * Where card `index` of `count` sits so every row is full and no card is left alone:
 * - 2 across: an odd count's last card spans the row ("two-across" wide).
 * - 3 across: cards take 2 of the 6 tracks. A last row of two splits in halves; a leftover single
 *   card instead ends the section with two rows of halves (4 → 2 + 2, 7 → 3 + 2 + 2). Only a
 *   section with one idea spans the row there ("always" wide).
 */
export function ideaCardLayout(index: number, count: number): { className: string; wide: IdeaCardWide } {
  const aloneAtTwo = count % 2 === 1 && index === count - 1;
  const rest = count % 3;
  const halves = rest === 2 ? 2 : rest === 1 && count >= 4 ? 4 : 0;
  const atThree = count === 1 ? "@6xl:col-span-6" : index >= count - halves ? "@6xl:col-span-3" : "@6xl:col-span-2";
  return {
    className: cn(aloneAtTwo && "@2xl:col-span-2", atThree),
    wide: count === 1 ? "always" : aloneAtTwo ? "two-across" : "never"
  };
}
