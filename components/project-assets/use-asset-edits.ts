"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";
import { toAiredDateInputValue } from "@/components/project-assets/format";
import type {
  ApprovalStatusValue,
  DownloadConfirmAction,
  MediaTileItem,
  MoveToVersionAction,
  RenameAction
} from "@/components/project-assets/types";

function triggerFileDownload(url: string) {
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", "");
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/**
 * Per-asset edits: rename, move a duplicate into the right package, approval status (with the
 * Aired date), turn-in date sync, original download, and moving to a folder (one or the
 * selection). Moved verbatim from project-media-tiles.tsx; dialog errors stay in the dialog,
 * the rest go to the page notice, and successes are toasts.
 */
export function useAssetEdits({
  projectId,
  items,
  selectedIds,
  setItems,
  setSelectedIds,
  setSelectedVersionByMedia,
  refresh,
  canSyncTurnedInDates,
  showPackageActions,
  onError,
  onWarning,
  clearNotice
}: {
  projectId: string;
  items: MediaTileItem[];
  selectedIds: string[];
  setItems: Dispatch<SetStateAction<MediaTileItem[]>>;
  setSelectedIds: Dispatch<SetStateAction<string[]>>;
  setSelectedVersionByMedia: Dispatch<SetStateAction<Record<string, string>>>;
  refresh: () => void;
  canSyncTurnedInDates: boolean;
  showPackageActions: boolean;
  onError: (message: string) => void;
  onWarning: (message: string) => void;
  clearNotice: () => void;
}) {
  const [renameAction, setRenameAction] = useState<RenameAction>(null);
  const [renameTitleInput, setRenameTitleInput] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [moveToVersionAction, setMoveToVersionAction] = useState<MoveToVersionAction>(null);
  const [moveToVersionBusy, setMoveToVersionBusy] = useState(false);
  const [moveToVersionError, setMoveToVersionError] = useState<string | null>(null);
  const [statusUpdating, setStatusUpdating] = useState<string | null>(null);
  const [airedDialog, setAiredDialog] = useState<{ mediaId: string; versionId: string; date: string } | null>(null);
  const [syncingTurnedInMediaId, setSyncingTurnedInMediaId] = useState<string | null>(null);
  const [downloadConfirmAction, setDownloadConfirmAction] = useState<DownloadConfirmAction>(null);
  const [isMoving, setIsMoving] = useState(false);

  // Drop a pending rename or move once its item leaves the list.
  if (renameAction && !items.some((item) => item.id === renameAction.mediaId)) {
    setRenameAction(null);
    setRenameTitleInput("");
  }

  if (
    moveToVersionAction &&
    (!items.some((item) => item.id === moveToVersionAction.sourceMediaId) ||
      !items.some((item) => item.id === moveToVersionAction.targetMediaId))
  ) {
    setMoveToVersionAction(null);
  }

  const [prevShowPackageActions, setPrevShowPackageActions] = useState(showPackageActions);
  if (showPackageActions !== prevShowPackageActions) {
    setPrevShowPackageActions(showPackageActions);
    if (!showPackageActions) setMoveToVersionAction(null);
  }

  function requestRename(mediaId: string) {
    const item = items.find((entry) => entry.id === mediaId);
    if (!item) {
      return;
    }

    setRenameError(null);
    setRenameAction({ mediaId });
    setRenameTitleInput(item.title);
  }

  function cancelRename() {
    setRenameAction(null);
    setRenameTitleInput("");
  }

  async function confirmRename() {
    if (!renameAction) {
      return;
    }

    const nextTitle = renameTitleInput.trim();
    if (!nextTitle) {
      return;
    }

    const item = items.find((entry) => entry.id === renameAction.mediaId);
    if (item && item.title === nextTitle) {
      cancelRename();
      return;
    }

    setRenameBusy(true);
    setRenameError(null);

    try {
      const response = await fetch(`/api/media/${renameAction.mediaId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          title: nextTitle
        })
      });

      const payload = (await response.json()) as {
        data?: {
          id: string;
          title: string;
        };
        error?: { message?: string };
      };

      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Could not rename video.");
      }

      const updatedTitle = payload.data?.title ?? nextTitle;
      const mediaId = renameAction.mediaId;
      setItems((current) =>
        current.map((entry) =>
          entry.id === mediaId
            ? {
                ...entry,
                title: updatedTitle
              }
            : entry
        )
      );
      cancelRename();
      toast.success("Video renamed.");
    } catch (error) {
      setRenameError(error instanceof Error ? error.message : "Could not rename video.");
    } finally {
      setRenameBusy(false);
    }
  }

  function moveCandidatesFor(source: MediaTileItem) {
    const sourceType = source.versions[0]?.sourceType ?? null;
    return items.filter(
      (entry) =>
        entry.id !== source.id &&
        entry.deletedAt === null &&
        entry.versions.length > 0 &&
        entry.versions.every((version) => version.sourceType === sourceType)
    );
  }

  function requestMoveIntoVersion(mediaId: string) {
    const source = items.find((entry) => entry.id === mediaId);
    if (!source) {
      return;
    }

    const candidates = moveCandidatesFor(source);
    if (candidates.length === 0) {
      onWarning("No matching package is visible to move this into.");
      return;
    }

    setMoveToVersionError(null);
    setMoveToVersionAction({
      sourceMediaId: source.id,
      targetMediaId: candidates[0].id
    });
  }

  function requestMoveSelectedIntoVersion() {
    if (selectedIds.length !== 1) {
      onWarning("Select one duplicate package to move into the correct version.");
      return;
    }

    requestMoveIntoVersion(selectedIds[0]);
  }

  async function confirmMoveIntoVersion() {
    if (!moveToVersionAction || moveToVersionBusy) {
      return;
    }

    const source = items.find((entry) => entry.id === moveToVersionAction.sourceMediaId);
    const target = items.find((entry) => entry.id === moveToVersionAction.targetMediaId);
    if (!source || !target) {
      return;
    }

    setMoveToVersionBusy(true);
    setMoveToVersionError(null);

    try {
      const response = await fetch(`/api/media/${source.id}/move-to-version`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          targetMediaId: target.id
        })
      });

      if (!response.ok) {
        throw new Error("Move failed");
      }

      const sourceVersions = [...source.versions].sort((a, b) => a.versionNumber - b.versionNumber);
      const latestTargetVersionNumber = Math.max(...target.versions.map((version) => version.versionNumber));
      const movedVersions = sourceVersions.map((version, index) => ({
        ...version,
        versionNumber: latestTargetVersionNumber + index + 1
      }));
      const currentVersionId = movedVersions[movedVersions.length - 1]?.id ?? target.currentVersionId;
      const assignedMembersById = new Map(
        [...target.assignedMembers, ...source.assignedMembers].map((member) => [member.userId, member])
      );

      setItems((current) =>
        current
          .filter((entry) => entry.id !== source.id)
          .map((entry) =>
            entry.id === target.id
              ? {
                  ...entry,
                  currentVersionId,
                  assignedMembers: [...assignedMembersById.values()],
                  versions: [...movedVersions, ...entry.versions].sort((a, b) => b.versionNumber - a.versionNumber)
                }
              : entry
          )
      );
      if (currentVersionId) {
        setSelectedVersionByMedia((current) => ({
          ...current,
          [target.id]: currentVersionId
        }));
      }
      setSelectedIds([]);
      setMoveToVersionAction(null);
      refresh();
    } catch {
      setMoveToVersionError("Could not move that package into the selected version.");
    } finally {
      setMoveToVersionBusy(false);
    }
  }

  async function onApprovalStatusChange(
    mediaId: string,
    versionId: string,
    nextStatus: ApprovalStatusValue,
    airedAtIso?: string
  ) {
    setStatusUpdating(mediaId);
    try {
      const response = await fetch(`/api/media/${mediaId}/approval-status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mediaVersionId: versionId,
          status: nextStatus,
          ...(nextStatus === "AIRED" && airedAtIso ? { airedAt: airedAtIso } : {})
        })
      });

      if (!response.ok) {
        throw new Error("Failed to update status");
      }

      const nextAiredAt = nextStatus === "AIRED" ? airedAtIso ?? null : null;

      setItems((currentItems) =>
        currentItems.map((item) =>
          item.id !== mediaId
            ? item
            : {
                ...item,
                versions: item.versions.map((version) =>
                  version.id === versionId
                    ? { ...version, approvalStatus: nextStatus, airedAt: nextAiredAt }
                    : version
                )
              }
        )
      );
    } catch {
      onError("Could not update status.");
    } finally {
      setStatusUpdating(null);
    }
  }

  function requestStatusChange(
    mediaId: string,
    versionId: string,
    nextStatus: ApprovalStatusValue,
    currentAiredAt: string | null
  ) {
    if (nextStatus === "AIRED") {
      setAiredDialog({
        mediaId,
        versionId,
        date: toAiredDateInputValue(currentAiredAt)
      });
      return;
    }
    void onApprovalStatusChange(mediaId, versionId, nextStatus);
  }

  async function submitAiredDialog() {
    if (!airedDialog || !airedDialog.date) {
      return;
    }
    const iso = `${airedDialog.date}T00:00:00.000Z`;
    const { mediaId, versionId } = airedDialog;
    setAiredDialog(null);
    await onApprovalStatusChange(mediaId, versionId, "AIRED", iso);
  }

  async function syncTurnedInDateForMedia(mediaId: string) {
    if (!canSyncTurnedInDates || !showPackageActions || syncingTurnedInMediaId) {
      return;
    }

    setSyncingTurnedInMediaId(mediaId);
    clearNotice();

    try {
      const response = await fetch(`/api/projects/${projectId}/sync-turned-in-dates`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          mediaId
        })
      });

      const payload = (await response.json()) as {
        data?: {
          processedVideoCount: number;
          syncedTurnedInRows: number;
        };
        error?: {
          message?: string;
        };
      };

      if (!response.ok) {
        onError(payload.error?.message ?? "Could not sync turn-in date.");
        return;
      }

      const syncedTurnedInRows = payload.data?.syncedTurnedInRows ?? 0;
      if (syncedTurnedInRows > 0) {
        toast.success("Turn-in date synced to upload date.");
      } else {
        toast("No turn-in date changes were needed.");
      }
      refresh();
    } catch {
      onError("Could not sync turn-in date.");
    } finally {
      setSyncingTurnedInMediaId(null);
    }
  }

  function requestOriginalDownload(mediaId: string, versionId: string, title: string, versionNumber: number) {
    setDownloadConfirmAction({
      mediaId,
      versionId,
      title,
      versionNumber
    });
  }

  function confirmOriginalDownload() {
    if (!downloadConfirmAction) {
      return;
    }

    triggerFileDownload(`/api/media/${downloadConfirmAction.mediaId}/download?mediaVersionId=${downloadConfirmAction.versionId}`);
    setDownloadConfirmAction(null);
  }

  async function moveMediaToFolder(mediaId: string, folderValue: string) {
    const folderId = folderValue === "root" ? null : folderValue;

    let response: Response;
    try {
      response = await fetch(`/api/media/${mediaId}/folder`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          folderId
        })
      });
    } catch {
      onError("Could not move video to that folder.");
      return;
    }

    if (!response.ok) {
      onError("Could not move video to that folder.");
      return;
    }

    setItems((current) => current.map((item) => (item.id === mediaId ? { ...item, folderId } : item)));
    refresh();
  }

  async function moveSelectedToFolder(folderValue: string) {
    if (selectedIds.length === 0) {
      return;
    }

    setIsMoving(true);
    const folderId = folderValue === "root" ? null : folderValue;

    try {
      const responses = await Promise.all(
        selectedIds.map((mediaId) =>
          fetch(`/api/media/${mediaId}/folder`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              folderId
            })
          })
        )
      );

      if (responses.some((response) => !response.ok)) {
        throw new Error("Move failed");
      }

      setItems((current) =>
        current.map((item) => (selectedIds.includes(item.id) ? { ...item, folderId } : item))
      );
      setSelectedIds([]);
      refresh();
    } catch {
      onError("Could not move one or more selected videos.");
    } finally {
      setIsMoving(false);
    }
  }

  const moveSource = moveToVersionAction ? items.find((item) => item.id === moveToVersionAction.sourceMediaId) ?? null : null;

  return {
    rename: {
      open: Boolean(renameAction),
      value: renameTitleInput,
      busy: renameBusy,
      error: renameError,
      setValue: setRenameTitleInput,
      request: requestRename,
      cancel: cancelRename,
      confirm: confirmRename
    },
    moveIntoVersion: {
      open: Boolean(moveToVersionAction),
      source: moveSource,
      candidates: moveSource ? moveCandidatesFor(moveSource) : [],
      target: moveToVersionAction ? items.find((item) => item.id === moveToVersionAction.targetMediaId) ?? null : null,
      targetId: moveToVersionAction?.targetMediaId ?? "",
      busy: moveToVersionBusy,
      error: moveToVersionError,
      setTarget: (targetMediaId: string) =>
        setMoveToVersionAction((current) => (current ? { ...current, targetMediaId } : current)),
      request: requestMoveIntoVersion,
      requestSelected: requestMoveSelectedIntoVersion,
      cancel: () => setMoveToVersionAction(null),
      confirm: confirmMoveIntoVersion
    },
    status: {
      updatingMediaId: statusUpdating,
      request: requestStatusChange,
      airedDialog,
      setAiredDate: (date: string) => setAiredDialog((current) => (current ? { ...current, date } : current)),
      cancelAired: () => setAiredDialog(null),
      submitAired: submitAiredDialog
    },
    syncingTurnedInMediaId,
    syncTurnedInDateForMedia,
    download: {
      action: downloadConfirmAction,
      request: requestOriginalDownload,
      confirm: confirmOriginalDownload,
      close: () => setDownloadConfirmAction(null)
    },
    isMoving,
    moveMediaToFolder,
    moveSelectedToFolder
  };
}
