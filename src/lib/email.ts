import { Resend } from "resend";
import { mainAppOrigin } from "@/src/lib/hosts";
import { EMAIL_BRAND, escapeHtml, renderBrandedEmail } from "@/src/lib/email-layout";
import { pushBodyFromParagraphs, sendNativePushToEmails } from "@/src/lib/native-push";
import type { PackageMailContent } from "@/src/lib/package-stage-events";

type AnnouncementEmailPayload = {
  recipients: string[];
  authorName: string;
  content: string;
  announcementUrl: string;
};

type GradeEmailPayload = {
  recipients: string[];
  cycleNumber: number;
  totalPoints: number;
  percentage: number;
  gradeUrl: string;
  mode: "published" | "updated";
};

type TestNotificationEmailPayload = {
  recipients: string[];
  settingsUrl: string;
  recipientName?: string | null;
};

type AccessRequestDecisionPayload = {
  recipients: string[];
  status: "APPROVED" | "DENIED";
  signInUrl: string;
  recipientName?: string | null;
  decidedByName?: string | null;
};

type AccountInviteEmailPayload = {
  recipients: string[];
  signInUrl: string;
  recipientName?: string | null;
  inviterName?: string | null;
};

type PackageReviewEmailPayload = {
  recipients: string[];
  cycleNumber: number;
  groupTopic: string;
  members: string;
  reviewUrl: string;
  stageLabel: string;
};

type PackageRevisionEmailPayload = {
  recipients: string[];
  cycleNumber: number;
  groupTopic: string;
  reviewerName: string;
  reviewUrl: string;
};

type MediaProcessedEmailPayload = {
  recipients: string[];
  uploaderName: string;
  projectName: string;
  folderName: string | null;
  mediaTitle: string;
  reviewUrl: string;
};

type SubmittedAnnouncementInvitePayload = {
  recipients: string[];
  inviterName: string;
  shareUrl: string;
  expiresLabel: string;
};

type ParticipationGradeRequestEmailPayload = {
  recipients: string[];
  requesterName: string;
  itemCount: number;
  reviewUrl: string;
};

let resendClient: Resend | null = null;

function getResendClient() {
  if (resendClient) {
    return resendClient;
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return null;
  }

  resendClient = new Resend(apiKey);
  return resendClient;
}

export function isEmailNotificationsConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);
}

function mailClient() {
  const client = getResendClient();
  const from = process.env.RESEND_FROM_EMAIL;
  if (!client || !from) return null;
  return { client, from };
}

/** Frozen publication payload + provider idempotency key for retryable delivery. */
export async function sendPreparedEmail(payload: {
  from: string; to: string; subject: string; text: string; html: string;
}, idempotencyKey: string) {
  const client = getResendClient();
  if (!client) throw new Error("Email delivery is not configured.");
  const result = await client.emails.send(payload, { idempotencyKey });
  if (result.error || !result.data) throw new Error("Publication email delivery failed.");
  return result.data;
}

/** Resend accepts at most 50 addresses in `to` per email. */
const MAX_RECIPIENTS_PER_EMAIL = 50;

function uniqueRecipients(recipients: string[]) {
  const byKey = new Map<string, string>();
  for (const recipient of recipients) {
    const trimmed = recipient.trim();
    if (trimmed && !byKey.has(trimmed.toLowerCase())) byKey.set(trimmed.toLowerCase(), trimmed);
  }
  return [...byKey.values()];
}

/** Identical content goes out as one email with every recipient in `to` (split past 50). */
async function sendToAll(recipients: string[], subject: string, text: string, html: string) {
  const mail = mailClient();
  const addresses = uniqueRecipients(recipients);
  if (!mail || addresses.length === 0) {
    return { configured: false as const, sent: 0, failed: 0 };
  }

  const batches: string[][] = [];
  for (let index = 0; index < addresses.length; index += MAX_RECIPIENTS_PER_EMAIL) {
    batches.push(addresses.slice(index, index + MAX_RECIPIENTS_PER_EMAIL));
  }

  const results = await Promise.allSettled(
    batches.map(async (to) => {
      const result = await mail.client.emails.send({
        from: mail.from,
        to,
        subject,
        text,
        html
      });
      if (result.error) {
        throw new Error(result.error.message);
      }
      return result.data;
    })
  );

  let sent = 0;
  results.forEach((entry, index) => {
    if (entry.status === "fulfilled") {
      sent += batches[index].length;
    } else {
      console.error("Resend email failed", entry.reason);
    }
  });
  return { configured: true as const, sent, failed: addresses.length - sent };
}

