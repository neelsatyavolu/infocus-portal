"use client";

import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Alert } from "@/components/kit/alert";
import { useHotkeys } from "@/components/kit/hotkeys";
import { useRememberedState } from "@/components/kit/remembered-state";
import { ProjectAssetsToolbar } from "@/components/project-assets-toolbar";
import { AssetCard, type AssetContext } from "@/components/project-assets/asset-card";
import { AssetsEmptyState, AssetsFilterEmpty } from "@/components/project-assets/assets-empty-state";
import { AssetListHeader, AssetRow } from "@/components/project-assets/asset-row";
import {
  buildProjectQueryHref,
  commonFolderValue,
  folderStages,
  getActiveVersion,
  keepExistingSelection,
  pageRange,
  pendingItemCount,
  reconcileVersionOverrides,
  selectAllState,
  viewCountNoun,
  type ProjectQueryUpdates
} from "@/components/project-assets/format";
import { FolderRow, FolderTile } from "@/components/project-assets/folder-tile";
import { ProjectHeaderActions } from "@/components/project-assets/header-actions";
import { LIST_SHELL } from "@/components/project-assets/list-layout";
import { ProjectDialogs } from "@/components/project-assets/project-dialogs";
import { ProjectHeader } from "@/components/project-assets/project-header";
import { SectionBar } from "@/components/project-assets/section-bar";
import { SelectionBar } from "@/components/project-assets/selection-bar";
import type {
  FilterValue,
  FolderItem,
  MediaTileItem,
  PageNotice,
  ScopeMode,
  SortValue,
  UploadAction,
  ViewMode
} from "@/components/project-assets/types";
import { useViewMode } from "@/components/project-assets/use-view-mode";
import { useAssetDelete } from "@/components/project-assets/use-asset-delete";
import { useAssetDrag } from "@/components/project-assets/use-asset-drag";
import { useAssetEdits } from "@/components/project-assets/use-asset-edits";
import { useAssetPeople } from "@/components/project-assets/use-asset-people";
import { useCreateFolder } from "@/components/project-assets/use-create-folder";
import { useProjectUploads } from "@/components/project-assets/use-project-uploads";
import { useStableCallbacks } from "@/components/project-assets/use-stable-callbacks";
import { UploadProgressToast } from "@/components/upload-progress-toast";
import type { DropdownOption } from "@/components/video-card-menu";
import { Button } from "@/components/ui/button";
import { folderDisplayName, folderPathSegments, isDirectChildFolder } from "@/src/lib/project-folders";
import { cn } from "@/src/lib/utils";

const DragPreview = dynamic(() => import("@/components/project-assets/drag-preview"), { ssr: false });

/** Folder tiles and asset cards share one column grid, so their columns line up. */
const TILE_GRID = "grid gap-3 grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(232px,1fr))]";
const SECTIONS_KEY = "projectAssets:sections:v1";

type SectionsState = { folders: boolean; assets: boolean };

function isSectionsState(value: unknown): value is SectionsState {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as SectionsState).folders === "boolean" &&
    typeof (value as SectionsState).assets === "boolean"
  );
}

/** True while a Radix menu or popover is open (Esc belongs to it, not the selection). */
function popoverOpen() {
  return document.querySelector("[data-radix-popper-content-wrapper]") !== null;
}

type ProjectMediaTilesProps = {
  projectId: string;
  /** The header plate's title at the project root (from the shell data the page already loads). */
  projectName: string;
  /** The header's eyebrow at the project root. */
  workspaceName: string;
  /** Active assets in the whole project (folders included), for the header at the root. */
  projectAssetCount: number;
  /** "videos" for the Videos collection view. */
  collection: "videos" | null;
  collectionDescription: string | null;
  canUpload: boolean;
  canManageProjectMedia: boolean;
  canManageVersionMeta: boolean;
  canSyncTurnedInDates: boolean;
  /** Platform producers only (the approval-status route's rule). */
  canChangeStatus: boolean;
  items: MediaTileItem[];
  folders: FolderItem[];
  scope: ScopeMode;
  selectedFolderId: string;
  finalCutFolderId: string | null;
  filterValue: FilterValue;
  sortValue: SortValue;
  viewMode: ViewMode;
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
};

