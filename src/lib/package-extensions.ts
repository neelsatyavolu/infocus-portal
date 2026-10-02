import { finalCutClosesAt, pacificDateKey } from "@/src/lib/deadlines";

/**
 * Extension policy for 2026-27.
 *
 * The 14-day allowance pool is abolished. Extensions are granted only on
 * request, at producer discretion, and require two producer approvals.
 * A request covers the whole package group: every group member must agree
 * before producers may approve. Turning a package in past the extension
 * deadline costs 20%; more than 14 days past costs 30% and cannot be repaired
 * by a second revision.
 */
export const REQUIRED_EXTENSION_APPROVALS = 2;
/** Window event fired after a member or producer responds, so the sidebar badge refreshes. */
export const EXTENSION_REQUESTS_CHANGED_EVENT = "infocus-extension-requests-changed";
export const LATE_PENALTY_MULTIPLIER = 0.2;
export const SEVERELY_LATE_PENALTY_MULTIPLIER = 0.3;
export const SEVERELY_LATE_THRESHOLD_DAYS = 14;
/** Extension days allow one decimal place: 0.1 day (2.4 hours) up to 30 days. */
export const MIN_EXTENSION_DAYS = 0.1;
export const MAX_EXTENSION_DAYS = 30;
export const EXTENSION_DAYS_ERROR = "Days must be 0.1 to 30, with at most one decimal place.";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Rounds to the one decimal place extension days allow. */
export function roundExtensionDays(days: number) {
  return Math.round(days * 10) / 10;
}

export function isValidExtensionDays(days: number) {
  return (
    Number.isFinite(days) &&
    days >= MIN_EXTENSION_DAYS &&
    days <= MAX_EXTENSION_DAYS &&
    roundExtensionDays(days) === days
  );
}

/** Clamps a typed value into the allowed range for day inputs. */
export function clampExtensionDays(value: number) {
  if (!Number.isFinite(value)) {
    return MIN_EXTENSION_DAYS;
  }
  return Math.min(MAX_EXTENSION_DAYS, Math.max(MIN_EXTENSION_DAYS, roundExtensionDays(value)));
}

export type LatePenalty = {
  /** Fraction of the grade deducted, e.g. 0.2 for a 20% reduction. */
  penaltyMultiplier: number;
  daysLate: number;
  /** True once a second revision can no longer repair the deduction. */
  blocksSecondRevision: boolean;
};

export function daysPastDeadline(deadline: Date | null, turnedInAt: Date | null) {
  if (!deadline || !turnedInAt) {
    return 0;
  }

  const diff = Math.floor((turnedInAt.getTime() - deadline.getTime()) / DAY_MS);
  return diff > 0 ? diff : 0;
}

/**
 * `deadline` is the student's effective deadline: the final cut date plus any
 * approved extension days. `turnedInAt` is a whole turn-in day, so a fractional
 * extension that closes partway through that day is judged by `uploadedAt`,
 * the Final Cut upload time, when the upload falls on the turn-in day.
 */
export function calculateLatePenalty(
  deadline: Date | null,
  turnedInAt: Date | null,
  uploadedAt?: Date | null
): LatePenalty {
  const daysLate =
    daysPastDeadline(deadline, turnedInAt) || (uploadedPastClose(deadline, turnedInAt, uploadedAt) ? 1 : 0);

  if (daysLate <= 0) {
    return { penaltyMultiplier: 0, daysLate: 0, blocksSecondRevision: false };
  }

  if (daysLate > SEVERELY_LATE_THRESHOLD_DAYS) {
    return {
      penaltyMultiplier: SEVERELY_LATE_PENALTY_MULTIPLIER,
      daysLate,
      blocksSecondRevision: true
    };
  }

  return { penaltyMultiplier: LATE_PENALTY_MULTIPLIER, daysLate, blocksSecondRevision: false };
}

function uploadedPastClose(deadline: Date | null, turnedInAt: Date | null, uploadedAt: Date | null | undefined) {
  if (!deadline || !turnedInAt || !uploadedAt) {
    return false;
  }
  return (
    pacificDateKey(uploadedAt) === turnedInAt.toISOString().slice(0, 10) &&
    uploadedAt.getTime() > finalCutClosesAt(deadline).getTime()
  );
}

