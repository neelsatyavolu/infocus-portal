import type { ReactNode } from "react";
import { cn } from "@/src/lib/utils";

/**
 * Side-by-side grids, each a container query (not a viewport breakpoint), so they follow the
 * sidebar being open or closed. Below the threshold the rail stacks under the main column.
 * - board (the Meetings tab): a main column and a 22rem rail once the page's own column is at
 *   least 68rem wide, so the main column keeps room for row titles beside the fixed action slots.
 * - reading (meeting notes): no row action slots, so the rail joins from 50rem. The main column
 *   is the reading width (at most 46rem, so the summary fills its card) and the rail (at least
 *   18rem) takes the rest. Stacked but at least 36rem wide (tablets in portrait), the rail's
 *   cards sit side by side under the main column instead of as full-width strips.
 */
const GRID = {
  board: "@min-[68rem]:grid-cols-[minmax(0,1fr)_22rem]",
  reading: "@min-[50rem]:grid-cols-[minmax(0,46rem)_minmax(18rem,1fr)]"
} as const;
const RAIL = {
  board: "",
  reading: "@min-[36rem]:@max-[50rem]:grid @min-[36rem]:@max-[50rem]:grid-flow-col @min-[36rem]:@max-[50rem]:auto-cols-fr"
} as const;

/** The Meetings pages' layout. No max-width: the app shell owns the page width. */
export function BoardColumns({
  main,
  rail,
  variant = "board"
}: {
  main: ReactNode;
  rail: ReactNode;
  variant?: keyof typeof GRID;
}) {
  return (
    <div className="@container min-w-0">
      <div className={cn("grid min-w-0 items-start gap-5", GRID[variant])}>
        <div className="flex min-w-0 flex-col gap-5">{main}</div>
        <div className={cn("flex min-w-0 flex-col gap-5", RAIL[variant])}>{rail}</div>
      </div>
    </div>
  );
}

/** Board: shown only while the columns are stacked (the phone and tablet Upcoming | Past switch). */
export const STACKED_ONLY = "@min-[68rem]:hidden";
/** Hidden while the columns are stacked (the panel the switch isn't showing). */
export const HIDDEN_WHEN_STACKED = "@max-[68rem]:hidden";
/**
 * On a Panel: hides its header row while the columns are stacked, where the Upcoming | Past
 * switch above already names the list and its count. (The header is the Panel's first child;
 * its title still names the section for assistive tech through aria-labelledby.)
 */
export const HEADER_HIDDEN_WHEN_STACKED = "@max-[68rem]:[&>div:first-child]:hidden";
