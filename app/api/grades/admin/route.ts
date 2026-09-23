import type { GradeScoreState } from "@prisma/client";
import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { sendGradeEmails } from "@/src/lib/email";
import { fail, ok } from "@/src/lib/http";
import {
  MAX_EFFORT_POINTS,
  MAX_TEAMWORK_POINTS,
  PACKAGE_CYCLE_NUMBERS,
  gradePercentage,
  gradeTotal,
  parseCycleNumber
} from "@/src/lib/package-grades";
import { approvedExtensionDaysFor, calculateLatePenalty, effectiveDeadline } from "@/src/lib/package-extensions";
import { officialFinalCutPoints } from "@/src/lib/package-review-mail";
import { capAwardedForRevision } from "@/src/lib/package-revisions";
import {
  calculateExtensionDays,
  calculateExtensionsRemaining,
  effectiveAppliedDays,
  parseDateInput,
  sanitizeFreeExtensionDays,
  STARTING_EXTENSION_DAYS,
  toDateKey
} from "@/src/lib/extensions";
import { isExcludedFromGrading, loadNonGradableEmails } from "@/src/lib/gradable-roster";
import { computeMissingGradeReport } from "@/src/lib/missing-grades";
import { getPlatformAccess, hasPlatformRole, normalizeEmail } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import { userDisplayName } from "@/src/lib/user-display";
import { isWebPushConfigured, sendWebPush } from "@/src/lib/web-push";
import { CHECK_IN_STATE_FIELDS, CHECK_IN_STATE_SELECT, CHECK_IN_SCORE_FIELDS, checkInOverrides, checkInDeadlinePassed, cycleCheckInDates } from "@/src/lib/package-stages";
import { loadGradeEditorParticipation } from "@/src/server/grade-editor-participation";
import { loadGradeEditorCredits } from "@/src/server/grade-editor-credits";
import { loadStudentGradebookView } from "@/src/server/student-grades-view";

const gradeHistorySelect = {
  eventType: true,
  occurredAt: true
} as const;

const saveGradeSchema = z.object({
  action: z.literal("save"),
  cycleNumber: z.number().int().min(1).max(8),
  userId: z.string().min(1),
  effortPoints: z.number().int().min(0).max(MAX_EFFORT_POINTS).nullable(),
  finalCutState: z.enum(["UNGRADED", "EXEMPT"]).nullable().optional(),
  teamworkPoints: z.number().int().min(0).max(MAX_TEAMWORK_POINTS).optional().default(0),
  feedback: z.string().max(2000).optional(),
  turnedInDate: z.string().nullable().optional(),
  freeExtensionDays: z.number().int().min(0).max(STARTING_EXTENSION_DAYS).optional()
});

const setPublishSchema = z.object({
  action: z.literal("setPublish"),
  cycleNumber: z.number().int().min(1).max(8),
  userId: z.string().min(1),
  published: z.boolean()
});

const setTurnedInDateSchema = z.object({
  action: z.literal("setTurnedInDate"),
  cycleNumber: z.number().int().min(1).max(8),
  userId: z.string().min(1),
  turnedInDate: z.string().nullable(),
  freeExtensionDays: z.number().int().min(0).max(STARTING_EXTENSION_DAYS).optional()
});

const setTotalNotesSchema = z.object({
  action: z.literal("setTotalNotes"),
  userId: z.string().min(1),
  notes: z.string().max(5000)
});

const setCheckInSchema = z.object({
  action: z.literal("setCheckIn"),
  userId: z.string().min(1),
  cycleNumber: z.number().int().min(1).max(8),
  stage: z.enum(["pitching", "proofOfContact", "aRollBRoll", "initialCut"]),
  points: z.union([z.number().int().min(0).max(5), z.enum(["UNGRADED", "EXEMPT"])]).nullable()
});

const requestSchema = z.discriminatedUnion("action", [
  saveGradeSchema,
  setPublishSchema,
  setTurnedInDateSchema,
  setTotalNotesSchema,
  setCheckInSchema
]);

function toIso(value: Date | null) {
  return value ? value.toISOString() : null;
}

function serializeGradeHistory(events: Array<{ eventType: "PUBLISHED" | "REVISED"; occurredAt: Date }>) {
  return events.map((event) => ({
    eventType: event.eventType,
    occurredAt: toIso(event.occurredAt)
  }));
}

function buildExtensionDetails({
  finalCutDate,
  turnedInDate,
  extensionDaysApplied,
  freeExtensionDays,
  extensionExempt
}: {
  finalCutDate: Date | null;
  turnedInDate: Date | null;
  extensionDaysApplied: number;
  freeExtensionDays: number | null | undefined;
  extensionExempt: boolean;
}) {
  const calculatedDays = calculateExtensionDays(finalCutDate, turnedInDate);
  const normalizedFreeDays = sanitizeFreeExtensionDays(freeExtensionDays);

  return {
    calculatedDays,
    freeDays: normalizedFreeDays,
    chargedDays: effectiveAppliedDays({
      extensionDaysApplied,
      extensionExempt,
      freeExtensionDays: normalizedFreeDays
    }),
    exempt: extensionExempt
  };
}

