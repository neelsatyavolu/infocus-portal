import { type PlatformRole } from "@prisma/client";
import {
  hasPlatformRole,
  normalizeEmail,
  PACKAGE_ADVISER_EMAIL,
  PLATFORM_SUPER_ADMIN_EMAIL
} from "@/src/lib/platform-admin";

export type ProposedParticipationEntry = {
  userId: string;
  dateKey: string;
  points: number;
  notes: string;
};

export type LiveParticipationEntry = {
  userId: string;
  dateKey: string;
  points: number;
  notes: string;
};

export function participationCellKey(userId: string, dateKey: string) {
  return `${userId}:${dateKey}`;
}

/** Last write for a (student, day) wins. */
export function dedupeParticipationEntries<T extends { userId: string; dateKey: string }>(
  entries: T[]
): T[] {
  const byKey = new Map<string, T>();
  for (const entry of entries) {
    byKey.set(participationCellKey(entry.userId, entry.dateKey), entry);
  }
  return [...byKey.values()];
}

/** Only cells that differ from live scores (or are new) go into a request. */
export function changedParticipationEntries(
  proposed: ProposedParticipationEntry[],
  live: LiveParticipationEntry[]
): ProposedParticipationEntry[] {
  const liveByKey = new Map(
    live.map((entry) => [participationCellKey(entry.userId, entry.dateKey), entry])
  );

  return dedupeParticipationEntries(proposed).filter((entry) => {
    const current = liveByKey.get(participationCellKey(entry.userId, entry.dateKey));
    if (!current) {
      return true;
    }
    return current.points !== entry.points || (current.notes ?? "") !== (entry.notes ?? "");
  });
}

/** Docked scores need a second producer. Full marks (including 0/0 days) post immediately. */
export function participationNeedsApproval(points: number, maxPoints: number) {
  return points < maxPoints;
}

export function splitParticipationChanges<T extends { points: number; maxPoints: number }>(
  entries: T[]
): { autoApply: T[]; needsApproval: T[] } {
  const autoApply: T[] = [];
  const needsApproval: T[] = [];
  for (const entry of entries) {
    if (participationNeedsApproval(entry.points, entry.maxPoints)) {
      needsApproval.push(entry);
    } else {
      autoApply.push(entry);
    }
  }
  return { autoApply, needsApproval };
}

export function participationItemsChanged(
  previous: ProposedParticipationEntry[],
  next: ProposedParticipationEntry[]
) {
  if (previous.length !== next.length) {
    return true;
  }

  const prevByKey = new Map(
    previous.map((entry) => [participationCellKey(entry.userId, entry.dateKey), entry])
  );

  return next.some((entry) => {
    const match = prevByKey.get(participationCellKey(entry.userId, entry.dateKey));
    if (!match) {
      return true;
    }
    return match.points !== entry.points || (match.notes ?? "") !== (entry.notes ?? "");
  });
}

export function canReviewParticipationRequest(input: {
  reviewerUserId: string;
  requesterUserId: string;
  reviewerRole: PlatformRole | null;
}): { ok: true } | { ok: false; reason: "forbidden" | "self" } {
  if (!hasPlatformRole(input.reviewerRole, "ASSOCIATE_PRODUCER")) {
    return { ok: false, reason: "forbidden" };
  }
  if (input.reviewerUserId === input.requesterUserId) {
    return { ok: false, reason: "self" };
  }
  return { ok: true };
}

/** Adviser + other execs + super-admin, minus the person who submitted the scores. */
export function participationApprovalMailRecipients(input: {
  requesterEmail?: string | null;
  execEmails: string[];
}) {
  const requester = normalizeEmail(input.requesterEmail);
  const emails = new Set(
    [...input.execEmails, PLATFORM_SUPER_ADMIN_EMAIL, PACKAGE_ADVISER_EMAIL]
      .map((email) => normalizeEmail(email))
      .filter(Boolean)
  );
  if (requester) {
    emails.delete(requester);
  }
  return [...emails];
}
