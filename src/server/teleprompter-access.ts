import { cookies } from "next/headers";
import { WorkspaceRole } from "@prisma/client";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { getCanonicalWorkspace } from "@/src/lib/canonical-workspace";
import { getPlatformAccess } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import {
  TELEPROMPTER_KIOSK_COOKIE_NAME,
  TELEPROMPTER_KIOSK_USER_ID,
  isValidTeleprompterKioskToken
} from "@/src/lib/teleprompter-kiosk";
import { buildWorkspaceAccessWhere, resolveWorkspaceAccess } from "@/src/server/workspace-access";

export type TeleprompterWorkspace = {
  id: string;
  name: string;
  role: WorkspaceRole;
};

export async function hasTeleprompterKioskCookie() {
  const store = await cookies();
  return isValidTeleprompterKioskToken(store.get(TELEPROMPTER_KIOSK_COOKIE_NAME)?.value);
}

export async function ensureTeleprompterKioskUser() {
  const workspace = await getCanonicalWorkspace();
  const serial = process.env.TELEPROMPTER_KIOSK_SERIAL?.trim();
  const name = serial ? `Teleprompter kiosk (${serial})` : "Teleprompter kiosk";

  const user = await prisma.user.upsert({
    where: { id: TELEPROMPTER_KIOSK_USER_ID },
    create: {
      id: TELEPROMPTER_KIOSK_USER_ID,
      name,
      onboardingCompletedAt: new Date()
    },
    update: { name }
  });

  await prisma.workspaceMember.upsert({
    where: {
      workspaceId_userId: {
        workspaceId: workspace.id,
        userId: user.id
      }
    },
    create: {
      workspaceId: workspace.id,
      userId: user.id,
      role: WorkspaceRole.EDITOR
    },
    update: {}
  });

  return user;
}

export async function requireTeleprompterActor() {
  if (await hasTeleprompterKioskCookie()) {
    const user = await ensureTeleprompterKioskUser();
    return { userId: user.id, email: user.email };
  }

  const userId = await requireUserId();
  const user = await syncUserProfile(userId);
  return { userId: user.id, email: user.email };
}

async function requireWorkspaceAccess(params: {
  workspaceId: string;
  userId: string;
  email?: string | null;
}) {
  await resolveWorkspaceAccess({
    workspaceId: params.workspaceId,
    userId: params.userId,
    email: params.email,
    allowVisibility: true
  });
}

export async function resolveTeleprompterWorkspace(params: {
  userId: string;
  email?: string | null;
  workspaceId?: string | null;
}) {
  const { userId, email, workspaceId } = params;
  const access = await getPlatformAccess(email);

  const workspaces = await prisma.workspace.findMany({
    where: buildWorkspaceAccessWhere({
      userId,
      platformRole: access.role
    }),
    select: {
      id: true,
      name: true,
      members: {
        where: { userId },
        select: {
          role: true
        },
        take: 1
      }
    },
    orderBy: {
      name: "asc"
    }
  });

  const normalizedWorkspaces: TeleprompterWorkspace[] = workspaces.map((workspace) => ({
    id: workspace.id,
    name: workspace.name,
    role: workspace.members[0]?.role ?? WorkspaceRole.REVIEWER
  }));

  const selectedWorkspace =
    normalizedWorkspaces.find((workspace) => workspace.id === workspaceId) ?? normalizedWorkspaces[0] ?? null;

  return {
    workspaces: normalizedWorkspaces,
    selectedWorkspace
  };
}

export async function backfillLegacyTeleprompterDocs(params: {
  userId: string;
  workspaceId: string;
}) {
  const { userId, workspaceId } = params;
  return prisma.teleprompterDoc.updateMany({
    where: {
      createdById: userId,
      workspaceId: null
    },
    data: {
      workspaceId
    }
  });
}

export async function requireTeleprompterWorkspaceAccess(params: {
  workspaceId: string;
  userId: string;
  email?: string | null;
}) {
  await requireWorkspaceAccess(params);
}

export async function requireTeleprompterDocAccess(params: {
  docId: string;
  userId: string;
  email?: string | null;
}) {
  const { docId, userId, email } = params;
  const doc = await prisma.teleprompterDoc.findUnique({
    where: {
      id: docId
    },
    select: {
      id: true,
      workspaceId: true,
      createdById: true
    }
  });

  if (!doc) {
    throw new Error("NOT_FOUND");
  }

  if (doc.workspaceId) {
    await requireWorkspaceAccess({
      workspaceId: doc.workspaceId,
      userId,
      email
    });
    return doc;
  }

  if (doc.createdById !== userId) {
    throw new Error("NOT_FOUND");
  }

  return doc;
}

export async function requireTeleprompterSectionAccess(params: {
  sectionId: string;
  userId: string;
  email?: string | null;
}) {
  const { sectionId, userId, email } = params;
  const section = await prisma.teleprompterSection.findUnique({
    where: {
      id: sectionId
    },
    select: {
      id: true,
      doc: {
        select: {
          id: true,
          workspaceId: true,
          createdById: true
        }
      }
    }
  });

  if (!section) {
    throw new Error("NOT_FOUND");
  }

  if (section.doc.workspaceId) {
    await requireWorkspaceAccess({
      workspaceId: section.doc.workspaceId,
      userId,
      email
    });
    return section;
  }

  if (section.doc.createdById !== userId) {
    throw new Error("NOT_FOUND");
  }

  return section;
}
