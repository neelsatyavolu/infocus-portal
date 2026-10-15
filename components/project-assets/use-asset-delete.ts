"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import type { ConfirmAction, MediaTileItem } from "@/components/project-assets/types";

function labelFor(mediaIds: string[]) {
  return mediaIds.length === 1 ? "this video" : `${mediaIds.length} videos`;
}

/**
 * Move to Recently deleted, restore, and delete permanently (single or bulk), with the confirm
 * step and the "Delete not allowed" answer for viewers without permission (also shown on a 403).
 * Moved verbatim from project-media-tiles.tsx; confirm failures stay inside the confirm dialog.
 */
export function useAssetDelete({
  canManageVersionMeta,
  setItems,
  setSelectedIds,
  refresh,
  onError
}: {
  canManageVersionMeta: boolean;
  setItems: Dispatch<SetStateAction<MediaTileItem[]>>;
  setSelectedIds: Dispatch<SetStateAction<string[]>>;
  refresh: () => void;
  onError: (message: string) => void;
}) {
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  function request(type: "soft-delete" | "permanent-delete", mediaIds: string[]) {
    if (mediaIds.length === 0) {
      return;
    }

    const label = labelFor(mediaIds);
    setConfirmError(null);
    if (!canManageVersionMeta) {
      setConfirmAction({
        type: "permission-denied",
        label
      });
      return;
    }

    setConfirmAction({
      type,
      mediaIds,
      label
    });
  }

  function removeFromView(mediaIds: string[]) {
    setItems((current) => current.filter((item) => !mediaIds.includes(item.id)));
    setSelectedIds((current) => current.filter((id) => !mediaIds.includes(id)));
    refresh();
  }

  async function softDeleteMediaByIds(mediaIds: string[]): Promise<boolean> {
    if (mediaIds.length === 0) return false;

    setIsDeleting(true);
    try {
      const results = await Promise.all(
        mediaIds.map((mediaId) =>
          fetch(`/api/media/${mediaId}`, {
            method: "DELETE"
          })
        )
      );

      const denied = results.some((response) => response.status === 403);
      if (denied) {
        setConfirmAction({
          type: "permission-denied",
          label: labelFor(mediaIds)
        });
        return false;
      }

      if (results.some((response) => !response.ok)) {
        throw new Error("Delete failed");
      }

      removeFromView(mediaIds);
      return true;
    } catch {
      setConfirmError("Could not delete one or more videos.");
      return false;
    } finally {
      setIsDeleting(false);
    }
  }

  async function restoreMediaByIds(mediaIds: string[]) {
    if (mediaIds.length === 0) return;

    setIsDeleting(true);
    try {
      const results = await Promise.all(
        mediaIds.map((mediaId) =>
          fetch(`/api/media/${mediaId}/restore`, {
            method: "POST"
          })
        )
      );

      if (results.some((response) => !response.ok)) {
        throw new Error("Restore failed");
      }

      removeFromView(mediaIds);
    } catch {
      onError("Could not restore one or more videos.");
    } finally {
      setIsDeleting(false);
    }
  }

  async function permanentlyDeleteMediaByIds(mediaIds: string[]): Promise<boolean> {
    if (mediaIds.length === 0) return false;

    setIsDeleting(true);
    try {
      const results = await Promise.all(
        mediaIds.map((mediaId) =>
          fetch(`/api/media/${mediaId}/permanent`, {
            method: "DELETE"
          })
        )
      );

      const denied = results.some((response) => response.status === 403);
      if (denied) {
        setConfirmAction({
          type: "permission-denied",
          label: labelFor(mediaIds)
        });
        return false;
      }

      if (results.some((response) => !response.ok)) {
        throw new Error("Permanent delete failed");
      }

      removeFromView(mediaIds);
      return true;
    } catch {
      setConfirmError("Could not permanently delete one or more videos.");
      return false;
    } finally {
      setIsDeleting(false);
    }
  }

  /** For ConfirmDialog: throws when it didn't work, so the dialog stays open with the error. */
  async function confirm() {
    if (confirmAction?.type === "soft-delete") {
      if (!(await softDeleteMediaByIds(confirmAction.mediaIds))) throw new Error("Delete failed");
    } else if (confirmAction?.type === "permanent-delete") {
      if (!(await permanentlyDeleteMediaByIds(confirmAction.mediaIds))) throw new Error("Delete failed");
    }
  }

  return {
    confirmAction,
    confirmError,
    isDeleting,
    requestSoftDelete: (mediaIds: string[]) => request("soft-delete", mediaIds),
    requestPermanentDelete: (mediaIds: string[]) => request("permanent-delete", mediaIds),
    restoreMediaByIds,
    confirm,
    closeConfirm: () => setConfirmAction(null)
  };
}
