import { Prisma } from "@prisma/client";
import { LAST_S1_CYCLE_NUMBER, cycleSemesterTerm } from "@/src/lib/package-grades";
import { prisma } from "@/src/lib/prisma";
import { CUSTOM_QUEUE_CYCLE_NUMBER } from "@/src/lib/publishing-queue";
import { resolveActiveCycleNumber } from "@/src/server/package-cycle-stage";

export type SemesterTerm = 1 | 2;

export const SEMESTER_RESET_CONFIRM = { 1: "RESET S1", 2: "RESET S2" } as const satisfies Record<SemesterTerm, string>;

export class SemesterResetError extends Error {
  status: number;

  constructor(message: string, status = 409) {
    super(message);
    this.status = status;
  }
}

/** S1 is stored as cycles 1–3, S2 as cycles 4 and up (src/lib/package-grades.ts). */
function cycleRange(term: SemesterTerm): Prisma.IntFilter {
  return term === 1 ? { gte: 1, lte: LAST_S1_CYCLE_NUMBER } : { gt: LAST_S1_CYCLE_NUMBER };
}

/**
 * A package the publishing queue still needs: it has a Final Cut, is queued, or has a YouTube
 * upload. These stay (moved to the queue's cycle 0) with their members, Final Cut and queue data.
 */
const QUEUE_PACKAGE = {
  OR: [
    { finalCutMediaItemId: { not: null } },
    { queuedForAirAt: { not: null } },
    { youtubePublication: { isNot: null } }
  ]
} satisfies Prisma.PackageProgressRowWhereInput;

/** A-roll/B-roll clips and Initial Cuts of the semester's packages; never a Final Cut. */
function semesterMediaWhere(cycleNumber: Prisma.IntFilter): Prisma.MediaItemWhereInput {
  return {
    deletedAt: null,
    finalCutForRows: { none: {} },
    OR: [
      { cycleStageLinks: { some: { row: { cycleNumber } } } },
      { initialCutForRows: { some: { cycleNumber } } }
    ]
  };
}

export type SemesterResetSummary = {
  term: SemesterTerm;
  packagesKept: number;
  packagesDeleted: number;
  mediaRemoved: number;
  grades: number;
  extensionRequests: number;
  producerNotes: number;
  /** Set when this semester can't be reset yet (it is the current one). Preview only. */
  blockedReason?: string | null;
};

/** Why `term` can't be reset: it holds the active cycle. Only a finished semester is cleared. */
async function currentSemesterReason(term: SemesterTerm) {
  const active = await resolveActiveCycleNumber();
  return cycleSemesterTerm(active) === term
    ? `Semester ${term} is the current semester (Cycle ${active} is active). Reset it once the next semester's cycles have started.`
    : null;
}

/** What a reset of `term` would remove, for the confirm dialog. */
export async function previewSemesterReset(term: SemesterTerm): Promise<SemesterResetSummary> {
  const cycleNumber = cycleRange(term);
  const [packagesKept, packagesTotal, mediaRemoved, grades, extensionRequests, producerNotes, blockedReason] = await Promise.all([
    prisma.packageProgressRow.count({ where: { cycleNumber, ...QUEUE_PACKAGE } }),
    prisma.packageProgressRow.count({ where: { cycleNumber } }),
    prisma.mediaItem.count({ where: semesterMediaWhere(cycleNumber) }),
    prisma.packageGrade.count({ where: { cycleNumber } }),
    prisma.packageExtensionRequest.count({ where: { cycleNumber } }),
    prisma.memberProducerNote.count({ where: { cycleNumber } }),
    currentSemesterReason(term)
  ]);
  return {
    term,
    packagesKept,
    packagesDeleted: packagesTotal - packagesKept,
    mediaRemoved,
    grades,
    extensionRequests,
    producerNotes,
    blockedReason
  };
}

/**
 * Clears a finished semester so its cycle numbers start fresh, in one transaction:
 * - A-roll/B-roll clips and Initial Cuts go to Recently deleted (the nightly purge removes the
 *   files from Drive 7 days later, so a mistake can still be restored).
 * - Packages the publishing queue needs move to cycle 0 with their members, Final Cut, toss,
 *   bylines, show date and YouTube record; their stage work (comments, approvals, proofs of
 *   contact, scores, votes, chats) is deleted.
 * - Every other package of the semester is deleted, with its roster.
 * - Grades, grade history, extension requests and per-cycle producer notes are deleted, and the
 *   cycles' focus and dates are cleared.
 * Members, general producer notes, the publishing queue and everything outside package cycles stay.
 */
export async function resetSemester(input: { term: SemesterTerm; actorUserId: string }): Promise<SemesterResetSummary> {
  const blockedReason = await currentSemesterReason(input.term);
  if (blockedReason) {
    throw new SemesterResetError(blockedReason);
  }
  const cycleNumber = cycleRange(input.term);
  const kept = await prisma.packageProgressRow.findMany({
    where: { cycleNumber, ...QUEUE_PACKAGE },
    select: { id: true }
  });
  const keptIds = kept.map((row) => row.id);
  const keptRows = { rowId: { in: keptIds } };

  const [media, , , , , , , , , , , deletedRows, extensionRequests, grades, producerNotes] = await prisma.$transaction([
    // First, while the rows still link the media.
    prisma.mediaItem.updateMany({
      where: semesterMediaWhere(cycleNumber),
      data: { deletedAt: new Date(), deletedById: input.actorUserId }
    }),
    prisma.packageStageMedia.deleteMany({ where: keptRows }),
    prisma.packageStageComment.deleteMany({ where: keptRows }),
    prisma.packageStageCommentRead.deleteMany({ where: keptRows }),
    prisma.packageProofOfContact.deleteMany({ where: keptRows }),
    prisma.packageFinalCutScore.deleteMany({ where: keptRows }),
    prisma.packageOfCycleVote.deleteMany({ where: keptRows }),
    prisma.packageReviewNotice.deleteMany({ where: { progressRowId: { in: keptIds } } }),
    prisma.packageApproval.deleteMany({ where: { progressRowId: { in: keptIds } } }),
    prisma.hubChat.deleteMany({ where: { packageRowId: { in: keptIds } } }),
    prisma.packageProgressRow.updateMany({
      where: { id: { in: keptIds } },
      data: { cycleNumber: CUSTOM_QUEUE_CYCLE_NUMBER, initialCutMediaItemId: null, stageNotes: Prisma.DbNull }
    }),
    // Cascades to members and the rest of each package's stage work.
    prisma.packageProgressRow.deleteMany({ where: { cycleNumber } }),
    prisma.packageExtensionRequest.deleteMany({ where: { cycleNumber } }),
    // Cascades to grade history.
    prisma.packageGrade.deleteMany({ where: { cycleNumber } }),
    prisma.memberProducerNote.deleteMany({ where: { cycleNumber } }),
    prisma.packageCycle.updateMany({
      where: { cycleNumber },
      data: {
        focus: "",
        pitchingDate: null,
        proofOfContactDate: null,
        aRollBRollDate: null,
        initialCutDate: null,
        finalCutDate: null,
        packageOfCycleReleasedAt: null
      }
    }),
    prisma.programSetting.updateMany({
      where: { classBoardCycleNumber: cycleNumber },
      data: { classBoardCycleNumber: null }
    })
  ]);

  return {
    term: input.term,
    packagesKept: keptIds.length,
    packagesDeleted: deletedRows.count,
    mediaRemoved: media.count,
    grades: grades.count,
    extensionRequests: extensionRequests.count,
    producerNotes: producerNotes.count
  };
}
