import { PlatformRole, type Prisma } from "@prisma/client";
import { toDateKey } from "@/src/lib/extensions";
import { sendParticipationGradeRequestEmails } from "@/src/lib/email";
import { participationPointsForDate } from "@/src/lib/grading";
import { mainAppOrigin } from "@/src/lib/hosts";
import {
  canReviewParticipationRequest,
  changedParticipationEntries,
  participationApprovalMailRecipients,
  participationCellKey,
  splitParticipationChanges,
  type ProposedParticipationEntry
} from "@/src/lib/participation-grade-requests";
import { getPlatformAccess, hasPlatformRole, normalizeEmail } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import { userDisplayName } from "@/src/lib/user-display";

type Actor = {
  id: string;
  email: string | null;
  name: string | null;
};

type ProposedCell = {
  userId: string;
  date: Date;
  points: number;
  notes: string;
};

function toProposed(entry: ProposedCell): ProposedParticipationEntry {
  return {
    userId: entry.userId,
    dateKey: toDateKey(entry.date) ?? "",
    points: entry.points,
    notes: entry.notes
  };
}

async function requireProducer(actor: Actor) {
  const access = await getPlatformAccess(actor.email);
  if (!hasPlatformRole(access.role, "ASSOCIATE_PRODUCER")) {
    throw new Error("FORBIDDEN");
  }
  return access;
}

function utcDateFromKey(dateKey: string) {
  return new Date(`${dateKey}T00:00:00.000Z`);
}

async function dropPendingCells(
  tx: Prisma.TransactionClient,
  cells: Array<{ userId: string; dateKey: string }>,
  exceptRequestId?: string
) {
  if (cells.length === 0) {
    return;
  }

  const overlapping = await tx.participationGradeRequestItem.findMany({
    where: {
      request: {
        status: "PENDING",
        ...(exceptRequestId ? { id: { not: exceptRequestId } } : {})
      },
      OR: cells.map((entry) => ({
        userId: entry.userId,
        date: utcDateFromKey(entry.dateKey)
      }))
    },
    select: { id: true, requestId: true }
  });
  if (overlapping.length === 0) {
    return;
  }

  await tx.participationGradeRequestItem.deleteMany({
    where: { id: { in: overlapping.map((item) => item.id) } }
  });

  const requestIds = [...new Set(overlapping.map((item) => item.requestId))];
  for (const requestId of requestIds) {
    const remaining = await tx.participationGradeRequestItem.count({ where: { requestId } });
    if (remaining === 0) {
      await tx.participationGradeRequest.delete({ where: { id: requestId } });
    }
  }
}

async function upsertLiveEntries(
  tx: Prisma.TransactionClient,
  entries: ProposedParticipationEntry[]
) {
  for (const entry of entries) {
    const date = utcDateFromKey(entry.dateKey);
    await tx.participationEntry.upsert({
      where: { userId_date: { userId: entry.userId, date } },
      update: { points: entry.points, notes: entry.notes },
      create: {
        userId: entry.userId,
        date,
        points: entry.points,
        notes: entry.notes
      }
    });
  }
}

