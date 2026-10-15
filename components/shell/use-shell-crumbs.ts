"use client";

import { useMemo, useSyncExternalStore } from "react";
import type { ProjectAssetView } from "@/components/shell/project-nav";
import type { ShellRoute } from "@/components/shell/shell-route";
import {
  buildGenericBreadcrumbs,
  buildGroupsBreadcrumbs,
  buildProjectBreadcrumbs,
  getGroupBreadcrumbTopic,
  publishedGroupTopicForRow,
  subscribeGroupBreadcrumbTopic,
  type AppBreadcrumb
} from "@/src/lib/app-breadcrumbs";
import type { ProjectShellData } from "@/src/lib/project-shell";

/**
 * The top bar's crumbs: Groups (with the topic the group page publishes), project pages
 * (workspace / project / folders / asset), or one crumb per segment. The dashboard is one crumb
 * (hidden: its header plate already names the workspace).
 */
export function useShellCrumbs({
  route,
  project,
  assetView
}: {
  route: ShellRoute;
  project: ProjectShellData | null;
  assetView: ProjectAssetView;
}): AppBreadcrumb[] {
  const groupTopic = useSyncExternalStore(subscribeGroupBreadcrumbTopic, getGroupBreadcrumbTopic, () => null);
  return useMemo(() => {
    const groups = buildGroupsBreadcrumbs(route.segments, publishedGroupTopicForRow(groupTopic, route.segments[1]));
    if (groups) return groups;
    if (route.projectId) {
      const openFolderId = assetView.scope === "active" ? assetView.folderId : "all";
      return buildProjectBreadcrumbs({
        projectId: route.projectId,
        mediaId: route.mediaId,
        workspace: project?.workspace ?? null,
        projectName: project?.projectName ?? null,
        folders: project?.folders ?? [],
        currentAsset: project?.currentAsset ?? null,
        currentFolderName:
          route.isProjectAssetsRoute && openFolderId !== "all" && openFolderId !== "root"
            ? project?.folders.find((folder) => folder.id === openFolderId)?.name ?? null
            : null
      });
    }
    return buildGenericBreadcrumbs(route.segments);
  }, [route, groupTopic, project, assetView]);
}
