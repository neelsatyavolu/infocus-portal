import { PlatformRole, WorkspaceRole } from "@prisma/client";
import { sendMediaProcessedEmail } from "@/src/lib/email";
import { prisma } from "@/src/lib/prisma";
import { userDisplayName } from "@/src/lib/user-display";

export async function notifyManagersOfReadyVersion(versionId: string) {
  const version = await prisma.mediaVersion.findUnique({
    where: { id: versionId },
    select: {
      id: true,
      createdById: true,
      mediaItem: {
        select: {
          id: true,
          title: true,
          folder: { select: { name: true } },
          project: {
            select: {
              id: true,
              name: true,
              workspaceId: true
            }
          }
        }
      }
    }
  });

  if (!version) {
    return { skipped: true as const, reason: "version-not-found" };
  }

  const workspaceId = version.mediaItem.project.workspaceId;

  const [workspaceAdmins, platformRoles, uploader] = await Promise.all([
    prisma.workspaceMember.findMany({
      where: {
        workspaceId,
        role: WorkspaceRole.OWNER_ADMIN
      },
      select: {
        user: {
          select: {
            email: true,
            notificationPreference: {
              select: {
                emailEnabled: true,
                notificationEmail: true
              }
            }
          }
        }
      }
    }),
    prisma.platformRoleAssignment.findMany({
      where: {
        role: {
          in: [
            PlatformRole.SUPER_ADMIN,
            PlatformRole.EXECUTIVE_PRODUCER,
            PlatformRole.ADVISER,
            PlatformRole.ASSOCIATE_PRODUCER
          ]
        }
      },
      select: { email: true }
    }),
    version.createdById
      ? prisma.user.findUnique({
          where: { id: version.createdById },
          select: { name: true, nickname: true, email: true }
        })
      : Promise.resolve(null)
  ]);

  const platformEmails = platformRoles
    .map((entry) => entry.email.toLowerCase())
    .filter((email): email is string => Boolean(email));

  const platformUsers = platformEmails.length
    ? await prisma.user.findMany({
        where: {
          email: { in: platformEmails, mode: "insensitive" }
        },
        select: {
          email: true,
          notificationPreference: {
            select: {
              emailEnabled: true,
              notificationEmail: true
            }
          }
        }
      })
    : [];

  const candidates = [
    ...workspaceAdmins.map((member) => member.user),
    ...platformUsers
  ];

  const recipientEmails = new Set<string>();
  const uploaderEmail = uploader?.email?.toLowerCase() ?? null;

  for (const candidate of candidates) {
    const pref = candidate.notificationPreference;
    if (pref && pref.emailEnabled === false) {
      continue;
    }
    const email = (pref?.notificationEmail ?? candidate.email)?.trim();
    if (!email) {
      continue;
    }
    if (uploaderEmail && email.toLowerCase() === uploaderEmail) {
      continue;
    }
    recipientEmails.add(email);
  }

  if (recipientEmails.size === 0) {
    return { skipped: true as const, reason: "no-recipients" };
  }

  const baseUrl = process.env.APP_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "";
  const reviewPath = `/projects/${version.mediaItem.project.id}/review/${version.mediaItem.id}`;
  const reviewUrl = baseUrl ? `${baseUrl.replace(/\/+$/, "")}${reviewPath}` : reviewPath;

  return sendMediaProcessedEmail({
    recipients: Array.from(recipientEmails),
    uploaderName: uploader ? userDisplayName(uploader) || "Someone" : "Someone",
    projectName: version.mediaItem.project.name,
    folderName: version.mediaItem.folder?.name ?? null,
    mediaTitle: version.mediaItem.title,
    reviewUrl
  });
}