export async function listParticipationGradeRequests(actor: Actor) {
  const access = await requireProducer(actor);

  const requests = await prisma.participationGradeRequest.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "desc" },
    include: {
      requestedBy: { select: { id: true, name: true, nickname: true, email: true } },
      items: {
        orderBy: [{ date: "asc" }],
        include: { user: { select: { id: true, name: true, nickname: true, email: true } } }
      }
    }
  });

  const itemDates = requests.flatMap((request) => request.items.map((item) => item.date));
  const itemUserIds = [...new Set(requests.flatMap((request) => request.items.map((item) => item.userId)))];
  const live =
    itemDates.length === 0
      ? []
      : await prisma.participationEntry.findMany({
          where: { userId: { in: itemUserIds }, date: { in: itemDates } }
        });

  const liveByKey = new Map(
    live.map((entry) => [
      participationCellKey(entry.userId, toDateKey(entry.date) ?? ""),
      entry
    ])
  );

  return {
    currentUserId: actor.id,
    requests: requests.map((request) => {
      const review = canReviewParticipationRequest({
        reviewerUserId: actor.id,
        requesterUserId: request.requestedById,
        reviewerRole: access.role
      });
      return {
        id: request.id,
        createdAt: request.createdAt.toISOString(),
        updatedAt: request.updatedAt.toISOString(),
        requestedBy: request.requestedBy,
        canReview: review.ok,
        items: request.items.map((item) => {
          const dateKey = toDateKey(item.date) ?? "";
          const current = liveByKey.get(participationCellKey(item.userId, dateKey));
          return {
            userId: item.userId,
            studentName: userDisplayName(item.user) || item.user.name,
            studentEmail: item.user.email,
            date: dateKey,
            points: item.points,
            notes: item.notes,
            currentPoints: current?.points ?? null,
            currentNotes: current?.notes ?? ""
          };
        })
      };
    })
  };
}

export async function pendingParticipationOverlay(range: { start: Date; end: Date }) {
  const [items, pendingCount] = await Promise.all([
    prisma.participationGradeRequestItem.findMany({
      where: {
        request: { status: "PENDING" },
        date: { gte: range.start, lt: range.end }
      },
      include: {
        request: {
          select: {
            id: true,
            requestedById: true,
            requestedBy: { select: { id: true, name: true, nickname: true, email: true } }
          }
        }
      }
    }),
    prisma.participationGradeRequest.count({ where: { status: "PENDING" } })
  ]);

  return {
    pendingCount,
    pendingItems: items.map((item) => ({
      requestId: item.requestId,
      userId: item.userId,
      date: toDateKey(item.date) ?? "",
      points: item.points,
      notes: item.notes,
      requestedBy: item.request.requestedBy
    }))
  };
}

export async function submitParticipationGradeRequest(actor: Actor, cells: ProposedCell[]) {
  await requireProducer(actor);

  const proposed = cells.map(toProposed).filter((entry) => entry.dateKey);
  if (proposed.length === 0) {
    return { saved: 0, pending: false as const, itemCount: 0, requestId: null as string | null, emailed: false };
  }

  const liveRows = await prisma.participationEntry.findMany({
    where: {
      OR: proposed.map((entry) => ({
        userId: entry.userId,
        date: utcDateFromKey(entry.dateKey)
      }))
    }
  });

  const changed = changedParticipationEntries(
    proposed,
    liveRows.map((entry) => ({
      userId: entry.userId,
      dateKey: toDateKey(entry.date) ?? "",
      points: entry.points,
      notes: entry.notes
    }))
  );

  if (changed.length === 0) {
    return { saved: 0, pending: false as const, itemCount: 0, requestId: null as string | null, emailed: false };
  }

  const { autoApply, needsApproval } = splitParticipationChanges(
    changed.map((entry) => ({
      ...entry,
      maxPoints: participationPointsForDate(utcDateFromKey(entry.dateKey))
    }))
  );

  const result = await prisma.$transaction(async (tx) => {
    if (autoApply.length > 0) {
      await upsertLiveEntries(tx, autoApply);
      await dropPendingCells(tx, autoApply);
    }

    if (needsApproval.length === 0) {
      return { requestId: null as string | null, itemCount: 0, shouldEmail: false };
    }

    const existing = await tx.participationGradeRequest.findFirst({
      where: { requestedById: actor.id, status: "PENDING" },
      select: { id: true }
    });

    const request =
      existing ??
      (await tx.participationGradeRequest.create({
        data: { requestedById: actor.id },
        select: { id: true }
      }));

    await dropPendingCells(tx, needsApproval, request.id);

    for (const entry of needsApproval) {
      await tx.participationGradeRequestItem.upsert({
        where: {
          requestId_userId_date: {
            requestId: request.id,
            userId: entry.userId,
            date: utcDateFromKey(entry.dateKey)
          }
        },
        update: { points: entry.points, notes: entry.notes },
        create: {
          requestId: request.id,
          userId: entry.userId,
          date: utcDateFromKey(entry.dateKey),
          points: entry.points,
          notes: entry.notes
        }
      });
    }

    await tx.participationGradeRequest.update({
      where: { id: request.id },
      data: { updatedAt: new Date() }
    });

    return {
      requestId: request.id,
      itemCount: needsApproval.length,
      shouldEmail: true
    };
  });

  let emailed = false;
  if (result.shouldEmail) {
    emailed = await notifyParticipationGradeRequest({
      requesterName: actor.name?.trim() || actor.email || "A producer",
      requesterEmail: actor.email,
      itemCount: result.itemCount
    });
  }

  return {
    saved: autoApply.length,
    pending: needsApproval.length > 0,
    itemCount: result.itemCount,
    requestId: result.requestId,
    emailed
  };
}

