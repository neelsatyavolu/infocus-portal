import type { ReactNode } from "react";
import { cn } from "@/src/lib/utils";

/*
 * The page body. One column (strip, stage dates, winners) until the page's box is 86rem wide
 * (the Calendar hub is a wide route, so this is a 1680px+ screen). From there the stage dates keep
 * the main column and the strip and winners move to a 20rem rail on the right, so the stage
 * columns stay readable and the side space holds the secondary content. The main column is then
 * at least 64rem, the editor table's width, so it never scrolls there. With nothing for the rail,
 * it stays one column. Placement is by grid lines, so the reading order stays strip, dates, winners.
 */
const WIDE = {
  grid: "@min-[86rem]/cycles:grid-cols-[minmax(0,1fr)_20rem]",
  bothRows: "@min-[86rem]/cycles:grid-rows-[auto_1fr]",
  dates: "@min-[86rem]/cycles:col-start-1 @min-[86rem]/cycles:row-start-1",
  datesBothRows: "@min-[86rem]/cycles:col-start-1 @min-[86rem]/cycles:row-[1/span_2]",
  railTop: "@min-[86rem]/cycles:col-start-2 @min-[86rem]/cycles:row-start-1",
  railSecond: "@min-[86rem]/cycles:col-start-2 @min-[86rem]/cycles:row-start-2"
} as const;

export function CycleDatesColumns({ strip, dates, winners }: { strip: ReactNode; dates: ReactNode; winners: ReactNode }) {
  const both = Boolean(strip) && Boolean(winners);
  const rail = Boolean(strip) || Boolean(winners);
  return (
    <div className="@container/cycles">
      <div className={cn("grid min-w-0 items-start gap-5", rail && WIDE.grid, both && WIDE.bothRows)}>
        {strip ? <div className={cn("min-w-0", WIDE.railTop)}>{strip}</div> : null}
        <div className={cn("min-w-0", rail && (both ? WIDE.datesBothRows : WIDE.dates))}>{dates}</div>
        {winners ? <div className={cn("min-w-0", strip ? WIDE.railSecond : WIDE.railTop)}>{winners}</div> : null}
      </div>
    </div>
  );
}
