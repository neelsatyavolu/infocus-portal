"use client";

import { type DragEvent as ReactDragEvent, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createPortal } from "react-dom";
import {
  CheckSquare,
  ChevronDown,
  Copy,
  Folder,
  FolderPlus,
  GitMerge,
  MessageSquare,
  Plus,
  RotateCcw,
  Send,
  Square,
  Trash2,
  UploadCloud,
  UserPlus,
  Users,
  X
} from "lucide-react";
import { UploadProgressToast, type UploadProgressToastItem } from "@/components/upload-progress-toast";
import { VideoCardMenu, type DropdownOption } from "@/components/video-card-menu";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/src/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { buildMediaVersionImageUrl } from "@/src/lib/media-assets";
import { upsertUploadHistory } from "@/src/lib/upload-history";
import { folderDisplayName, folderPathSegments, isDirectChildFolder } from "@/src/lib/project-folders";

type ApprovalStatusValue = "IN_REVIEW" | "NEEDS_CHANGES" | "APPROVED" | "AIRED";
type MediaStatusValue = "UPLOADING" | "PROCESSING" | "READY" | "FAILED";
type ViewMode = "grid" | "list";
type ScopeMode = "active" | "deleted";
type GuestPermissionValue = "VIEW" | "COMMENT";

const UPLOAD_PROGRESS_REPORT_MS = 200;

type FolderItem = {
  id: string;
  name: string;
  itemCount: number;
};

type MediaTileVersion = {
  id: string;
  versionNumber: number;
  sourceType: "VIDEO" | "IMAGE";
  status: MediaStatusValue;
  approvalStatus: ApprovalStatusValue;
  airedAt: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  createdAt: string;
  createdByName: string;
  commentCount: number;
};

type MediaTileItem = {
  id: string;
  title: string;
  reviewHref: string;
  currentVersionId: string | null;
  folderId: string | null;
  deletedAt: string | null;
  deletedByName: string | null;
  assignedMembers: {
    userId: string;
    name: string | null;
    email: string | null;
  }[];
  versions: MediaTileVersion[];
};

type WorkspaceMemberOption = {
  userId: string;
  name: string | null;
  email: string | null;
};