function serializeGrade(grade: {
  cycleNumber: number;
  userId: string;
  effortPoints: number;
  teamworkPoints: number;
  awardedFinalCutPoints?: number | null;
  finalCutState?: GradeScoreState | null;
  previousEffortPoints: number | null;
  previousTeamworkPoints: number | null;
  revisedAt: Date | null;
  feedback: string;
  turnedInDate: Date | null;
  extensionDaysApplied: number;
  freeExtensionDays: number;
  extensionExempt: boolean;
  publishedAt: Date | null;
  publicationHistory: Array<{
    eventType: "PUBLISHED" | "REVISED";
    occurredAt: Date;
  }>;
}, options?: { finalCutDate?: Date | null }) {
  const quality = grade.finalCutState ? null : grade.awardedFinalCutPoints ?? null;
  const totalPoints = quality;
  const extensionDetails = buildExtensionDetails({
    finalCutDate: options?.finalCutDate ?? null,
    turnedInDate: grade.turnedInDate,
    extensionDaysApplied: grade.extensionDaysApplied,
    freeExtensionDays: grade.freeExtensionDays,
    extensionExempt: grade.extensionExempt
  });

  return {
    cycleNumber: grade.cycleNumber,
    userId: grade.userId,
    finalCutState: grade.finalCutState ?? null,
    effortPoints: quality,
    teamworkPoints: grade.teamworkPoints,
    previousEffortPoints: grade.previousEffortPoints,
    previousTeamworkPoints: grade.previousTeamworkPoints,
    totalPoints,
    percentage: totalPoints === null ? null : gradePercentage(totalPoints),
    revised: Boolean(grade.revisedAt),
    revisedAt: toIso(grade.revisedAt),
    feedback: grade.feedback,
    turnedInDate: toDateKey(grade.turnedInDate),
    freeExtensionDays: grade.freeExtensionDays,
    extensionDetails,
    published: Boolean(grade.publishedAt),
    publishedAt: toIso(grade.publishedAt),
    publicationHistory: serializeGradeHistory(grade.publicationHistory)
  };
}

async function ensureDefaultCycles() {
  const existing = await prisma.packageCycle.findMany({
    select: { cycleNumber: true }
  });

  const existingSet = new Set(existing.map((entry) => entry.cycleNumber));
  const missing = PACKAGE_CYCLE_NUMBERS.filter((cycleNumber) => !existingSet.has(cycleNumber));

  if (missing.length > 0) {
    await prisma.packageCycle.createMany({
      data: missing.map((cycleNumber) => ({
        cycleNumber,
        focus: ""
      }))
    });
  }
}

async function getExtensionsRemainingForUser(userId: string) {
  const entries = await prisma.packageGrade.findMany({
    where: { userId },
    select: {
      extensionDaysApplied: true,
      freeExtensionDays: true,
      extensionExempt: true
    }
  });

  return calculateExtensionsRemaining(entries);
}

async function notifyGradeUser(
  recipient: {
    id: string;
    email: string | null;
    notificationPreference: {
      emailEnabled: boolean;
      notificationEmail: string | null;
      emailGradesEnabled: boolean;
      browserEnabled: boolean;
      browserGradesEnabled: boolean;
    } | null;
    pushSubscriptions: Array<{
      id: string;
      endpoint: string;
      p256dh: string;
      auth: string;
    }>;
  },
  payload: {
    mode: "published" | "updated";
    cycleNumber: number;
    totalPoints: number;
    percentage: number;
  }
) {
  const preference = recipient.notificationPreference;
  const baseUrl = process.env.APP_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "";
  const gradeUrl = baseUrl ? `${baseUrl.replace(/\/+$/, "")}/grades` : "/grades";

  if (
    preference?.browserEnabled &&
    preference.browserGradesEnabled &&
    recipient.pushSubscriptions.length > 0 &&
    isWebPushConfigured()
  ) {
    const title = payload.mode === "published" ? "Grade published" : "Grade updated";
    const body = `Package Cycle ${payload.cycleNumber}: ${payload.totalPoints}/40 (${payload.percentage.toFixed(1)}%)`;

    const results = await Promise.all(
      recipient.pushSubscriptions.map((subscription) =>
        sendWebPush(
          {
            endpoint: subscription.endpoint,
            p256dh: subscription.p256dh,
            auth: subscription.auth
          },
          {
            title,
            body,
            url: "/grades"
          }
        ).then((result) => ({
          id: subscription.id,
          result
        }))
      )
    );

    const staleSubscriptionIds = results.filter((entry) => entry.result.stale).map((entry) => entry.id);
    if (staleSubscriptionIds.length > 0) {
      await prisma.pushNotificationSubscription.deleteMany({
        where: {
          id: {
            in: staleSubscriptionIds
          }
        }
      });
    }
  }

  if (preference?.emailEnabled && preference.emailGradesEnabled) {
    const recipientEmail = preference.notificationEmail ?? recipient.email;

    if (recipientEmail) {
      void sendGradeEmails({
        recipients: [recipientEmail],
        cycleNumber: payload.cycleNumber,
        totalPoints: payload.totalPoints,
        percentage: payload.percentage,
        gradeUrl,
        mode: payload.mode
      });
    }
  }
}

