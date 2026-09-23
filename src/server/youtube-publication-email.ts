import { z } from "zod";
import { prisma } from "@/src/lib/prisma";
import { sendPreparedEmail } from "@/src/lib/email";
import { escapeHtml, renderBrandedEmail } from "@/src/lib/email-layout";
import { mainAppOrigin } from "@/src/lib/hosts";
import { youtubeEmbedCode, youtubeWatchUrl } from "@/src/lib/youtube-publication";

const emailPayload = z.object({ from: z.string(), to: z.string().email(), subject: z.string(), text: z.string(), html: z.string() });

export function publicationEmailPayload(publication: { rowId: string; title: string; showDate: string; videoId: string }, recipient: string) {
  const from = process.env.RESEND_FROM_EMAIL;
  if (!from || !process.env.RESEND_API_KEY) throw new Error("Publication email is not configured.");
  const watch = youtubeWatchUrl(publication.videoId);
  const embed = youtubeEmbedCode(publication.videoId);
  const page = `${mainAppOrigin()}/publishing-queue/${encodeURIComponent(publication.rowId)}`;
  const content = renderBrandedEmail({
    heading: "Package ready for the website",
    paragraphs: [publication.title, `Air date: ${publication.showDate}`, `Watch: ${watch}`],
    ctaLabel: "View package & copy embed code", ctaUrl: page,
    extraHtml: `<p>Embed code:</p><pre style="white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px">${escapeHtml(embed)}</pre>`
  });
  return { from, to: recipient, subject: `Published: ${publication.title}`,
    html: content.html, text: `${content.text}\n\nEmbed code:\n${embed}` };
}

export async function deliverPublicationEmails(publicationId: string, now = new Date()) {
  const emails = await prisma.youtubePublicationEmail.findMany({ where: { publicationId, sentAt: null, cancelledAt: null } });
  let pending = 0;
  for (const email of emails) {
    const manager = await prisma.publishingManager.findUnique({
      where: { userId: email.recipientUserId }, select: { user: { select: { email: true } } }
    });
    if (manager?.user.email?.trim().toLowerCase() !== email.recipient) {
      await prisma.youtubePublicationEmail.update({ where: { id: email.id },
        data: { cancelledAt: now, lastError: "Recipient is no longer a manager at this email address." } });
      continue;
    }
    // Resend deduplicates for 24h. Leave a safety margin and never guess after expiry.
    if (email.firstAttemptAt && now.getTime() - email.firstAttemptAt.getTime() >= 23 * 60 * 60 * 1000) {
      await prisma.youtubePublicationEmail.update({ where: { id: email.id },
        data: { lastError: "Check Resend delivery history before retrying this email; its deduplication window expired." } });
      pending++;
      continue;
    }
    try {
      if (!email.firstAttemptAt) {
        await prisma.youtubePublicationEmail.update({ where: { id: email.id }, data: { firstAttemptAt: now } });
      }
      await sendPreparedEmail(emailPayload.parse(email.payload), `youtube-publication/${email.id}`);
      await prisma.youtubePublicationEmail.update({ where: { id: email.id }, data: { sentAt: now, lastError: null } });
    } catch {
      await prisma.youtubePublicationEmail.update({ where: { id: email.id }, data: { lastError: "Manager email delivery failed; retry pending." } });
      pending++;
    }
  }
  await prisma.youtubePublication.update({ where: { id: publicationId },
    data: { lastError: pending ? "Some manager emails are pending. Check publication email delivery records." : null } });
  return { pending };
}
