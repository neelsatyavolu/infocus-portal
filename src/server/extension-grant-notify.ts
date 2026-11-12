import { sendBrandedEmails } from "@/src/lib/email";
import { mainAppOrigin } from "@/src/lib/hosts";
import { extensionRequestVisibleTo, isGroupConsentComplete } from "@/src/lib/package-extensions";
import {
  normalizeEmail,
  PACKAGE_ADVISER_EMAIL,
  PLATFORM_SUPER_ADMIN_EMAIL
} from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import { userDisplayName } from "@/src/lib/user-display";

const EXTENSION_REQUESTS_PATH = "/extension-requests";

function extensionRequestsUrl() {
  return `${mainAppOrigin().replace(/\/+$/, "")}${EXTENSION_REQUESTS_PATH}`;
}

function dayLabel(days: number) {
  return `${days} ${days === 1 ? "day" : "days"}`;
}

async function loadGrant(requestId: string) {
  return prisma.packageExtensionRequest.findUnique({
    where: { id: requestId },
    include: {
      user: { select: { id: true, name: true, nickname: true, email: true } },
      approvals: {
        select: {
          approved: true,
          reason: true,
          user: { select: { name: true, nickname: true, email: true } }
        }
      },
      memberConsents: { select: { agreed: true } },
      progressRow: {
        select: {
          groupTopic: true,
          members: {
            select: {
              user: {
                select: {
                  id: true,
                  name: true,
                  nickname: true,
                  email: true,
                  notificationPreference: { select: { notificationEmail: true } }
                }
              }
            }
          }
        }
      }
    }
  });
}

type LoadedGrant = NonNullable<Awaited<ReturnType<typeof loadGrant>>>;

function grantSummary(grant: LoadedGrant) {
  const days = grant.grantedDays ?? grant.requestedDays;
  const topic = grant.progressRow?.groupTopic ? ` (“${grant.progressRow.groupTopic}”)` : "";
  return { days, topic };
}

/** Emails every other exec that a new producer grant needs their approval. */
export async function notifyExecsOfExtensionGrant(requestId: string) {
  const grant = await loadGrant(requestId);
  if (!grant) return;

  const assignments = await prisma.platformRoleAssignment.findMany({
    where: { role: { in: ["EXECUTIVE_PRODUCER", "SUPER_ADMIN", "ADVISER"] } },
    select: { email: true }
  });
  // The granting exec's approval is the only one so far; on a granted student request,
  // grant.user is the student who filed it.
  const granter = grant.approvals.find((approval) => approval.approved)?.user ?? grant.user;
  const creatorEmail = normalizeEmail(granter.email);
  const memberEmails = new Set(
    (grant.progressRow?.members ?? []).map((member) => normalizeEmail(member.user.email))
  );
  const recipients = [
    ...new Set(
      [...assignments.map((entry) => entry.email), PLATFORM_SUPER_ADMIN_EMAIL, PACKAGE_ADVISER_EMAIL]
        .map((email) => normalizeEmail(email))
        .filter((email) => email && email !== creatorEmail && !memberEmails.has(email))
    )
  ];

  const { days, topic } = grantSummary(grant);
  const creator = userDisplayName(granter) || granter.email || "An executive producer";
  try {
    await sendBrandedEmails({
      recipients,
      subject: `Approve a ${dayLabel(days)} extension for Cycle ${grant.cycleNumber}`,
      heading: "Extension needs your approval",
      paragraphs: [
        `${creator} granted a ${dayLabel(days)} extension to a Cycle ${grant.cycleNumber} group${topic}.`,
        ...(grant.reason ? [`Reason: ${grant.reason}`] : []),
        "One more executive producer must approve it before it takes effect."
      ],
      ctaLabel: "Review extension",
      ctaUrl: extensionRequestsUrl()
    });
  } catch (error) {
    console.error("extension grant exec email failed", error);
  }
}

