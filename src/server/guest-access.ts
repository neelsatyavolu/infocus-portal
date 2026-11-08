import { GuestPermission } from "@prisma/client";
import { isGuestLinkActive, parseGuestCredential, verifyGuestPasscodeProof } from "@/src/lib/guest-links";
import { prisma } from "@/src/lib/prisma";

/**
 * `credential` is the link token, or for a passcode link the `<token>.<exp>.<sig>` credential the
 * /g page issues after a correct passcode (`issueGuestCredential`). A passcode link refuses the
 * bare token.
 */
export async function requireGuestLink(
  credential: string,
  options?: {
    projectId?: string;
    mediaVersionId?: string;
    requireComment?: boolean;
  }
) {
  const { token, proof } = parseGuestCredential(credential);
  const link = await prisma.guestLink.findUnique({
    where: { token },
    include: {
      mediaVersion: {
        select: {
          id: true,
          mediaItem: {
            select: {
              projectId: true,
              project: {
                select: {
                  workspaceId: true
                }
              }
            }
          }
        }
      },
      project: {
        select: {
          id: true,
          workspaceId: true
        }
      }
    }
  });

  if (!link || !isGuestLinkActive(link)) {
    throw new Error("FORBIDDEN");
  }

  if (link.passcodeHash && !verifyGuestPasscodeProof(proof, { id: link.id, token, passcodeHash: link.passcodeHash })) {
    throw new Error("FORBIDDEN");
  }

  if (options?.requireComment && link.permission !== GuestPermission.COMMENT) {
    throw new Error("FORBIDDEN");
  }

  const linkProjectId = link.project?.id ?? link.mediaVersion?.mediaItem.projectId;
  const workspaceId = link.project?.workspaceId ?? link.mediaVersion?.mediaItem.project.workspaceId;

  if (!linkProjectId || !workspaceId) {
    throw new Error("BAD_REQUEST");
  }

  if (options?.projectId && options.projectId !== linkProjectId) {
    throw new Error("FORBIDDEN");
  }

  if (options?.mediaVersionId && link.mediaVersion && options.mediaVersionId !== link.mediaVersion.id) {
    throw new Error("FORBIDDEN");
  }

  if (options?.mediaVersionId && !link.mediaVersion) {
    const targetVersion = await prisma.mediaVersion.findUnique({
      where: { id: options.mediaVersionId },
      include: {
        mediaItem: {
          select: { projectId: true }
        }
      }
    });

    if (!targetVersion || targetVersion.mediaItem.projectId !== linkProjectId) {
      throw new Error("FORBIDDEN");
    }
  }

  return {
    link,
    projectId: linkProjectId,
    workspaceId
  };
}
