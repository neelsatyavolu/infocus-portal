import type { PlatformRole } from "@prisma/client";
import { mayReopenFinalCut } from "@/src/lib/package-revisions";
import { prisma } from "@/src/lib/prisma";

/** An executive lets the group upload one new version of a Final Cut that is already in. */
export async function reopenFinalCut(input: { rowId: string; role: PlatformRole | null }) {
  if (!mayReopenFinalCut(input.role)) throw new Error("FORBIDDEN");

  const row = await prisma.packageProgressRow.findUnique({
    where: { id: input.rowId },
    select: { finalCutMediaItemId: true }
  });
  if (!row) throw new Error("NOT_FOUND");
  if (!row.finalCutMediaItemId) throw new Error("CONFLICT");

  await prisma.packageProgressRow.update({
    where: { id: input.rowId },
    data: { finalCutResubmitAllowed: true }
  });
}
