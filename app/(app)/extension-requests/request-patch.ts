import { isGroupConsentComplete } from "@/src/lib/package-extensions";
import type { ExtensionRequest, Payload, RequestStatus } from "./request-view";

/**
 * The list with one request changed to what a saved vote made it, so the page can show the
 * decision and open the next request before the quiet reload brings the server's copy. The
 * PATCH answers with the request's new status only; the viewer's own vote is filled in here
 * (granted terms are left to the reload, which has the server's normalized copy).
 */
function patchRequest(payload: Payload, requestId: string, change: (entry: ExtensionRequest) => ExtensionRequest): Payload {
  return {
    ...payload,
    requests: payload.requests.map((entry) => (entry.id === requestId ? change(entry) : entry))
  };
}

function decided(entry: ExtensionRequest, status: RequestStatus, at: string): ExtensionRequest {
  return { ...entry, status, decidedAt: status === "PENDING" ? entry.decidedAt : at };
}

/** A group member agreed or declined (declining denies the request). */
export function withMemberVote(
  payload: Payload,
  input: { requestId: string; agreed: boolean; status: RequestStatus; at: string }
): Payload {
  const me = payload.currentUserId;
  return patchRequest(payload, input.requestId, (entry) => {
    const mine = entry.memberConsents.find((consent) => consent.userId === me);
    const memberConsents = [
      ...entry.memberConsents.filter((consent) => consent.userId !== me),
      { userId: me, agreed: input.agreed, name: mine?.name ?? null, createdAt: mine?.createdAt ?? input.at }
    ];
    const memberConsentComplete = isGroupConsentComplete({
      memberUserIds: entry.groupMembers.map((member) => member.userId),
      consents: memberConsents
    });
    return decided({ ...entry, memberConsents, memberConsentComplete }, input.status, input.at);
  });
}

/** A producer approved, granted or denied. */
export function withProducerVote(
  payload: Payload,
  input: {
    requestId: string;
    approved: boolean;
    reason?: string;
    grantWithoutAgreement?: boolean;
    status: RequestStatus;
    at: string;
  }
): Payload {
  const me = payload.currentUserId;
  return patchRequest(payload, input.requestId, (entry) => {
    const mine = entry.approvals.find((approval) => approval.userId === me);
    const approvals = [
      ...entry.approvals.filter((approval) => approval.userId !== me),
      {
        userId: me,
        approved: input.approved,
        reason: input.approved ? "" : (input.reason ?? ""),
        name: mine?.name ?? null,
        createdAt: input.at
      }
    ];
    return decided(
      {
        ...entry,
        approvals,
        producerGranted: entry.producerGranted || Boolean(input.approved && input.grantWithoutAgreement)
      },
      input.status,
      input.at
    );
  });
}
