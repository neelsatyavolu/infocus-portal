import { sendBrandedEmails } from "@/src/lib/email";
import { mainAppOrigin } from "@/src/lib/hosts";
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
  const creatorEmail = normalizeEmail(grant.user.email);
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
  const creator = userDisplayName(grant.user) || grant.user.email || "An executive producer";
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

function memberEmails(
  members: Array<{
    user: { email: string | null; notificationPreference: { notificationEmail: string | null } | null };
  }>
) {
  return members
    .map((member) => (member.user.notificationPreference?.notificationEmail ?? member.user.email)?.trim())
    .filter((email): email is string => Boolean(email));
}

function approvedMail(grant: LoadedGrant) {
  const covered = (grant.progressRow?.members ?? []).filter(
    (member) => grant.grantedUserIds.length === 0 || grant.grantedUserIds.includes(member.user.id)
  );
  const { days, topic } = grantSummary(grant);
  return {
    recipients: memberEmails(covered),
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
    recipients: memberEmails(grant.progressRow?.members ?? []),
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
 * Emails the decision on a decided request as one email: approved → the members the grant
 * covers; denied → the whole group. Returns null while the request is still pending.
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
