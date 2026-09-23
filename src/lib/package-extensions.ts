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

const DAY_MS = 24 * 60 * 60 * 1000;

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
 * approved extension days.
 */
export function calculateLatePenalty(deadline: Date | null, turnedInAt: Date | null): LatePenalty {
  const daysLate = daysPastDeadline(deadline, turnedInAt);

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

export function applyLatePenalty(points: number, penalty: LatePenalty) {
  return Math.max(0, Math.round(points * (1 - penalty.penaltyMultiplier)));
}

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
 */
export function isExtensionGranted(
  state: ExtensionApprovalState & Partial<ExtensionMemberConsentState>
) {
  if (state.approvals.some((entry) => !entry.approved)) {
    return false;
  }

  if (state.memberUserIds) {
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

/**
 * True when a pending request needs this viewer's response: a member who has
 * not agreed yet, or a producer who may decide, after full group consent, and
 * has not voted.
 */
export function extensionRequestAwaitsUser(
  request: ExtensionMemberConsentState & {
    status: "PENDING" | "APPROVED" | "DENIED";
    approvals: Array<{ userId: string; approved: boolean }>;
    viewerMayDecide: boolean;
  },
  userId: string
) {
  if (request.status !== "PENDING") {
    return false;
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
