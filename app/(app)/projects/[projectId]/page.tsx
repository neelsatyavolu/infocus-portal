import { notFound } from "next/navigation";
import { Video } from "lucide-react";
import { ProjectAssetsToolbar } from "@/components/project-assets-toolbar";
import { ProjectMediaTiles } from "@/components/project-media-tiles";
import { ProjectShellBridge } from "@/components/project-shell-bridge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { isDirectChildFolder, isFinalCutFolderName } from "@/src/lib/project-folders";
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

function StatTile({
  label,
  value,
  compact = false,
  dim = false
}: {
  label: string;
  value: string;
  compact?: boolean;
  dim?: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-[rgb(10,10,10,0.55)] px-4 py-3.5 backdrop-blur">
      <div className="font-display text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--ink-text)]">
        {label}
      </div>
      <div
        className={`mt-1.5 font-display italic font-extrabold tracking-tight ${
          dim ? "text-[var(--ink-5)]" : "text-white"
        } ${compact ? "text-lg leading-tight" : "text-[28px] leading-none"}`}
      >
        {value || "—"}
      </div>
    </div>
  );
}

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
    canManageProjectMedia = membership.role !== "REVIEWER" || hasPlatformRole(platformAccess.role, "ASSOCIATE_PRODUCER");
  } catch (error) {
    if (error instanceof Error && (error.message === "FORBIDDEN" || error.message === "NOT_FOUND")) {
      return null;
    }

    throw error;
  }

  const [hasPendingVersions, shellData] = await Promise.all([
    projectHasPendingMediaVersions(params.projectId),
    getProjectShellData({
      projectId: params.projectId,
      canViewShareLinks: isDirectMember
    })
  ]);
  const mediaPage = await getProjectMediaPage({
    projectId: params.projectId,
    filter: params.filter,
    sort: params.sort,
    scope: params.scope,
    folderId: params.folderId,
    page: params.page
  });

  if (hasPendingVersions) {
    void reconcileProjectMediaStatuses(params.projectId).catch(() => undefined);
  }

  return {
    membership,
    canManageProjectMedia,
    canSyncTurnedInDates,
    shellData,
    mediaPage
  };
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

  const { membership, canManageProjectMedia, canSyncTurnedInDates, shellData, mediaPage } = data;
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
  const showSyncTurnedInButton = canSyncTurnedInDates && scopeValue === "active" && isFinalCutFolderSelected;
  const visibleMediaCount = mediaPage.items.length;
  const hasVisibleFolders =
    scopeValue === "active" &&
    shellData.folders.some((folder) => isDirectChildFolder(selectedFolder?.name ?? null, folder.name));
  const shouldShowEmptyState = visibleMediaCount === 0 && !hasVisibleFolders;

  const totalAssets = shellData.assetCount;
  const totalVersions = mediaPage.items.reduce((sum, item) => sum + item.versions.length, 0);
  const totalComments = mediaPage.items.reduce(
    (sum, item) => sum + item.versions.reduce((vSum, v) => vSum + v._count.comments, 0),
    0
  );
  const stageLabel = isFinalCutFolderSelected ? "Final Cut" : "Initial Cut";
  const initials = shellData.projectName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "PR";

  return (
    <div className="space-y-5">
      <ProjectShellBridge data={shellData} />

      {/* Project hero — slim broadcast bar with eyebrow, title, comments + stage */}
      <section
        className="relative overflow-hidden rounded-2xl border border-border px-5 py-4"
        style={{
          background: "linear-gradient(135deg, #08492A 0%, #0A0A0A 60%, #1F1F1F 100%)"
        }}
      >
        {/* Ambient orb accent */}
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[var(--brand-green)]/10 blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="eyebrow flex items-center gap-2">
              <span className="rec-dot rec-dot-red" />
              {shellData.workspace.name} · Cycle
            </div>
            <h1 className="display-md mt-1 break-words text-white">
              {shellData.projectName}
            </h1>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <StatTile label="Comments" value={`${totalComments}`} compact />
            <StatTile label="Stage" value={stageLabel} compact />
          </div>
        </div>
      </section>

      {collectionMeta ? (
        <section className="rounded-2xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-muted text-foreground">
                {collectionValue === "videos" ? <Video className="h-5 w-5" /> : null}
              </p>
              <h2 className="mt-3 text-3xl font-semibold text-foreground">{collectionMeta.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{collectionMeta.description}</p>
            </div>
            <p className="rounded-full border border-border bg-muted px-3 py-1 text-xs text-muted-foreground">
              {mediaPage.totalCount} {mediaPage.totalCount === 1 ? "asset" : "assets"} in view
            </p>
          </div>
        </section>
      ) : null}

      <ProjectAssetsToolbar
        projectId={projectId}
        projectName={shellData.projectName}
        canUpload={canUpload}
        filterValue={filterValue}
        sortValue={sortValue}
        viewValue={viewValue}
        showSyncTurnedInButton={showSyncTurnedInButton}
        syncTurnedInFolderId={isFinalCutFolderSelected ? selectedFolder?.id ?? null : null}
      />

      {shouldShowEmptyState ? (
        <Card>
          <CardHeader>
            <CardTitle>
              {scopeValue === "deleted"
                ? `No deleted ${(collectionMeta?.title ?? "Videos").toLowerCase()} yet`
                : `No ${(collectionMeta?.title ?? "Videos").toLowerCase()} match this view`}
            </CardTitle>
            <CardDescription>
              {scopeValue === "deleted"
                ? "Deleted assets appear here for 7 days before permanent cleanup."
                : "Try changing filters, switching folders, or upload new media to continue."}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <ProjectMediaTiles
        projectId={projectId}
        viewMode={viewValue}
        canUpload={canUpload}
        canManageProjectMedia={canManageProjectMedia}
        canManageVersionMeta={canManageVersionMeta && canManageProjectMedia}
        canSyncTurnedInDates={canSyncTurnedInDates}
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
    </div>
  );
}
