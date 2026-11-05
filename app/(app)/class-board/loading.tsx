import { LoadingRegion, Skeleton } from "@/components/kit/skeleton";
import { cn } from "@/src/lib/utils";
import { BOARD_SCALE, PLATE_GRID, PLATE_MARK } from "./board-scale";

const LANE_ROWS = 8;
/** One line of board label text (the line box, not the font size). */
const LABEL_LINE = "h-[calc(var(--b-label)*1.2)]";
/** The plate's right column on lg, over the rail. */
const TIME_CELL = "lg:col-[5/6] lg:mr-[var(--b-inset)] lg:justify-self-end";
const RAIL_HEADS = ["h-[var(--b-head-tall)]", "h-[var(--b-head)] border-t", "h-[var(--b-head)] border-t"];

/**
 * Board-shaped (nameplate, race, rail) on the board's own grids, line heights and header heights,
 * so nothing jumps when the board streams in. No board words: it also flashes before the PIN
 * gate. Sizes itself to the viewport because the route template's wrapper has no height.
 */
export default function ClassBoardLoading() {
  return (
    <LoadingRegion
      label="Loading"
      className={cn(BOARD_SCALE, "flex h-dvh w-full flex-col gap-4 overflow-hidden bg-background p-4")}
    >
      {/* The nameplate on its own grid: wordmark, cycle title, and the date / clock / Updated stack. */}
      <div
        aria-hidden="true"
        className={cn(
          "brand-hero-panel flex shrink-0 flex-col gap-3 px-[var(--b-inset)] py-3",
          "lg:grid lg:items-center lg:gap-x-4 lg:gap-y-[calc(var(--b)*0.2)] lg:px-0 lg:py-[calc(var(--b)*0.7)]",
          PLATE_GRID
        )}
      >
        <div className="flex items-start justify-between gap-4 lg:contents">
          <div className={cn(PLATE_MARK, "min-h-10")}>
            <Skeleton className="h-8 w-28 lg:h-[calc(var(--b)*2.5)] lg:w-[calc(var(--b)*9.35)]" />
          </div>
          <div className="flex flex-col items-end gap-1 lg:contents">
            <Skeleton className={cn(LABEL_LINE, "w-24 lg:w-40", TIME_CELL, "lg:row-start-1")} />
            <Skeleton className={cn("h-[var(--b-clock)] w-32 lg:w-44", TIME_CELL, "lg:row-start-2")} />
            <Skeleton className={cn("h-[calc(var(--b-meta)*1.35)] w-24", TIME_CELL, "lg:row-start-3")} />
          </div>
        </div>
        <div className="space-y-1 lg:contents lg:space-y-0">
          <Skeleton className={cn(LABEL_LINE, "w-40 lg:col-[2/5] lg:row-start-1")} />
          <Skeleton className="h-[calc(var(--b-h1)*1.1)] w-64 max-w-full lg:col-[2/5] lg:row-start-2" />
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div aria-hidden="true" className="flex min-h-0 flex-col overflow-hidden rounded-md border border-border bg-card">
          <div className="flex shrink-0 items-center border-b border-border px-4 py-2.5 lg:h-[var(--b-head-tall)] lg:py-0">
            <Skeleton className="h-[var(--b-label)] w-full" />
          </div>
          {Array.from({ length: LANE_ROWS }, (_, index) => (
            <div key={index} className="flex min-h-14 flex-1 items-center gap-4 border-b border-border px-4 last:border-b-0">
              <Skeleton className="h-5 w-5 shrink-0" />
              <Skeleton className="h-4 w-1/3 md:w-1/5" />
              <Skeleton className="hidden h-1 flex-1 md:block" />
              <Skeleton className="ml-auto h-5 w-24 md:ml-0" />
            </div>
          ))}
        </div>
        <div aria-hidden="true" className="hidden min-h-0 flex-col overflow-hidden rounded-md border border-border bg-card lg:flex">
          {RAIL_HEADS.map((head, index) => (
            <div key={index} className={cn("flex flex-col", index === RAIL_HEADS.length - 1 && "flex-1")}>
              <div className={cn("flex shrink-0 items-center border-b border-border px-4", head)}>
                <Skeleton className="h-[var(--b-label)] w-28" />
              </div>
              <div className="space-y-3 p-4">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-4/5" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </LoadingRegion>
  );
}