/**
 * A student filed a request: email the groupmates who still need to agree (the requester
 * agreed by filing it). Producers hear about it once everyone has agreed.
 */
export async function notifyGroupOfExtensionRequest(requestId: string) {
  const grant = await loadGrant(requestId);
  if (!grant || grant.status !== "PENDING" || grant.producerGranted) return null;

  const agreed = new Set(
    (await prisma.packageExtensionMemberConsent.findMany({
      where: { requestId, agreed: true },
      select: { userId: true }
    })).map((consent) => consent.userId)
  );
  const waiting = (grant.progressRow?.members ?? []).filter(
    (member) => member.user.email && !agreed.has(member.user.id) && member.user.id !== grant.user.id
  );
  const recipients = memberEmails(waiting);
  if (recipients.length === 0) return null;

  const { topic } = grantSummary(grant);
  const requester = userDisplayName(grant.user) || "A groupmate";
  try {
    return await sendBrandedEmails({
      recipients,
      subject: `${requester} asked for a ${dayLabel(grant.requestedDays)} extension for Cycle ${grant.cycleNumber}`,
      heading: "Your group asked for an extension",
      paragraphs: [
        `${requester} asked producers for a ${dayLabel(grant.requestedDays)} extension on your Cycle ${grant.cycleNumber} package${topic}.`,
        ...(grant.reason ? [`Reason: ${grant.reason}`] : []),
        "Every member has to agree before producers can review it. Declining denies the request."
      ],
      ctaLabel: "Agree or decline",
      ctaUrl: extensionRequestsUrl(),
      idempotencyKey: `extension-request-created/${requestId}`
    });
  } catch (error) {
    console.error("extension request group email failed", error);
    return null;
  }
}

/**
 * Producers who can vote on a student request: the group's assigned producer and every exec
 * (EP, adviser, super admin), minus members of the group.
 */
export function extensionDeciderEmails(input: {
  execEmails: Array<string | null | undefined>;
  assignedProducerEmail?: string | null;
  memberEmails: Array<string | null | undefined>;
}) {
  const members = new Set(input.memberEmails.map((email) => normalizeEmail(email)).filter(Boolean));
  return [
    ...new Set(
      [input.assignedProducerEmail, ...input.execEmails, PLATFORM_SUPER_ADMIN_EMAIL, PACKAGE_ADVISER_EMAIL]
        .map((email) => normalizeEmail(email))
        .filter((email) => email && !members.has(email))
    )
  ];
}

/**
 * Once every member has agreed to a student request, email the producers who can approve it.
 * Does nothing while anyone still has to agree, or once the request is decided.
 */
export async function notifyProducersOfAgreedExtension(requestId: string) {
  const request = await prisma.packageExtensionRequest.findUnique({
    where: { id: requestId },
    select: {
      status: true,
      producerGranted: true,
      cycleNumber: true,
      requestedDays: true,
      reason: true,
      memberConsents: { select: { userId: true, agreed: true } },
      progressRow: {
        select: {
          groupTopic: true,
          assignedProducer: { select: { email: true } },
          members: { select: { userId: true, user: { select: { email: true } } } }
        }
      }
    }
  });
  if (!request || request.status !== "PENDING" || request.producerGranted || !request.progressRow) return null;
  const members = request.progressRow.members;
  if (
    !isGroupConsentComplete({
      memberUserIds: members.map((member) => member.userId),
      consents: request.memberConsents
    })
  ) {
    return null;
  }

  const assignments = await prisma.platformRoleAssignment.findMany({
    where: { role: { in: ["EXECUTIVE_PRODUCER", "SUPER_ADMIN", "ADVISER"] } },
    select: { email: true }
  });
  const recipients = extensionDeciderEmails({
    execEmails: assignments.map((entry) => entry.email),
    assignedProducerEmail: request.progressRow.assignedProducer?.email,
    memberEmails: members.map((member) => member.user.email)
  });
  if (recipients.length === 0) return null;

  const topic = request.progressRow.groupTopic ? ` (“${request.progressRow.groupTopic}”)` : "";
  try {
    return await sendBrandedEmails({
      recipients,
      subject: `Review a ${dayLabel(request.requestedDays)} extension request for Cycle ${request.cycleNumber}`,
      heading: "Extension request ready for review",
      paragraphs: [
        `Every member of a Cycle ${request.cycleNumber} group${topic} agreed to ask for a ${dayLabel(request.requestedDays)} extension.`,
        ...(request.reason ? [`Reason: ${request.reason}`] : []),
        "Two producers must approve it before it takes effect."
      ],
      ctaLabel: "Review request",
      ctaUrl: extensionRequestsUrl(),
      idempotencyKey: `extension-request-agreed/${requestId}`
    });
  } catch (error) {
    console.error("extension request producer email failed", error);
    return null;
  }
}

