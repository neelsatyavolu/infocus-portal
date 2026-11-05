import type { ReactNode } from "react";
import { StatusTag } from "@/components/kit/status-tag";
import { PageHeader } from "@/components/page-header";
import type { FolderItem, ScopeMode } from "@/components/project-assets/types";
import { folderDisplayName, folderParentPath } from "@/src/lib/project-folders";

function Num({ children }: { children: ReactNode }) {
  return <span className="font-mono-broadcast tabular-nums">{children}</span>;
}

function plural(count: number, singular: string) {
  return count === 1 ? singular : `${singular}s`;
}

/** "{n} assets", "{n} comments"… with the number in Geist Mono. */
function Count({ count, noun }: { count: number; noun: string }) {
  return (
    <>
      <Num>{count}</Num> {plural(count, noun)}
    </>
  );
}

/**
 * The project plate. The title is the place you're looking at (project, folder, Videos or
 * Recently deleted); the eyebrow is one level up: the workspace at the project root, the parent
 * folder (a Cycle group) inside a stage folder, otherwise the project. The summary counts the
 * place, not just this page: every active asset in the project at the root, the open folder's
 * own count (subfolders included) inside one, plus its subfolders; comments (on the assets on
 * this page) only when there are any. Recently deleted says only how long items stay. What's
 * in view (status filter and page applied) is counted in the toolbar, in every scope. The one
 * tag is "{n} processing" while assets on this page are uploading or processing (the page polls
 * until they finish, so it clears by itself). On phones the actions stay on the title row at
 * 40px (36px from md, like the toolbar) and the summary is clamped to one line.
 */
export function ProjectHeader({
  projectName,
  workspaceName,
  projectAssetCount,
  scope,
  collection,
  collectionDescription,
  folder,
  folderCount,
  totalItems,
  totalPages,
  totalComments,
  processingCount,
  actions
}: {
  projectName: string;
  workspaceName: string;
  /** Active assets in the whole project (folders included). */
  projectAssetCount: number;
  scope: ScopeMode;
  collection: "videos" | null;
  collectionDescription: string | null;
  /** The open folder, when one is open. */
  folder: FolderItem | null;
  /** Subfolders shown here. */
  folderCount: number;
  /** Assets in this view (all pages); used by the Videos collection. */
  totalItems: number;
  totalPages: number;
  /** Comments on the assets on this page (all versions). */
  totalComments: number;
  /** Assets on this page still uploading or processing. */
  processingCount: number;
  actions: ReactNode;
}) {
  const deleted = scope === "deleted";
  const openFolder = !deleted && !collection ? folder : null;
  const parentPath = openFolder ? folderParentPath(openFolder.name) : null;
  const eyebrow = openFolder
    ? parentPath
      ? folderDisplayName(parentPath)
      : projectName
    : deleted || collection
      ? projectName
      : workspaceName || "Project";
  const title = deleted ? "Recently deleted" : collection ? "Videos" : folder ? folderDisplayName(folder.name) : projectName;
  // Comments cover this page's assets only; say so when the asset count covers more than that.
  const comments =
    totalComments > 0 ? (
      <>
        {" · "}
        <Count count={totalComments} noun="comment" />
        {totalPages > 1 || folderCount > 0 ? " on this page" : null}
      </>
    ) : null;

  const description = deleted ? (
    "Deleted assets appear here for 7 days before permanent cleanup."
  ) : collection ? (
    <>
      {collectionDescription} · <Num>{totalItems}</Num> {plural(totalItems, "asset")} in view
      {comments}
    </>
  ) : (
    <>
      <Count count={openFolder ? openFolder.itemCount : projectAssetCount} noun="asset" />
      {folderCount > 0 ? (
        <>
          {" · "}
          <Count count={folderCount} noun="folder" />
        </>
      ) : null}
      {comments}
    </>
  );

  const status =
    processingCount > 0 ? (
      <StatusTag tone="neutral" dot>
        {processingCount} processing
      </StatusTag>
    ) : null;

  return (
    <PageHeader
      eyebrow={eyebrow}
      status={status}
      title={title}
      description={<span className={deleted ? "block" : "block max-sm:truncate"}>{description}</span>}
      className="max-sm:flex-nowrap max-sm:items-start max-sm:gap-x-3 max-sm:[&>div:first-child]:basis-0 max-sm:[&>div:last-child]:w-auto max-sm:[&>div:last-child]:shrink-0 max-md:[&>div:last-child>*]:h-10"
      actions={actions}
    />
  );
}