export async function sendBrandedEmails(payload: {
  recipients: string[];
  subject: string;
  heading: string;
  paragraphs: string[];
  ctaLabel: string;
  ctaUrl: string;
  extraHtml?: string;
  /** Mac app notification to the same people. Defaults to the subject, first non-greeting paragraph and button link; false skips it. */
  push?: false | { title?: string; body?: string; url?: string };
}) {
  const branded = renderBrandedEmail({
    heading: payload.heading,
    paragraphs: payload.paragraphs,
    extraHtml: payload.extraHtml,
    ctaLabel: payload.ctaLabel,
    ctaUrl: payload.ctaUrl,
    preview: payload.paragraphs[0]
  });
  const push = payload.push;
  // The push never rejects, so it can't change the email result.
  const [result] = await Promise.all([
    sendToAll(payload.recipients, payload.subject, branded.text, branded.html),
    push === false
      ? null
      : sendNativePushToEmails(payload.recipients, {
          title: push?.title ?? payload.subject,
          body: push?.body ?? pushBodyFromParagraphs(payload.paragraphs),
          url: push?.url ?? payload.ctaUrl
        })
  ]);
  return result;
}

export async function sendPackageEventEmails(payload: PackageMailContent & { recipients: string[]; ctaUrl: string }) {
  return sendBrandedEmails({
    recipients: payload.recipients,
    subject: payload.subject,
    heading: payload.heading,
    paragraphs: payload.paragraphs,
    ctaLabel: payload.ctaLabel,
    ctaUrl: payload.ctaUrl,
    push: { title: payload.pushTitle, body: payload.pushBody }
  });
}

export async function sendSignInCodeEmail(email: string, code: string) {
  return sendBrandedEmails({
    recipients: [email],
    subject: "Your InFocus Portal sign-in code",
    heading: "Your sign-in code",
    paragraphs: [
      `Your code is ${code}.`,
      "Enter this code in the browser where you requested it. It expires in 10 minutes and can only be used once.",
      "If you didn't request this code, you can ignore this email."
    ],
    ctaLabel: "Open InFocus Portal",
    ctaUrl: `${mainAppOrigin()}/sign-in`,
    push: false
  });
}

export async function sendAnnouncementEmails(payload: AnnouncementEmailPayload) {
  const trimmedContent = payload.content.trim();
  const preview = trimmedContent.length > 160 ? `${trimmedContent.slice(0, 157)}...` : trimmedContent;
  return sendBrandedEmails({
    recipients: payload.recipients,
    subject: `New announcement from ${payload.authorName}`,
    heading: "New announcement",
    paragraphs: [`${payload.authorName} posted a new announcement.`, preview],
    ctaLabel: "Open announcements",
    ctaUrl: payload.announcementUrl
  });
}

export async function sendGradeEmails(payload: GradeEmailPayload) {
  const published = payload.mode === "published";
  const intro = published
    ? `Your grade for Package Cycle ${payload.cycleNumber} is now available.`
    : `Your grade for Package Cycle ${payload.cycleNumber} was updated.`;
  return sendBrandedEmails({
    recipients: payload.recipients,
    subject: published
      ? `Your Package Cycle ${payload.cycleNumber} grade is published`
      : `Your Package Cycle ${payload.cycleNumber} grade was updated`,
    heading: published ? "Grade published" : "Grade updated",
    paragraphs: [intro, `Score: ${payload.totalPoints}/40 (${payload.percentage.toFixed(1)}%)`],
    ctaLabel: "Open grade viewer",
    ctaUrl: payload.gradeUrl
  });
}

