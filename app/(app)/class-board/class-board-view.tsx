import { pacificDateKey, type ClassBoardModel } from "@/src/lib/class-board";
import { cn } from "@/src/lib/utils";
import { BoardLiveHeader } from "./board-live-header";
import { BoardRace } from "./board-race";
import { BoardRail } from "./board-rail";
import { BOARD_SCALE } from "./board-scale";

/**
 * The classroom display, chromeless and full-bleed (the shell hides its chrome on /class-board).
 * A server component: only the nameplate (clock, focus, refresh) and the lanes' "Cleared" tags run
 * on the client.
 *
 * lg: viewport-locked, no scroll. The nameplate and the body share one 2fr | 1fr grid, so the
 * clock sits over the rail. Below lg the board is its own scroll container (every ancestor is
 * overflow-hidden) and the sections stack: nameplate, race, Due next, Livestreams, Calendar.
 */
export default function ClassBoardView({ board }: { board: ClassBoardModel }) {
  return (
    <div
      className={cn(
        BOARD_SCALE,
        "flex h-dvh w-full flex-col gap-4 overflow-y-auto overflow-x-hidden overscroll-contain bg-background p-4 text-foreground lg:overflow-hidden"
      )}
    >
      <BoardLiveHeader
        generatedAt={board.generatedAt}
        classSessions={board.classSessions}
        days={board.days}
        deadlines={board.deadlines}
        cycleNumber={board.cycleNumber}
        cycleFocus={board.cycleFocus}
        laneCount={board.lanes.length}
      />
      <div className="grid gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <BoardRace gates={board.gates} lanes={board.lanes} />
        <BoardRail
          deadlines={board.deadlines}
          livestreams={board.livestreams}
          days={board.days}
          todayKey={pacificDateKey(new Date(board.generatedAt))}
        />
      </div>
    </div>
  );
}
