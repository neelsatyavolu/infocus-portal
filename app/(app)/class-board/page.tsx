import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/src/lib/auth";
import { getPlatformRoleForEmail } from "@/src/lib/platform-admin";
import { loadClassBoard } from "@/src/server/class-board";
import { classBoardPinAllowsAccess } from "@/src/server/class-board-pin";
import ClassBoardPinGate from "./class-board-pin-gate";
import ClassBoardView from "./class-board-view";

export const metadata: Metadata = {
  title: "Class Board · InFocus Portal"
};

export default async function ClassBoardPage() {
  try {
    const session = await getSessionUser();
    if (!session && !(await classBoardPinAllowsAccess())) {
      return <ClassBoardPinGate />;
    }
    const platformRole = session?.email ? await getPlatformRoleForEmail(session.email) : null;
    const board = await loadClassBoard(platformRole);
    return <ClassBoardView board={board} />;
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      redirect("/sign-in");
    }
    throw error;
  }
}