/** Percentages an exec can set in place of a member's automatic late penalty. */
export const LATE_PENALTY_OVERRIDE_PERCENTS = [5, 10, 15, 20, 30] as const;

export function isLatePenaltyOverridePercent(value: number) {
  return (LATE_PENALTY_OVERRIDE_PERCENTS as readonly number[]).includes(value);
}

/** A member's penalty: the exec's override when set, otherwise the automatic one. */
export function memberLatePenaltyMultiplier(automatic: LatePenalty, overridePercent: number | null | undefined) {
  return overridePercent == null ? automatic.penaltyMultiplier : overridePercent / 100;
}

export function applyLatePenalty(points: number, penalty: LatePenalty) {
  return Math.max(0, Math.round(points * (1 - penalty.penaltyMultiplier)));
}

/**
 * A fractional extension leaves a time-of-day offset on the returned date;
 * `deadlineClosesAt` adds that offset to the 11:59 PM Pacific close.
 */
export function effectiveDeadline(finalCutDate: Date | null, approvedExtensionDays: number) {
  if (!finalCutDate) {
    return null;
  }

  // Always return a copy so callers cannot mutate the caller's date in place.
  if (approvedExtensionDays <= 0) {
    return new Date(finalCutDate.getTime());
  }

  return new Date(finalCutDate.getTime() + approvedExtensionDays * DAY_MS);
}

export type ExtensionApprovalState = {
  approvals: Array<{ userId: string; approved: boolean }>;
};

export type ExtensionMemberConsentState = {
  /** All user ids on the package group when the request was filed / evaluated. */
  memberUserIds: string[];
  consents: Array<{ userId: string; agreed: boolean }>;
};

/**
 * Every current group member must have an affirmative consent record.
 * Empty groups are not consent-complete (a request needs a real group).
 */
export function isGroupConsentComplete(state: ExtensionMemberConsentState) {
  if (state.memberUserIds.length === 0) {
    return false;
  }

  if (state.consents.some((entry) => !entry.agreed)) {
    return false;
  }

  const agreed = new Set(
    state.consents.filter((entry) => entry.agreed).map((entry) => entry.userId)
  );

  return state.memberUserIds.every((userId) => agreed.has(userId));
}

export function hasMemberDisagreed(state: ExtensionMemberConsentState) {
  return state.consents.some((entry) => !entry.agreed);
}

/**
 * A request is granted once the whole group has consented and two distinct
 * producers approve it. A single denial (member or producer) is enough to stop it.
 * Producer grants skip member consent; the creating exec's approval counts as one.
 */
export function isExtensionGranted(
  state: ExtensionApprovalState &
    Partial<ExtensionMemberConsentState> & { producerGranted?: boolean }
) {
  if (state.approvals.some((entry) => !entry.approved)) {
    return false;
  }

  if (state.memberUserIds && !state.producerGranted) {
    if (
      !isGroupConsentComplete({
        memberUserIds: state.memberUserIds,
        consents: state.consents ?? []
      })
    ) {
      return false;
    }
  }

  const distinctApprovers = new Set(
    state.approvals.filter((entry) => entry.approved).map((entry) => entry.userId)
  );

  return distinctApprovers.size >= REQUIRED_EXTENSION_APPROVALS;
}

/**
 * Terms of an approved request. `grantedDays` null means the requested days
 * (legacy rows); empty `grantedUserIds` means the whole group.
 */
export type ExtensionGrant = {
  requestedDays: number;
  grantedDays: number | null;
  grantedUserIds: string[];
};

function grantCoversUser(grant: ExtensionGrant, userId: string) {
  return grant.grantedUserIds.length === 0 || grant.grantedUserIds.includes(userId);
}

/**
 * Approved extension days for one group member, or the longest grant on the
 * group when `userId` is omitted (group-level displays).
 */
export function approvedExtensionDaysFor(
  row: { extension: boolean; extensionRequests: ExtensionGrant[] } | null | undefined,
  userId?: string
) {
  if (!row?.extension) {
    return 0;
  }

  return row.extensionRequests
    .filter((grant) => userId === undefined || grantCoversUser(grant, userId))
    .reduce((longest, grant) => Math.max(longest, grant.grantedDays ?? grant.requestedDays), 0);
}

