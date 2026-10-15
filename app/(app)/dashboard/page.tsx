import type { Metadata } from "next";
import { type PlatformRole } from "@prisma/client";
import { ProducerPackages } from "@/components/home/producer-packages";
import { StudentHome } from "@/components/home/student-home";
import { normalizeSort, normalizeView, packagePeopleLine, plural, type SortValue } from "@/components/home/home-format";
import { isAppReviewEmail } from "@/src/lib/app-review";
import { getCurrentAppUser } from "@/src/lib/current-app-user";
import { userDisplayName } from "@/src/lib/user-display";
import { buildPlatformAccess } from "@/src/lib/platform-admin";
import { prisma } from "@/src/lib/prisma";
import {
  getDashboardData as fetchDashboardPanels,
  loadStudentDashboardSnapshot,
  type StudentDashboardSnapshot
} from "@/src/server/dashboard-data";
import { buildWorkspaceAccessWhere } from "@/src/server/workspace-access";

type DashboardPageProps = {
  searchParams: Promise<{ workspaceId?: string; sort?: string; view?: string }>;
};

/** includeProjects: false for students, whose dashboard shows the snapshot instead of projects. */
async function getDashboardData(
  userId: string,
  platformRole: PlatformRole | null,
  email: string | null,
  includeProjects: boolean
) {
  return prisma.workspace.findMany({
    where: buildWorkspaceAccessWhere({
      userId,
      platformRole,
      email
    }),
    select: {
      id: true,
      name: true,
      members: {
        where: {
          userId
        },
        select: {
          role: true
        },
        take: 1
      },
      projects: {
        orderBy: { createdAt: "desc" },
        ...(includeProjects ? {} : { take: 0 }),
        select: {
          id: true,
          name: true,
          updatedAt: true,
          _count: {
            select: {
              mediaItems: true
            }
          }
        }
      }
    },
    orderBy: {
      name: "asc"
    }
  });
}

function canCreateInWorkspace(role: string | undefined) {
  if (!role) {
    return false;
  }

  return role === "OWNER_ADMIN" || role === "EDITOR";
}

function sortProjects<T extends { name: string; updatedAt: Date; _count: { mediaItems: number } }>(
  projects: T[],
  sortValue: SortValue
) {
  return [...projects].sort((a, b) => {
    if (sortValue === "recent") {
      return b.updatedAt.getTime() - a.updatedAt.getTime();
    }

    if (sortValue === "size") {
      return b._count.mediaItems - a._count.mediaItems;
    }

    return a.name.localeCompare(b.name);
  });
}

/**
 * A failed snapshot shows inline errors on Home's Grade and This week panels instead of taking
 * the whole page to the error screen (and never turns a student into the producer view).
 */
async function loadSnapshotOrNull(userId: string): Promise<StudentDashboardSnapshot | null> {
  try {
    return await loadStudentDashboardSnapshot(userId);
  } catch (error) {
    console.error("Failed to load the student dashboard snapshot:", error);
    return null;
  }
}

/** The tab says what the sidebar says: "Packages" for producers, "Dashboard" for everyone else. */
export async function generateMetadata(): Promise<Metadata> {
  const { platformRole } = await getCurrentAppUser();
  return { title: buildPlatformAccess(platformRole).canManageWorkspaces ? "Packages" : "Dashboard" };
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const [{ workspaceId, sort, view }, currentAppUser] = await Promise.all([searchParams, getCurrentAppUser()]);
  const { userId, user, platformRole } = currentAppUser;
  const access = buildPlatformAccess(platformRole);
  // The App Review account sees its sample workspace's projects, not a (blank) student snapshot.
  const isStudent = !access.canManageWorkspaces && !isAppReviewEmail(user.email);
  // The student snapshot doesn't depend on workspaces, so start everything at once.
  const workspacesPromise = getDashboardData(userId, platformRole, user.email, !isStudent);
  const viewerName = userDisplayName(user) || user.name;
  const [workspaces, dashboardPanels, snapshot] = await Promise.all([
    workspacesPromise,
    workspacesPromise.then((loaded) =>
      fetchDashboardPanels({
        userId,
        userName: viewerName,
        userEmail: user.email,
        workspaceIds: loaded.map((workspace) => workspace.id)
      })
    ),
    isStudent ? loadSnapshotOrNull(userId) : Promise.resolve(null)
  ]);
  const { upNext, activity } = dashboardPanels;
  const peopleLine = upNext ? packagePeopleLine({ memberNames: upNext.memberNames, producerName: upNext.producerName }) : null;

  if (isStudent) {
    const firstName = (viewerName || "").trim().split(/\s+/)[0] || null;
    return <StudentHome firstName={firstName} upNext={upNext} activity={activity} snapshot={snapshot} peopleLine={peopleLine} />;
  }

  const selectedWorkspace = workspaces.find((workspace) => workspace.id === workspaceId) ?? workspaces[0] ?? null;
  const selectedWorkspaceRole = selectedWorkspace?.members[0]?.role;
  const sortValue = normalizeSort(sort);
  const projects = selectedWorkspace ? sortProjects(selectedWorkspace.projects, sortValue) : [];
  const canCreate = access.canManageWorkspaces && selectedWorkspace !== null && canCreateInWorkspace(selectedWorkspaceRole);
  const accountName = userDisplayName(user) || `${(user.email ?? "Your").split("@")[0]}'s Account`;
  // Only producers can ever add projects; for them, say who in the workspace can.
  const createHint = !canCreate && access.canManageWorkspaces ? "Workspace owners and editors can add projects." : null;
  const description = selectedWorkspace
    ? `${plural(projects.length, "project")} · ${plural(workspaces.length, "workspace")} · Shows Wed & Fri`
    : "Projects show here once you're added to a workspace.";

  return (
    <ProducerPackages
      eyebrow={access.canManageWorkspaces ? "Packages" : "Dashboard"}
      title={selectedWorkspace?.name ?? accountName}
      description={description}
      selectedWorkspace={selectedWorkspace ? { id: selectedWorkspace.id, name: selectedWorkspace.name } : null}
      workspaces={workspaces.map((workspace) => ({ id: workspace.id, name: workspace.name }))}
      projects={projects}
      sort={sortValue}
      view={normalizeView(view)}
      canCreate={canCreate}
      createHint={createHint}
      canDelete={access.canManageWorkspaces}
      upNext={upNext}
      peopleLine={peopleLine}
      activity={activity}
    />
  );
}
