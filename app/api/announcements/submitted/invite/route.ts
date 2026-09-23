import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import {
  createSubmittedAnnouncementShareToken,
  shareDurationLabel,
  submittedAnnouncementSharePath,
  type ShareDuration
} from "@/src/lib/announcement-share";
import { sendSubmittedAnnouncementInviteEmails } from "@/src/lib/email";
import { fail, ok } from "@/src/lib/http";
import { getPlatformAccess, isExecutiveProducer, normalizeEmail } from "@/src/lib/platform-admin";
import { getRequestKey, limitByKey } from "@/src/lib/rate-limit";
import { userDisplayName } from "@/src/lib/user-display";

const inviteSchema = z.object({
  emails: z.string().trim().max(2000).optional(),
  sendEmail: z.boolean().optional(),
  duration: z.enum(["30d", "1y"]).default("30d")
});

function parseEmails(value: string | undefined) {
  const unique = new Set<string>();
  for (const part of (value ?? "").split(/[\s,;]+/)) {
    const email = normalizeEmail(part);
    if (email && email.includes("@") && email.includes(".")) {
      unique.add(email);
    }
  }
  return [...unique].slice(0, 20);
}

export async function POST(request: Request) {
  try {
    const rate = limitByKey(getRequestKey(request, "announcements:invite"), { max: 20, windowMs: 60 * 60 * 1000 });
    if (!rate.allowed) {
      throw new Error("TOO_MANY_REQUESTS");
    }

    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);
    if (!isExecutiveProducer(access.role)) {
      throw new Error("FORBIDDEN");
    }

    const payload = inviteSchema.parse(await request.json());
    const emails = parseEmails(payload.emails);
    const duration = payload.duration as ShareDuration;
    const token = createSubmittedAnnouncementShareToken(user.email ?? "producer@infocuspaly.com", Date.now(), duration);
    const origin = (process.env.APP_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin).replace(
      /\/+$/,
      ""
    );
    const path = submittedAnnouncementSharePath(token);
    const shareUrl = `${origin}${path}`;

    let emailed = 0;
    if (payload.sendEmail && emails.length > 0) {
      const result = await sendSubmittedAnnouncementInviteEmails({
        recipients: emails,
        inviterName: userDisplayName(user) || user.email || "An InFocus producer",
        shareUrl,
        expiresLabel: shareDurationLabel(duration)
      });
      emailed = result.sent;
    }

    return ok({
      shareUrl,
      invitedCount: emails.length,
      emailed
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return fail(error.issues[0]?.message ?? "Invalid invite.", 400);
    }
    return handleRouteError(error);
  }
}
