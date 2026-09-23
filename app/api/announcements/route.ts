import { z } from "zod";
import { handleRouteError } from "@/src/lib/api-errors";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { ok } from "@/src/lib/http";
import { getPlatformAccess, hasPlatformRole } from "@/src/lib/platform-admin";
import { sendAnnouncementEmails } from "@/src/lib/email";
import { prisma } from "@/src/lib/prisma";
import { userDisplayName } from "@/src/lib/user-display";
import { isWebPushConfigured, sendWebPush } from "@/src/lib/web-push";

const createAnnouncementSchema = z.object({
  content: z.string().trim().min(1).max(4000),
  mentionUserIds: z.array(z.string()).max(150).optional()
});

export async function GET() {
  try {
    const userId = await requireUserId();
    await syncUserProfile(userId);

    const announcements = await prisma.announcement.findMany({
      orderBy: { createdAt: "desc" },
      take: 80,
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            nickname: true
          }
        },
        mentions: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                nickname: true
              }
            }
          }
        },
        comments: {
          orderBy: { createdAt: "asc" },
          include: {
            author: {
              select: {
                id: true,
                name: true,
                nickname: true
              }
            }
          }
        },
        reads: {
          where: { userId },
          select: { readAt: true },
          take: 1
        },
        likes: {
          where: { userId },
          select: { id: true },
          take: 1
        },
        _count: {
          select: {
            likes: true
          }
        }
      }
    });

    return ok(
      announcements.map((announcement) => ({
        id: announcement.id,
        content: announcement.content,
        createdAt: announcement.createdAt,
        author: announcement.createdBy
          ? { id: announcement.createdBy.id, name: userDisplayName(announcement.createdBy) }
          : { id: "", name: "Deleted user" },
        unread: announcement.reads.length === 0,
        likedByMe: announcement.likes.length > 0,
        likeCount: announcement._count.likes,
        mentions: announcement.mentions.map((mention) => ({
          id: mention.user.id,
          name: userDisplayName(mention.user)
        })),
        comments: announcement.comments.map((comment) => ({
          id: comment.id,
          body: comment.body,
          createdAt: comment.createdAt,
          author: comment.author
            ? { id: comment.author.id, name: userDisplayName(comment.author) }
            : { id: "", name: "Deleted user" }
        }))
      }))
    );
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);

    if (!hasPlatformRole(access.role, "ASSOCIATE_PRODUCER")) {
      throw new Error("FORBIDDEN");
    }

    const payload = createAnnouncementSchema.parse(await request.json());
    const mentionIds = [...new Set(payload.mentionUserIds ?? [])].filter(Boolean);
    const validMentions =
      mentionIds.length > 0
        ? await prisma.user.findMany({
            where: {
              id: { in: mentionIds }
            },
            select: { id: true }
          })
        : [];

    const created = await prisma.announcement.create({
      data: {
        content: payload.content.trim(),
        createdById: user.id,
        mentions: validMentions.length
          ? {
              createMany: {
                data: validMentions.map((member) => ({
                  userId: member.id
                })),
                skipDuplicates: true
              }
            }
          : undefined,
        reads: {
          create: {
            userId: user.id
          }
        }
      },
      select: { id: true }
    });

    if (isWebPushConfigured()) {
      const recipients = await prisma.pushNotificationSubscription.findMany({
        where: {
          userId: {
            not: user.id
          },
          user: {
            notificationPreference: {
              browserEnabled: true,
              browserAnnouncementsEnabled: true
            }
          }
        },
        select: {
          id: true,
          endpoint: true,
          p256dh: true,
          auth: true
        }
      });

      if (recipients.length > 0) {
        const title = "New Announcement";
        const body =
          payload.content.trim().length > 120
            ? `${payload.content.trim().slice(0, 117)}...`
            : payload.content.trim();

        const results = await Promise.all(
          recipients.map((recipient) =>
            sendWebPush(
              {
                endpoint: recipient.endpoint,
                p256dh: recipient.p256dh,
                auth: recipient.auth
              },
              {
                title,
                body,
                url: "/announcements"
              }
            ).then((result) => ({
              id: recipient.id,
              result
            }))
          )
        );

        const staleIds = results
          .filter((entry) => entry.result.stale)
          .map((entry) => entry.id);

        if (staleIds.length > 0) {
          await prisma.pushNotificationSubscription.deleteMany({
            where: {
              id: {
                in: staleIds
              }
            }
          });
        }
      }
    }

    const emailRecipients = await prisma.user.findMany({
      where: {
        id: {
          not: user.id
        },
        OR: [
          {
            email: {
              not: null
            },
            notificationPreference: {
              is: null
            }
          },
          {
            notificationPreference: {
              is: {
                emailEnabled: true,
                emailAnnouncementsEnabled: true
              }
            }
          }
        ]
      },
      select: {
        email: true,
        notificationPreference: {
          select: {
            notificationEmail: true
          }
        }
      }
    });

    const uniqueEmails = [
      ...new Set(
        emailRecipients
          .map((entry) => entry.notificationPreference?.notificationEmail ?? entry.email)
          .filter(Boolean)
      )
    ] as string[];
    const baseUrl = process.env.APP_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "";
    const announcementUrl = baseUrl ? `${baseUrl.replace(/\/+$/, "")}/announcements` : "/announcements";

    void sendAnnouncementEmails({
      recipients: uniqueEmails,
      authorName: userDisplayName(user) || user.email || "A manager",
      content: payload.content.trim(),
      announcementUrl
    });

    return ok(created, 201);
  } catch (error) {
    return handleRouteError(error);
  }
}
