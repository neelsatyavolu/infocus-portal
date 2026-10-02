import type { PlatformRole } from "@prisma/client";
import { z } from "zod";
import { sendBrandedEmails } from "@/src/lib/email";
import { mainAppOrigin } from "@/src/lib/hosts";
import { normalizeEmail, PACKAGE_ADVISER_EMAIL } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import { userDisplayName } from "@/src/lib/user-display";
import { requireChatAccess } from "@/src/server/hub-chat";
import { requireStageCommentAccess } from "@/src/server/package-stage-comments";

/**
 * Reporting a chat message or a stage feedback comment (App Review Guideline 1.2): the
 * InFocus adviser and the executive producers get an email and an app notification with
 * who reported it, who wrote it, an excerpt and a link. The reporter must be able to see it.
 */

export const contentReportSchema = z
  .object({
    kind: z.enum(["chat", "comment"]),
    messageId: z.string().trim().min(1).max(100).optional(),
    commentId: z.string().trim().min(1).max(100).optional(),
    reason: z.string().trim().max(500).optional()
  })
  .refine((value) => (value.kind === "chat" ? Boolean(value.messageId) : Boolean(value.commentId)), {
    message: "Say which message or comment to report."
  });

export type ContentReportInput = z.infer<typeof contentReportSchema>;

const EXCERPT_MAX = 280;
const REVIEWER_ROLES: PlatformRole[] = ["EXECUTIVE_PRODUCER", "ADVISER"];

type Reported = { authorId: string; authorName: string; body: string; where: string; path: string };

function excerpt(body: string) {
  const clean = body.replace(/\s+/g, " ").trim();
  return clean.length > EXCERPT_MAX ? `${clean.slice(0, EXCERPT_MAX - 1).trimEnd()}…` : clean;
}

async function reportedChatMessage(userId: string, messageId: string): Promise<Reported> {
  const message = await prisma.hubChatMessage.findUnique({
    where: { id: messageId },
    select: { chatId: true, authorId: true, body: true, author: { select: { name: true, nickname: true, email: true } } }
  });
  if (!message) throw new Error("NOT_FOUND");
  const { chat } = await requireChatAccess(userId, message.chatId);
  const group = chat.kind === "GROUP" && chat.packageRow;
  return {
    authorId: message.authorId,
    authorName: userDisplayName(message.author, "Someone"),
    body: message.body,
    where: group ? "a package group chat" : "a direct message",
    // The website has no page per chat: a group chat links to its group, a direct message to the dashboard.
    path: group ? `/groups/${chat.packageRowId}` : "/dashboard"
  };
}

async function reportedComment(userId: string, role: PlatformRole | null, commentId: string): Promise<Reported> {
  const comment = await prisma.packageStageComment.findUnique({
    where: { id: commentId },
    select: { rowId: true, stage: true, authorId: true, body: true, author: { select: { name: true, nickname: true, email: true } } }
  });
  if (!comment) throw new Error("NOT_FOUND");
  await requireStageCommentAccess(comment.rowId, userId, role);
  return {
    authorId: comment.authorId,
    authorName: userDisplayName(comment.author, "Someone"),
    body: comment.body,
    where: "stage feedback",
    path: `/groups/${comment.rowId}/${comment.stage}`
  };
}

/** The adviser and every executive producer, never the reporter or the author themselves. */
async function reviewerEmails(excludeUserIds: string[]) {
  const [assignments, excluded] = await Promise.all([
    prisma.platformRoleAssignment.findMany({ where: { role: { in: REVIEWER_ROLES } }, select: { email: true } }),
    prisma.user.findMany({ where: { id: { in: excludeUserIds } }, select: { email: true } })
  ]);
  const skip = new Set(excluded.map((user) => normalizeEmail(user.email)));
  return [...new Set([...assignments.map((entry) => entry.email), PACKAGE_ADVISER_EMAIL].map((email) => normalizeEmail(email)))]
    .filter((email) => email && !skip.has(email));
}

export async function reportContent(
  reporter: { userId: string; name: string; role: PlatformRole | null },
  input: ContentReportInput
) {
  const reported = input.kind === "chat"
    ? await reportedChatMessage(reporter.userId, input.messageId!)
    : await reportedComment(reporter.userId, reporter.role, input.commentId!);
  if (reported.authorId === reporter.userId) throw new Error("BAD_REQUEST");

  const recipients = await reviewerEmails([reporter.userId, reported.authorId]);
  const url = `${mainAppOrigin().replace(/\/+$/, "")}${reported.path}`;
  await sendBrandedEmails({
    recipients,
    subject: `Reported: ${reported.authorName} in ${reported.where}`,
    heading: "Someone reported a message",
    paragraphs: [
      `${reporter.name} reported something ${reported.authorName} wrote in ${reported.where}:`,
      `“${excerpt(reported.body)}”`,
      ...(input.reason ? [`Reason given: ${input.reason}`] : []),
      "Please review it and follow up with the people involved."
    ],
    ctaLabel: "Open in InFocus Portal",
    ctaUrl: url,
    push: { title: "Message reported", body: `${reporter.name} reported a message from ${reported.authorName}.`, url }
  });
  return { reported: true, notified: recipients.length };
}
