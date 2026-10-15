import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProjectMediaTiles } from "@/components/project-media-tiles";
import { ProjectShellBridge } from "@/components/project-shell-bridge";
import { resolveThumbnailUrl } from "@/src/lib/media-playback";
import { syncUserProfile } from "@/src/lib/auth";
import { buildMediaVersionImageUrl } from "@/src/lib/media-assets";
import { getPlatformAccess, hasPlatformRole } from "@/src/lib/platform-admin";
import { reconcileProjectMediaStatuses } from "@/src/server/media-reconcile";
import { requireProjectRole } from "@/src/server/memberships";
import {
  getProjectMediaPage,
  normalizeProjectMediaPage,
  projectHasPendingMediaVersions,
  type ProjectMediaFilter,
  type ProjectMediaScope,
  type ProjectMediaSort
} from "@/src/server/project-media";
import { getProjectShellData } from "@/src/server/project-shell";
import { isFinalCutFolderName } from "@/src/lib/project-folders";
import { labeledUser, userDisplayName } from "@/src/lib/user-display";

type ProjectPageProps = {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{
    filter?: string;
    sort?: string;
    view?: string;
    scope?: string;
    folderId?: string;
    collection?: string;
    page?: string;
  }>;
};

function normalize<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T {
  if (!value) {
    return fallback;
  }

  return allowed.includes(value as T) ? (value as T) : fallback;
}

async function getProjectRouteData(params: {
  projectId: string;
  filter: ProjectMediaFilter;
  sort: ProjectMediaSort;
  scope: ProjectMediaScope;
  folderId: string;
  page: number;
}) {
  let membership: Awaited<ReturnType<typeof requireProjectRole>>["membership"];
  let canSyncTurnedInDates = false;
  let canManageProjectMedia = false;
  let canChangeStatus = false;
  let isDirectMember = false;

  try {
    const access = await requireProjectRole(params.projectId, undefined, {
      allowVisibility: true
    });
    membership = access.membership;
    isDirectMember = access.isDirectMember;

    const user = await syncUserProfile(access.userId);
    const platformAccess = await getPlatformAccess(user.email);
    canSyncTurnedInDates = hasPlatformRole(platformAccess.role, "EXECUTIVE_PRODUCER");
    // Same rule as PATCH /api/media/[id]/approval-status.
    canChangeStatus = platformAccess.canManageWorkspaces;
    canManageProjectMedia = membership.role !== "REVIEWER" || hasPlatformRole(platformAccess.role, "ASSOCIATE_PRODUCER");
  } catch (error) {
    if (error instanceof Error && (error.message === "FORBIDDEN" || error.message === "NOT_FOUND")) {
      return null;
    }

    throw error;
  }

  const [hasPendingVersions, shellData, mediaPage] = await Promise.all([
    projectHasPendingMediaVersions(params.projectId),
    getProjectShellData({
      projectId: params.projectId,
      canViewShareLinks: isDirectMember
    }),
    getProjectMediaPage({
      projectId: params.projectId,
      filter: params.filter,
      sort: params.sort,
      scope: params.scope,
      folderId: params.folderId,
      page: params.page
    })
  ]);

  if (hasPendingVersions) {
    void reconcileProjectMediaStatuses(params.projectId).catch(() => undefined);
  }

  return {
    membership,
    canManageProjectMedia,
    canSyncTurnedInDates,
    canChangeStatus,
    shellData,
    mediaPage
  };
}

export async function generateMetadata({ params }: Pick<ProjectPageProps, "params">): Promise<Metadata> {
  const { projectId } = await params;
  try {
    const { project } = await requireProjectRole(projectId, undefined, { allowVisibility: true });
    return { title: project.name || "Project" };
  } catch {
    return { title: "Project" };
  }
}

