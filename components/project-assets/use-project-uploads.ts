"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { UploadProgressToastItem } from "@/components/upload-progress-toast";
import { getActiveVersion, isImageFile, titleFromFileName } from "@/components/project-assets/format";
import type { ActiveUpload, ActiveUploadStatus, MediaTileItem, UploadAction } from "@/components/project-assets/types";
import { buildMediaVersionImageUrl } from "@/src/lib/media-assets";
import { upsertUploadHistory } from "@/src/lib/upload-history";
import { uploadFileWithTus, type UploadTarget } from "@/components/project-assets/upload-transport";

const ACTIVE_UPLOAD_STATUS_ORDER: Record<ActiveUploadStatus, number> = {
  PREPARING: 0,
  UPLOADING: 1,
  PROCESSING: 2
};

/**
 * The project upload engine (new videos and images, new versions; NAS or legacy Bunny tus),
 * moved verbatim from project-media-tiles.tsx. It owns the in-flight uploads (ring, toast and
 * upload history) and writes optimistic tiles through `setItems`.
 */
export function useProjectUploads({
  projectId,
  uploadTargetFolderId,
  items,
  selectedVersionByMedia,
  setItems,
  setSelectedVersionByMedia,
  onError,
  onWarning,
  scheduleRefresh
}: {
  projectId: string;
  uploadTargetFolderId: string | null;
  items: MediaTileItem[];
  selectedVersionByMedia: Record<string, string>;
  setItems: Dispatch<SetStateAction<MediaTileItem[]>>;
  setSelectedVersionByMedia: Dispatch<SetStateAction<Record<string, string>>>;
  onError: (message: string) => void;
  onWarning: (message: string) => void;
  scheduleRefresh: (delayMs?: number) => void;
}) {
  const [activeUploads, setActiveUploads] = useState<ActiveUpload[]>([]);
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const activeUploadByMedia = useMemo(() => {
    const byMedia = new Map<string, ActiveUpload>();
    for (const upload of activeUploads) {
      if (!upload.mediaId) {
        continue;
      }

      const current = byMedia.get(upload.mediaId);
      if (!current || upload.updatedAt > current.updatedAt) {
        byMedia.set(upload.mediaId, upload);
      }
    }

    return byMedia;
  }, [activeUploads]);

  const toastItems: UploadProgressToastItem[] = useMemo(
    () =>
      [...activeUploads]
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map((upload) => ({
          id: upload.id,
          fileName: upload.fileName,
          status: upload.status,
          progress: upload.progress,
          speedBytesPerSecond: upload.speedBytesPerSecond,
          etaSeconds: upload.etaSeconds
        })),
    [activeUploads]
  );

  const upsertActiveUpload = useCallback((upload: Omit<ActiveUpload, "updatedAt">) => {
    const normalizedIncoming: ActiveUpload = {
      ...upload,
      progress: Math.max(0, Math.min(100, upload.progress)),
      speedBytesPerSecond: Math.max(0, upload.speedBytesPerSecond),
      etaSeconds: upload.etaSeconds !== null && Number.isFinite(upload.etaSeconds) ? Math.max(0, upload.etaSeconds) : null,
      updatedAt: Date.now()
    };

    setActiveUploads((current) => {
      const existing = current.find((item) => item.id === normalizedIncoming.id);
      if (!existing) {
        return [normalizedIncoming, ...current];
      }

      const keepExistingStatus =
        ACTIVE_UPLOAD_STATUS_ORDER[normalizedIncoming.status] < ACTIVE_UPLOAD_STATUS_ORDER[existing.status];

      const mergedStatus = keepExistingStatus ? existing.status : normalizedIncoming.status;
      const mergedProgress = mergedStatus === "PROCESSING" ? 100 : Math.max(existing.progress, normalizedIncoming.progress);
      const mergedSpeed = mergedStatus === "UPLOADING" ? normalizedIncoming.speedBytesPerSecond : 0;
      const mergedEta = mergedStatus === "UPLOADING" ? normalizedIncoming.etaSeconds : null;

      const didChange =
        mergedStatus !== existing.status ||
        mergedProgress !== existing.progress ||
        mergedSpeed !== existing.speedBytesPerSecond ||
        mergedEta !== existing.etaSeconds ||
        (normalizedIncoming.mediaId ?? null) !== (existing.mediaId ?? null) ||
        normalizedIncoming.fileName !== existing.fileName;

      const merged: ActiveUpload = {
        ...existing,
        ...normalizedIncoming,
        status: mergedStatus,
        progress: mergedProgress,
        speedBytesPerSecond: mergedSpeed,
        etaSeconds: mergedEta,
        mediaId: normalizedIncoming.mediaId ?? existing.mediaId,
        updatedAt: didChange ? normalizedIncoming.updatedAt : existing.updatedAt
      };

      return [merged, ...current.filter((item) => item.id !== merged.id)];
    });
  }, []);

  const removeActiveUpload = useCallback((uploadId: string) => {
    setActiveUploads((current) => current.filter((upload) => upload.id !== uploadId));
  }, []);

  const markVersionUploadComplete = useCallback(async (mediaId: string, versionId: string) => {
    try {
      await fetch(`/api/media/${mediaId}/versions/${versionId}/upload-complete`, {
        method: "PATCH"
      });
    } catch {
      return;
    }
  }, []);

  // Drop finished "processing" entries once the server shows the version as ready.
  useEffect(() => {
    setActiveUploads((current) => {
      const now = Date.now();
      const next = current.filter((upload) => {
        if (upload.status !== "PROCESSING") {
          return true;
        }

        if (now - upload.updatedAt < 8000) {
          return true;
        }

        if (!upload.mediaId) {
          return false;
        }

        const mediaItem = items.find((item) => item.id === upload.mediaId);
        if (!mediaItem) {
          return now - upload.updatedAt < 120000;
        }

        const activeVersion = getActiveVersion(mediaItem, selectedVersionByMedia);
        if (!activeVersion) {
          return false;
        }

        return activeVersion.status === "UPLOADING" || activeVersion.status === "PROCESSING";
      });

      return next.length === current.length ? current : next;
    });
  }, [items, selectedVersionByMedia]);

  async function handleNewUpload(file: File) {
    const mediaTitle = titleFromFileName(file.name);
    const uploadId = `new-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    let uploadedMediaId: string | null = null;
    let uploadedVersionId: string | null = null;

    upsertActiveUpload({
      id: uploadId,
      fileName: file.name,
      mediaId: null,
      status: "PREPARING",
      progress: 0,
      speedBytesPerSecond: 0,
      etaSeconds: null
    });
    upsertUploadHistory({
      id: uploadId,
      name: file.name,
      status: "PREPARING",
      progress: 0,
      speedBytesPerSecond: 0,
      etaSeconds: null
    });

    try {
      const initResponse = await fetch("/api/media/init-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          title: mediaTitle,
          fileName: file.name,
          folderId: uploadTargetFolderId
        })
      });

      if (!initResponse.ok) {
        throw new Error("Upload init failed");
      }

      const init = (await initResponse.json()) as {
        data: {
          media: { id: string; title: string };
          version: { id: string; versionNumber: number; createdAt: string };
          upload: UploadTarget;
        };
      };

      uploadedMediaId = init.data.media.id;
      uploadedVersionId = init.data.version.id;

      const newItem: MediaTileItem = {
        id: init.data.media.id,
        title: init.data.media.title,
        reviewHref: `/projects/${projectId}/review/${init.data.media.id}`,
        currentVersionId: init.data.version.id,
        folderId: uploadTargetFolderId,
        deletedAt: null,
        deletedByName: null,
        assignedMembers: [],
        versions: [
          {
            id: init.data.version.id,
            versionNumber: init.data.version.versionNumber,
            sourceType: "VIDEO",
            status: "UPLOADING",
            approvalStatus: "IN_REVIEW",
            airedAt: null,
            thumbnailUrl: null,
            durationSeconds: null,
            createdAt: init.data.version.createdAt,
            createdByName: "You",
            commentCount: 0
          }
        ]
      };

      setItems((current) => [newItem, ...current]);

      upsertActiveUpload({
        id: uploadId,
        fileName: file.name,
        mediaId: init.data.media.id,
        status: "UPLOADING",
        progress: 0,
        speedBytesPerSecond: 0,
        etaSeconds: null
      });

      await uploadFileWithTus(
        file,
        init.data.upload,
        mediaTitle,
        ({ progress, bytesUploaded, bytesTotal, speedBytesPerSecond, etaSeconds }) => {
          upsertActiveUpload({
            id: uploadId,
            fileName: file.name,
            mediaId: init.data.media.id,
            status: "UPLOADING",
            progress,
            speedBytesPerSecond,
            etaSeconds
          });

          upsertUploadHistory({
            id: uploadId,
            name: file.name,
            status: "UPLOADING",
            progress,
            bytesUploaded,
            bytesTotal,
            speedBytesPerSecond,
            etaSeconds
          });
        },
        { mediaId: init.data.media.id, versionId: init.data.version.id }
      );

      const isNas = init.data.upload.provider === "NAS";
      let nasThumb: string | null = null;
      if (isNas) {
        const { uploadNasPosterBestEffort } = await import("@/src/lib/video-thumbnail-client");
        nasThumb = await uploadNasPosterBestEffort(file, init.data.media.id, init.data.version.id);
      }

      setItems((current) =>
        current.map((item) =>
          item.id === init.data.media.id
            ? {
                ...item,
                versions: item.versions.map((version) =>
                  version.id === init.data.version.id
                    ? {
                        ...version,
                        status: isNas ? "READY" : "PROCESSING",
                        thumbnailUrl: nasThumb ?? version.thumbnailUrl
                      }
                    : version
                )
              }
            : item
        )
      );

      // Bunny needs webhook/processing poll; NAS is complete after complete-nas-upload above.
      if (!isNas) {
        await markVersionUploadComplete(init.data.media.id, init.data.version.id);
      }

      upsertActiveUpload({
        id: uploadId,
        fileName: file.name,
        mediaId: init.data.media.id,
        status: "PROCESSING",
        progress: 100,
        speedBytesPerSecond: 0,
        etaSeconds: null
      });
      upsertUploadHistory({ id: uploadId, name: file.name, status: "PROCESSING", progress: 100, etaSeconds: null });

      window.setTimeout(() => {
        upsertUploadHistory({ id: uploadId, name: file.name, status: "DONE", progress: 100, etaSeconds: null });
        scheduleRefresh(5000);
      }, 1200);
    } catch {
      onError("Video upload failed. Please try again.");
      if (uploadedMediaId && uploadedVersionId) {
        setItems((current) =>
          current.map((item) =>
            item.id !== uploadedMediaId
              ? item
              : {
                  ...item,
                  versions: item.versions.map((version) =>
                    version.id === uploadedVersionId ? { ...version, status: "FAILED" } : version
                  )
                }
          )
        );
      }

      removeActiveUpload(uploadId);
      upsertUploadHistory({ id: uploadId, name: file.name, status: "FAILED", progress: 0, etaSeconds: null });
    }
  }

  async function handleNewImageUpload(file: File) {
    const uploadId = `new-image-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

    upsertActiveUpload({
      id: uploadId,
      fileName: file.name,
      mediaId: null,
      status: "PREPARING",
      progress: 0,
      speedBytesPerSecond: 0,
      etaSeconds: null
    });
    upsertUploadHistory({ id: uploadId, name: file.name, status: "PREPARING", progress: 0, etaSeconds: null });

    try {
      const form = new FormData();
      form.set("projectId", projectId);
      form.set("title", titleFromFileName(file.name));
      if (uploadTargetFolderId) {
        form.set("folderId", uploadTargetFolderId);
      }
      form.set("file", file);

      const response = await fetch("/api/media/init-image-upload", {
        method: "POST",
        body: form
      });

      if (!response.ok) {
        throw new Error("Image upload failed");
      }

      const payload = (await response.json()) as {
        data: {
          media: { id: string; title: string };
          version: { id: string; versionNumber: number; createdAt: string };
        };
      };

      setItems((current) => [
        {
          id: payload.data.media.id,
          title: payload.data.media.title,
          reviewHref: `/projects/${projectId}/review/${payload.data.media.id}`,
          currentVersionId: payload.data.version.id,
          folderId: uploadTargetFolderId,
          deletedAt: null,
          deletedByName: null,
          assignedMembers: [],
          versions: [
            {
              id: payload.data.version.id,
              versionNumber: payload.data.version.versionNumber,
              sourceType: "IMAGE",
              status: "READY",
              approvalStatus: "IN_REVIEW",
              airedAt: null,
              thumbnailUrl: buildMediaVersionImageUrl(payload.data.media.id, payload.data.version.id),
              durationSeconds: null,
              createdAt: payload.data.version.createdAt,
              createdByName: "You",
              commentCount: 0
            }
          ]
        },
        ...current
      ]);

      upsertActiveUpload({
        id: uploadId,
        fileName: file.name,
        mediaId: payload.data.media.id,
        status: "PROCESSING",
        progress: 100,
        speedBytesPerSecond: 0,
        etaSeconds: null
      });
      upsertUploadHistory({ id: uploadId, name: file.name, status: "DONE", progress: 100, etaSeconds: null });

      window.setTimeout(() => {
        removeActiveUpload(uploadId);
        scheduleRefresh(2500);
      }, 600);
    } catch {
      removeActiveUpload(uploadId);
      upsertUploadHistory({ id: uploadId, name: file.name, status: "FAILED", progress: 0, etaSeconds: null });
      onError("Image upload failed. Please try again.");
    }
  }

  async function handleVersionUpload(file: File, mediaId: string) {
    const targetItem = itemsRef.current.find((item) => item.id === mediaId);
    const uploadId = `version-${mediaId}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    let uploadedVersionId: string | null = null;

    upsertActiveUpload({
      id: uploadId,
      fileName: file.name,
      mediaId,
      status: "PREPARING",
      progress: 0,
      speedBytesPerSecond: 0,
      etaSeconds: null
    });
    upsertUploadHistory({ id: uploadId, name: file.name, status: "PREPARING", progress: 0, etaSeconds: null });

    try {
      const initResponse = await fetch(`/api/media/${mediaId}/versions/init-upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: targetItem?.title ?? titleFromFileName(file.name),
          fileName: file.name
        })
      });

      if (!initResponse.ok) {
        throw new Error("Version upload init failed");
      }

      const init = (await initResponse.json()) as {
        data: {
          mediaId: string;
          version: { id: string; versionNumber: number; createdAt: string };
          upload: UploadTarget;
        };
      };

      uploadedVersionId = init.data.version.id;

      setItems((currentItems) =>
        currentItems.map((item) =>
          item.id !== mediaId
            ? item
            : {
                ...item,
                currentVersionId: init.data.version.id,
                versions: [
                  {
                    id: init.data.version.id,
                    versionNumber: init.data.version.versionNumber,
                    sourceType: targetItem?.versions[0]?.sourceType ?? "VIDEO",
                    status: "UPLOADING",
                    approvalStatus: "IN_REVIEW",
                    airedAt: null,
                    thumbnailUrl: null,
                    durationSeconds: null,
                    createdAt: init.data.version.createdAt,
                    createdByName: "You",
                    commentCount: 0
                  },
                  ...item.versions
                ]
              }
        )
      );
      setSelectedVersionByMedia((current) => ({
        ...current,
        [mediaId]: init.data.version.id
      }));

      upsertActiveUpload({
        id: uploadId,
        fileName: file.name,
        mediaId,
        status: "UPLOADING",
        progress: 0,
        speedBytesPerSecond: 0,
        etaSeconds: null
      });

      await uploadFileWithTus(
        file,
        init.data.upload,
        targetItem?.title ?? titleFromFileName(file.name),
        ({ progress, bytesUploaded, bytesTotal, speedBytesPerSecond, etaSeconds }) => {
          upsertActiveUpload({
            id: uploadId,
            fileName: file.name,
            mediaId,
            status: "UPLOADING",
            progress,
            speedBytesPerSecond,
            etaSeconds
          });

          upsertUploadHistory({
            id: uploadId,
            name: file.name,
            status: "UPLOADING",
            progress,
            bytesUploaded,
            bytesTotal,
            speedBytesPerSecond,
            etaSeconds
          });
        },
        { mediaId, versionId: init.data.version.id }
      );

      const nasDone = init.data.upload.provider === "NAS";
      let nasThumb: string | null = null;
      if (nasDone) {
        const { uploadNasPosterBestEffort } = await import("@/src/lib/video-thumbnail-client");
        nasThumb = await uploadNasPosterBestEffort(file, mediaId, init.data.version.id);
      }
      setItems((currentItems) =>
        currentItems.map((item) =>
          item.id !== mediaId
            ? item
            : {
                ...item,
                versions: item.versions.map((version) =>
                  version.id === init.data.version.id
                    ? {
                        ...version,
                        status: nasDone ? "READY" : "PROCESSING",
                        thumbnailUrl: nasThumb ?? version.thumbnailUrl
                      }
                    : version
                )
              }
        )
      );

      if (!nasDone) {
        await markVersionUploadComplete(mediaId, init.data.version.id);
      }

      upsertActiveUpload({
        id: uploadId,
        fileName: file.name,
        mediaId,
        status: "PROCESSING",
        progress: 100,
        speedBytesPerSecond: 0,
        etaSeconds: null
      });
      upsertUploadHistory({
        id: uploadId,
        name: file.name,
        status: nasDone ? "DONE" : "PROCESSING",
        progress: 100,
        etaSeconds: null
      });

      window.setTimeout(() => {
        upsertUploadHistory({ id: uploadId, name: file.name, status: "DONE", progress: 100, etaSeconds: null });
        scheduleRefresh(5000);
      }, 1200);
    } catch {
      onError("Version upload failed. Please try again.");
      if (uploadedVersionId) {
        setItems((currentItems) =>
          currentItems.map((item) =>
            item.id !== mediaId
              ? item
              : {
                  ...item,
                  versions: item.versions.map((version) =>
                    version.id === uploadedVersionId ? { ...version, status: "FAILED" } : version
                  )
                }
          )
        );
      }

      removeActiveUpload(uploadId);
      upsertUploadHistory({ id: uploadId, name: file.name, status: "FAILED", progress: 0, etaSeconds: null });
    }
  }

  async function handleImageVersionUpload(file: File, mediaId: string) {
    const targetItem = itemsRef.current.find((item) => item.id === mediaId);
    const uploadId = `version-image-${mediaId}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

    upsertActiveUpload({
      id: uploadId,
      fileName: file.name,
      mediaId,
      status: "PREPARING",
      progress: 0,
      speedBytesPerSecond: 0,
      etaSeconds: null
    });
    upsertUploadHistory({ id: uploadId, name: file.name, status: "PREPARING", progress: 0, etaSeconds: null });

    try {
      const form = new FormData();
      form.set("title", targetItem?.title ?? titleFromFileName(file.name));
      form.set("file", file);

      const response = await fetch(`/api/media/${mediaId}/versions/upload-image`, {
        method: "POST",
        body: form
      });

      if (!response.ok) {
        throw new Error("Image version upload failed");
      }

      const payload = (await response.json()) as {
        data: {
          version: { id: string; versionNumber: number; createdAt: string };
        };
      };

      setItems((currentItems) =>
        currentItems.map((item) =>
          item.id !== mediaId
            ? item
            : {
                ...item,
                currentVersionId: payload.data.version.id,
                versions: [
                  {
                    id: payload.data.version.id,
                    versionNumber: payload.data.version.versionNumber,
                    sourceType: "IMAGE",
                    status: "READY",
                    approvalStatus: "IN_REVIEW",
                    airedAt: null,
                    thumbnailUrl: buildMediaVersionImageUrl(mediaId, payload.data.version.id),
                    durationSeconds: null,
                    createdAt: payload.data.version.createdAt,
                    createdByName: "You",
                    commentCount: 0
                  },
                  ...item.versions
                ]
              }
        )
      );

      setSelectedVersionByMedia((current) => ({
        ...current,
        [mediaId]: payload.data.version.id
      }));

      upsertActiveUpload({
        id: uploadId,
        fileName: file.name,
        mediaId,
        status: "PROCESSING",
        progress: 100,
        speedBytesPerSecond: 0,
        etaSeconds: null
      });
      upsertUploadHistory({ id: uploadId, name: file.name, status: "DONE", progress: 100, etaSeconds: null });

      window.setTimeout(() => {
        removeActiveUpload(uploadId);
        scheduleRefresh(2500);
      }, 600);
    } catch {
      removeActiveUpload(uploadId);
      upsertUploadHistory({ id: uploadId, name: file.name, status: "FAILED", progress: 0, etaSeconds: null });
      onError("Image version upload failed. Please try again.");
    }
  }

  /** Runs the picked files for the pending action (new uploads in parallel; one file per version). */
  async function uploadFiles(files: File[], uploadAction: Exclude<UploadAction, null>) {
    if (uploadAction.kind === "new") {
      await Promise.allSettled(
        files.map((file) => (isImageFile(file) ? handleNewImageUpload(file) : handleNewUpload(file)))
      );
      return;
    }

    if (files.length > 1) {
      onWarning("Version upload supports one file at a time. Uploading the first selected file.");
    }

    const targetItem = itemsRef.current.find((item) => item.id === uploadAction.mediaId);
    const isImageAsset = targetItem?.versions[0]?.sourceType === "IMAGE";

    if (isImageAsset) {
      if (!isImageFile(files[0])) {
        onWarning("Please upload an image file for this asset version.");
      } else {
        await handleImageVersionUpload(files[0], uploadAction.mediaId);
      }
    } else {
      if (isImageFile(files[0])) {
        onWarning("Please upload a video file for this asset version.");
      } else {
        await handleVersionUpload(files[0], uploadAction.mediaId);
      }
    }
  }

  const hasActiveUpload = activeUploads.some(
    (upload) => upload.status === "PREPARING" || upload.status === "UPLOADING" || upload.status === "PROCESSING"
  );

  return { activeUploads, activeUploadByMedia, toastItems, hasActiveUpload, uploadFiles };
}