type ShareLink = {
  id: string;
  token: string;
  permission: GuestPermissionValue;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

type ProjectMediaTilesProps = {
  projectId: string;
  canUpload: boolean;
  canManageProjectMedia: boolean;
  canManageVersionMeta: boolean;
  canSyncTurnedInDates: boolean;
  items: MediaTileItem[];
  folders: FolderItem[];
  scope: ScopeMode;
  selectedFolderId: string;
  finalCutFolderId: string | null;
  viewMode: ViewMode;
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
};

type UploadAction = { kind: "new" } | { kind: "version"; mediaId: string } | null;
type ConfirmAction =
  | { type: "soft-delete" | "permanent-delete"; mediaIds: string[]; label: string }
  | { type: "permission-denied"; label: string }
  | null;
type DownloadConfirmAction = {
  mediaId: string;
  versionId: string;
  title: string;
  versionNumber: number;
} | null;
type RenameAction = {
  mediaId: string;
} | null;
type MoveToVersionAction = {
  sourceMediaId: string;
  targetMediaId: string;
} | null;
type ActiveUploadStatus = "PREPARING" | "UPLOADING" | "PROCESSING";

type ActiveUpload = {
  id: string;
  fileName: string;
  mediaId: string | null;
  status: ActiveUploadStatus;
  progress: number;
  speedBytesPerSecond: number;
  etaSeconds: number | null;
  updatedAt: number;
};

type DragPreviewState = {
  title: string;
  thumbnailUrl: string | null;
  itemCount: number;
};

const ACTIVE_UPLOAD_STATUS_ORDER: Record<ActiveUploadStatus, number> = {
  PREPARING: 0,
  UPLOADING: 1,
  PROCESSING: 2
};

function titleFromFileName(fileName: string) {
  const cleaned = fileName.replace(/\.[^/.]+$/, "").trim();
  return cleaned.length > 0 ? cleaned : "Untitled upload";
}

function isImageFile(file: File) {
  return file.type.startsWith("image/");
}

function shouldBypassNextImageOptimization(src: string) {
  if (src.startsWith("/api/")) {
    return true;
  }

  try {
    const url = new URL(src);
    // Bunny CDN + Drive signed poster URLs (auth in query; optimizer would strip/expire)
    return (
      url.hostname.endsWith(".b-cdn.net") ||
      url.hostname === "drive.infocuspaly.com" ||
      url.hostname.endsWith(".infocuspaly.com")
    );
  } catch {
    return false;
  }
}

function formatDuration(totalSeconds: number | null) {
  if (!totalSeconds || totalSeconds <= 0) {
    return "--:--";
  }

  const rounded = Math.round(totalSeconds);
  const minutes = Math.floor(rounded / 60);
  const seconds = rounded % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatApprovalLabel(status: ApprovalStatusValue) {
  if (status === "IN_REVIEW") return "In Review";
  if (status === "NEEDS_CHANGES") return "Needs Changes";
  if (status === "AIRED") return "Aired";
  return "Approved";
}

function formatAiredDateLabel(iso: string | null): string {
  if (!iso) {
    return "";
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  }).format(date);
}

function toAiredDateInputValue(iso: string | null): string {
  const source = iso ? new Date(iso) : new Date();
  if (Number.isNaN(source.getTime())) {
    return "";
  }
  const year = source.getUTCFullYear();
  const month = String(source.getUTCMonth() + 1).padStart(2, "0");
  const day = String(source.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function approvalPillClassName(status: ApprovalStatusValue) {
  if (status === "AIRED") {
    return "border-indigo-400/45 bg-indigo-500/15 text-indigo-300";
  }

  if (status === "APPROVED") {
    return "border-[rgb(43,179,110,0.30)] bg-[rgb(43,179,110,0.18)] text-[var(--brand-green)]";
  }

  if (status === "NEEDS_CHANGES") {
    return "border-[rgb(238,58,42,0.40)] bg-[rgb(238,58,42,0.18)] text-[var(--brand-red)]";
  }

  return "border-[rgb(242,165,22,0.40)] bg-[rgb(242,165,22,0.18)] text-[var(--brand-amber)]";
}

function getMemberFirstName(member: { name: string | null; email: string | null }) {
  const trimmedName = member.name?.trim();
  if (trimmedName) {
    return trimmedName.split(/\s+/).filter(Boolean)[0] ?? trimmedName;
  }

  return member.email?.split("@")[0]?.trim() || "Member";
}

function formatMemberNameSummary(members: { name: string | null; email: string | null }[]) {
  if (members.length === 0) {
    return "No assignees";
  }

  if (members.length === 1) {
    return getMemberDisplayName(members[0]);
  }

  const formatter = new Intl.ListFormat(undefined, { style: "long", type: "conjunction" });
  return formatter.format(members.map((member) => getMemberFirstName(member)));
}

function formatTileDateLabel(createdAtIso: string) {
  const date = new Date(createdAtIso);
  return Number.isNaN(date.getTime())
    ? "Unknown date"
    : date.toLocaleDateString(undefined, {
        month: "short",
        day: "2-digit",
        year: "numeric"
      });
}

function getReadableStatus(status: MediaStatusValue) {
  if (status === "UPLOADING") return "Uploading";
  if (status === "PROCESSING") return "Processing";
  if (status === "FAILED") return "Failed";
  return "Ready";
}

function buildVersionSelection(items: MediaTileItem[]) {
  const initial: Record<string, string> = {};
  for (const item of items) {
    const fallbackVersionId = item.versions[0]?.id ?? item.currentVersionId;
    if (fallbackVersionId) {
      initial[item.id] = fallbackVersionId;
    }
  }

  return initial;
}

function formatDeletedAt(dateIso: string | null) {
  if (!dateIso) {
    return "Unknown time";
  }

  const date = new Date(dateIso);
  if (Number.isNaN(date.getTime())) {
    return "Unknown time";
  }

  return date.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    year: "numeric"
  });
}

function formatEtaCompact(seconds: number | null) {
  if (seconds === null || !Number.isFinite(seconds)) {
    return "ETA --";
  }

  const rounded = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  return `ETA ${minutes}:${String(remainder).padStart(2, "0")}`;
}

function triggerFileDownload(url: string) {
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", "");
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function uploadStatusLabel(status: ActiveUploadStatus | MediaStatusValue) {
  if (status === "PREPARING") return "Preparing";
  if (status === "UPLOADING") return "Uploading";
  if (status === "PROCESSING") return "Processing";
  if (status === "FAILED") return "Failed";
  return "Ready";
}

function getMemberDisplayName(member: { name: string | null; email: string | null }) {
  return member.name?.trim() || member.email?.trim() || "Team member";
}

function getMemberInitials(member: { name: string | null; email: string | null }) {
  const source = member.name?.trim() || member.email?.split("@")[0]?.trim() || "";
  if (!source) {
    return "?";
  }

  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

function UploadCircleThumb({
  status,
  progress,
  etaSeconds
}: {
  status: ActiveUploadStatus | MediaStatusValue;
  progress: number;
  etaSeconds: number | null;
}) {
  if (status === "PROCESSING") {
    return (
      <div className="grid aspect-video w-full place-items-center bg-muted">
        <span className="text-xl font-semibold tracking-[0.04em] text-foreground">Processing</span>
      </div>
    );
  }

  const boundedProgress = Math.max(0, Math.min(100, Math.round(progress)));
  const degrees = Math.max(2, boundedProgress * 3.6);
  const isFailed = status === "FAILED";
  const ringColor = isFailed ? "hsl(var(--destructive))" : "hsl(var(--primary))";

  return (
    <div className="grid aspect-video w-full place-items-center bg-muted">
      <div className="flex flex-col items-center gap-2">
        <div
          className="grid h-24 w-24 place-items-center rounded-full p-[3px]"
          style={{
            background: `conic-gradient(${ringColor} ${degrees}deg, hsl(var(--secondary)) 0deg)`
          }}
        >
          <div className="grid h-full w-full place-items-center rounded-full bg-background text-center">
            <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{uploadStatusLabel(status)}</span>
            <span className="text-lg font-semibold text-foreground">{boundedProgress}%</span>
          </div>
        </div>

        <span className="text-[11px] text-muted-foreground">{status === "UPLOADING" ? formatEtaCompact(etaSeconds) : "Working..."}</span>
      </div>
    </div>
  );
}

export function ProjectMediaTiles({
  projectId,
  canUpload,
  canManageProjectMedia,
  canManageVersionMeta,
  canSyncTurnedInDates,
  items: initialItems,
  folders,
  scope,
  selectedFolderId,
  finalCutFolderId,
  viewMode,
  pagination
}: ProjectMediaTilesProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [queryNavigationPending, startQueryNavigationTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const refreshTimerRef = useRef<number | null>(null);
  const lastHandledNewActionRef = useRef<string | null>(null);
  const dragOverlayRef = useRef<HTMLDivElement | null>(null);
  const transparentDragImageRef = useRef<HTMLDivElement | null>(null);
  const dragOverlayFrameRef = useRef<number | null>(null);
  const dragPointerRef = useRef({ x: 0, y: 0 });

  const [items, setItems] = useState(initialItems);
  const [foldersState, setFoldersState] = useState(folders);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedVersionByMedia, setSelectedVersionByMedia] = useState<Record<string, string>>(buildVersionSelection(initialItems));
  const [uploadAction, setUploadAction] = useState<UploadAction>(null);
  const [activeUploads, setActiveUploads] = useState<ActiveUpload[]>([]);
  const [statusUpdating, setStatusUpdating] = useState<string | null>(null);
  const [airedDialog, setAiredDialog] = useState<{ mediaId: string; versionId: string; date: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const [draggingMediaId, setDraggingMediaId] = useState<string | null>(null);
  const [dragPreview, setDragPreview] = useState<DragPreviewState | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const [memberAddModalSearch, setMemberAddModalSearch] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [shareLinks, setShareLinks] = useState<ShareLink[]>([]);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const [sharePermission, setSharePermission] = useState<GuestPermissionValue>("COMMENT");
  const [sharePasscode, setSharePasscode] = useState("");
  const [shareExpiry, setShareExpiry] = useState("");
  const [foldersExpanded, setFoldersExpanded] = useState(true);
  const [assetsExpanded, setAssetsExpanded] = useState(true);
  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [folderNameInput, setFolderNameInput] = useState("");
  const [folderCreating, setFolderCreating] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [downloadConfirmAction, setDownloadConfirmAction] = useState<DownloadConfirmAction>(null);
  const [downloadConfirmBusy, setDownloadConfirmBusy] = useState(false);
  const [renameAction, setRenameAction] = useState<RenameAction>(null);
  const [renameTitleInput, setRenameTitleInput] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);
  const [moveToVersionAction, setMoveToVersionAction] = useState<MoveToVersionAction>(null);
  const [moveToVersionBusy, setMoveToVersionBusy] = useState(false);
  const [memberPickerForMediaId, setMemberPickerForMediaId] = useState<string | null>(null);
  const [memberPickerSideByMediaId, setMemberPickerSideByMediaId] = useState<Record<string, "left" | "right">>({});
  const [memberAddModalForMediaId, setMemberAddModalForMediaId] = useState<string | null>(null);
  const [membersUpdatingMediaId, setMembersUpdatingMediaId] = useState<string | null>(null);
  const [syncingTurnedInMediaId, setSyncingTurnedInMediaId] = useState<string | null>(null);
  const [inlineNotice, setInlineNotice] = useState<string | null>(null);
  const [workspaceMembers, setWorkspaceMembers] = useState<WorkspaceMemberOption[]>([]);
  const [workspaceMembersLoading, setWorkspaceMembersLoading] = useState(false);
  const [workspaceMembersLoaded, setWorkspaceMembersLoaded] = useState(false);

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
  const allVisibleSelected = useMemo(() => {
    if (assetItems.length === 0) return false;
    return assetItems.every((item) => selectedIds.includes(item.id));
  }, [assetItems, selectedIds]);

  const ensureWorkspaceMembersLoaded = useCallback(async () => {
    if (workspaceMembersLoaded || workspaceMembersLoading) {
      return;
    }

    setWorkspaceMembersLoading(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/member-candidates`, { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Failed");
      }

      const payload = await response.json();
      setWorkspaceMembers((payload.data as WorkspaceMemberOption[]) ?? []);
      setWorkspaceMembersLoaded(true);
    } catch {
      setInlineNotice("Could not load people for this project.");
    } finally {
      setWorkspaceMembersLoading(false);
    }
  }, [projectId, workspaceMembersLoaded, workspaceMembersLoading]);

  const updateDragOverlayPosition = useCallback((clientX: number, clientY: number) => {
    dragPointerRef.current = { x: clientX, y: clientY };

    if (dragOverlayFrameRef.current !== null) {
      return;
    }

    dragOverlayFrameRef.current = window.requestAnimationFrame(() => {
      dragOverlayFrameRef.current = null;
      const overlay = dragOverlayRef.current;
      if (!overlay) {
        return;
      }

      const { x, y } = dragPointerRef.current;
      overlay.style.transform = `translate3d(${x + 18}px, ${y + 18}px, 0)`;
    });
  }, []);

  useEffect(() => {
    if (!draggingMediaId) {
      return;
    }

    function handleWindowDragOver(event: DragEvent) {
      updateDragOverlayPosition(event.clientX, event.clientY);
    }

    function handleWindowDrop() {
      setDragOverFolderId(null);
    }

    window.addEventListener("dragover", handleWindowDragOver);
    window.addEventListener("drop", handleWindowDrop);

    return () => {
      window.removeEventListener("dragover", handleWindowDragOver);
      window.removeEventListener("drop", handleWindowDrop);
    };
  }, [draggingMediaId, updateDragOverlayPosition]);

  useEffect(() => {
    setMemberAddModalSearch("");
  }, [memberAddModalForMediaId]);

  useEffect(() => {
    return () => {
      if (dragOverlayFrameRef.current !== null) {
        window.cancelAnimationFrame(dragOverlayFrameRef.current);
      }
    };
  }, []);

  const selectedMoveValue = useMemo(() => {
    if (selectedIds.length === 0) {
      return "root";
    }

    const selectedItems = items.filter((item) => selectedIds.includes(item.id));
    if (selectedItems.length === 0) {
      return "root";
    }

    const firstFolder = selectedItems[0].folderId ?? "root";
    const allSame = selectedItems.every((item) => (item.folderId ?? "root") === firstFolder);
    return allSame ? firstFolder : "root";
  }, [items, selectedIds]);

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

  const markVersionUploadComplete = useCallback(async (mediaId: string, versionId: string) => {
    try {
      await fetch(`/api/media/${mediaId}/versions/${versionId}/upload-complete`, {
        method: "PATCH"
      });
    } catch {
      return;
    }
  }, []);

  useEffect(() => {
    setItems(initialItems);
    setSelectedIds([]);
    setSelectedVersionByMedia(buildVersionSelection(initialItems));
  }, [initialItems]);

  useEffect(() => {
    setFoldersState(folders);
  }, [folders]);

  useEffect(() => {
    setWorkspaceMembers([]);
    setWorkspaceMembersLoaded(false);
    setWorkspaceMembersLoading(false);
  }, [projectId]);

  useEffect(() => {
    if (!memberPickerForMediaId) {
      return;
    }

    void ensureWorkspaceMembersLoaded();

    if (!items.some((item) => item.id === memberPickerForMediaId)) {
      setMemberPickerForMediaId(null);
    }
  }, [ensureWorkspaceMembersLoaded, items, memberPickerForMediaId]);

  useEffect(() => {
    if (!memberAddModalForMediaId) {
      return;
    }

    void ensureWorkspaceMembersLoaded();

    if (!items.some((item) => item.id === memberAddModalForMediaId)) {
      setMemberAddModalForMediaId(null);
    }
  }, [ensureWorkspaceMembersLoaded, items, memberAddModalForMediaId]);

  useEffect(() => {
    if (!renameAction) {
      return;
    }

    if (!items.some((item) => item.id === renameAction.mediaId)) {
      setRenameAction(null);
      setRenameTitleInput("");
    }
  }, [items, renameAction]);

  useEffect(() => {
    if (!moveToVersionAction) {
      return;
    }

    const sourceExists = items.some((item) => item.id === moveToVersionAction.sourceMediaId);
    const targetExists = items.some((item) => item.id === moveToVersionAction.targetMediaId);
    if (!sourceExists || !targetExists) {
      setMoveToVersionAction(null);
    }
  }, [items, moveToVersionAction]);

  useEffect(() => {
    if (showPackageActions) {
      return;
    }

    setMemberPickerForMediaId(null);
    setMemberAddModalForMediaId(null);
    setMoveToVersionAction(null);
  }, [showPackageActions]);

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

        const selectedVersionId = selectedVersionByMedia[mediaItem.id] ?? mediaItem.currentVersionId ?? mediaItem.versions[0]?.id;
        const activeVersion = mediaItem.versions.find((candidate) => candidate.id === selectedVersionId) ?? mediaItem.versions[0];
        if (!activeVersion) {
          return false;
        }

        return activeVersion.status === "UPLOADING" || activeVersion.status === "PROCESSING";
      });

      return next.length === current.length ? current : next;
    });
  }, [items, selectedVersionByMedia]);

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
      ) ||
      activeUploads.some(
        (upload) => upload.status === "PREPARING" || upload.status === "UPLOADING" || upload.status === "PROCESSING"
      ),
    [activeUploads, items]
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

  useEffect(() => {
    const ghost = document.createElement("div");
    ghost.style.position = "fixed";
    ghost.style.left = "-9999px";
    ghost.style.top = "-9999px";
    ghost.style.width = "1px";
    ghost.style.height = "1px";
    ghost.style.opacity = "0";
    ghost.style.pointerEvents = "none";
    document.body.appendChild(ghost);
    transparentDragImageRef.current = ghost;

    return () => {
      transparentDragImageRef.current = null;
      ghost.remove();
    };
  }, []);

  const loadShareLinks = useCallback(async () => {
    setShareLoading(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/guest-links`, { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Failed");
      }

      const payload = await response.json();
      setShareLinks(payload.data as ShareLink[]);
    } catch {
      setShareMessage("Could not load share links.");
    } finally {
      setShareLoading(false);
    }
  }, [projectId]);

  const updateQuery = useCallback(
    (updates: {
      new?: "upload" | "folder" | null;
      folderId?: string;
      scope?: ScopeMode;
      page?: number | null;
      preservePage?: boolean;
    }) => {
      const next = new URLSearchParams(searchParams.toString());

      if (updates.new === null) {
        next.delete("new");
      } else if (updates.new) {
        next.set("new", updates.new);
      }

      if (updates.scope) {
        next.set("scope", updates.scope);
      }

      if (updates.folderId) {
        next.set("folderId", updates.folderId);
      }

      if (updates.page === null) {
        next.delete("page");
      } else if (typeof updates.page === "number") {
        if (updates.page <= 1) {
          next.delete("page");
        } else {
          next.set("page", String(updates.page));
        }
      } else if (!updates.preservePage) {
        next.delete("page");
      }

      startQueryNavigationTransition(() => {
        router.push(`${pathname}?${next.toString()}` as never);
      });
    },
    [pathname, router, searchParams, startQueryNavigationTransition]
  );

  const prefetchHref = useCallback(
    (href: string) => {
      router.prefetch(href as never);
    },
    [router]
  );

  const openReviewHref = useCallback(
    (href: string) => {
      startQueryNavigationTransition(() => {
        router.push(href as never);
      });
    },
    [router, startQueryNavigationTransition]
  );

  const createFolder = useCallback(async (rawName: string) => {
    const name = rawName.trim();
    if (!name) {
      return false;
    }

    const parentName =
      selectedFolderId !== "all" && selectedFolderId !== "root"
        ? foldersState.find((folder) => folder.id === selectedFolderId)?.name ?? null
        : null;
    const fullName = parentName ? `${parentName}/${name}` : name;

    setFolderCreating(true);
    setInlineNotice(null);

    try {
      const response = await fetch(`/api/projects/${projectId}/folders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: fullName
        })
      });

      if (!response.ok) {
        setInlineNotice("Could not create folder.");
        return false;
      }

      const payload = await response.json();
      const folder = payload.data as { id: string; name: string };

      setFoldersState((current) => [...current, { id: folder.id, name: folder.name, itemCount: 0 }]);
      router.refresh();
      return true;
    } catch {
      setInlineNotice("Could not create folder.");
      return false;
    } finally {
      setFolderCreating(false);
    }
  }, [foldersState, projectId, router, selectedFolderId]);

  useEffect(() => {
    function openShareModal() {
      setShareOpen(true);
      setShareMessage(null);
      void loadShareLinks();
    }

    window.addEventListener("infocus:open-project-share", openShareModal);
    return () => window.removeEventListener("infocus:open-project-share", openShareModal);
  }, [loadShareLinks]);

  useEffect(() => {
    if (searchParams.get("share") === "1") {
      setShareOpen(true);
      setShareMessage(null);
      void loadShareLinks();
    }
  }, [loadShareLinks, searchParams]);

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
        updateQuery({ new: null });
        return;
      }

      setUploadAction({ kind: "new" });
      fileInputRef.current?.click();
      updateQuery({ new: null });
      return;
    }

    if (newValue === "folder") {
      setFolderModalOpen(true);
      updateQuery({ new: null });
    }
  }, [canUpload, searchParams, updateQuery]);

  const getActiveVersion = useCallback(
    (item: MediaTileItem) => {
      const selectedVersionId = selectedVersionByMedia[item.id] ?? item.currentVersionId ?? item.versions[0]?.id;
      return item.versions.find((candidate) => candidate.id === selectedVersionId) ?? item.versions[0];
    },
    [selectedVersionByMedia]
  );

  function toggleSelect(mediaId: string) {
    setSelectedIds((current) =>
      current.includes(mediaId) ? current.filter((id) => id !== mediaId) : [...current, mediaId]
    );
  }

  function toggleSelectAll() {
    if (allVisibleSelected) {
      setSelectedIds([]);
      return;
    }
    setSelectedIds(assetItems.map((item) => item.id));
  }

  function triggerVersionUploadForSelected() {
    if (selectedCount === 0) return;
    if (selectedCount > 1) {
      setInlineNotice("Select one video to upload a new version.");
      return;
    }

    setUploadAction({ kind: "version", mediaId: selectedIds[0] });
    fileInputRef.current?.click();
  }

  function triggerVersionUploadForMedia(mediaId: string) {
    if (!canUpload || scope !== "active") {
      return;
    }

    setUploadAction({ kind: "version", mediaId });
    fileInputRef.current?.click();
  }

  function triggerNewUpload() {
    if (!canUpload) {
      return;
    }

    setUploadAction({ kind: "new" });
    fileInputRef.current?.click();
  }

  async function uploadFileWithTus(
    file: File,
    upload: {
      provider?: string;
      uploadUrl: string;
      signature: string;
      expiresAt: number;
      videoId: string;
      libraryId: string;
      path?: string;
      token?: string;
    },
    title: string,
    onProgress: (update: {
      progress: number;
      bytesUploaded: number;
      bytesTotal: number;
      speedBytesPerSecond: number;
      etaSeconds: number | null;
    }) => void,
    complete?: { mediaId: string; versionId: string }
  ) {
    const speedTracker = {
      loaded: 0,
      timestampMs: performance.now(),
      speedBytesPerSecond: 0,
      progress: 0,
      bytesUploaded: 0
    };
    let lastReportMs = 0;

    const reportProgress = (bytesUploaded: number, bytesTotal: number) => {
      if (!bytesTotal) return;
      const nowMs = performance.now();
      const elapsedSeconds = (nowMs - speedTracker.timestampMs) / 1000;
      const bytesDelta = bytesUploaded - speedTracker.loaded;
      if (elapsedSeconds > 0 && bytesDelta >= 0) {
        speedTracker.speedBytesPerSecond = bytesDelta / elapsedSeconds;
        speedTracker.loaded = bytesUploaded;
        speedTracker.timestampMs = nowMs;
      }
      const monotonicBytesUploaded = Math.max(speedTracker.bytesUploaded, bytesUploaded);
      speedTracker.bytesUploaded = monotonicBytesUploaded;
      const progress = Math.max(speedTracker.progress, (monotonicBytesUploaded / bytesTotal) * 100);
      speedTracker.progress = progress;
      const bytesRemaining = Math.max(0, bytesTotal - monotonicBytesUploaded);
      const etaSeconds =
        speedTracker.speedBytesPerSecond > 0 ? bytesRemaining / speedTracker.speedBytesPerSecond : null;
      // Progress events can fire many times a second; each one re-renders the whole media grid.
      if (bytesRemaining > 0 && nowMs - lastReportMs < UPLOAD_PROGRESS_REPORT_MS) {
        return;
      }
      lastReportMs = nowMs;
      onProgress({
        progress,
        bytesUploaded: monotonicBytesUploaded,
        bytesTotal,
        speedBytesPerSecond: speedTracker.speedBytesPerSecond,
        etaSeconds
      });
    };

    // NAS: multipart POST to drive.infocuspaly.com (CORS-enabled)
    if ((upload.provider || "").toUpperCase() === "NAS") {
      const { completeNasUpload, uploadFileToNas } = await import("@/src/lib/nas-upload-client");
      await uploadFileToNas(file, upload, reportProgress);
      if (complete) {
        await completeNasUpload(complete.mediaId, complete.versionId);
      }
      onProgress({
        progress: 100,
        bytesUploaded: file.size,
        bytesTotal: file.size,
        speedBytesPerSecond: 0,
        etaSeconds: null
      });
      return;
    }

    // Legacy Bunny path only; NAS uploads never need the tus client.
    const tus = await import("tus-js-client");
    await new Promise<void>((resolve, reject) => {
      const uploader = new tus.Upload(file, {
        endpoint: upload.uploadUrl,
        retryDelays: [0, 1500, 3000, 5000],
        headers: {
          AuthorizationSignature: upload.signature,
          AuthorizationExpire: String(upload.expiresAt),
          VideoId: upload.videoId,
          LibraryId: upload.libraryId
        },
        metadata: {
          filetype: file.type || "video/mp4",
          title
        },
        onError: (error) => reject(error),
        onProgress: (bytesUploaded, bytesTotal) => {
          reportProgress(bytesUploaded, bytesTotal);
        },
        onSuccess: () => {
          onProgress({
            progress: 100,
            bytesUploaded: file.size,
            bytesTotal: file.size,
            speedBytesPerSecond: 0,
            etaSeconds: null
          });
          resolve();
        }
      });

      uploader.start();
    });
  }

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
          upload: {
            uploadUrl: string;
            signature: string;
            expiresAt: number;
            videoId: string;
            libraryId: string;
          };
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

      const isNas = (init.data.upload as { provider?: string }).provider === "NAS";
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
      setInlineNotice("Video upload failed. Please try again.");
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
      setInlineNotice("Image upload failed. Please try again.");
    }
  }

  async function handleVersionUpload(file: File, mediaId: string) {
    const targetItem = items.find((item) => item.id === mediaId);
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
          upload: {
            uploadUrl: string;
            signature: string;
            expiresAt: number;
            videoId: string;
            libraryId: string;
          };
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

      const nasDone = (init.data.upload as { provider?: string }).provider === "NAS";
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
      setInlineNotice("Version upload failed. Please try again.");
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
    const targetItem = items.find((item) => item.id === mediaId);
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
      setInlineNotice("Image version upload failed. Please try again.");
    }
  }

  async function onFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0 || !uploadAction) return;

    if (uploadAction.kind === "new") {
      await Promise.allSettled(
        files.map((file) => (isImageFile(file) ? handleNewImageUpload(file) : handleNewUpload(file)))
      );
    } else {
      if (files.length > 1) {
        setInlineNotice("Version upload supports one file at a time. Uploading the first selected file.");
      }

      const targetItem = items.find((item) => item.id === uploadAction.mediaId);
      const isImageAsset = targetItem?.versions[0]?.sourceType === "IMAGE";

      if (isImageAsset) {
        if (!isImageFile(files[0])) {
          setInlineNotice("Please upload an image file for this asset version.");
        } else {
          await handleImageVersionUpload(files[0], uploadAction.mediaId);
        }
      } else {
        if (isImageFile(files[0])) {
          setInlineNotice("Please upload a video file for this asset version.");
        } else {
          await handleVersionUpload(files[0], uploadAction.mediaId);
        }
      }
    }

    setUploadAction(null);
    event.target.value = "";
  }

  async function updateMediaAssignedMembers(mediaId: string, memberIds: string[]) {
    setMembersUpdatingMediaId(mediaId);

    const uniqueMemberIds = [...new Set(memberIds)];
    const currentItem = items.find((item) => item.id === mediaId) ?? null;
    const memberMap = new Map(
      [...workspaceMembers, ...(currentItem?.assignedMembers ?? [])].map((member) => [member.userId, member])
    );
    const optimisticMembers = uniqueMemberIds
      .map((memberId) => memberMap.get(memberId))
      .filter((member): member is WorkspaceMemberOption => Boolean(member));

    const previousItems = items;

    setItems((current) =>
      current.map((item) =>
        item.id === mediaId
          ? {
              ...item,
              assignedMembers: optimisticMembers
            }
          : item
      )
    );

    try {
      const response = await fetch(`/api/media/${mediaId}/members`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          memberIds: uniqueMemberIds
        })
      });

      if (!response.ok) {
        throw new Error("Failed to update assignees");
      }

      const payload = (await response.json()) as {
        data: {
          assignedMembers: {
            userId: string;
            name: string | null;
            email: string | null;
          }[];
        };
      };

      setItems((current) =>
        current.map((item) =>
          item.id === mediaId
            ? {
                ...item,
                assignedMembers: payload.data.assignedMembers
              }
            : item
        )
      );
    } catch {
      setItems(previousItems);
      setInlineNotice("Could not update assigned members.");
    } finally {
      setMembersUpdatingMediaId(null);
    }
  }

  function toggleAssignedMember(mediaId: string, userId: string) {
    const item = items.find((entry) => entry.id === mediaId);
    if (!item) {
      return;
    }

    const selectedIds = new Set(item.assignedMembers.map((member) => member.userId));
    if (selectedIds.has(userId)) {
      selectedIds.delete(userId);
    } else {
      selectedIds.add(userId);
    }

    void updateMediaAssignedMembers(mediaId, [...selectedIds]);
  }

  function requestSoftDelete(mediaIds: string[]) {
    if (mediaIds.length === 0) {
      return;
    }

    const label = mediaIds.length === 1 ? "this video" : `${mediaIds.length} videos`;
    if (!canManageVersionMeta) {
      setConfirmAction({
        type: "permission-denied",
        label
      });
      return;
    }

    setConfirmAction({
      type: "soft-delete",
      mediaIds,
      label
    });
  }

  function requestPermanentDelete(mediaIds: string[]) {
    if (mediaIds.length === 0) {
      return;
    }

    const label = mediaIds.length === 1 ? "this video" : `${mediaIds.length} videos`;
    if (!canManageVersionMeta) {
      setConfirmAction({
        type: "permission-denied",
        label
      });
      return;
    }

    setConfirmAction({
      type: "permanent-delete",
      mediaIds,
      label
    });
  }

  function requestOriginalDownload(mediaId: string, versionId: string, title: string, versionNumber: number) {
    setDownloadConfirmAction({
      mediaId,
      versionId,
      title,
      versionNumber
    });
  }

  function requestRename(mediaId: string) {
    const item = items.find((entry) => entry.id === mediaId);
    if (!item) {
      return;
    }

    setRenameAction({ mediaId });
    setRenameTitleInput(item.title);
  }

  function requestMoveSelectedIntoVersion() {
    if (selectedIds.length !== 1) {
      setInlineNotice("Select one duplicate package to move into the correct version.");
      return;
    }

    requestMoveIntoVersion(selectedIds[0]);
  }

  function requestMoveIntoVersion(mediaId: string) {
    const source = items.find((entry) => entry.id === mediaId);
    if (!source) {
      return;
    }

    const sourceType = source.versions[0]?.sourceType ?? null;
    const candidates = items.filter(
      (entry) =>
        entry.id !== source.id &&
        entry.deletedAt === null &&
        entry.versions.length > 0 &&
        entry.versions.every((version) => version.sourceType === sourceType)
    );

    if (candidates.length === 0) {
      setInlineNotice("No matching package is visible to move this into.");
      return;
    }

    setMoveToVersionAction({
      sourceMediaId: source.id,
      targetMediaId: candidates[0].id
    });
  }

  async function confirmOriginalDownload() {
    if (!downloadConfirmAction) {
      return;
    }

    setDownloadConfirmBusy(true);
    try {
      triggerFileDownload(`/api/media/${downloadConfirmAction.mediaId}/download?mediaVersionId=${downloadConfirmAction.versionId}`);
      setDownloadConfirmAction(null);
    } finally {
      setDownloadConfirmBusy(false);
    }
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
      setRenameAction(null);
      setRenameTitleInput("");
      return;
    }

    setRenameBusy(true);
    setInlineNotice(null);

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
      setRenameAction(null);
      setRenameTitleInput("");
    } catch (error) {
      setInlineNotice(error instanceof Error ? error.message : "Could not rename video.");
    } finally {
      setRenameBusy(false);
    }
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
    setInlineNotice(null);

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
      router.refresh();
    } catch {
      setInlineNotice("Could not move that package into the selected version.");
    } finally {
      setMoveToVersionBusy(false);
    }
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
        const label = mediaIds.length === 1 ? "this video" : `${mediaIds.length} videos`;
        setConfirmAction({
          type: "permission-denied",
          label
        });
        return false;
      }

      if (results.some((response) => !response.ok)) {
        throw new Error("Delete failed");
      }

      setItems((current) => current.filter((item) => !mediaIds.includes(item.id)));
      setSelectedIds((current) => current.filter((id) => !mediaIds.includes(id)));
      router.refresh();
      return true;
    } catch {
      setInlineNotice("Could not delete one or more videos.");
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

      setItems((current) => current.filter((item) => !mediaIds.includes(item.id)));
      setSelectedIds((current) => current.filter((id) => !mediaIds.includes(id)));
      router.refresh();
    } catch {
      setInlineNotice("Could not restore one or more videos.");
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
        const label = mediaIds.length === 1 ? "this video" : `${mediaIds.length} videos`;
        setConfirmAction({
          type: "permission-denied",
          label
        });
        return false;
      }

      if (results.some((response) => !response.ok)) {
        throw new Error("Permanent delete failed");
      }

      setItems((current) => current.filter((item) => !mediaIds.includes(item.id)));
      setSelectedIds((current) => current.filter((id) => !mediaIds.includes(id)));
      router.refresh();
      return true;
    } catch {
      setInlineNotice("Could not permanently delete one or more videos.");
      return false;
    } finally {
      setIsDeleting(false);
    }
  }

  async function syncTurnedInDateForMedia(mediaId: string) {
    if (!canSyncTurnedInDates || !showPackageActions || syncingTurnedInMediaId) {
      return;
    }

    setSyncingTurnedInMediaId(mediaId);
    setInlineNotice(null);

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
        setInlineNotice(payload.error?.message ?? "Could not sync turn-in date.");
        return;
      }

      const syncedTurnedInRows = payload.data?.syncedTurnedInRows ?? 0;
      if (syncedTurnedInRows > 0) {
        setInlineNotice("Turn-in date synced to upload date.");
      } else {
        setInlineNotice("No turn-in date changes were needed.");
      }
      router.refresh();
    } catch {
      setInlineNotice("Could not sync turn-in date.");
    } finally {
      setSyncingTurnedInMediaId(null);
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
      setInlineNotice("Could not update status.");
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

  async function moveMediaToFolder(mediaId: string, folderValue: string) {
    const folderId = folderValue === "root" ? null : folderValue;

    const response = await fetch(`/api/media/${mediaId}/folder`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        folderId
      })
    });

    if (!response.ok) {
      setInlineNotice("Could not move video to that folder.");
      return;
    }

    setItems((current) => current.map((item) => (item.id === mediaId ? { ...item, folderId } : item)));
    router.refresh();
  }

  function onMediaDragStart(event: ReactDragEvent<HTMLElement>, mediaId: string) {
    const draggedItem = items.find((item) => item.id === mediaId) ?? null;
    const moveCount = selectedIds.includes(mediaId) && selectedIds.length > 1 ? selectedIds.length : 1;

    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", mediaId);
    if (transparentDragImageRef.current) {
      event.dataTransfer.setDragImage(transparentDragImageRef.current, 0, 0);
    }

    updateDragOverlayPosition(event.clientX, event.clientY);
    setDraggingMediaId(mediaId);
    setDragOverFolderId(null);
    setDragPreview(
      draggedItem
        ? {
            title: draggedItem.title,
            thumbnailUrl: getActiveVersion(draggedItem)?.thumbnailUrl ?? null,
            itemCount: moveCount
          }
        : {
            title: "Moving asset",
            thumbnailUrl: null,
            itemCount: moveCount
          }
    );
  }

  function onMediaDragEnd() {
    if (dragOverlayFrameRef.current !== null) {
      window.cancelAnimationFrame(dragOverlayFrameRef.current);
      dragOverlayFrameRef.current = null;
    }
    setDraggingMediaId(null);
    setDragPreview(null);
    setDragOverFolderId(null);
  }

  function onFolderDrop(folderId: string) {
    if (!draggingMediaId) {
      return;
    }

    if (selectedIds.includes(draggingMediaId) && selectedIds.length > 1) {
      void moveSelectedToFolder(folderId);
    } else {
      void moveMediaToFolder(draggingMediaId, folderId);
    }
    setDragOverFolderId(null);
    setDraggingMediaId(null);
    setDragPreview(null);
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
      router.refresh();
    } catch {
      setInlineNotice("Could not move one or more selected videos.");
    } finally {
      setIsMoving(false);
    }
  }

  async function createShareLink() {
    const response = await fetch("/api/guest-links", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        projectId,
        permission: sharePermission,
        passcode: sharePasscode || undefined,
        expiresAt: shareExpiry || undefined
      })
    });

    if (!response.ok) {
      setShareMessage("Failed to create share link.");
      return;
    }

    setShareMessage("Share link created.");
    setSharePasscode("");
    setShareExpiry("");
    await loadShareLinks();
  }

  async function revokeShareLink(id: string) {
    const response = await fetch(`/api/guest-links/${id}/revoke`, {
      method: "POST"
    });

    setShareMessage(response.ok ? "Share link revoked." : "Failed to revoke share link.");
    if (response.ok) {
      await loadShareLinks();
    }
  }

  async function copyShareLink(token: string) {
    try {
      const url = `${window.location.origin}/g/${token}`;
      await navigator.clipboard.writeText(url);
      setShareMessage("Copied share link.");
    } catch {
      setShareMessage("Could not copy share link.");
    }
  }

  const memberAddModalItem = memberAddModalForMediaId ? items.find((item) => item.id === memberAddModalForMediaId) ?? null : null;
  const memberAddModalAssignedIds = new Set(memberAddModalItem?.assignedMembers.map((member) => member.userId) ?? []);
  const memberAddModalAvailableMembers = workspaceMembers.filter((member) => !memberAddModalAssignedIds.has(member.userId));
  const memberAddModalSearchQuery = memberAddModalSearch.trim().toLowerCase();
  const memberAddModalFilteredMembers = memberAddModalAvailableMembers.filter((member) => {
    if (!memberAddModalSearchQuery) {
      return true;
    }

    const name = member.name?.toLowerCase() ?? "";
    const email = member.email?.toLowerCase() ?? "";
    return name.includes(memberAddModalSearchQuery) || email.includes(memberAddModalSearchQuery);
  });
  const moveToVersionSourceItem = moveToVersionAction
    ? items.find((item) => item.id === moveToVersionAction.sourceMediaId) ?? null
    : null;
  const moveToVersionSourceType = moveToVersionSourceItem?.versions[0]?.sourceType ?? null;
  const moveToVersionTargetCandidates = moveToVersionSourceItem
    ? items.filter(
        (item) =>
          item.id !== moveToVersionSourceItem.id &&
          item.deletedAt === null &&
          item.versions.length > 0 &&
          item.versions.every((version) => version.sourceType === moveToVersionSourceType)
      )
    : [];
  const moveToVersionTargetItem = moveToVersionAction
    ? items.find((item) => item.id === moveToVersionAction.targetMediaId) ?? null
    : null;
  const dragTargetFolder = dragOverFolderId ? foldersState.find((folder) => folder.id === dragOverFolderId) ?? null : null;

  return (
    <div className="space-y-3">
      <input ref={fileInputRef} type="file" accept="video/*,image/*" multiple className="hidden" onChange={onFileSelected} />
      {queryNavigationPending ? (
        <div className="h-1 w-full overflow-hidden rounded-full bg-secondary">
          <div className="h-full w-1/3 animate-[loading-bar_1s_ease-in-out_infinite] rounded-full bg-primary" />
        </div>
      ) : null}
      {inlineNotice ? (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-amber-300/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-200">
          <p>{inlineNotice}</p>
          <button
            type="button"
            onClick={() => setInlineNotice(null)}
            className="rounded-md p-1 text-foreground hover:text-foreground hover:bg-accent"
            aria-label="Dismiss notice"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted px-3 py-2.5">
        <button
          onClick={toggleSelectAll}
          className="inline-flex items-center gap-2 rounded-md px-2 py-1 text-sm text-foreground hover:bg-accent"
        >
          {allVisibleSelected ? <CheckSquare className="h-4 w-4 text-foreground" /> : <Square className="h-4 w-4" />}
          Select all
        </button>

        {selectedCount > 0 ? (
          <div className="inline-flex items-center gap-2">
            <span className="rounded-full border border-border bg-secondary px-2 py-1 text-xs text-foreground">
              {selectedCount} selected
            </span>

            {scope === "active" ? (
              <>
                {canUpload ? (
                  <Button size="sm" className="h-8 gap-1" onClick={triggerVersionUploadForSelected}>
                    <UploadCloud className="h-3.5 w-3.5" />
                    Upload New Version
                  </Button>
                ) : null}

                {canManageProjectMedia ? (
                  <Button size="sm" variant="secondary" className="h-8 gap-1" onClick={requestMoveSelectedIntoVersion}>
                    <GitMerge className="h-3.5 w-3.5" />
                    Move Into Version
                  </Button>
                ) : null}

                <Select
                  value={selectedMoveValue}
                  onValueChange={(value) => void moveSelectedToFolder(value)}
                  disabled={isMoving}
                >
                  <SelectTrigger className="h-8 min-w-[150px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {folderOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 gap-1 text-destructive hover:bg-destructive/10"
                  onClick={() => requestSoftDelete(selectedIds)}
                  disabled={isDeleting}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </Button>
              </>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 gap-1"
                  onClick={() => void restoreMediaByIds(selectedIds)}
                  disabled={isDeleting}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Restore
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 gap-1 text-destructive hover:bg-destructive/10"
                  onClick={() => requestPermanentDelete(selectedIds)}
                  disabled={isDeleting}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete Permanently
                </Button>
              </>
            )}

            <Button size="sm" variant="ghost" className="h-8" onClick={() => setSelectedIds([])}>
              Clear
            </Button>
          </div>
        ) : (
          <div className="inline-flex items-center gap-2">
            <p className="text-xs text-muted-foreground">Select videos for bulk actions.</p>
            {scope === "deleted" && assetItems.length > 0 ? (
              <Button
                size="sm"
                variant="ghost"
                className="h-8 gap-1 text-destructive hover:bg-destructive/10"
                onClick={() => requestPermanentDelete(assetItems.map((item) => item.id))}
                disabled={isDeleting}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete All Permanently
              </Button>
            ) : null}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
        <p>
          {scope === "active" && folderCards.length > 0 && assetItems.length === 0
            ? `Showing ${folderCards.length} ${folderCards.length === 1 ? "folder" : "folders"}`
            : `Showing ${assetItems.length} of ${pagination.totalItems} ${pagination.totalItems === 1 ? "asset" : "assets"}`}
        </p>
        {pagination.totalPages > 1 ? (
          <p>
            Page {pagination.page} of {pagination.totalPages}
          </p>
        ) : null}
      </div>

      {scope === "active" && folderCards.length > 0 ? (
        <section className="space-y-3">
          <button
            type="button"
            onClick={() => setFoldersExpanded((current) => !current)}
            className="flex w-full items-center gap-2 rounded-lg border border-[hsl(var(--border))]/60 bg-[hsl(var(--background))]/60 px-3 py-2 text-left text-xs font-medium text-muted-foreground transition hover:bg-[hsl(var(--background))] hover:text-foreground"
          >
            <Square className="h-3.5 w-3.5" />
            <ChevronDown className={`h-3.5 w-3.5 transition ${foldersExpanded ? "" : "-rotate-90"}`} />
            <span className="text-foreground">{folderCards.length} Folders</span>
          </button>

          {foldersExpanded ? (
            <div className={`grid gap-3.5 ${viewMode === "list" ? "grid-cols-1" : "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"}`}>
              {folderCards.map((folder) => {
                const displayName = folderDisplayName(folder.name);
                const lower = displayName.trim().toLowerCase();
                const isFinal = lower.includes("final");
                const isInitial = lower.includes("initial");
                const spineCls = isFinal
                  ? "bg-gradient-to-r from-[var(--brand-green)] to-[var(--brand-green-deep)]"
                  : isInitial
                    ? "bg-gradient-to-r from-[#F2A516] to-[#D17F00]"
                    : "bg-[var(--ink-4)]";
                const iconCls = isFinal
                  ? "border-[rgb(43,179,110,0.30)] bg-[rgb(43,179,110,0.14)] text-[var(--brand-green)]"
                  : isInitial
                    ? "border-[rgb(242,165,22,0.30)] bg-[rgb(242,165,22,0.14)] text-[var(--brand-amber)]"
                    : "border-border bg-[var(--ink)] text-muted-foreground";
                const statusPill = isFinal
                  ? folder.itemCount === 0
                    ? { cls: "status-neutral", label: "Locked" }
                    : { cls: "status-approved", label: "In Final" }
                  : isInitial
                    ? folder.itemCount === 0
                      ? { cls: "status-neutral", label: "Empty" }
                      : { cls: "status-warn", label: "In Review" }
                    : { cls: "status-neutral", label: `${folder.itemCount} items` };
                const eyebrow = isInitial
                  ? "Stage 1 of 2"
                  : isFinal
                    ? "Stage 2 of 2"
                    : "Folder";

                return (
                  <button
                    key={folder.id}
                    type="button"
                    onClick={() => updateQuery({ scope: "active", folderId: folder.id })}
                    onMouseEnter={() => prefetchHref(`${pathname}?scope=active&folderId=${folder.id}`)}
                    onFocus={() => prefetchHref(`${pathname}?scope=active&folderId=${folder.id}`)}
                    data-folder-drop-zone={folder.id}
                    onDragEnter={() => {
                      if (!draggingMediaId) {
                        return;
                      }
                      setDragOverFolderId(folder.id);
                    }}
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                      if (draggingMediaId) {
                        setDragOverFolderId((current) => (current === folder.id ? current : folder.id));
                      }
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      onFolderDrop(folder.id);
                    }}
                    className={cn(
                      "group relative flex min-h-[200px] flex-col overflow-hidden rounded-xl border bg-card text-left transition hover:-translate-y-0.5 hover:border-[var(--ink-4)] hover:shadow-[0_12px_32px_-12px_rgba(0,0,0,0.5)]",
                      dragOverFolderId === folder.id
                        ? "border-[var(--brand-green)] bg-[var(--brand-green)]/5 shadow-md"
                        : draggingMediaId
                          ? "border-[var(--brand-green)]/50"
                          : "border-border"
                    )}
                  >
                    {/* Folder spine */}
                    <div className={cn("relative h-2 w-full flex-shrink-0", spineCls)}>
                      <div className="absolute left-3.5 top-0 h-2 w-20 rounded-b-md border border-t-0 border-border bg-card" />
                    </div>

                    {/* Folder body */}
                    <div className="flex flex-1 flex-col gap-3 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className={cn("grid h-10 w-10 place-items-center rounded-lg border", iconCls)}>
                          <Folder className="h-4 w-4" />
                        </div>
                        <span className={cn("status-pill", statusPill.cls)}>{statusPill.label}</span>
                      </div>

                      <div>
                        <div className="font-display text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--ink-5)]">
                          {eyebrow}
                        </div>
                        <h2 className="mt-0.5 font-display text-2xl italic font-extrabold leading-none tracking-tight text-foreground">
                          {displayName.toUpperCase()}
                        </h2>
                      </div>

                      {/* Mini thumbnail strip */}
                      <div className="flex gap-1">
                        {Array.from({ length: 3 }).map((_, i) => (
                          <div
                            key={`mini-${folder.id}-${i}`}
                            className={cn(
                              "relative flex-1 overflow-hidden rounded-sm aspect-video",
                              i < folder.itemCount
                                ? i === 0
                                  ? "bg-gradient-to-br from-[#1a3a2e] to-[#0a0a0a]"
                                  : i === 1
                                    ? "bg-gradient-to-br from-[#7a3a1a] to-[#3a1a0a]"
                                    : "bg-gradient-to-br from-[#1a3a7a] to-[#0a1a3a]"
                                : "border border-dashed border-border bg-[var(--ink)]"
                            )}
                          >
                            {i < folder.itemCount ? (
                              <span className="absolute bottom-0.5 right-0.5 rounded-sm bg-black/70 px-1 py-0 font-mono-broadcast text-[7px] font-bold text-white">
                                v{folder.itemCount - i}
                              </span>
                            ) : null}
                          </div>
                        ))}
                      </div>

                      {/* Folder meta */}
                      <div className="mt-auto flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <Folder className="h-3 w-3" />
                          <span>
                            <strong className="font-bold text-foreground">{folder.itemCount}</strong> versions
                          </span>
                        </div>
                      </div>

                      {draggingMediaId ? (
                        <div
                          className={cn(
                            "absolute inset-x-3 bottom-3 inline-flex items-center justify-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium",
                            dragOverFolderId === folder.id
                              ? "border-[var(--brand-green)] bg-[var(--brand-green)]/15 text-foreground"
                              : "border-border bg-secondary text-muted-foreground"
                          )}
                        >
                          {dragOverFolderId === folder.id ? "Release to move" : "Drop target"}
                        </div>
                      ) : null}
                    </div>
                  </button>
                );
              })}

              <button
                type="button"
                onClick={() => setFolderModalOpen(true)}
                className="flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-transparent p-6 transition hover:border-[var(--brand-green)] hover:bg-[var(--brand-green)]/5"
              >
                <div className="grid h-12 w-12 place-items-center rounded-xl border border-border bg-card text-muted-foreground transition group-hover:border-[var(--brand-green)] group-hover:text-[var(--brand-green)]">
                  <FolderPlus className="h-5 w-5" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-foreground">New Folder</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Create a folder to sort assets.</p>
                </div>
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {assetItems.length > 0 || folderCards.length === 0 || scope === "deleted" ? (
      <section className="space-y-2">
        <button
          type="button"
          onClick={() => setAssetsExpanded((current) => !current)}
          className="flex w-full items-center gap-2 rounded-lg border border-[hsl(var(--border))]/60 bg-[hsl(var(--background))]/60 px-3 py-2 text-left text-xs font-medium text-muted-foreground transition hover:bg-[hsl(var(--background))] hover:text-foreground"
        >
          <Square className="h-3.5 w-3.5" />
          <ChevronDown className={`h-3.5 w-3.5 transition ${assetsExpanded ? "" : "-rotate-90"}`} />
          <span className="text-foreground">{assetItems.length} Assets</span>
        </button>

        {assetsExpanded ? (
          <div className={`grid gap-3 ${viewMode === "list" ? "grid-cols-1" : "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"}`}>
            {assetItems.map((item) => {
              const activeVersion = getActiveVersion(item);
              if (!activeVersion) return null;
              const selected = selectedIds.includes(item.id);
              const mediaUpload = activeUploadByMedia.get(item.id) ?? null;
              const derivedVersionStatus: ActiveUploadStatus | MediaStatusValue =
                !mediaUpload && activeVersion.status === "UPLOADING" ? "PROCESSING" : activeVersion.status;
              const thumbnailStatus: ActiveUploadStatus | MediaStatusValue | null = mediaUpload
                ? mediaUpload.status
                : derivedVersionStatus === "PROCESSING" || derivedVersionStatus === "FAILED"
                  ? derivedVersionStatus
                  : null;
              const thumbnailProgress = mediaUpload
                ? mediaUpload.progress
                : derivedVersionStatus === "PROCESSING"
                  ? 100
                  : 0;
              const shouldShowUploadCircle = thumbnailStatus !== null;
              const assignedPreviewMembers = item.assignedMembers.slice(0, 3);
              const extraAssignedCount = Math.max(0, item.assignedMembers.length - assignedPreviewMembers.length);
              const memberPickerOpen = showPackageActions && memberPickerForMediaId === item.id;
              const memberPickerSide = memberPickerSideByMediaId[item.id] ?? "right";
              const assigneeBusy = membersUpdatingMediaId === item.id;
              const compactPeopleButton = item.assignedMembers.length >= 3;
              const tilePeopleSummary = formatMemberNameSummary(item.assignedMembers);
              const tileDateLabel = formatTileDateLabel(activeVersion.createdAt);
              const showPeopleControls = showPackageActions && scope === "active";
              const canSyncTurnedInForTile =
                canSyncTurnedInDates && showPackageActions && scope === "active" && activeVersion.sourceType === "VIDEO";

              const versionOptions: DropdownOption<string>[] = item.versions.map((version) => ({
                value: version.id,
                label: `v${version.versionNumber}`,
                hint: getReadableStatus(version.status)
              }));
              const approvalOptions: DropdownOption<ApprovalStatusValue>[] = [
                { value: "IN_REVIEW", label: formatApprovalLabel("IN_REVIEW") },
                { value: "NEEDS_CHANGES", label: formatApprovalLabel("NEEDS_CHANGES") },
                { value: "APPROVED", label: formatApprovalLabel("APPROVED") },
                {
                  value: "AIRED",
                  label:
                    activeVersion.approvalStatus === "AIRED" && activeVersion.airedAt
                      ? `${formatApprovalLabel("AIRED")} · ${formatAiredDateLabel(activeVersion.airedAt)}`
                      : formatApprovalLabel("AIRED")
                }
              ];
              return (
                <article
                  key={item.id}
                  draggable={scope === "active"}
                  onDragStart={(event) => onMediaDragStart(event, item.id)}
                  onDragEnd={onMediaDragEnd}
                  onMouseEnter={() => prefetchHref(item.reviewHref)}
                  onFocus={() => prefetchHref(item.reviewHref)}
                  onClick={(event) => {
                    const target = event.target;
                    if (!(target instanceof HTMLElement)) {
                      return;
                    }

                    if (
                      target.closest(
                        "a,button,input,select,textarea,[role='button'],[contenteditable='true'],[data-prevent-review-open='true']"
                      )
                    ) {
                      return;
                    }

                    openReviewHref(item.reviewHref);
                  }}
                  className={`group relative overflow-visible rounded-2xl border bg-card transition hover:z-50 hover:border-[var(--brand-green)]/40 focus-within:z-50 ${
                    memberPickerOpen ? "z-[120]" : "z-0"
                  } ${
                    draggingMediaId === item.id ? "scale-[0.985] border-[var(--brand-green)]/50 opacity-65" :
                    selected ? "border-[var(--brand-green)] shadow-[0_0_0_3px_rgb(43,179,110,0.15)]" : "border-border"
                  }`}
                >
                  <div className="relative rounded-t-2xl">
                    <button
                      onClick={() => toggleSelect(item.id)}
                      className={cn(
                        "absolute left-2 top-2 z-20 grid h-6 w-6 place-items-center rounded border border-white/15 bg-black/70 text-white backdrop-blur transition hover:bg-black",
                        selected ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus:opacity-100"
                      )}
                      title="Select video"
                    >
                      {selected ? <CheckSquare className="h-3.5 w-3.5 text-[#2BB36E]" /> : <Square className="h-3.5 w-3.5" />}
                    </button>

                    <div className="absolute right-2 top-2 z-20">
                      <VideoCardMenu
                        reviewHref={item.reviewHref}
                        versionValue={activeVersion.id}
                        versionOptions={versionOptions}
                        onVersionChange={(value) =>
                          setSelectedVersionByMedia((current) => ({
                            ...current,
                            [item.id]: value
                          }))
                        }
                        statusValue={activeVersion.approvalStatus}
                        statusOptions={approvalOptions}
                        onStatusChange={(value) =>
                          requestStatusChange(
                            item.id,
                            activeVersion.id,
                            value as ApprovalStatusValue,
                            activeVersion.airedAt
                          )
                        }
                        statusDisabled={scope !== "active" || !canManageVersionMeta || statusUpdating === item.id}
                        onUploadNewVersion={scope === "active" && canUpload ? () => triggerVersionUploadForMedia(item.id) : undefined}
                        onMoveIntoVersion={scope === "active" && canManageProjectMedia ? () => requestMoveIntoVersion(item.id) : undefined}
                        onDownloadOriginal={
                          activeVersion.sourceType === "VIDEO"
                            ? () => requestOriginalDownload(item.id, activeVersion.id, item.title, activeVersion.versionNumber)
                            : undefined
                        }
                        onRename={
                          scope === "active" && canManageVersionMeta && activeVersion.sourceType === "VIDEO"
                            ? () => requestRename(item.id)
                            : undefined
                        }
                        onSyncTurnedInDate={canSyncTurnedInForTile ? () => void syncTurnedInDateForMedia(item.id) : undefined}
                        syncTurnedInDisabled={syncingTurnedInMediaId === item.id}
                        onDelete={scope === "active" ? () => requestSoftDelete([item.id]) : undefined}
                      />
                    </div>

                    <a
                      href={item.reviewHref}
                      draggable={false}
                      className="relative block overflow-hidden rounded-t-2xl"
                      onClick={(event) => {
                        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
                          return;
                        }

                        event.preventDefault();
                        openReviewHref(item.reviewHref);
                      }}
                    >
                      {shouldShowUploadCircle && thumbnailStatus ? (
                        <UploadCircleThumb
                          status={thumbnailStatus}
                          progress={thumbnailProgress}
                          etaSeconds={mediaUpload?.etaSeconds ?? null}
                        />
                      ) : activeVersion.thumbnailUrl ? (
                        <Image
                          src={activeVersion.thumbnailUrl}
                          alt={`${item.title} thumbnail`}
                          width={640}
                          height={360}
                          draggable={false}
                          className="aspect-video w-full bg-black object-cover"
                          sizes="(min-width: 1536px) 20vw, (min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
                          unoptimized={shouldBypassNextImageOptimization(activeVersion.thumbnailUrl)}
                        />
                      ) : (
                        <div className="grid aspect-video w-full place-items-center bg-muted text-muted-foreground">No preview</div>
                      )}

                      {/* Thumbnail overlays — status pill bottom-left so it doesn't fight the checkbox */}
                      {activeVersion.approvalStatus === "IN_REVIEW" ? (
                        <span className="absolute bottom-2 left-2 z-10 inline-flex items-center gap-1 rounded-full bg-black/75 px-2 py-0.5 font-display text-[9px] font-bold uppercase tracking-[0.18em] text-white">
                          <span className="h-1.5 w-1.5 rounded-full bg-[#F2A516]" />
                          In Review
                        </span>
                      ) : activeVersion.approvalStatus === "APPROVED" ? (
                        <span className="absolute bottom-2 left-2 z-10 inline-flex items-center gap-1 rounded-full bg-black/75 px-2 py-0.5 font-display text-[9px] font-bold uppercase tracking-[0.18em] text-white">
                          <span className="h-1.5 w-1.5 rounded-full bg-[#2BB36E]" />
                          Approved
                        </span>
                      ) : activeVersion.approvalStatus === "NEEDS_CHANGES" ? (
                        <span className="absolute bottom-2 left-2 z-10 inline-flex items-center gap-1 rounded-full bg-black/75 px-2 py-0.5 font-display text-[9px] font-bold uppercase tracking-[0.18em] text-white">
                          <span className="h-1.5 w-1.5 rounded-full bg-[#EE3A2A]" />
                          Needs Changes
                        </span>
                      ) : activeVersion.approvalStatus === "AIRED" ? (
                        <span className="absolute bottom-2 left-2 z-10 inline-flex items-center gap-1 rounded-full bg-black/75 px-2 py-0.5 font-display text-[9px] font-bold uppercase tracking-[0.18em] text-white">
                          <span className="h-1.5 w-1.5 rounded-full bg-[oklch(78.5%_0.115_274.713)]" />
                          Aired
                        </span>
                      ) : null}
                      <span className="absolute right-2 top-2 z-10 rounded bg-[var(--brand-green)] px-1.5 py-0.5 font-mono-broadcast text-[10px] font-bold text-[var(--ink)]">
                        v{activeVersion.versionNumber}
                      </span>
                      {activeVersion.durationSeconds !== null ? (
                        <span className="absolute bottom-2 right-2 z-10 rounded bg-black/75 px-1.5 py-0.5 font-mono-broadcast text-[10px] font-semibold text-white">
                          {formatDuration(activeVersion.durationSeconds)}
                        </span>
                      ) : null}
                    </a>
                  </div>

                  <div className="px-3.5 pb-3.5 pt-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 truncate text-[13px] font-semibold text-foreground">{item.title}</p>
                      {activeVersion.commentCount > 0 ? (
                        <span
                          className="inline-flex shrink-0 items-center gap-1 font-mono-broadcast text-[10px] text-muted-foreground"
                          title={`${activeVersion.commentCount} comments`}
                        >
                          <MessageSquare className="h-3 w-3" />
                          {activeVersion.commentCount}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 truncate font-mono-broadcast text-[11px] text-muted-foreground">
                      {scope === "deleted"
                        ? `${item.deletedByName ?? "Someone"} · Deleted ${formatDeletedAt(item.deletedAt)}`
                        : showPeopleControls && tilePeopleSummary
                          ? `${tileDateLabel} · ${tilePeopleSummary}`
                          : tileDateLabel}
                    </p>

                    {scope === "deleted" ? (
                      <div className="mt-2 flex items-center gap-2">
                        <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => void restoreMediaByIds([item.id])}>
                          <RotateCcw className="h-3 w-3" />
                          Restore
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 gap-1 text-xs text-destructive hover:bg-destructive/10"
                          onClick={() => requestPermanentDelete([item.id])}
                        >
                          <Trash2 className="h-3 w-3" />
                          Delete
                        </Button>
                      </div>
                    ) : showPeopleControls ? (
                      <div className="relative mt-2 flex items-center gap-1.5">
                        {item.assignedMembers.slice(0, 3).map((member, mIdx) => {
                          const palette = ["av-green", "av-red", "av-blue", "av-purple", "av-gray"] as const;
                          return (
                            <span
                              key={`${item.id}-chip-${member.userId}`}
                              title={getMemberDisplayName(member)}
                              className={cn(
                                "grid h-5 w-5 place-items-center rounded-full text-[9px] font-bold",
                                palette[mIdx % palette.length]
                              )}
                            >
                              {getMemberInitials(member)}
                            </span>
                          );
                        })}
                        {item.assignedMembers.length > 3 ? (
                          <span className="font-mono-broadcast text-[10px] text-muted-foreground">
                            +{item.assignedMembers.length - 3}
                          </span>
                        ) : null}
                        <button
                          type="button"
                          data-prevent-review-open="true"
                          onClick={(event) => {
                            event.stopPropagation();
                            setMemberPickerForMediaId((current) => (current === item.id ? null : item.id));
                          }}
                          className="inline-flex h-5 items-center gap-0.5 rounded-full border border-dashed border-border px-1.5 text-[10px] font-semibold text-muted-foreground transition hover:border-[var(--brand-green)] hover:text-[var(--brand-green)]"
                          title="Edit people"
                        >
                          <Users className="h-2.5 w-2.5" />
                          {item.assignedMembers.length === 0 ? "Add people" : "Edit"}
                        </button>
                        {memberPickerOpen ? (
                          <div
                            className="absolute bottom-7 left-0 z-[140] w-64 rounded-xl border border-border bg-popover p-2 shadow-2xl"
                            data-prevent-review-open="true"
                          >
                            <p className="mb-2 px-1 font-display text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                              People on this video
                            </p>
                            <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
                              {item.assignedMembers.length === 0 ? (
                                <p className="rounded-md border border-border bg-[var(--ink)] px-2 py-1.5 text-[11px] text-muted-foreground">
                                  No one assigned yet.
                                </p>
                              ) : (
                                item.assignedMembers.map((member) => (
                                  <div
                                    key={`${item.id}-people-${member.userId}`}
                                    className="flex items-center justify-between gap-2 rounded-md border border-border bg-[var(--ink)] px-2 py-1.5"
                                  >
                                    <div className="min-w-0">
                                      <p className="truncate text-[11px] text-foreground">{getMemberDisplayName(member)}</p>
                                      <p className="truncate font-mono-broadcast text-[9px] text-muted-foreground">
                                        {member.email ?? "Workspace member"}
                                      </p>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => toggleAssignedMember(item.id, member.userId)}
                                      disabled={assigneeBusy}
                                      className="grid h-5 w-5 place-items-center rounded-md text-muted-foreground transition hover:bg-[rgb(238,58,42,0.15)] hover:text-[var(--brand-red)]"
                                      aria-label="Remove"
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  </div>
                                ))
                              )}
                            </div>
                            <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
                              <button
                                type="button"
                                onClick={() => {
                                  void ensureWorkspaceMembersLoaded();
                                  setMemberAddModalForMediaId(item.id);
                                  setMemberPickerForMediaId(null);
                                }}
                                disabled={assigneeBusy}
                                className="inline-flex items-center gap-1 rounded-md border border-[rgb(43,179,110,0.3)] bg-[rgb(43,179,110,0.10)] px-2 py-1 text-[11px] font-semibold text-[var(--brand-green)] hover:bg-[rgb(43,179,110,0.18)]"
                              >
                                <UserPlus className="h-3 w-3" />
                                Add people
                              </button>
                              <button
                                type="button"
                                onClick={() => setMemberPickerForMediaId(null)}
                                className="text-[11px] text-muted-foreground hover:text-foreground"
                              >
                                Done
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </article>
              );
            })}

            {scope === "active" && canUpload ? (
              <button
                type="button"
                onClick={triggerNewUpload}
                className="flex min-h-[260px] items-center justify-center rounded-2xl border border-dashed border-border bg-card p-4 hover:bg-accent"
              >
                <div className="text-center">
                  <div className="mx-auto mb-2 grid h-11 w-11 place-items-center rounded-xl border border-border bg-secondary text-foreground">
                    <Plus className="h-5 w-5" />
                  </div>
                  <p className="text-sm font-semibold text-foreground">Upload New Video</p>
                  <p className="text-xs text-muted-foreground">Create a new asset in this project.</p>
                </div>
              </button>
            ) : null}
          </div>
        ) : null}
      </section>
      ) : null}

      {pagination.totalPages > 1 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted px-3 py-2">
          <p className="text-sm text-muted-foreground">
            Page {pagination.page} of {pagination.totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={pagination.page <= 1}
              onClick={() => updateQuery({ page: pagination.page - 1, preservePage: true })}
            >
              Previous
            </Button>
            <Button
              size="sm"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => updateQuery({ page: pagination.page + 1, preservePage: true })}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}

      <Dialog
        open={showPackageActions && Boolean(memberAddModalForMediaId)}
        onOpenChange={(isOpen) => {
          if (!isOpen && membersUpdatingMediaId === memberAddModalForMediaId) return;
          if (!isOpen) setMemberAddModalForMediaId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add People</DialogTitle>
            <DialogDescription>
              {memberAddModalItem ? `Add people to ${memberAddModalItem.title}.` : "Add people to this video."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {memberAddModalItem === null ? (
              <p className="rounded-lg border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">Video not found.</p>
            ) : workspaceMembersLoading && !workspaceMembersLoaded ? (
              <p className="rounded-lg border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">Loading people…</p>
            ) : workspaceMembers.length === 0 ? (
              <p className="rounded-lg border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
                No workspace members found.
              </p>
            ) : memberAddModalAvailableMembers.length === 0 ? (
              <p className="rounded-lg border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
                Everyone in this workspace is already assigned.
              </p>
            ) : (
              <div className="space-y-2">
                <input
                  type="search"
                  value={memberAddModalSearch}
                  onChange={(event) => setMemberAddModalSearch(event.target.value)}
                  placeholder="Search by name or email"
                  className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground"
                />
                {memberAddModalFilteredMembers.length === 0 ? (
                  <p className="rounded-lg border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
                    No members match your search.
                  </p>
                ) : (
                  <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
                    {memberAddModalFilteredMembers.map((member) => (
                      <div
                        key={`member-modal-${member.userId}`}
                        className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm text-foreground">{getMemberDisplayName(member)}</p>
                          <p className="truncate text-xs text-muted-foreground">{member.email ?? "Workspace member"}</p>
                        </div>
                        <Button
                          size="sm"
                          className="h-8 gap-1"
                          disabled={membersUpdatingMediaId === memberAddModalForMediaId || !memberAddModalItem}
                          onClick={() => {
                            if (!memberAddModalItem) {
                              return;
                            }
                            toggleAssignedMember(memberAddModalItem.id, member.userId);
                          }}
                        >
                          <UserPlus className="h-3.5 w-3.5" />
                          Add
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setMemberAddModalForMediaId(null)}
              disabled={membersUpdatingMediaId === memberAddModalForMediaId}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Share Links</DialogTitle>
            <DialogDescription>Create links for reviewers and keep full control with expiry and passcodes.</DialogDescription>
          </DialogHeader>
        <div className="grid gap-3 rounded-xl border border-border bg-muted p-3 md:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
          <select
            value={sharePermission}
            onChange={(event) => setSharePermission(event.target.value as GuestPermissionValue)}
            className="h-10 min-w-0 rounded-lg border border-border bg-background px-3 text-sm text-foreground"
          >
            <option value="COMMENT">View + Comment</option>
            <option value="VIEW">View only</option>
          </select>
          <input
            type="datetime-local"
            value={shareExpiry}
            onChange={(event) => setShareExpiry(event.target.value)}
            className="h-10 min-w-0 rounded-lg border border-border bg-background px-3 text-sm text-foreground"
          />
          <input
            type="password"
            value={sharePasscode}
            onChange={(event) => setSharePasscode(event.target.value)}
            placeholder="Optional passcode"
            className="h-10 min-w-0 rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground md:col-span-2 lg:col-span-1"
          />
          <Button className="h-10 w-full gap-1 lg:w-auto" onClick={() => void createShareLink()}>
            <Send className="h-3.5 w-3.5" />
            Create
          </Button>
        </div>

        <div className="mt-3 max-h-[44vh] space-y-2 overflow-y-auto pr-1">
          {shareLoading ? (
            <p className="text-xs text-muted-foreground">Loading links...</p>
          ) : shareLinks.length === 0 ? (
            <p className="text-xs text-muted-foreground">No share links yet.</p>
          ) : (
            shareLinks.map((link) => (
              <div key={link.id} className="rounded-lg border border-border bg-muted p-2.5">
                <p className="text-sm text-foreground">{link.permission === "COMMENT" ? "Can comment" : "View only"}</p>
                <p className="text-xs text-muted-foreground">
                  {link.revokedAt ? "Revoked" : link.expiresAt ? `Expires ${new Date(link.expiresAt).toLocaleString()}` : "No expiry"}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <Button size="sm" variant="secondary" className="h-7 gap-1" onClick={() => void copyShareLink(link.token)}>
                    <Copy className="h-3 w-3" />
                    Copy
                  </Button>
                  {!link.revokedAt ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-destructive hover:bg-destructive/10"
                      onClick={() => void revokeShareLink(link.id)}
                    >
                      Revoke
                    </Button>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>

        {shareMessage ? <p className="mt-3 text-xs text-muted-foreground">{shareMessage}</p> : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(renameAction)}
        onOpenChange={(isOpen) => {
          if (!isOpen && renameBusy) return;
          if (!isOpen) {
            setRenameAction(null);
            setRenameTitleInput("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Video</DialogTitle>
            <DialogDescription>Update this video title.</DialogDescription>
          </DialogHeader>
          <input
            value={renameTitleInput}
            onChange={(event) => setRenameTitleInput(event.target.value)}
            placeholder="Video title"
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setRenameAction(null);
                setRenameTitleInput("");
              }}
              disabled={renameBusy}
            >
              Cancel
            </Button>
            <Button onClick={() => void confirmRename()} disabled={renameBusy || !renameTitleInput.trim()}>
              {renameBusy ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(moveToVersionAction)}
        onOpenChange={(isOpen) => {
          if (!isOpen && moveToVersionBusy) return;
          if (!isOpen) {
            setMoveToVersionAction(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move Into Version</DialogTitle>
            <DialogDescription>
              Move the selected upload into the correct package as its newest version.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="rounded-lg border border-border bg-muted p-3">
              <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Moving</p>
              <p className="mt-1 truncate text-sm font-semibold text-foreground">
                {moveToVersionSourceItem?.title ?? "Selected package"}
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Correct package</label>
              <Select
                value={moveToVersionAction?.targetMediaId ?? ""}
                onValueChange={(targetMediaId) =>
                  setMoveToVersionAction((current) => (current ? { ...current, targetMediaId } : current))
                }
                disabled={moveToVersionBusy || moveToVersionTargetCandidates.length === 0}
              >
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Choose a package" />
                </SelectTrigger>
                <SelectContent>
                  {moveToVersionTargetCandidates.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {moveToVersionTargetItem ? (
              <p className="text-xs text-muted-foreground">
                This will add {moveToVersionSourceItem?.versions.length ?? 0} version
                {(moveToVersionSourceItem?.versions.length ?? 0) === 1 ? "" : "s"} to {moveToVersionTargetItem.title} and merge any people assigned to the duplicate.
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setMoveToVersionAction(null)} disabled={moveToVersionBusy}>
              Cancel
            </Button>
            <Button
              onClick={() => void confirmMoveIntoVersion()}
              disabled={moveToVersionBusy || !moveToVersionAction?.targetMediaId || moveToVersionTargetCandidates.length === 0}
            >
              {moveToVersionBusy ? "Moving..." : "Move Into Version"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={folderModalOpen}
        onOpenChange={(isOpen) => {
          if (!isOpen && folderCreating) return;
          setFolderModalOpen(isOpen);
          if (!isOpen) setFolderNameInput("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Folder</DialogTitle>
            <DialogDescription>Organize your assets with a dedicated folder.</DialogDescription>
          </DialogHeader>
          <input
            value={folderNameInput}
            onChange={(event) => setFolderNameInput(event.target.value)}
            placeholder="Folder name"
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setFolderModalOpen(false);
                setFolderNameInput("");
              }}
              disabled={folderCreating}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                void (async () => {
                  const created = await createFolder(folderNameInput);
                  if (!created) {
                    return;
                  }
                  setFolderModalOpen(false);
                  setFolderNameInput("");
                })();
              }}
              disabled={folderCreating || !folderNameInput.trim()}
            >
              {folderCreating ? "Creating..." : "Create Folder"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(confirmAction)}
        onOpenChange={(isOpen) => {
          if (!isOpen && isDeleting && confirmAction?.type !== "permission-denied") return;
          if (!isOpen) setConfirmAction(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmAction?.type === "permission-denied"
                ? "Delete Not Allowed"
                : confirmAction?.type === "permanent-delete"
                  ? "Delete Permanently"
                  : "Move To Recently Deleted"}
            </DialogTitle>
            <DialogDescription>
              {confirmAction?.type === "permission-denied"
                ? `You don't have permission to delete ${confirmAction?.label ?? "these videos"}.`
                : confirmAction?.type === "permanent-delete"
                  ? `Permanently delete ${confirmAction?.label ?? "these videos"}? This action cannot be undone.`
                  : `Move ${confirmAction?.label ?? "these videos"} to Recently Deleted?`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setConfirmAction(null)}
              disabled={isDeleting && confirmAction?.type !== "permission-denied"}
            >
              Cancel
            </Button>
            <Button
              variant={confirmAction?.type === "permanent-delete" ? "destructive" : "default"}
              onClick={() => {
                if (!confirmAction) {
                  return;
                }

                void (async () => {
                  if (confirmAction.type === "permission-denied") {
                    setConfirmAction(null);
                    return;
                  }

                  let success = false;
                  if (confirmAction.type === "permanent-delete") {
                    success = await permanentlyDeleteMediaByIds(confirmAction.mediaIds);
                  } else {
                    success = await softDeleteMediaByIds(confirmAction.mediaIds);
                  }

                  if (success) {
                    setConfirmAction(null);
                  }
                })();
              }}
              disabled={isDeleting && confirmAction?.type !== "permission-denied"}
            >
              {confirmAction?.type === "permission-denied"
                ? "OK"
                : confirmAction?.type === "permanent-delete"
                  ? "Delete Permanently"
                  : "Move To Deleted"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(downloadConfirmAction)}
        onOpenChange={(isOpen) => {
          if (!isOpen && downloadConfirmBusy) return;
          if (!isOpen) setDownloadConfirmAction(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Download Original Video</DialogTitle>
            <DialogDescription>
              {downloadConfirmAction
                ? `Download ${downloadConfirmAction.title} (v${downloadConfirmAction.versionNumber}) now?`
                : "Download this video now?"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDownloadConfirmAction(null)} disabled={downloadConfirmBusy}>
              Cancel
            </Button>
            <Button onClick={() => void confirmOriginalDownload()} disabled={downloadConfirmBusy}>
              {downloadConfirmBusy ? "Starting..." : "Download"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {dragPreview && typeof document !== "undefined"
        ? createPortal(
            <div className="pointer-events-none fixed inset-0 z-[220]">
              <div
                ref={dragOverlayRef}
                className="w-[min(320px,calc(100vw-1.5rem))] rounded-2xl border border-border bg-card/95 p-2 shadow-2xl backdrop-blur-xl"
                style={{ transform: "translate3d(-9999px, -9999px, 0)" }}
              >
                <div className="flex items-center gap-2.5">
                  <div className="relative h-12 w-20 overflow-hidden rounded-lg border border-border bg-muted">
                    {dragPreview.thumbnailUrl ? (
                      <Image
                        src={dragPreview.thumbnailUrl}
                        alt=""
                        fill
                        className="object-cover"
                        unoptimized={shouldBypassNextImageOptimization(dragPreview.thumbnailUrl)}
                      />
                    ) : (
                      <div className="grid h-full w-full place-items-center text-xs text-muted-foreground">
                        <Folder className="h-4 w-4" />
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs uppercase tracking-[0.12em] text-muted-foreground">Move Asset</p>
                    <p className="truncate text-sm font-semibold text-foreground">{dragPreview.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {dragPreview.itemCount > 1 ? `${dragPreview.itemCount} selected items` : "1 item"}
                      {dragTargetFolder ? ` -> ${dragTargetFolder.name}` : " -> Drop on a folder"}
                    </p>
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}

      <UploadProgressToast items={toastItems} />

      <Dialog open={airedDialog !== null} onOpenChange={(open) => (open ? null : setAiredDialog(null))}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Mark as Aired</DialogTitle>
            <DialogDescription>Pick the date this video aired.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label htmlFor="tile-aired-date" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Air date
            </label>
            <input
              id="tile-aired-date"
              type="date"
              value={airedDialog?.date ?? ""}
              onChange={(event) =>
                setAiredDialog((current) => (current ? { ...current, date: event.target.value } : current))
              }
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAiredDialog(null)} disabled={statusUpdating !== null}>
              Cancel
            </Button>
            <Button
              onClick={() => void submitAiredDialog()}
              disabled={!airedDialog?.date || statusUpdating !== null}
            >
              Mark as Aired
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
