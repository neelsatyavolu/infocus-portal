import { isPlatformAdminEmail, normalizeEmail } from "@/src/lib/platform-admin";

export const VIEW_AS_COOKIE_NAME = "infocus_view_as";
export const VIEW_AS_MAX_AGE_SECONDS = 12 * 60 * 60;

/**
 * Parses `actor@x=target@y|target2@y;actor2@x=target@y` (env `VIEW_AS_LIMITED_ACTORS`).
 * Malformed entries are skipped.
 */
export function parseViewAsLimitedActors(raw?: string | null): Record<string, readonly string[]> {
  const grants: Record<string, readonly string[]> = {};
  for (const entry of (raw ?? "").split(";")) {
    const [actor, targets] = entry.split("=");
    const actorEmail = normalizeEmail(actor);
    const targetEmails = (targets ?? "").split("|").map(normalizeEmail).filter(Boolean);
    if (actorEmail && targetEmails.length > 0) {
      grants[actorEmail] = targetEmails;
    }
  }
  return grants;
}

/** Limited actors may View as only these emails. Super-admin may view as anyone. */
export const VIEW_AS_LIMITED_ACTORS = parseViewAsLimitedActors(process.env.VIEW_AS_LIMITED_ACTORS);

export type ViewAsToken = {
  actorUserId: string;
  targetUserId: string;
};

export function parseViewAsPayload(payload: Record<string, unknown> | null): ViewAsToken | null {
  if (
    !payload ||
    payload.v !== 1 ||
    typeof payload.actorUserId !== "string" ||
    typeof payload.targetUserId !== "string" ||
    !payload.actorUserId ||
    !payload.targetUserId
  ) {
    return null;
  }

  return {
    actorUserId: payload.actorUserId,
    targetUserId: payload.targetUserId
  };
}

export function allowedViewAsTargetEmails(actorEmail?: string | null): readonly string[] | null {
  if (isPlatformAdminEmail(actorEmail)) {
    return null;
  }
  return VIEW_AS_LIMITED_ACTORS[normalizeEmail(actorEmail)] ?? [];
}

export function canControlViewAs(email?: string | null) {
  const allowed = allowedViewAsTargetEmails(email);
  return allowed === null || allowed.length > 0;
}

export function canViewAsTarget(actorEmail?: string | null, targetEmail?: string | null) {
  const allowed = allowedViewAsTargetEmails(actorEmail);
  if (allowed === null) {
    return true;
  }
  const target = normalizeEmail(targetEmail);
  return Boolean(target) && allowed.some((email) => normalizeEmail(email) === target);
}

export function shouldApplyViewAs(input: {
  actorUserId: string;
  actorEmail: string | null;
  token: ViewAsToken | null;
  targetEmail?: string | null;
}) {
  if (!input.token) {
    return false;
  }

  if (!canControlViewAs(input.actorEmail)) {
    return false;
  }

  if (input.token.actorUserId !== input.actorUserId) {
    return false;
  }

  if (input.token.targetUserId === input.actorUserId) {
    return false;
  }

  if (input.targetEmail !== undefined && !canViewAsTarget(input.actorEmail, input.targetEmail)) {
    return false;
  }

  return true;
}