export async function sendPackageReviewEmails(payload: PackageReviewEmailPayload) {
  const topic = payload.groupTopic.trim() || "Untitled package";
  return sendBrandedEmails({
    recipients: payload.recipients,
    subject: `Cycle ${payload.cycleNumber} ${payload.stageLabel}: ${topic}`,
    heading: `Ready for ${payload.stageLabel}`,
    paragraphs: [
      `${topic} (Cycle ${payload.cycleNumber}) is ready for ${payload.stageLabel}.`,
      `Members: ${payload.members}`
    ],
    ctaLabel: "Open in Groups",
    ctaUrl: payload.reviewUrl
  });
}

export async function sendPackageRevisionEmails(payload: PackageRevisionEmailPayload) {
  const topic = payload.groupTopic.trim() || "Untitled package";
  const reviewer = payload.reviewerName.trim() || "A producer";
  return sendBrandedEmails({
    recipients: payload.recipients,
    subject: `Cycle ${payload.cycleNumber}: review comments on ${topic}`,
    heading: "New review on your Initial Cut",
    paragraphs: [
      `${reviewer} submitted a review of ${topic} (Cycle ${payload.cycleNumber}).`,
      "Open the Initial Cut to see comments and upload a revision."
    ],
    ctaLabel: "Open Initial Cut",
    ctaUrl: payload.reviewUrl
  });
}

export async function sendTestNotificationEmail(payload: TestNotificationEmailPayload) {
  const recipientLabel = payload.recipientName?.trim() || "there";
  return sendBrandedEmails({
    recipients: payload.recipients,
    subject: "InFocus Portal test email notification",
    heading: "Test notification",
    paragraphs: [
      `Hi ${recipientLabel},`,
      "This is a test email from InFocus Portal to confirm your email notifications are working."
    ],
    ctaLabel: "Manage notification settings",
    ctaUrl: payload.settingsUrl,
    // Mac notifications have their own test in Settings.
    push: false
  });
}

export async function sendMediaProcessedEmail(payload: MediaProcessedEmailPayload) {
  // The push never rejects, so it can't change the email result.
  const [result] = await Promise.all([
    sendMediaProcessedMail(payload),
    sendNativePushToEmails(payload.recipients, {
      title: `New video uploaded: ${payload.mediaTitle}`,
      body: `${payload.uploaderName} uploaded a new video to ${payload.projectName}.`,
      url: payload.reviewUrl
    })
  ]);
  return result;
}

async function sendMediaProcessedMail(payload: MediaProcessedEmailPayload) {
  const mail = mailClient();
  if (!mail || payload.recipients.length === 0) {
    return { configured: false as const, sent: 0, failed: 0 };
  }

  const folderLabel = payload.folderName?.trim() || "No folder";
  const extraHtml = `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 8px;border-collapse:collapse;">
  <tr><td style="padding:4px 16px 4px 0;color:${EMAIL_BRAND.muted};font-size:11px;font-weight:500;letter-spacing:0.11em;text-transform:uppercase;font-family:${EMAIL_BRAND.font};">Title</td><td style="padding:4px 0;color:${EMAIL_BRAND.paper};font-size:14px;font-family:${EMAIL_BRAND.font};">${escapeHtml(payload.mediaTitle)}</td></tr>
  <tr><td style="padding:4px 16px 4px 0;color:${EMAIL_BRAND.muted};font-size:11px;font-weight:500;letter-spacing:0.11em;text-transform:uppercase;font-family:${EMAIL_BRAND.font};">Cycle</td><td style="padding:4px 0;color:${EMAIL_BRAND.paper};font-size:14px;font-family:${EMAIL_BRAND.font};">${escapeHtml(payload.projectName)}</td></tr>
  <tr><td style="padding:4px 16px 4px 0;color:${EMAIL_BRAND.muted};font-size:11px;font-weight:500;letter-spacing:0.11em;text-transform:uppercase;font-family:${EMAIL_BRAND.font};">Folder</td><td style="padding:4px 0;color:${EMAIL_BRAND.paper};font-size:14px;font-family:${EMAIL_BRAND.font};">${escapeHtml(folderLabel)}</td></tr>
</table>`;

  const branded = renderBrandedEmail({
    heading: "New video uploaded",
    paragraphs: [`${payload.uploaderName} uploaded a new video.`],
    extraHtml,
    ctaLabel: "Open video review",
    ctaUrl: payload.reviewUrl,
    preview: `${payload.uploaderName} uploaded ${payload.mediaTitle}`
  });

  try {
    await mail.client.emails.send({
      from: mail.from,
      to: mail.from,
      bcc: payload.recipients,
      subject: `New video uploaded: ${payload.mediaTitle} — ${payload.projectName}`,
      text: branded.text,
      html: branded.html
    });
    return { configured: true as const, sent: payload.recipients.length, failed: 0 };
  } catch {
    return { configured: true as const, sent: 0, failed: payload.recipients.length };
  }
}