export async function decideParticipationGradeRequest(
  actor: Actor,
  input: { requestId: string; approved: boolean }
) {
  const access = await requireProducer(actor);

  await prisma.$transaction(async (tx) => {
    const request = await tx.participationGradeRequest.findUnique({
      where: { id: input.requestId },
      include: { items: true }
    });
    if (!request) {
      throw new Error("NOT_FOUND");
    }
    if (request.status !== "PENDING") {
      throw new Error("This request was already reviewed.");
    }

    const review = canReviewParticipationRequest({
      reviewerUserId: actor.id,
      requesterUserId: request.requestedById,
      reviewerRole: access.role
    });
    if (!review.ok) {
      throw new Error(
        review.reason === "self"
          ? "Another producer has to approve these grades."
          : "FORBIDDEN"
      );
    }

    if (input.approved) {
      for (const item of request.items) {
        await tx.participationEntry.upsert({
          where: { userId_date: { userId: item.userId, date: item.date } },
          update: { points: item.points, notes: item.notes },
          create: {
            userId: item.userId,
            date: item.date,
            points: item.points,
            notes: item.notes
          }
        });
      }
    }

    await tx.participationGradeRequest.update({
      where: { id: request.id },
      data: {
        status: input.approved ? "APPROVED" : "DENIED",
        reviewedById: actor.id,
        reviewedAt: new Date()
      }
    });
  });

  return { approved: input.approved };
}

async function notifyParticipationGradeRequest(input: {
  requesterName: string;
  requesterEmail: string | null;
  itemCount: number;
}) {
  const assignments = await prisma.platformRoleAssignment.findMany({
    where: {
      role: {
        in: [PlatformRole.EXECUTIVE_PRODUCER, PlatformRole.ADVISER, PlatformRole.SUPER_ADMIN]
      }
    },
    select: { email: true }
  });

  const staffEmails = participationApprovalMailRecipients({
    requesterEmail: input.requesterEmail,
    execEmails: assignments.map((entry) => entry.email)
  });
  if (staffEmails.length === 0) {
    return false;
  }

  const users = await prisma.user.findMany({
    where: { email: { in: staffEmails, mode: "insensitive" } },
    select: {
      email: true,
      notificationPreference: { select: { notificationEmail: true } }
    }
  });
  const preferredByAccount = new Map(
    users.map((user) => [
      normalizeEmail(user.email),
      normalizeEmail(user.notificationPreference?.notificationEmail) || normalizeEmail(user.email)
    ])
  );
  const requester = normalizeEmail(input.requesterEmail);
  const recipients = [
    ...new Set(
      staffEmails
        .map((email) => preferredByAccount.get(normalizeEmail(email)) || normalizeEmail(email))
        .filter((email) => email && email !== requester)
    )
  ];
  if (recipients.length === 0) {
    return false;
  }

  try {
    const result = await sendParticipationGradeRequestEmails({
      recipients,
      requesterName: input.requesterName,
      itemCount: input.itemCount,
      reviewUrl: `${mainAppOrigin()}/participation`
    });
    return result.configured && result.sent > 0;
  } catch (error) {
    console.error("sendParticipationGradeRequestEmails failed", error);
    return false;
  }
}