export default async function ProjectPage({ params, searchParams }: ProjectPageProps) {
  const { projectId } = await params;
  const resolvedSearchParams = await searchParams;

  const filterValue = normalize(resolvedSearchParams.filter, ["all", "ready", "in-progress", "failed"] as const, "all");
  const sortValue = normalize(resolvedSearchParams.sort, ["recent", "name", "status"] as const, "recent");
  const viewValue = normalize(resolvedSearchParams.view, ["grid", "list"] as const, "grid");
  const scopeValue = normalize(resolvedSearchParams.scope, ["active", "deleted"] as const, "active");
  const folderIdValue = resolvedSearchParams.folderId ?? "all";
  const collectionValue = resolvedSearchParams.collection === "videos" ? resolvedSearchParams.collection : null;
  const pageValue = normalizeProjectMediaPage(resolvedSearchParams.page);

  const data = await getProjectRouteData({
    projectId,
    filter: filterValue,
    sort: sortValue,
    scope: scopeValue,
    folderId: folderIdValue,
    page: pageValue
  });

  if (!data) {
    notFound();
  }

  const { membership, canManageProjectMedia, canSyncTurnedInDates, canChangeStatus, shellData, mediaPage } = data;
  const collectionMeta = collectionValue
    ? {
        videos: {
          title: "Videos",
          description: "This collection contains all video files in this project."
        }
      }[collectionValue]
    : null;

  const canUpload = true;
  const canManageVersionMeta = membership.role !== "REVIEWER";
  const selectedFolder = shellData.folders.find((folder) => folder.id === folderIdValue) ?? null;
  const isFinalCutFolderSelected = Boolean(selectedFolder && isFinalCutFolderName(selectedFolder.name));

  return (
    <>
      <ProjectShellBridge data={shellData} />
      <ProjectMediaTiles
        projectId={projectId}
        projectName={shellData.projectName}
        workspaceName={shellData.workspace.name}
        projectAssetCount={shellData.assetCount}
        collection={collectionValue}
        collectionDescription={collectionMeta?.description ?? null}
        viewMode={viewValue}
        filterValue={filterValue}
        sortValue={sortValue}
        canUpload={canUpload}
        canManageProjectMedia={canManageProjectMedia}
        canManageVersionMeta={canManageVersionMeta && canManageProjectMedia}
        canSyncTurnedInDates={canSyncTurnedInDates}
        canChangeStatus={canChangeStatus}
        scope={scopeValue}
        selectedFolderId={folderIdValue}
        finalCutFolderId={isFinalCutFolderSelected ? selectedFolder?.id ?? null : null}
        pagination={{
          page: mediaPage.page,
          pageSize: mediaPage.pageSize,
          totalItems: mediaPage.totalCount,
          totalPages: mediaPage.totalPages
        }}
        folders={shellData.folders.map((folder) => ({
          id: folder.id,
          name: folder.name,
          itemCount: folder.activeMediaCount
        }))}
        items={await Promise.all(
          mediaPage.items.map(async (media) => ({
            id: media.id,
            title: media.title,
            reviewHref: `/projects/${projectId}/review/${media.id}`,
            currentVersionId: media.currentVersionId,
            folderId: media.folderId,
            deletedAt: media.deletedAt?.toISOString() ?? null,
            deletedByName: media.deletedBy
              ? userDisplayName(media.deletedBy) || media.deletedBy.email
              : null,
            assignedMembers: media.memberAssignments.map((assignment) => ({
              userId: assignment.user.id,
              ...labeledUser(assignment.user)
            })),
            versions: await Promise.all(
              media.versions.map(async (version) => ({
                id: version.id,
                versionNumber: version.versionNumber,
                sourceType: version.sourceType,
                status: version.status,
                approvalStatus: version.approvalStatus,
                airedAt: version.airedAt?.toISOString() ?? null,
                thumbnailUrl:
                  version.sourceType === "IMAGE"
                    ? buildMediaVersionImageUrl(media.id, version.id)
                    : await resolveThumbnailUrl(version),
                durationSeconds: version.durationSeconds ?? null,
                createdAt: version.createdAt.toISOString(),
                createdByName: version.createdBy
                  ? userDisplayName(version.createdBy) || version.createdBy.email || "Unknown uploader"
                  : "Unknown uploader",
                commentCount: version._count.comments
              }))
            )
          }))
        )}
      />
    </>
  );
}