export async function sendAccessRequestDecisionEmail(payload: AccessRequestDecisionPayload) {
  const recipientLabel = payload.recipientName?.trim() || "there";
  const decidedByLabel = payload.decidedByName?.trim() || "an admin";
  const isApproved = payload.status === "APPROVED";
  return sendBrandedEmails({
    recipients: payload.recipients,
    subject: isApproved ? "Your InFocus Portal access request was approved" : "Your InFocus Portal access request was denied",
    heading: isApproved ? "Access approved" : "Access denied",
    paragraphs: isApproved
      ? [`Hi ${recipientLabel},`, `Good news. ${decidedByLabel} approved your access request for InFocus Portal.`]
      : [
          `Hi ${recipientLabel},`,
          `${decidedByLabel} reviewed your access request for InFocus Portal and did not approve it at this time.`,
          "If you believe this was a mistake, contact your administrator."
        ],
    ctaLabel: isApproved ? "Sign in to InFocus Portal" : "Go to InFocus Portal",
    ctaUrl: payload.signInUrl,
    push: false
  });
}

export async function sendAccountInviteEmail(payload: AccountInviteEmailPayload) {
  const recipientLabel = payload.recipientName?.trim() || "there";
  const inviterLabel = payload.inviterName?.trim() || "an InFocus producer";
  return sendBrandedEmails({
    recipients: payload.recipients,
    subject: "You're invited to InFocus Portal",
    heading: "You're invited",
    paragraphs: [
      `Hi ${recipientLabel},`,
      `${inviterLabel} added you to InFocus Portal. Sign in with this email address.`
    ],
    ctaLabel: "Sign in to InFocus Portal",
    ctaUrl: payload.signInUrl,
    push: false
  });
}

export async function sendSubmittedAnnouncementInviteEmails(payload: SubmittedAnnouncementInvitePayload) {
  return sendBrandedEmails({
    recipients: payload.recipients,
    subject: `${payload.inviterName} shared InFocus announcement submissions with you`,
    heading: "Announcement submissions shared",
    paragraphs: [
      `${payload.inviterName} invited you to view submitted InFocus announcements.`,
      `This link expires in ${payload.expiresLabel}.`
    ],
    ctaLabel: "Open submitted announcements",
    ctaUrl: payload.shareUrl
  });
}

export async function sendParticipationGradeRequestEmails(payload: ParticipationGradeRequestEmailPayload) {
  const requester = payload.requesterName.trim() || "A producer";
  const countLabel = payload.itemCount === 1 ? "1 participation score" : `${payload.itemCount} participation scores`;
  return sendBrandedEmails({
    recipients: payload.recipients,
    subject: `Participation grades need approval (${payload.itemCount})`,
    heading: "Participation grades need approval",
    paragraphs: [
      `${requester} submitted ${countLabel} that need approval from the adviser or another executive producer.`
    ],
    ctaLabel: "Open pending requests",
    ctaUrl: payload.reviewUrl
  });
}