/** Students see a request only if its terms cover them; a partial grant stays hidden from everyone else. */
export function extensionRequestVisibleTo(request: { grantedUserIds: string[] }, userId: string) {
  return request.grantedUserIds.length === 0 || request.grantedUserIds.includes(userId);
}

/** True when the group's extension applies to this member. A legacy flag with no approved requests covers everyone. */
export function extensionCoversUser(
  row: { extension: boolean; extensionRequests: ExtensionGrant[] },
  userId: string
) {
  return (
    row.extension &&
    (row.extensionRequests.length === 0 || row.extensionRequests.some((grant) => grantCoversUser(grant, userId)))
  );
}

/** Extension for shared screens (Class Board): whole-group grants only, so a partial grant never shows. */
export function groupWideExtension(row: { extension: boolean; extensionRequests: ExtensionGrant[] }) {
  const wholeGroup = row.extensionRequests.filter((grant) => grant.grantedUserIds.length === 0);
  const extension = row.extension && (row.extensionRequests.length === 0 || wholeGroup.length > 0);
  return {
    extension,
    days: extension ? approvedExtensionDaysFor({ extension, extensionRequests: wholeGroup }) : 0
  };
}

/** Badge text for a group's extension; falls back when no approved days are on record. */
export function extensionBadgeLabel(days: number | undefined, dueIn?: string | null) {
  const label = days && days > 0 ? `${days} Day Extension` : "Extension";
  return dueIn ? `${label} - Due in ${dueIn}` : label;
}

/** Time left before the extended Final Cut closes: whole days ("3D"), or hours under a day ("5H"). Null once closed. */
export function extensionDueIn(finalCutDate: Date | null, extensionDays: number, now: Date) {
  const deadline = effectiveDeadline(finalCutDate, extensionDays);
  if (!deadline) return null;
  const leftMs = finalCutClosesAt(deadline).getTime() - now.getTime();
  if (leftMs <= 0) return null;
  return leftMs >= DAY_MS ? `${Math.floor(leftMs / DAY_MS)}D` : `${Math.ceil(leftMs / HOUR_MS)}H`;
}

/**
 * Validates the first producer approval's terms. Selecting every member is
 * stored as the whole group so later roster changes stay covered.
 */
export function resolveGrantTerms(input: {
  requestedDays: number;
  memberUserIds: string[];
  grantedDays?: number;
  grantedUserIds?: string[];
}) {
  const grantedDays = input.grantedDays ?? input.requestedDays;
  if (input.grantedUserIds === undefined) {
    return { grantedDays, grantedUserIds: [] as string[] };
  }

  const selected = [...new Set(input.grantedUserIds)].sort();
  if (selected.length === 0) {
    throw new Error("Pick at least one group member to grant the extension to.");
  }
  if (selected.some((userId) => !input.memberUserIds.includes(userId))) {
    throw new Error("A selected student is not in this group.");
  }

  const wholeGroup = input.memberUserIds.every((userId) => selected.includes(userId));
  return { grantedDays, grantedUserIds: wholeGroup ? [] : selected };
}

/** A producer must say why they deny an extension. Approvals store no reason. */
export function denialReasonFor(approved: boolean, reason: string | undefined) {
  if (approved) {
    return "";
  }

  const trimmed = reason?.trim() ?? "";
  if (!trimmed) {
    throw new Error("Add a reason for denying this extension.");
  }
  return trimmed;
}

/**
 * True when a pending request needs this viewer's response: a member who has
 * not agreed yet, or a producer who may decide, after full group consent, and
 * has not voted. Producer grants never wait on members.
 */
export function extensionRequestAwaitsUser(
  request: ExtensionMemberConsentState & {
    status: "PENDING" | "APPROVED" | "DENIED";
    approvals: Array<{ userId: string; approved: boolean }>;
    viewerMayDecide: boolean;
    producerGranted?: boolean;
  },
  userId: string
) {
  if (request.status !== "PENDING") {
    return false;
  }

  if (request.producerGranted) {
    return request.viewerMayDecide && !request.approvals.some((entry) => entry.userId === userId);
  }

  if (request.memberUserIds.includes(userId)) {
    return !request.consents.some((entry) => entry.userId === userId && entry.agreed);
  }

  return (
    request.viewerMayDecide &&
    isGroupConsentComplete(request) &&
    !request.approvals.some((entry) => entry.userId === userId)
  );
}