function memberEmails(
  members: Array<{
    user: { email: string | null; notificationPreference: { notificationEmail: string | null } | null };
  }>
) {
  return members
    .map((member) => (member.user.notificationPreference?.notificationEmail ?? member.user.email)?.trim())
    .filter((email): email is string => Boolean(email));
}

/** Members the grant's terms cover; a partial grant is never emailed to the rest of the group. */
function coveredMembers(grant: LoadedGrant) {
  return (grant.progressRow?.members ?? []).filter((member) =>
    extensionRequestVisibleTo(grant, member.user.id)
  );
}

function approvedMail(grant: LoadedGrant) {
  const { days, topic } = grantSummary(grant);
  return {
    recipients: memberEmails(coveredMembers(grant)),
    subject: `You have a ${dayLabel(days)} extension for Cycle ${grant.cycleNumber}`,
    heading: "Extension granted",
    paragraphs: [
      grant.producerGranted
        ? `Producers gave you a ${dayLabel(days)} extension on your Cycle ${grant.cycleNumber} package${topic}.`
        : `Producers approved a ${dayLabel(days)} extension on your Cycle ${grant.cycleNumber} package${topic}.`,
      "Your final cut deadline moves back by that many days. Late penalties apply after the new deadline."
    ]
  };
}

function deniedMail(grant: LoadedGrant) {
  const { topic } = grantSummary(grant);
  const producerReasons = grant.approvals
    .filter((approval) => !approval.approved)
    .map((approval) => {
      const name = userDisplayName(approval.user) || "A producer";
      return approval.reason ? `${name} denied it: ${approval.reason}` : `${name} denied it.`;
    });
  const memberDeclined = grant.memberConsents.some((consent) => !consent.agreed);
  return {
    recipients: memberEmails(coveredMembers(grant)),
    subject: `Your Cycle ${grant.cycleNumber} extension request was denied`,
    heading: "Extension denied",
    paragraphs: [
      `Your group's ${dayLabel(grant.requestedDays)} extension request for Cycle ${grant.cycleNumber}${topic} was denied.`,
      ...(producerReasons.length > 0
        ? producerReasons
        : memberDeclined
          ? ["A group member declined the request."]
          : []),
      "Your original deadlines still apply."
    ]
  };
}

/**
 * Emails the decision on a decided request as one email to the members the terms cover (the
 * whole group unless a producer picked some members). Returns null while still pending.
 */
export async function notifyGroupOfExtensionDecision(requestId: string) {
  const grant = await loadGrant(requestId);
  if (!grant || grant.status === "PENDING") return null;

  const mail = grant.status === "APPROVED" ? approvedMail(grant) : deniedMail(grant);
  try {
    return await sendBrandedEmails({
      ...mail,
      ctaLabel: "View extension",
      ctaUrl: extensionRequestsUrl()
    });
  } catch (error) {
    console.error("extension decision email failed", error);
    return { configured: true as const, sent: 0, failed: mail.recipients.length };
  }
}