/**
 * The project assets page (/projects/<id>) below the shell: header, toolbar or selection bar,
 * folders, assets (grid or list), pagination, dialogs and the upload toast. It owns the page
 * state; the pieces live in components/project-assets/.
 */
export function ProjectMediaTiles({
  projectId,
  projectName,
  workspaceName,
  projectAssetCount,
  collection,
  collectionDescription,
  canUpload,
  canManageProjectMedia,
  canManageVersionMeta,
  canSyncTurnedInDates,
  canChangeStatus,
  items: initialItems,
  folders,
  scope,
  selectedFolderId,
  finalCutFolderId,
  filterValue,
  sortValue,
  viewMode: viewModeFromServer,
  pagination
}: ProjectMediaTilesProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [queryNavigationPending, startQueryNavigationTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const refreshTimerRef = useRef<number | null>(null);
  const lastHandledNewActionRef = useRef<string | null>(null);
  const shareParamHandledRef = useRef(false);

  const [items, setItems] = useState(initialItems);
  const [foldersState, setFoldersState] = useState(folders);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  /** Version-menu picks only; a card without one shows its newest version. */
  const [selectedVersionByMedia, setSelectedVersionByMedia] = useState<Record<string, string>>({});
  // Read only by the file input's change handler, so it never needs a render.
  const uploadActionRef = useRef<UploadAction>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [sections, setSections] = useRememberedState<SectionsState>(SECTIONS_KEY, { folders: true, assets: true }, isSectionsState);
  const [notice, setNotice] = useState<PageNotice>(null);

  const showError = useCallback((message: string) => setNotice({ tone: "danger", message }), []);
  const showWarning = useCallback((message: string) => setNotice({ tone: "warning", message }), []);
  const clearNotice = useCallback(() => setNotice(null), []);
  const refresh = useCallback(() => router.refresh(), [router]);

  const [viewMode, changeView] = useViewMode(searchParams, viewModeFromServer);

  const folderOptions: DropdownOption<string>[] = useMemo(
    () => [
      { value: "root", label: "Root assets" },
      ...foldersState.map((folder) => ({
        value: folder.id,
        label: folderPathSegments(folder.name).join(" / ")
      }))
    ],
    [foldersState]
  );

  const selectedFolder = useMemo(
    () => foldersState.find((folder) => folder.id === selectedFolderId) ?? null,
    [foldersState, selectedFolderId]
  );

  const folderCards = useMemo(() => {
    if (scope !== "active") {
      return [] as FolderItem[];
    }

    const parentName =
      selectedFolderId === "all" || selectedFolderId === "root" ? null : selectedFolder?.name ?? null;
    if (selectedFolderId !== "all" && selectedFolderId !== "root" && !parentName) {
      return [] as FolderItem[];
    }

    return foldersState.filter((folder) => isDirectChildFolder(parentName, folder.name));
  }, [foldersState, scope, selectedFolder, selectedFolderId]);

  const folderStagesById = useMemo(
    () => new Map(folderCards.map((folder) => [folder.id, folderStages(folder, foldersState)])),
    [folderCards, foldersState]
  );

  const assetItems = useMemo(() => {
    if (scope !== "active" || selectedFolderId !== "all") {
      return items;
    }

    return items.filter((item) => item.folderId === null);
  }, [items, scope, selectedFolderId]);

  const uploadTargetFolderId = useMemo(() => {
    if (scope !== "active" || selectedFolderId === "all" || selectedFolderId === "root") {
      return null;
    }

    return selectedFolderId;
  }, [scope, selectedFolderId]);

  const isFinalCutFolderSelected = scope === "active" && finalCutFolderId !== null && selectedFolderId === finalCutFolderId;
  const showPackageActions = isFinalCutFolderSelected;

  const selectedCount = selectedIds.length;
  const assetIds = useMemo(() => assetItems.map((item) => item.id), [assetItems]);
  const selectAll = selectAllState(assetIds, selectedIds);

  const scheduleRefresh = useCallback(
    (delayMs = 2500) => {
      if (refreshTimerRef.current) {
        window.clearTimeout(refreshTimerRef.current);
      }

      refreshTimerRef.current = window.setTimeout(() => {
        router.refresh();
        refreshTimerRef.current = null;
      }, delayMs);
    },
    [router]
  );

  const uploads = useProjectUploads({
    projectId,
    uploadTargetFolderId,
    items,
    selectedVersionByMedia,
    setItems,
    setSelectedVersionByMedia,
    onError: showError,
    onWarning: showWarning,
    scheduleRefresh
  });
  const people = useAssetPeople({ projectId, items, setItems, showPackageActions, onError: showError });
  const removal = useAssetDelete({ canManageVersionMeta, setItems, setSelectedIds, refresh, onError: showError });
  const edits = useAssetEdits({
    projectId,
    items,
    selectedIds,
    setItems,
    setSelectedIds,
    setSelectedVersionByMedia,
    refresh,
    canSyncTurnedInDates,
    showPackageActions,
    onError: showError,
    onWarning: showWarning,
    clearNotice
  });
  const drag = useAssetDrag({
    items,
    selectedIds,
    selectedVersionByMedia,
    moveOne: (mediaId, folderValue) => void edits.moveMediaToFolder(mediaId, folderValue),
    moveSelected: (folderValue) => void edits.moveSelectedToFolder(folderValue)
  });
  const folderDialog = useCreateFolder({ projectId, selectedFolderId, foldersState, setFoldersState, refresh });

  // New server data (navigation, the 4s processing poll, any refresh): keep what is still there
  // selected, and keep Version-menu picks whose version still exists.
  const [syncedItems, setSyncedItems] = useState(initialItems);
  if (initialItems !== syncedItems) {
    setSyncedItems(initialItems);
    setItems(initialItems);
    setSelectedIds((current) => keepExistingSelection(current, initialItems));
    setSelectedVersionByMedia((current) => reconcileVersionOverrides(current, initialItems));
  }

  // Another folder, scope, page, filter or sort is a new set of assets: start a fresh selection.
  const assetSetKey = JSON.stringify([scope, selectedFolderId, pagination.page, filterValue, sortValue]);
  const [selectionAssetSetKey, setSelectionAssetSetKey] = useState(assetSetKey);
  if (assetSetKey !== selectionAssetSetKey) {
    setSelectionAssetSetKey(assetSetKey);
    setSelectedIds([]);
  }

  const [syncedFolders, setSyncedFolders] = useState(folders);
  if (folders !== syncedFolders) {
    setSyncedFolders(folders);
    setFoldersState(folders);
  }

  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) {
        window.clearTimeout(refreshTimerRef.current);
      }
    };
  }, []);

  const hasPendingUpload = useMemo(
    () =>
      items.some((item) =>
        item.versions.some((version) => version.status === "UPLOADING" || version.status === "PROCESSING")
      ) || uploads.hasActiveUpload,
    [items, uploads.hasActiveUpload]
  );

  // Keyed on the boolean so progress updates don't keep restarting the 4s timer.
  useEffect(() => {
    if (!hasPendingUpload) {
      return;
    }

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        router.refresh();
      }
    }, 4000);

    return () => window.clearInterval(intervalId);
  }, [hasPendingUpload, router]);

  const processingCount = useMemo(
    () => pendingItemCount(items, uploads.activeUploads.map((upload) => upload.mediaId)),
    [items, uploads.activeUploads]
  );

  const buildQueryHref = useCallback(
    (updates: ProjectQueryUpdates) => buildProjectQueryHref(pathname, searchParams.toString(), updates),
    [pathname, searchParams]
  );

  const updateQuery = useCallback(
    (updates: ProjectQueryUpdates, { replace = false }: { replace?: boolean } = {}) => {
      const href = buildQueryHref(updates);
      startQueryNavigationTransition(() => {
        if (replace) {
          router.replace(href as never, { scroll: false });
        } else {
          router.push(href as never);
        }
      });
    },
    [buildQueryHref, router, startQueryNavigationTransition]
  );

  const openReviewHref = useCallback(
    (href: string) => {
      startQueryNavigationTransition(() => {
        router.push(href as never);
      });
    },
    [router, startQueryNavigationTransition]
  );

  const openShare = useCallback(() => {
    setShareOpen(true);
  }, []);

  useEffect(() => {
    window.addEventListener("infocus:open-project-share", openShare);
    return () => window.removeEventListener("infocus:open-project-share", openShare);
  }, [openShare]);

  // ?share=1 opens Share links once; later query changes (which keep the param) don't reopen it.
  useEffect(() => {
    const shareParam = searchParams.get("share") === "1";
    if (shareParam && !shareParamHandledRef.current) {
      openShare();
    }
    shareParamHandledRef.current = shareParam;
  }, [openShare, searchParams]);

  const openFolderDialog = folderDialog.openDialog;
  useEffect(() => {
    const newValue = searchParams.get("new");

    if (!newValue) {
      lastHandledNewActionRef.current = null;
      return;
    }

    if (lastHandledNewActionRef.current === newValue) {
      return;
    }

    lastHandledNewActionRef.current = newValue;

    if (newValue === "upload") {
      if (!canUpload) {
        updateQuery({ new: null }, { replace: true });
        return;
      }

      uploadActionRef.current = { kind: "new" };
      fileInputRef.current?.click();
      updateQuery({ new: null }, { replace: true });
      return;
    }

    if (newValue === "folder") {
      openFolderDialog();
      updateQuery({ new: null }, { replace: true });
    }
    // openFolderDialog only sets state; its identity changes each render and must not re-run this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canUpload, searchParams, updateQuery]);

  function toggleSelect(mediaId: string) {
    setSelectedIds((current) =>
      current.includes(mediaId) ? current.filter((id) => id !== mediaId) : [...current, mediaId]
    );
  }

  function toggleSelectAll() {
    if (selectAll === "all") {
      setSelectedIds([]);
      return;
    }
    setSelectedIds(assetItems.map((item) => item.id));
  }

  function triggerVersionUploadForSelected() {
    if (selectedCount === 0) return;
    if (selectedCount > 1) {
      showWarning("Select one video to upload a new version.");
      return;
    }

    uploadActionRef.current = { kind: "version", mediaId: selectedIds[0] };
    fileInputRef.current?.click();
  }

  function triggerVersionUploadForMedia(mediaId: string) {
    if (!canUpload || scope !== "active") {
      return;
    }

    uploadActionRef.current = { kind: "version", mediaId };
    fileInputRef.current?.click();
  }

  function triggerNewUpload() {
    if (!canUpload) {
      return;
    }

    uploadActionRef.current = { kind: "new" };
    fileInputRef.current?.click();
  }

  async function onFileSelected(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    const uploadAction = uploadActionRef.current;
    if (files.length === 0 || !uploadAction) return;

    await uploads.uploadFiles(files, uploadAction);

    uploadActionRef.current = null;
    event.target.value = "";
  }

  // Stable handlers for the memoized cards, rows and tiles, so a progress tick re-renders only
  // the card whose upload moved.
  const actions = useStableCallbacks({
    toggleSelect,
    openReview: openReviewHref,
    prefetch: (href: string) => router.prefetch(href as never),
    dragStart: drag.onMediaDragStart,
    dragEnd: drag.onMediaDragEnd,
    selectVersion: (mediaId: string, versionId: string) =>
      setSelectedVersionByMedia((current) => ({ ...current, [mediaId]: versionId })),
    requestStatusChange: edits.status.request,
    uploadVersion: triggerVersionUploadForMedia,
    moveIntoVersion: edits.moveIntoVersion.request,
    downloadOriginal: edits.download.request,
    rename: edits.rename.request,
    syncTurnedIn: (mediaId: string) => void edits.syncTurnedInDateForMedia(mediaId),
    softDelete: (mediaId: string) => removal.requestSoftDelete([mediaId]),
    restore: (mediaId: string) => void removal.restoreMediaByIds([mediaId]),
    permanentDelete: (mediaId: string) => removal.requestPermanentDelete([mediaId]),
    setPeopleOpen: people.setPickerOpen,
    removePerson: people.toggleAssignedMember,
    addPeople: people.openAddPeople,
    openFolder: (folderId: string) => updateQuery({ scope: "active", folderId }),
    prefetchFolder: (folderId: string) => router.prefetch(buildQueryHref({ scope: "active", folderId }) as never),
    dragTargetFolder: drag.setDragTarget,
    dropFolder: drag.onFolderDrop
  });

  const context = useMemo<AssetContext>(
    () => ({
      scope,
      canUpload,
      canManageProjectMedia,
      canManageVersionMeta,
      canSyncTurnedInDates,
      canChangeStatus,
      showPackageActions,
      deleteBusy: removal.isDeleting
    }),
    [
      canChangeStatus,
      canManageProjectMedia,
      canManageVersionMeta,
      canSyncTurnedInDates,
      canUpload,
      removal.isDeleting,
      scope,
      showPackageActions
    ]
  );

  useHotkeys(
    {
      Escape: () => {
        if (popoverOpen()) return;
        setSelectedIds([]);
      }
    },
    { enabled: selectedCount > 0 }
  );

  const inFolder = selectedFolder !== null && selectedFolderId !== "all" && selectedFolderId !== "root";
  const uploadDestination = uploadTargetFolderId && selectedFolder ? folderDisplayName(selectedFolder.name) : projectName;
  const totalComments = items.reduce(
    (sum, item) => sum + item.versions.reduce((versionSum, version) => versionSum + version.commentCount, 0),
    0
  );
  const range = pageRange(pagination.page, pagination.pageSize, assetItems.length);
  const dragTargetFolder = drag.dragOverFolderId
    ? foldersState.find((folder) => folder.id === drag.dragOverFolderId) ?? null
    : null;
  const shouldShowEmptyState = assetItems.length === 0 && folderCards.length === 0;
  /** Folders are on screen but the status filter left no assets: say so in the Assets section. */
  const filterMatchesNothing = assetItems.length === 0 && folderCards.length > 0 && filterValue !== "all";
  const peopleColumn = showPackageActions && scope === "active";
  const addPeopleOpen = showPackageActions && Boolean(people.memberAddModalForMediaId);

  const assetItemProps = (item: MediaTileItem) => {
    const activeVersion = getActiveVersion(item, selectedVersionByMedia);
    if (!activeVersion) return null;
    return {
      item,
      activeVersion,
      selected: selectedIds.includes(item.id),
      dragging: drag.draggingMediaId === item.id,
      upload: uploads.activeUploadByMedia.get(item.id) ?? null,
      statusUpdating: edits.status.updatingMediaId === item.id,
      syncingTurnedIn: edits.syncingTurnedInMediaId === item.id,
      membersBusy: people.membersUpdatingMediaId === item.id,
      peopleOpen: showPackageActions && people.memberPickerForMediaId === item.id,
      context,
      actions
    };
  };

  const folderTileProps = (folder: FolderItem) => ({
    folder,
    stages: folderStagesById.get(folder.id) ?? null,
    dragActive: drag.draggingMediaId !== null,
    dragOver: drag.dragOverFolderId === folder.id,
    onOpen: actions.openFolder,
    onPrefetch: actions.prefetchFolder,
    onDragTarget: actions.dragTargetFolder,
    onDropFolder: actions.dropFolder
  });

  return (
    <div className="min-w-0 space-y-5">
      <input ref={fileInputRef} type="file" accept="video/*,image/*" multiple className="hidden" onChange={onFileSelected} />
      {/* Portaled into <body>; the selection bar lifts it above itself on phones. */}
      <UploadProgressToast items={uploads.toastItems} />

      <ProjectHeader
        projectName={projectName}
        workspaceName={workspaceName}
        projectAssetCount={projectAssetCount}
        scope={scope}
        collection={collection}
        collectionDescription={collectionDescription}
        folder={inFolder ? selectedFolder : null}
        folderCount={folderCards.length}
        totalItems={pagination.totalItems}
        totalPages={pagination.totalPages}
        totalComments={totalComments}
        processingCount={processingCount}
        actions={
          <ProjectHeaderActions
            projectId={projectId}
            projectName={projectName}
            scope={scope}
            canUpload={canUpload}
            uploadDestination={uploadDestination}
            onUpload={triggerNewUpload}
            onNewFolder={folderDialog.openDialog}
            showSyncAll={canSyncTurnedInDates && isFinalCutFolderSelected}
            syncFolderId={isFinalCutFolderSelected ? finalCutFolderId : null}
            onError={showError}
          />
        }
      />

      {notice ? (
        <Alert tone={notice.tone} onDismiss={clearNotice} dismissLabel="Dismiss notice">
          {notice.message}
        </Alert>
      ) : null}

      <ProjectAssetsToolbar
        className={selectedCount > 0 ? "lg:hidden" : undefined}
        scope={scope}
        filterValue={filterValue}
        sortValue={sortValue}
        viewValue={viewMode}
        onFilterChange={(filter) => updateQuery({ filter })}
        onSortChange={(sort) => updateQuery({ sort })}
        onViewChange={changeView}
        selectAll={selectAll}
        canSelect={assetItems.length > 0}
        onToggleAll={toggleSelectAll}
        meta={
          assetItems.length === 0 ? null : pagination.totalPages > 1 ? (
            <span className="font-mono-broadcast tabular-nums">
              {range.start}–{range.end} <span className="font-sans">of</span> {pagination.totalItems}
            </span>
          ) : (
            <>
              <span className="font-mono-broadcast tabular-nums">{assetItems.length}</span>{" "}
              {viewCountNoun(assetItems.length, filterValue, scope)}
            </>
          )
        }
        busy={queryNavigationPending}
        showDeleteAllPermanently={scope === "deleted" && assetItems.length > 0}
        deleting={removal.isDeleting}
        onDeleteAllPermanently={() => removal.requestPermanentDelete(assetItems.map((item) => item.id))}
      />

      {selectedCount > 0 ? (
        <SelectionBar
          scope={scope}
          listView={viewMode === "list"}
          count={selectedCount}
          selectAll={selectAll}
          onToggleAll={toggleSelectAll}
          onClear={() => setSelectedIds([])}
          canUpload={canUpload}
          canManageProjectMedia={canManageProjectMedia}
          onUploadVersion={triggerVersionUploadForSelected}
          onMoveIntoVersion={edits.moveIntoVersion.requestSelected}
          folderOptions={folderOptions}
          commonFolder={commonFolderValue(items, selectedIds)}
          moving={edits.isMoving}
          onMoveTo={(value) => void edits.moveSelectedToFolder(value)}
          deleting={removal.isDeleting}
          onDelete={() => removal.requestSoftDelete(selectedIds)}
          onRestore={() => void removal.restoreMediaByIds(selectedIds)}
          onDeletePermanently={() => removal.requestPermanentDelete(selectedIds)}
        />
      ) : null}

      <div
        aria-busy={queryNavigationPending || undefined}
        className={cn("min-w-0 space-y-5 transition-opacity", queryNavigationPending && "opacity-60")}
      >
        {shouldShowEmptyState ? (
          <AssetsEmptyState
            scope={scope}
            filterValue={filterValue}
            canUpload={canUpload}
            uploadDestination={uploadDestination}
            onUpload={triggerNewUpload}
            onShowAll={() => updateQuery({ filter: "all" })}
          />
        ) : null}

        {scope === "active" && folderCards.length > 0 ? (
          <section className="min-w-0 space-y-2" aria-label="Folders">
            <SectionBar
              id="project-folders"
              label="Folders"
              count={folderCards.length}
              open={sections.folders}
              onToggle={() => setSections((current) => ({ ...current, folders: !current.folders }))}
            />
            {sections.folders ? (
              viewMode === "list" ? (
                <ul id="project-folders" className={cn(LIST_SHELL, "divide-y divide-border")}>
                  {folderCards.map((folder) => (
                    <FolderRow key={folder.id} {...folderTileProps(folder)} showPeople={peopleColumn} />
                  ))}
                </ul>
              ) : (
                <div id="project-folders" className={TILE_GRID}>
                  {folderCards.map((folder) => (
                    <FolderTile key={folder.id} {...folderTileProps(folder)} />
                  ))}
                </div>
              )
            ) : null}
          </section>
        ) : null}

        {assetItems.length > 0 || filterMatchesNothing ? (
          <section className="min-w-0 space-y-2" aria-label="Assets">
            {/* With no folders above there is nothing to separate, so the cards follow the toolbar. */}
            {folderCards.length > 0 ? (
              <SectionBar
                id="project-assets"
                label="Assets"
                count={assetItems.length}
                open={sections.assets}
                onToggle={() => setSections((current) => ({ ...current, assets: !current.assets }))}
              />
            ) : null}
            {sections.assets || folderCards.length === 0 ? (
              filterMatchesNothing ? (
                <div id="project-assets" className={LIST_SHELL}>
                  <AssetsFilterEmpty onShowAll={() => updateQuery({ filter: "all" })} />
                </div>
              ) : viewMode === "list" ? (
                <div id="project-assets" className={LIST_SHELL}>
                  <AssetListHeader showPeople={peopleColumn} deleted={scope === "deleted"} />
                  <ul className="divide-y divide-border">
                    {assetItems.map((item) => {
                      const props = assetItemProps(item);
                      return props ? <AssetRow key={item.id} {...props} /> : null;
                    })}
                  </ul>
                </div>
              ) : (
                <div id="project-assets" className={TILE_GRID}>
                  {assetItems.map((item) => {
                    const props = assetItemProps(item);
                    return props ? <AssetCard key={item.id} {...props} /> : null;
                  })}
                </div>
              )
            ) : null}
          </section>
        ) : null}

        {pagination.totalPages > 1 ? (
          <nav aria-label="Pages" className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Page <span className="font-mono-broadcast tabular-nums">{pagination.page}</span> of{" "}
              <span className="font-mono-broadcast tabular-nums">{pagination.totalPages}</span>
            </p>
            <div className="flex items-center gap-2 max-sm:grid max-sm:w-full max-sm:grid-cols-2">
              <Button
                type="button"
                variant="outline"
                className="h-10 md:h-9"
                disabled={pagination.page <= 1}
                onClick={() => updateQuery({ page: pagination.page - 1, preservePage: true })}
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-10 md:h-9"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => updateQuery({ page: pagination.page + 1, preservePage: true })}
              >
                Next
              </Button>
            </div>
          </nav>
        ) : null}
      </div>

      <ProjectDialogs
        projectId={projectId}
        projectName={projectName}
        shareOpen={shareOpen}
        onShareOpenChange={setShareOpen}
        people={people}
        addPeopleOpen={addPeopleOpen}
        addPeopleItem={
          people.memberAddModalForMediaId ? items.find((item) => item.id === people.memberAddModalForMediaId) ?? null : null
        }
        edits={edits}
        removal={removal}
        folder={folderDialog}
      />

      {drag.dragPreview ? (
        <DragPreview
          preview={drag.dragPreview}
          targetFolderName={dragTargetFolder ? folderDisplayName(dragTargetFolder.name) : null}
          overlayRef={drag.dragOverlayRef}
        />
      ) : null}
    </div>
  );
}
