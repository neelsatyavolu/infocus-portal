import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/src/lib/auth";
import { getPlatformRoleForEmail } from "@/src/lib/platform-admin";
import { pacificDateKey } from "@/src/lib/class-board";
import { isBoardHidden, isContestOpen, isLeaderboardOpen } from "@/src/lib/thanksgiving-board";
import { inHarvestHour } from "@/src/lib/thanksgiving-harvest-hour";
import { loadClassBoard } from "@/src/server/class-board";
import { harvestHour } from "@/src/server/thanksgiving-harvest-hour";
import { loadHarvestBoard } from "@/src/server/thanksgiving-scores";
import type { BoardHarvest } from "./board-rail";
import { classBoardPinAllowsAccess } from "@/src/server/class-board-pin";
import ClassBoardPinGate from "./class-board-pin-gate";
import ClassBoardView from "./class-board-view";

export const metadata: Metadata = {
  title: "Class Board"
};

export default async function ClassBoardPage() {
  const result = await loadClassBoardPage();
  if (result.kind === "pin") return <ClassBoardPinGate />;
  return <ClassBoardView board={result.board} harvest={result.harvest} />;
}

const HARVEST_TOP = 5;

/**
 * In November (Pacific) of a contest year, until the winner is revealed, the Thanksgiving
 * leaderboard's top five. A failure leaves it off, never the board.
 */
async function loadBoardHarvest(now = new Date()): Promise<BoardHarvest | null> {
  if (pacificDateKey(now).slice(5, 7) !== "11" || !isLeaderboardOpen(now)) return null;
  const base = { contestOpen: isContestOpen(now), harvestHourLive: inHarvestHour(harvestHour(), now) };
  // The classroom screen is public: nothing to load while the board is dark.
  if (isBoardHidden(now)) return { ...base, rows: [], hidden: true };
  try {
    const board = await loadHarvestBoard(now);
    return {
      ...base,
      rows: board.rows.slice(0, HARVEST_TOP).map(({ userId, name, total, rank }) => ({ userId, name, total, rank })),
      hidden: false
    };
  } catch (error) {
    console.error("class board: leaderboard failed to load", error);
    return null;
  }
}

async function loadClassBoardPage() {
  try {
    const session = await getSessionUser();
    if (!session && !(await classBoardPinAllowsAccess())) {
      return { kind: "pin" } as const;
    }
    const platformRole = session?.email ? await getPlatformRoleForEmail(session.email) : null;
    const [board, harvest] = await Promise.all([loadClassBoard(platformRole), loadBoardHarvest()]);
    return { kind: "board", board, harvest } as const;
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      redirect("/sign-in");
    }
    throw error;
  }
}