export async function GET(request: Request) {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);

    if (!hasPlatformRole(access.role, "EXECUTIVE_PRODUCER")) {
      throw new Error("FORBIDDEN");
    }

    await ensureDefaultCycles();

    const { searchParams } = new URL(request.url);
    const view = searchParams.get("view");
    const nonGradableEmails = await loadNonGradableEmails();

    if (view === "totals") {
      const [users, cycles, allGrades, totalNotes] = await Promise.all([
        prisma.user.findMany({
          select: { id: true, name: true, nickname: true, email: true }
        }),
        prisma.packageCycle.findMany({
          orderBy: { cycleNumber: "asc" },
          select: {
            cycleNumber: true,
            focus: true,
            pitchingDate: true,
            proofOfContactDate: true,
            aRollBRollDate: true,
            initialCutDate: true,
            finalCutDate: true
          }
        }),
        prisma.packageGrade.findMany({
          select: {
            cycleNumber: true,
            userId: true,
            effortPoints: true,
            finalCutState: true,
            teamworkPoints: true,
            awardedFinalCutPoints: true
          }
        }),
        prisma.packageTotalNote.findMany({
          select: { userId: true, notes: true }
        })
      ]);
      const notesByUserId = new Map(totalNotes.map((entry) => [entry.userId, entry.notes]));

      const gradableUsers = users
        .filter((entry) => !isExcludedFromGrading(entry, nonGradableEmails))
        .sort((a, b) => {
          const aKey = (a.name ?? a.email ?? "").toLowerCase();
          const bKey = (b.name ?? b.email ?? "").toLowerCase();
          return aKey.localeCompare(bKey);
        });

      const finalStateByUserCycle = new Map(allGrades.map((grade) => [`${grade.userId}:${grade.cycleNumber}`, grade.finalCutState]));
      const gradeByUserCycle = new Map<string, Map<number, { effortPoints: number; teamworkPoints: number }>>();
      for (const grade of allGrades) {
        if (grade.finalCutState || grade.awardedFinalCutPoints === null) continue;
        const cycleMap = gradeByUserCycle.get(grade.userId) ?? new Map();
        cycleMap.set(grade.cycleNumber, {
          effortPoints: grade.awardedFinalCutPoints ?? grade.effortPoints,
          teamworkPoints: 0
        });
        gradeByUserCycle.set(grade.userId, cycleMap);
      }

      const userIds = gradableUsers.map((entry) => entry.id);
      const [{ checkInPossible, byUserId: creditsByUserId }, participationByUserId] = await Promise.all([
        loadGradeEditorCredits({ userIds, cycles }),
        loadGradeEditorParticipation(userIds)
      ]);

      return ok({
        cycles: cycles.map((cycle) => ({
          cycleNumber: cycle.cycleNumber,
          focus: cycle.focus,
          finalCutDate: toDateKey(cycle.finalCutDate)
        })),
        checkInPossible,
        totalsRows: gradableUsers.map((entry) => {
          const cycleMap = gradeByUserCycle.get(entry.id) ?? new Map();
          const credits = creditsByUserId.get(entry.id);
          return {
            userId: entry.id,
            name: userDisplayName(entry) || entry.name,
            email: entry.email,
            notes: notesByUserId.get(entry.id) ?? "",
            participationEarned: participationByUserId.get(entry.id)?.earned ?? 0,
            participationPossible: participationByUserId.get(entry.id)?.possible ?? 0,
            checkInPoints: credits?.checkInPoints ?? null,
            checkInPossible: credits?.checkInPossible ?? null,
            livestreamPoints: credits?.livestreamPoints ?? null,
            livestreamHours: credits?.livestreamHours ?? 0,
            portfolioPoints: credits?.portfolioPoints ?? null,
            cycleTotals: cycles.map((cycle) => {
              const grade = cycleMap.get(cycle.cycleNumber);
              const totalPoints = grade ? gradeTotal(grade.effortPoints, grade.teamworkPoints) : null;
              return {
                cycleNumber: cycle.cycleNumber,
                finalCutState: finalStateByUserCycle.get(`${entry.id}:${cycle.cycleNumber}`) ?? null,
                totalPoints
              };
            })
          };
        })
      });
    }

    if (view === "missing") {
      const [users, cycles, grades] = await Promise.all([
        prisma.user.findMany({
          select: { id: true, name: true, nickname: true, email: true }
        }),
        prisma.packageCycle.findMany({
          orderBy: { cycleNumber: "asc" },
          select: { cycleNumber: true, focus: true }
        }),
        prisma.packageGrade.findMany({
          where: { OR: [{ awardedFinalCutPoints: { not: null } }, { publishedAt: { not: null } }, { finalCutState: "EXEMPT" }] },
          select: { userId: true, cycleNumber: true, publishedAt: true, finalCutState: true }
        })
      ]);

      const gradableUsers = users
        .filter((entry) => !isExcludedFromGrading(entry, nonGradableEmails))
        .sort((a, b) => {
          const aKey = (a.name ?? a.email ?? "").toLowerCase();
          const bKey = (b.name ?? b.email ?? "").toLowerCase();
          return aKey.localeCompare(bKey);
        });

      const [memberships, associateAssignments] = await Promise.all([
        prisma.packageProgressRow.findMany({
          where: { cycleNumber: { in: cycles.map((cycle) => cycle.cycleNumber) } },
          select: {
            cycleNumber: true,
            members: { select: { userId: true } }
          }
        }),
        prisma.platformRoleAssignment.findMany({
          where: { role: "ASSOCIATE_PRODUCER" },
          select: { email: true }
        })
      ]);
      const associateEmails = new Set(
        associateAssignments.map((entry) => normalizeEmail(entry.email)).filter(Boolean)
      );
      const associateUserIds = new Set(
        gradableUsers
          .filter((entry) => associateEmails.has(normalizeEmail(entry.email)))
          .map((entry) => entry.id)
      );
      const memberCycleNumbersByUserId = new Map<string, Set<number>>();
      for (const row of memberships) {
        for (const member of row.members) {
          const set = memberCycleNumbersByUserId.get(member.userId) ?? new Set<number>();
          set.add(row.cycleNumber);
          memberCycleNumbersByUserId.set(member.userId, set);
        }
      }

      const { consideredCycleNumbers, report } = computeMissingGradeReport({
        people: gradableUsers.map((entry) => ({ id: entry.id, name: userDisplayName(entry) || entry.name, email: entry.email })),
        grades: grades.map((grade) => ({
          userId: grade.userId,
          cycleNumber: grade.cycleNumber,
          published: grade.publishedAt !== null,
          finalCutState: grade.finalCutState
        })),
        cycleNumbers: cycles.map((cycle) => cycle.cycleNumber),
        associateUserIds,
        memberCycleNumbersByUserId
      });

      return ok({
        cycles: cycles.map((cycle) => ({ cycleNumber: cycle.cycleNumber, focus: cycle.focus })),
        consideredCycleNumbers,
        people: gradableUsers.map((entry) => ({ userId: entry.id, name: userDisplayName(entry) || entry.name, email: entry.email })),
        missingReport: report
      });
    }

    if (view === "student") {
      const studentId = searchParams.get("userId")?.trim() ?? "";
      if (!studentId) {
        return fail("userId is required.", 400);
      }

      const student = await prisma.user.findUnique({
        where: { id: studentId },
        select: { id: true, name: true, nickname: true, email: true }
      });
      if (!student || isExcludedFromGrading(student, nonGradableEmails)) {
        return fail("Student not found.", 404);
      }

      const gradebookView = await loadStudentGradebookView(student.id);
      return ok({
        student: { userId: student.id, name: userDisplayName(student) || student.name, email: student.email },
        ...gradebookView
      });
    }

    const activeCycleNumber = parseCycleNumber(searchParams.get("cycle"));

    const [users, cycles, cycleGrades, publishedGrades, extensionUsageRows] = await Promise.all([
      prisma.user.findMany({
        select: {
          id: true,
          name: true,
          nickname: true,
          email: true
        }
      }),
      prisma.packageCycle.findMany({
        orderBy: { cycleNumber: "asc" },
        select: {
          cycleNumber: true,
          focus: true,
          pitchingDate: true,
          proofOfContactDate: true,
          aRollBRollDate: true,
          initialCutDate: true,
          finalCutDate: true
        }
      }),
      prisma.packageGrade.findMany({
        where: { cycleNumber: activeCycleNumber },
        select: {
          cycleNumber: true,
          userId: true,
          effortPoints: true,
          finalCutState: true,
          teamworkPoints: true,
          awardedFinalCutPoints: true,
          ...CHECK_IN_STATE_SELECT,
          pitchingPoints: true,
          proofOfContactPoints: true,
          aRollBRollPoints: true,
          initialCutPoints: true,
          previousEffortPoints: true,
          previousTeamworkPoints: true,
          revisedAt: true,
          feedback: true,
          turnedInDate: true,
          extensionDaysApplied: true,
          freeExtensionDays: true,
          extensionExempt: true,
          publishedAt: true,
          publicationHistory: {
            orderBy: { occurredAt: "desc" },
            select: gradeHistorySelect
          }
        }
      }),
      prisma.packageGrade.findMany({
        where: {
          publishedAt: {
            not: null
          }
        },
        select: {
          cycleNumber: true,
          userId: true,
          effortPoints: true,
          finalCutState: true,
          teamworkPoints: true
        }
      }),
      prisma.packageGrade.findMany({
      select: {
          userId: true,
          extensionDaysApplied: true,
          freeExtensionDays: true,
          extensionExempt: true
        }
      })
    ]);

    const gradableUsers = users
      .filter((entry) => !isExcludedFromGrading(entry, nonGradableEmails))
      .sort((a, b) => {
        const aKey = (a.name ?? a.email ?? "").toLowerCase();
        const bKey = (b.name ?? b.email ?? "").toLowerCase();
        return aKey.localeCompare(bKey);
      });

    const { byUserId: creditsByUserId } = await loadGradeEditorCredits({
      userIds: gradableUsers.map((entry) => entry.id),
      cycles: cycles.filter((cycle) => cycle.cycleNumber === activeCycleNumber)
    });
    const cycleGradeByUser = new Map(cycleGrades.map((entry) => [entry.userId, entry]));
    const cycleAverageMap = new Map<number, { sum: number; count: number }>();
    const extensionUsageByUser = new Map<
      string,
      Array<{ extensionDaysApplied: number; freeExtensionDays: number; extensionExempt: boolean }>
    >();

    for (const row of extensionUsageRows) {
      const rows = extensionUsageByUser.get(row.userId) ?? [];
      rows.push({
        extensionDaysApplied: row.extensionDaysApplied,
        freeExtensionDays: row.freeExtensionDays,
        extensionExempt: row.extensionExempt
      });
      extensionUsageByUser.set(row.userId, rows);
    }

    for (const grade of publishedGrades) {
      if (grade.finalCutState) continue;
      const total = gradeTotal(grade.effortPoints, grade.teamworkPoints);
      const cycleAggregate = cycleAverageMap.get(grade.cycleNumber) ?? { sum: 0, count: 0 };
      cycleAggregate.sum += total;
      cycleAggregate.count += 1;
      cycleAverageMap.set(grade.cycleNumber, cycleAggregate);
    }

    const cycleAverages = cycles.map((cycle) => {
      const aggregate = cycleAverageMap.get(cycle.cycleNumber);
      const averageTotal = aggregate ? Number((aggregate.sum / aggregate.count).toFixed(1)) : null;

      return {
        cycleNumber: cycle.cycleNumber,
        averageTotal,
        averagePercentage: averageTotal === null ? null : gradePercentage(averageTotal),
        publishedCount: aggregate?.count ?? 0
      };
    });

    const activeCycleAverage = cycleAverages.find((entry) => entry.cycleNumber === activeCycleNumber) ?? null;

    return ok({
      activeCycleNumber,
      cycles: cycles.map((cycle) => ({
        cycleNumber: cycle.cycleNumber,
        focus: cycle.focus,
        finalCutDate: toDateKey(cycle.finalCutDate)
      })),
      cycleAverages,
      activeCycleAverage,
      rows: gradableUsers.map((entry) => {
        const grade = cycleGradeByUser.get(entry.id);
        const totalPoints = grade?.finalCutState ? null : grade?.awardedFinalCutPoints ?? null;
        const usageRows = extensionUsageByUser.get(entry.id) ?? [];
        const extensionDetails = buildExtensionDetails({
          finalCutDate: cycles.find((cycle) => cycle.cycleNumber === activeCycleNumber)?.finalCutDate ?? null,
          turnedInDate: grade?.turnedInDate ?? null,
          extensionDaysApplied: grade?.extensionDaysApplied ?? 0,
          freeExtensionDays: grade?.freeExtensionDays ?? 0,
          extensionExempt: Boolean(grade?.extensionExempt)
        });

        return {
          userId: entry.id,
          name: userDisplayName(entry) || entry.name,
          email: entry.email,
          checkInScores: creditsByUserId.get(entry.id)?.checkInScoresByCycle[activeCycleNumber] ?? checkInOverrides(null),
          checkInOverrides: checkInOverrides(grade),
          finalCutState: grade?.finalCutState ?? null,
          effortPoints: totalPoints,
          teamworkPoints: grade?.teamworkPoints ?? null,
          previousEffortPoints: grade?.previousEffortPoints ?? null,
          previousTeamworkPoints: grade?.previousTeamworkPoints ?? null,
          totalPoints,
          percentage: totalPoints === null ? null : gradePercentage(totalPoints),
          revised: Boolean(grade?.revisedAt),
          revisedAt: toIso(grade?.revisedAt ?? null),
          feedback: grade?.feedback ?? "",
          turnedInDate: toDateKey(grade?.turnedInDate ?? null),
          freeExtensionDays: grade?.freeExtensionDays ?? 0,
          extensionDetails,
          published: Boolean(grade?.publishedAt),
          publishedAt: toIso(grade?.publishedAt ?? null),
          publicationHistory: serializeGradeHistory(grade?.publicationHistory ?? []),
          extensionsRemaining: calculateExtensionsRemaining(usageRows)
        };
      })
    });
  } catch (error) {
    if (error instanceof Error && error.message === "BAD_REQUEST") {
      return fail("Invalid cycle number.", 400);
    }
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);

    if (!hasPlatformRole(access.role, "EXECUTIVE_PRODUCER")) {
      throw new Error("FORBIDDEN");
    }

    await ensureDefaultCycles();

    const payload = requestSchema.parse(await request.json());
    const targetUser = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        notificationPreference: {
          select: {
            emailEnabled: true,
            notificationEmail: true,
            emailGradesEnabled: true,
            browserEnabled: true,
            browserGradesEnabled: true
          }
        },
        pushSubscriptions: {
          select: {
            id: true,
            endpoint: true,
            p256dh: true,
            auth: true
          }
        }
      }
    });

    if (!targetUser) {
      throw new Error("NOT_FOUND");
    }

    const nonGradableEmails = await loadNonGradableEmails();
    if (isExcludedFromGrading({ name: null, email: targetUser.email }, nonGradableEmails)) {
      return fail("Advisers, executive producers, and the super admin are not included in the gradebook.", 400);
    }

    if (payload.action === "setCheckIn") {
      const cycle = await prisma.packageCycle.findUnique({
        where: { cycleNumber: payload.cycleNumber },
        select: { cycleNumber: true, pitchingDate: true, proofOfContactDate: true, aRollBRollDate: true, initialCutDate: true, finalCutDate: true }
      });
      if (!cycle) throw new Error("NOT_FOUND");
      const now = new Date();
      if (!checkInDeadlinePassed(cycleCheckInDates(cycle)[payload.stage], now)) {
        return fail("This check-in is not due yet.", 400);
      }
      const { byUserId } = await loadGradeEditorCredits({ userIds: [payload.userId], cycles: [cycle], now });
      if (byUserId.get(payload.userId)?.checkInScoresByCycle[payload.cycleNumber]?.[payload.stage] == null) {
        return fail("This check-in does not apply to this student.", 400);
      }
      const field = CHECK_IN_SCORE_FIELDS[payload.stage];
      const stateField = CHECK_IN_STATE_FIELDS[payload.stage];
      const state = typeof payload.points === "string" ? payload.points : null;
      const points = typeof payload.points === "number" ? payload.points : null;
      const saved = await prisma.packageGrade.upsert({
        where: { cycleNumber_userId: { cycleNumber: payload.cycleNumber, userId: payload.userId } },
        create: { cycleNumber: payload.cycleNumber, userId: payload.userId, [field]: points, [stateField]: state },
        update: { [field]: points, [stateField]: state },
        select: { ...CHECK_IN_STATE_SELECT, pitchingPoints: true, proofOfContactPoints: true, aRollBRollPoints: true, initialCutPoints: true }
      });
      const { byUserId: updatedCredits } = await loadGradeEditorCredits({ userIds: [payload.userId], cycles: [cycle], now });
      return ok({
        checkInScores: updatedCredits.get(payload.userId)!.checkInScoresByCycle[payload.cycleNumber],
        checkInOverrides: checkInOverrides(saved)
      });
    }

    if (payload.action === "save") {
      const finalCutState = payload.finalCutState ?? (payload.effortPoints === null ? "UNGRADED" : null);
      const existing = await prisma.packageGrade.findUnique({
        where: {
          cycleNumber_userId: {
            cycleNumber: payload.cycleNumber,
            userId: payload.userId
          }
        },
        select: {
          id: true,
          effortPoints: true,
          finalCutState: true,
          teamworkPoints: true,
          awardedFinalCutPoints: true,
          revisionCount: true,
          previousEffortPoints: true,
          previousTeamworkPoints: true,
          revisedAt: true,
          feedback: true,
          turnedInDate: true,
          freeExtensionDays: true,
          publishedAt: true
        }
      });
      const turnedInDate =
        payload.turnedInDate === undefined ? (existing?.turnedInDate ?? null) : parseDateInput(payload.turnedInDate);
      const freeExtensionDays =
        payload.freeExtensionDays === undefined
          ? sanitizeFreeExtensionDays(existing?.freeExtensionDays ?? 0)
          : sanitizeFreeExtensionDays(payload.freeExtensionDays);

      const cycle = await prisma.packageCycle.findUnique({
        where: { cycleNumber: payload.cycleNumber },
        select: {
          finalCutDate: true
        }
      });

      if (turnedInDate && !cycle?.finalCutDate) {
        return fail("Final Cut date is required. Please update it in Package Cycles first.", 400);
      }

      const turnedInChanged = toDateKey(existing?.turnedInDate ?? null) !== toDateKey(turnedInDate);
      const calculatedDays = turnedInDate ? calculateExtensionDays(cycle?.finalCutDate ?? null, turnedInDate) : 0;
      const nextRevisionCount = finalCutState ? (existing?.revisionCount ?? 0) :
        existing?.awardedFinalCutPoints !== null && existing?.awardedFinalCutPoints !== undefined
          ? Math.max(existing.revisionCount, 1) + (existing.awardedFinalCutPoints !== payload.effortPoints ? 1 : 0)
          : Math.max(existing?.revisionCount ?? 0, 1);
      const cappedAwarded = capAwardedForRevision(payload.effortPoints ?? 0, nextRevisionCount);
      const progressRow = await prisma.packageProgressRow.findFirst({
        where: {
          cycleNumber: payload.cycleNumber,
          members: { some: { userId: payload.userId } }
        },
        select: {
          extension: true,
          extensionRequests: { where: { status: "APPROVED" }, select: { requestedDays: true, grantedDays: true, grantedUserIds: true } }
        }
      });
      const approvedDays = approvedExtensionDaysFor(progressRow, payload.userId);
      const deadline = effectiveDeadline(cycle?.finalCutDate ?? null, approvedDays);
      const late = calculateLatePenalty(deadline, turnedInDate);
      const officialPoints = officialFinalCutPoints(cappedAwarded, late.penaltyMultiplier);

      const nextFeedback = payload.feedback?.trim() ?? existing?.feedback ?? "";
      const changed =
        !existing ||
        (existing.finalCutState ?? null) !== finalCutState ||
        existing.effortPoints !== payload.effortPoints ||
        existing.teamworkPoints !== payload.teamworkPoints ||
        existing.feedback !== nextFeedback ||
        sanitizeFreeExtensionDays(existing?.freeExtensionDays ?? 0) !== freeExtensionDays;
      const pointsChanged =
        !existing ||
        (existing.finalCutState ?? null) !== finalCutState ||
        existing.effortPoints !== payload.effortPoints ||
        existing.teamworkPoints !== payload.teamworkPoints;
      const revisedPublishedGrade = Boolean(existing?.publishedAt) && (changed || turnedInChanged);

      const updated = await prisma.$transaction(async (tx) => {
        const saved = await tx.packageGrade.upsert({
          where: {
            cycleNumber_userId: {
              cycleNumber: payload.cycleNumber,
              userId: payload.userId
            }
          },
          update: {
            effortPoints: cappedAwarded,
            teamworkPoints: 0,
            finalCutState,
            awardedFinalCutPoints: finalCutState ? null : cappedAwarded,
            finalCutPoints: officialPoints,
            revisionCount: nextRevisionCount,
            previousEffortPoints: Boolean(existing?.publishedAt) && pointsChanged ? existing?.effortPoints ?? null : existing?.previousEffortPoints ?? null,
            previousTeamworkPoints: Boolean(existing?.publishedAt) && pointsChanged ? existing?.teamworkPoints ?? null : existing?.previousTeamworkPoints ?? null,
            revisedAt: revisedPublishedGrade ? new Date() : existing?.revisedAt ?? null,
            ...(revisedPublishedGrade ? { publishedAt: null } : {}),
            feedback: nextFeedback,
            turnedInDate,
            freeExtensionDays,
            ...(turnedInChanged
              ? {
                  extensionDaysApplied: calculatedDays,
                  extensionExempt: false
                }
              : {})
          },
          create: {
            cycleNumber: payload.cycleNumber,
            userId: payload.userId,
            effortPoints: cappedAwarded,
            teamworkPoints: 0,
            finalCutState,
            awardedFinalCutPoints: finalCutState ? null : cappedAwarded,
            finalCutPoints: officialPoints,
            revisionCount: nextRevisionCount,
            previousEffortPoints: null,
            previousTeamworkPoints: null,
            revisedAt: null,
            feedback: nextFeedback,
            turnedInDate,
            extensionDaysApplied: calculatedDays,
            freeExtensionDays,
            extensionExempt: false
          },
          select: {
            id: true
          }
        });

        if (revisedPublishedGrade) {
          await tx.packageGradeHistoryEvent.create({
            data: {
              packageGradeId: saved.id,
              eventType: "REVISED"
            }
          });
        }

        return tx.packageGrade.findUniqueOrThrow({
          where: { id: saved.id },
          select: {
            cycleNumber: true,
            userId: true,
            effortPoints: true,
            finalCutState: true,
            teamworkPoints: true,
            awardedFinalCutPoints: true,
            previousEffortPoints: true,
            previousTeamworkPoints: true,
            revisedAt: true,
            feedback: true,
            turnedInDate: true,
            extensionDaysApplied: true,
            freeExtensionDays: true,
            extensionExempt: true,
            publishedAt: true,
            publicationHistory: {
              orderBy: { occurredAt: "desc" },
              select: gradeHistorySelect
            }
          }
        });
      });

      if (existing?.publishedAt && changed && !revisedPublishedGrade) {
        const totalPoints = gradeTotal(updated.effortPoints, updated.teamworkPoints);
        await notifyGradeUser(targetUser, {
          mode: "updated",
          cycleNumber: updated.cycleNumber,
          totalPoints,
          percentage: gradePercentage(totalPoints)
        });
      }

      const extensionsRemaining = await getExtensionsRemainingForUser(payload.userId);
      return ok({
        ...serializeGrade(updated, { finalCutDate: cycle?.finalCutDate ?? null }),
        extensionsRemaining
      });
    }

    if (payload.action === "setTurnedInDate") {
      const existing = await prisma.packageGrade.findUnique({
        where: {
          cycleNumber_userId: {
            cycleNumber: payload.cycleNumber,
            userId: payload.userId
          }
        },
        select: {
          effortPoints: true,
          finalCutState: true,
          awardedFinalCutPoints: true,
          teamworkPoints: true,
          previousEffortPoints: true,
          previousTeamworkPoints: true,
          revisedAt: true,
          feedback: true,
          turnedInDate: true,
          extensionDaysApplied: true,
          freeExtensionDays: true,
          extensionExempt: true,
          publishedAt: true,
          publicationHistory: {
            orderBy: { occurredAt: "desc" },
            select: gradeHistorySelect
          }
        }
      });

      const turnedInDate = parseDateInput(payload.turnedInDate);
      const freeExtensionDays =
        payload.freeExtensionDays === undefined
          ? sanitizeFreeExtensionDays(existing?.freeExtensionDays ?? 0)
          : sanitizeFreeExtensionDays(payload.freeExtensionDays);
      const cycle = await prisma.packageCycle.findUnique({
        where: { cycleNumber: payload.cycleNumber },
        select: {
          finalCutDate: true
        }
      });

      if (turnedInDate && !cycle?.finalCutDate) {
        return fail("Final Cut date is required. Please update it in Package Cycles first.", 400);
      }

      const turnedInChanged = toDateKey(existing?.turnedInDate ?? null) !== toDateKey(turnedInDate);
      const calculatedDays = turnedInDate ? calculateExtensionDays(cycle?.finalCutDate ?? null, turnedInDate) : 0;

      const updated = await prisma.packageGrade.upsert({
        where: {
          cycleNumber_userId: {
            cycleNumber: payload.cycleNumber,
            userId: payload.userId
          }
        },
        update: {
          turnedInDate,
          freeExtensionDays,
          ...(turnedInChanged
            ? {
                extensionDaysApplied: calculatedDays,
                extensionExempt: false
              }
            : {})
        },
        create: {
          cycleNumber: payload.cycleNumber,
          userId: payload.userId,
          effortPoints: 0,
          teamworkPoints: 0,
          previousEffortPoints: null,
          previousTeamworkPoints: null,
          revisedAt: null,
          feedback: "",
          turnedInDate,
          extensionDaysApplied: calculatedDays,
          freeExtensionDays,
          extensionExempt: false,
          publishedAt: null
        },
        select: {
          cycleNumber: true,
          userId: true,
          effortPoints: true,
          finalCutState: true,
          awardedFinalCutPoints: true,
          teamworkPoints: true,
          previousEffortPoints: true,
          previousTeamworkPoints: true,
          revisedAt: true,
          feedback: true,
          turnedInDate: true,
          extensionDaysApplied: true,
          freeExtensionDays: true,
          extensionExempt: true,
          publishedAt: true,
          publicationHistory: {
            orderBy: { occurredAt: "desc" },
            select: gradeHistorySelect
          }
        }
      });

      const extensionsRemaining = await getExtensionsRemainingForUser(payload.userId);
      return ok({
        ...serializeGrade(updated, { finalCutDate: cycle?.finalCutDate ?? null }),
        extensionsRemaining
      });
    }

    if (payload.action === "setTotalNotes") {
      const saved = await prisma.packageTotalNote.upsert({
        where: { userId: payload.userId },
        update: { notes: payload.notes },
        create: { userId: payload.userId, notes: payload.notes },
        select: { userId: true, notes: true }
      });
      return ok(saved);
    }

    if (!payload.published) {
      const updated = await prisma.packageGrade.upsert({
        where: {
          cycleNumber_userId: {
            cycleNumber: payload.cycleNumber,
            userId: payload.userId
          }
        },
        update: {
          publishedAt: null
        },
        create: {
          cycleNumber: payload.cycleNumber,
          userId: payload.userId,
          effortPoints: 0,
          teamworkPoints: 0,
          previousEffortPoints: null,
          previousTeamworkPoints: null,
          revisedAt: null,
          feedback: "",
          turnedInDate: null,
          extensionDaysApplied: 0,
          freeExtensionDays: 0,
          extensionExempt: false,
          publishedAt: null
        },
        select: {
          cycleNumber: true,
          userId: true,
          effortPoints: true,
          finalCutState: true,
          awardedFinalCutPoints: true,
          teamworkPoints: true,
          previousEffortPoints: true,
          previousTeamworkPoints: true,
          revisedAt: true,
          feedback: true,
          turnedInDate: true,
          extensionDaysApplied: true,
          freeExtensionDays: true,
          extensionExempt: true,
          publishedAt: true,
          publicationHistory: {
            orderBy: { occurredAt: "desc" },
            select: gradeHistorySelect
          }
        }
      });

      const cycle = await prisma.packageCycle.findUnique({
        where: { cycleNumber: payload.cycleNumber },
        select: { finalCutDate: true }
      });
      const extensionsRemaining = await getExtensionsRemainingForUser(payload.userId);
      return ok({
        ...serializeGrade(updated, { finalCutDate: cycle?.finalCutDate ?? null }),
        extensionsRemaining
      });
    }

    const existing = await prisma.packageGrade.findUnique({
      where: {
        cycleNumber_userId: {
          cycleNumber: payload.cycleNumber,
          userId: payload.userId
        }
      }
    });

    const updated = await prisma.$transaction(async (tx) => {
      const publishedAt = new Date();
      const saved = await tx.packageGrade.upsert({
        where: {
          cycleNumber_userId: {
            cycleNumber: payload.cycleNumber,
            userId: payload.userId
          }
        },
        update: {
          publishedAt
        },
        create: {
          cycleNumber: payload.cycleNumber,
          userId: payload.userId,
          effortPoints: 0,
          teamworkPoints: 0,
          previousEffortPoints: null,
          previousTeamworkPoints: null,
          revisedAt: null,
          feedback: "",
          turnedInDate: null,
          extensionDaysApplied: 0,
          freeExtensionDays: 0,
          extensionExempt: false,
          publishedAt
        },
        select: {
          id: true
        }
      });

      await tx.packageGradeHistoryEvent.create({
        data: {
          packageGradeId: saved.id,
          eventType: "PUBLISHED"
        }
      });

      return tx.packageGrade.findUniqueOrThrow({
        where: { id: saved.id },
        select: {
          cycleNumber: true,
          userId: true,
          effortPoints: true,
          finalCutState: true,
          awardedFinalCutPoints: true,
          teamworkPoints: true,
          previousEffortPoints: true,
          previousTeamworkPoints: true,
          revisedAt: true,
          feedback: true,
          turnedInDate: true,
          extensionDaysApplied: true,
          freeExtensionDays: true,
          extensionExempt: true,
          publishedAt: true,
          publicationHistory: {
            orderBy: { occurredAt: "desc" },
            select: gradeHistorySelect
          }
        }
      });
    });

    if (!existing?.publishedAt && !updated.finalCutState && updated.awardedFinalCutPoints !== null) {
      const totalPoints = gradeTotal(updated.effortPoints, updated.teamworkPoints);
      await notifyGradeUser(targetUser, {
        mode: "published",
        cycleNumber: updated.cycleNumber,
        totalPoints,
        percentage: gradePercentage(totalPoints)
      });
    }

    const extensionsRemaining = await getExtensionsRemainingForUser(payload.userId);
    const cycle = await prisma.packageCycle.findUnique({
      where: { cycleNumber: payload.cycleNumber },
      select: { finalCutDate: true }
    });
    return ok({
      ...serializeGrade(updated, { finalCutDate: cycle?.finalCutDate ?? null }),
      extensionsRemaining
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
