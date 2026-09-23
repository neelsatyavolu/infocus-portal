"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  GraduationCap,
  ListFilter,
  Loader2,
  MessageCircleReply,
  MapPin,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  RefreshCw,
  Search,
  Trash2,
  Send,
  Save,
  Volume2,
  VolumeX
} from "lucide-react";
import { ApproveFeedbackDialog } from "@/components/package-cycle/approve-feedback-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { DropdownOption } from "@/components/video-card-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MAX_EFFORT_POINTS, MAX_TEAMWORK_POINTS } from "@/src/lib/package-grades";
import {
  DEFAULT_REVIEW_FPS,
  formatFrameAccurateTimecode,
  formatTimecode,
  frameNumberFromSeconds,
  timeSecondsFromFrameNumber
} from "@/src/lib/timecode";
import {
  APPROVE_ANYWAY_CONFIRM,
  approvalProgressLabel,
  approvalStageHandoff,
  approvalStagePillLabel,
  executiveWaitPill
} from "@/src/lib/package-approval";
import { approvalStageToReviewStage, cutTileReviewStatus } from "@/src/lib/group-tile-status";
import { ApprovalStatusValue, MediaReviewDto } from "@/src/lib/types";
import { cn } from "@/src/lib/utils";

type ReviewShellProps = {
  data: MediaReviewDto;
  guestToken?: string;
  isGuest?: boolean;
  allowComment?: boolean;
};

type CommentThread = {
  root: MediaReviewDto["comments"][number];
  replies: MediaReviewDto["comments"];
};

type QualityValue = "AUTO" | "1080" | "720" | "480";

type HlsInstance = {
  destroy: () => void;
  loadSource: (src: string) => void;
  once: (event: string, cb: () => void) => void;
  currentLevel: number;
  levels: { height: number }[];
};

type QuickGradeApiRow = {
  userId: string;
  name: string | null;
  email: string | null;
  effortPoints: number | null;
  teamworkPoints: number | null;
  feedback: string;
  turnedInDate: string | null;
  freeExtensionDays: number;
  extensionDetails: {
    calculatedDays: number;
    freeDays: number;
    chargedDays: number;
    exempt: boolean;
  };
  published: boolean;
  publishedAt: string | null;
  totalPoints: number | null;
  percentage: number | null;
  extensionsRemaining: number;
};

type QuickGradeRow = QuickGradeApiRow & {
  disabled: boolean;
  disabledReason: string | null;
};

type QuickGradesApiPayload = {
  activeCycleNumber: number;
  rows: QuickGradeApiRow[];
};

function withQualityParam(playbackUrl: string, quality: QualityValue) {
  if (quality === "AUTO") {
    return playbackUrl;
  }

  const separator = playbackUrl.includes("?") ? "&" : "?";
  return `${playbackUrl}${separator}quality=${quality}`;
}

function useHlsPlayer(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  playbackUrl: string | null | undefined,
  quality: QualityValue
) {
  const hlsRef = useRef<HlsInstance | null>(null);
  const nativeFallbackRef = useRef(false);
  const playbackUrlRef = useRef(playbackUrl);
  playbackUrlRef.current = playbackUrl;
  const qualityRef = useRef(quality);
  qualityRef.current = quality;

  const attachHls = useCallback(async (video: HTMLVideoElement, url: string) => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      nativeFallbackRef.current = true;
      video.src = withQualityParam(url, qualityRef.current);
      return;
    }

    nativeFallbackRef.current = false;

    try {
      const { default: Hls } = await import("hls.js");

      if (playbackUrlRef.current !== url) {
        return;
      }

      if (!Hls.isSupported()) {
        video.src = withQualityParam(url, qualityRef.current);
        nativeFallbackRef.current = true;
        return;
      }

      const hls = new Hls({
        startLevel: -1,
        capLevelToPlayerSize: true,
        abrEwmaDefaultEstimate: 2_000_000,
        maxBufferLength: 60,
        backBufferLength: 90,
        enableWorker: true,
        startFragPrefetch: true,
        fragLoadingMaxRetry: 6,
        manifestLoadingMaxRetry: 4,
        levelLoadingMaxRetry: 4,
        nudgeMaxRetry: 10,
      });
      hls.loadSource(url);
      hls.attachMedia(video);

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) {
          return;
        }
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          hls.startLoad();
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          hls.recoverMediaError();
        } else {
          hls.destroy();
          if (hlsRef.current === (hls as unknown as HlsInstance)) {
            hlsRef.current = null;
          }
        }
      });

      const hlsInstance = hls as unknown as HlsInstance;
      hlsInstance.once("hlsManifestParsed", () => {
        const q = qualityRef.current;
        if (q === "AUTO") {
          return;
        }
        const targetHeight = Number(q);
        const levelIndex = hlsInstance.levels.findIndex((level) => level.height === targetHeight);
        if (levelIndex >= 0) {
          hlsInstance.currentLevel = levelIndex;
        }
      });

      hlsRef.current = hlsInstance;
    } catch {
      video.src = withQualityParam(url, qualityRef.current);
      nativeFallbackRef.current = true;
    }
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !playbackUrl) {
      return;
    }

    void attachHls(video, playbackUrl);

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [videoRef, playbackUrl, attachHls]);

  useEffect(() => {
    if (nativeFallbackRef.current) {
      const video = videoRef.current;
      const url = playbackUrlRef.current;
      if (video && url) {
        const previousTime = video.currentTime;
        const wasPlaying = !video.paused;
        video.src = withQualityParam(url, quality);
        const restore = () => {
          video.currentTime = previousTime;
          if (wasPlaying) {
            void video.play();
          }
        };
        video.addEventListener("loadedmetadata", restore, { once: true });
      }
      return;
    }

    const hls = hlsRef.current;
    if (!hls) {
      return;
    }

    if (quality === "AUTO") {
      hls.currentLevel = -1;
      return;
    }

    const targetHeight = Number(quality);
    const levelIndex = hls.levels.findIndex((level) => level.height === targetHeight);
    if (levelIndex >= 0) {
      hls.currentLevel = levelIndex;
    }
  }, [quality, videoRef]);
}

function initialsFromName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "?";
  }

  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

const AVATAR_PALETTE = ["av-green", "av-red", "av-blue", "av-purple", "av-gray"] as const;

function avatarToneForName(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

function ageLabelFromDate(isoDate: string, nowMs: number) {
  if (nowMs === 0) {
    return "";
  }
  const createdMs = new Date(isoDate).getTime();
  const diffMs = Math.max(0, nowMs - createdMs);
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));

  if (diffDays >= 1) {
    return `${diffDays}d`;
  }

  const diffHours = Math.floor(diffMs / (60 * 60 * 1000));
  if (diffHours >= 1) {
    return `${diffHours}h`;
  }

  const diffMinutes = Math.floor(diffMs / (60 * 1000));
  return `${Math.max(1, diffMinutes)}m`;
}

function clampToDuration(timeSeconds: number, durationSeconds: number) {
  if (!Number.isFinite(timeSeconds)) {
    return 0;
  }

  if (durationSeconds <= 0) {
    return Math.max(0, timeSeconds);
  }

  return Math.min(Math.max(0, timeSeconds), durationSeconds);
}

function formatPinLabel(xPct: number | null, yPct: number | null) {
  if (xPct === null || yPct === null || !Number.isFinite(xPct) || !Number.isFinite(yPct)) {
    return "Image comment";
  }

  return `Point ${Math.round(xPct)}%, ${Math.round(yPct)}%`;
}

function commentSeekTimeSeconds(comment: MediaReviewDto["comments"][number]) {
  if (comment.frameNumber !== null && comment.frameNumber !== undefined) {
    return timeSecondsFromFrameNumber(comment.frameNumber, DEFAULT_REVIEW_FPS);
  }

  return comment.timeSeconds;
}

function collectCommentThreadIds(comments: MediaReviewDto["comments"], rootId: string) {
  const ids = new Set<string>([rootId]);
  let added = true;

  while (added) {
    added = false;
    for (const comment of comments) {
      if (comment.parentCommentId !== null && ids.has(comment.parentCommentId) && !ids.has(comment.id)) {
        ids.add(comment.id);
        added = true;
      }
    }
  }

  return ids;
}

function parseCycleFromProjectName(projectName: string) {
  const match = projectName.match(/package\s+cycle\s+(\d+)/i);
  if (!match) {
    return null;
  }

  const parsed = Number(match[1]);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 4) {
    return null;
  }

  return parsed;
}

function canShowQuickGradesForFolder(folderName: string | null) {
  if (folderName === null) {
    return true;
  }

  return folderName.trim().toLowerCase() === "final cut";
}

function normalizeQuickGradePoints(input: string, maxValue: number) {
  if (!input.trim()) {
    return null;
  }

  const parsed = Number(input);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.max(0, Math.min(maxValue, Math.round(parsed)));
}

function quickGradePersonLabel(row: Pick<QuickGradeRow, "name" | "email">) {
  return row.name?.trim() || row.email || "Unnamed user";
}

function quickGradeRowsEqual(current: QuickGradeRow, baseline?: QuickGradeRow) {
  if (!baseline) {
    return false;
  }

  return (
    (current.effortPoints ?? null) === (baseline.effortPoints ?? null) &&
    (current.teamworkPoints ?? null) === (baseline.teamworkPoints ?? null) &&
    current.feedback === baseline.feedback &&
    (current.turnedInDate ?? null) === (baseline.turnedInDate ?? null) &&
    current.freeExtensionDays === baseline.freeExtensionDays
  );
}

function commonQuickGradeTurnedInDate(rows: QuickGradeRow[]) {
  const gradableRows = rows.filter((row) => !row.disabled);
  if (gradableRows.length === 0) {
    return "";
  }

  const firstValue = gradableRows[0].turnedInDate ?? "";
  return gradableRows.every((row) => (row.turnedInDate ?? "") === firstValue) ? firstValue : "";
}

function formatQuickGradeRevisionDeadline(isoDate: string) {
  const publishedAt = new Date(isoDate);
  if (Number.isNaN(publishedAt.getTime())) {
    return null;
  }

  const deadline = new Date(publishedAt);
  deadline.setDate(deadline.getDate() + 14);
  return deadline.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

export function ReviewShell({ data, guestToken, isGuest = false, allowComment = true }: ReviewShellProps) {
  const reviewSplitterWidthPx = 14;
  const minSidebarWidthPx = 320;
  const maxSidebarWidthPx = 560;
  const minLeftPaneWidthPx = 360;
  const router = useRouter();
  const reviewLayoutRef = useRef<HTMLDivElement | null>(null);
  const reviewHeroRef = useRef<HTMLElement | null>(null);
  const reviewMainCardRef = useRef<HTMLDivElement | null>(null);
  const mediaStageRef = useRef<HTMLDivElement | null>(null);
  const mediaControlsRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const imageCanvasRef = useRef<HTMLDivElement | null>(null);
  const commentsMenuRef = useRef<HTMLDivElement | null>(null);
  const quickGradesRef = useRef<HTMLDivElement | null>(null);
  const importFileInputRef = useRef<HTMLInputElement | null>(null);
  const commentCardRefs = useRef<Record<string, HTMLElement | null>>({});
  const sidebarResizeDragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const [nowMs, setNowMs] = useState(0);
  const [versions, setVersions] = useState(data.versions);
  const [comments, setComments] = useState(data.comments);
  const [currentVersionId, setCurrentVersionId] = useState(data.currentVersionId);
  const [selectedCommentId, setSelectedCommentId] = useState<string | null>(null);
  const [composerBody, setComposerBody] = useState("");
  const [composerTimeSeconds, setComposerTimeSeconds] = useState(0);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [packageActionMessage, setPackageActionMessage] = useState<string | null>(null);
  const [approveFeedbackOpen, setApproveFeedbackOpen] = useState(false);
  const [submittingPackageReview, setSubmittingPackageReview] = useState(false);
  const packageReview = data.packageReview;
  const [airedDialogOpen, setAiredDialogOpen] = useState(false);
  const [airedDateInput, setAiredDateInput] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [savingEditCommentId, setSavingEditCommentId] = useState<string | null>(null);
  const [submittingReplyFor, setSubmittingReplyFor] = useState<string | null>(null);
  const [commentsTab, setCommentsTab] = useState<"COMMENTS" | "REVIEW">("COMMENTS");
  const [filterMode, setFilterMode] = useState<"ALL" | "OPEN" | "RESOLVED">("ALL");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [quality, setQuality] = useState<QualityValue>("AUTO");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [composerPin, setComposerPin] = useState<{ xPct: number; yPct: number } | null>(null);
  const [isMacDesktopApp, setIsMacDesktopApp] = useState(false);
  const [commentsMenuOpen, setCommentsMenuOpen] = useState(false);
  const [reviewComposerBody, setReviewComposerBody] = useState("");
  const [submittingReviewComment, setSubmittingReviewComment] = useState(false);
  const [importingComments, setImportingComments] = useState(false);
  const [pendingSidebarFocusCommentId, setPendingSidebarFocusCommentId] = useState<string | null>(null);
  const [sidebarHighlightedCommentId, setSidebarHighlightedCommentId] = useState<string | null>(null);
  const [quickGradesOpen, setQuickGradesOpen] = useState(false);
  const [quickGradesLoading, setQuickGradesLoading] = useState(false);
  const [quickGradesSaving, setQuickGradesSaving] = useState(false);
  const [quickGradesMessage, setQuickGradesMessage] = useState<string | null>(null);
  const [quickGradeRows, setQuickGradeRows] = useState<QuickGradeRow[]>([]);
  const [savedQuickGradeRows, setSavedQuickGradeRows] = useState<QuickGradeRow[]>([]);
  const [quickGradesLoadedCycle, setQuickGradesLoadedCycle] = useState<number | null>(null);
  const [quickGradesSharedTurnedInDate, setQuickGradesSharedTurnedInDate] = useState("");
  const [quickGradesSharedTurnedInDirty, setQuickGradesSharedTurnedInDirty] = useState(false);
  const [quickGradesFeedbackEditorUserId, setQuickGradesFeedbackEditorUserId] = useState<string | null>(null);
  const [isDesktopSplitLayout, setIsDesktopSplitLayout] = useState(false);
  const [autoSidebarWidthPx, setAutoSidebarWidthPx] = useState<number | null>(null);
  const [manualSidebarWidthPx, setManualSidebarWidthPx] = useState<number | null>(null);
  const [computedMediaStageMaxWidthPx, setComputedMediaStageMaxWidthPx] = useState<number | null>(null);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);

  useEffect(() => {
    setIsMacDesktopApp(/InFocusMacApp/i.test(window.navigator.userAgent));
  }, []);

  useEffect(() => {
    const syncLayoutMode = () => setIsDesktopSplitLayout(window.innerWidth >= 1280);
    syncLayoutMode();
    window.addEventListener("resize", syncLayoutMode);
    return () => window.removeEventListener("resize", syncLayoutMode);
  }, []);

  const currentVersion = useMemo(
    () => versions.find((version) => version.id === currentVersionId) ?? versions[0],
    [versions, currentVersionId]
  );
  const cutReviewStatus = cutTileReviewStatus({
    approvalStatus: currentVersion?.approvalStatus,
    reviewStage: approvalStageToReviewStage(packageReview?.stage),
    approvedInStage: currentVersion?.approvedInStage,
    remainingExecutiveSignoffs: packageReview?.remainingExecutiveSignoffs
  });

  const isImageReview = currentVersion?.sourceType === "IMAGE";
  const canImportComments = allowComment && !isImageReview && !guestToken;
  const quickGradeCycleNumber = useMemo(() => parseCycleFromProjectName(data.projectName), [data.projectName]);
  const canManageQuickGrades =
    !isGuest && !isImageReview && data.canManageQuickGrades && canShowQuickGradesForFolder(data.folderName);

  useHlsPlayer(videoRef, isImageReview ? null : currentVersion?.playbackUrl, quality);

  useEffect(() => {
    setNowMs(Date.now());
    const id = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const versionComments = useMemo(
    () => comments.filter((comment) => comment.mediaVersionId === currentVersionId),
    [currentVersionId, comments]
  );

  const allThreads = useMemo<CommentThread[]>(() => {
    const roots = versionComments.filter((comment) => comment.parentCommentId === null);

    return roots.map((root) => ({
      root,
      replies: versionComments
        .filter((candidate) => candidate.parentCommentId === root.id)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    }));
  }, [versionComments]);

  const commentThreads = useMemo<CommentThread[]>(
    () =>
      allThreads
        .filter((thread) => thread.root.targetType !== "GENERAL")
        .sort((a, b) => {
          if (isImageReview) {
            return a.root.createdAt.localeCompare(b.root.createdAt);
          }
          return a.root.timeSeconds - b.root.timeSeconds;
        }),
    [allThreads, isImageReview]
  );

  const reviewThreads = useMemo<CommentThread[]>(
    () =>
      allThreads
        .filter((thread) => thread.root.targetType === "GENERAL")
        .sort((a, b) => a.root.createdAt.localeCompare(b.root.createdAt)),
    [allThreads]
  );

  const deferredFilterMode = useDeferredValue(filterMode);

  const visibleThreads = useMemo(() => {
    if (deferredFilterMode === "ALL") {
      return commentThreads;
    }

    const shouldShowResolved = deferredFilterMode === "RESOLVED";
    return commentThreads.filter((thread) => (thread.root.resolvedAt !== null) === shouldShowResolved);
  }, [commentThreads, deferredFilterMode]);

  const visibleReviewThreads = useMemo(() => {
    if (deferredFilterMode === "ALL") {
      return reviewThreads;
    }

    const shouldShowResolved = deferredFilterMode === "RESOLVED";
    return reviewThreads.filter((thread) => (thread.root.resolvedAt !== null) === shouldShowResolved);
  }, [reviewThreads, deferredFilterMode]);

  const savedQuickGradeRowMap = useMemo(
    () => new Map(savedQuickGradeRows.map((row) => [row.userId, row])),
    [savedQuickGradeRows]
  );
  const quickGradesRevisionDeadlineLabel = useMemo(() => {
    let earliestPublishedAt: string | null = null;

    for (const row of quickGradeRows) {
      if (row.disabled || !row.published || !row.publishedAt) {
        continue;
      }

      if (earliestPublishedAt === null || row.publishedAt < earliestPublishedAt) {
        earliestPublishedAt = row.publishedAt;
      }
    }

    return earliestPublishedAt ? formatQuickGradeRevisionDeadline(earliestPublishedAt) : null;
  }, [quickGradeRows]);

  useEffect(() => {
    if (isImageReview) {
      setCurrentTime(0);
      setDuration(0);
      setComposerTimeSeconds(0);
      return;
    }

    const video = videoRef.current;

    if (!video) {
      return;
    }

    const syncState = () => {
      setCurrentTime(video.currentTime || 0);
      setDuration(video.duration || 0);
      setComposerTimeSeconds(video.currentTime || 0);
    };

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    video.addEventListener("loadedmetadata", syncState);
    video.addEventListener("timeupdate", syncState);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);

    return () => {
      video.removeEventListener("loadedmetadata", syncState);
      video.removeEventListener("timeupdate", syncState);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
    };
  }, [currentVersionId, isImageReview]);

  useEffect(() => {
    if (isImageReview) {
      return;
    }

    const video = videoRef.current;

    if (!video) {
      return;
    }

    video.playbackRate = playbackRate;
    video.volume = volume;
    if (volume === 0) {
      video.muted = true;
    } else if (video.muted) {
      video.muted = false;
    }
  }, [isImageReview, volume, playbackRate]);

  useEffect(() => {
    if (isImageReview) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" && event.key !== " ") {
        return;
      }

      if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }

      const target = event.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) {
          return;
        }
        if (target.getAttribute("role") === "textbox") {
          return;
        }
      }

      const video = videoRef.current;
      if (!video) {
        return;
      }

      event.preventDefault();
      if (video.paused) {
        void video.play();
      } else {
        video.pause();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isImageReview]);

  useEffect(() => {
    if (!commentsMenuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) {
        return;
      }

      if (commentsMenuRef.current?.contains(event.target)) {
        return;
      }

      setCommentsMenuOpen(false);
    };

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [commentsMenuOpen]);

  useEffect(() => {
    if (!quickGradesOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) {
        return;
      }

      if (quickGradesRef.current?.contains(event.target)) {
        return;
      }

      setQuickGradesOpen(false);
    };

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [quickGradesOpen]);

  useEffect(() => {
    if (!pendingSidebarFocusCommentId || commentsTab !== "COMMENTS") {
      return;
    }

    const card = commentCardRefs.current[pendingSidebarFocusCommentId];

    if (!card) {
      setPendingSidebarFocusCommentId(null);
      return;
    }

    card.scrollIntoView({ behavior: "smooth", block: "nearest" });
    setPendingSidebarFocusCommentId(null);
  }, [commentsTab, pendingSidebarFocusCommentId, visibleThreads]);

  useEffect(() => {
    if (!sidebarHighlightedCommentId) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setSidebarHighlightedCommentId((current) => (current === sidebarHighlightedCommentId ? null : current));
    }, 1400);

    return () => window.clearTimeout(timeoutId);
  }, [sidebarHighlightedCommentId]);

  useEffect(() => {
    setQuickGradesOpen(false);
  }, [currentVersionId]);

  function seekTo(timeSeconds: number) {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    const nextTime = clampToDuration(timeSeconds, video.duration || duration);
    video.currentTime = nextTime;
    setCurrentTime(nextTime);
    setComposerTimeSeconds(nextTime);
  }

  function focusCommentThread(thread: CommentThread, options?: { scrollSidebar?: boolean }) {
    setSelectedCommentId(thread.root.id);
    setSidebarHighlightedCommentId(thread.root.id);

    if (isImageReview) {
      if (thread.root.xPct !== null && thread.root.yPct !== null) {
        setComposerPin({ xPct: thread.root.xPct, yPct: thread.root.yPct });
      }
    } else {
      seekTo(commentSeekTimeSeconds(thread.root));
    }

    if (options?.scrollSidebar) {
      setCommentsTab("COMMENTS");
      setPendingSidebarFocusCommentId(thread.root.id);
    }
  }

  function handleImageCanvasClick(event: React.MouseEvent<HTMLDivElement>) {
    if (!allowComment || !isImageReview) {
      return;
    }

    const canvas = imageCanvasRef.current;
    if (!canvas) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return;
    }

    const xPct = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100));
    const yPct = Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100));

    setComposerPin({
      xPct,
      yPct
    });
    setComposerTimeSeconds(0);
    setSelectedCommentId(null);
  }

  async function loadQuickGrades(cycleNumber: number) {
    if (!canManageQuickGrades) {
      return;
    }

    setQuickGradesLoading(true);
    setQuickGradesMessage(null);

    try {
      const response = await fetch(`/api/grades/admin?cycle=${cycleNumber}`, { cache: "no-store" });
      const payload = (await response.json()) as {
        data?: QuickGradesApiPayload;
        error?: { message?: string };
      };

      if (!response.ok || !payload.data) {
        throw new Error(payload.error?.message ?? "Failed to load grades.");
      }

      const apiRowByUser = new Map(payload.data.rows.map((row) => [row.userId, row]));
      const rows: QuickGradeRow[] = data.assignedPeople.map((person) => {
        const apiRow = apiRowByUser.get(person.userId);
        if (apiRow) {
          return {
            ...apiRow,
            name: apiRow.name ?? person.name,
            email: apiRow.email ?? person.email,
            disabled: false,
            disabledReason: null
          };
        }

        return {
          userId: person.userId,
          name: person.name,
          email: person.email,
          effortPoints: null,
          teamworkPoints: null,
          feedback: "",
          turnedInDate: null,
          freeExtensionDays: 0,
          extensionDetails: {
            calculatedDays: 0,
            freeDays: 0,
            chargedDays: 0,
            exempt: false
          },
          published: false,
          publishedAt: null,
          totalPoints: null,
          percentage: null,
          extensionsRemaining: 14,
          disabled: true,
          disabledReason: "Admin users are not gradable here."
        };
      });

      setQuickGradeRows(rows);
      setSavedQuickGradeRows(rows);
      setQuickGradesLoadedCycle(cycleNumber);
      setQuickGradesSharedTurnedInDate(commonQuickGradeTurnedInDate(rows));
      setQuickGradesSharedTurnedInDirty(false);
    } catch (error) {
      setQuickGradesMessage(error instanceof Error ? error.message : "Failed to load grades.");
    } finally {
      setQuickGradesLoading(false);
    }
  }

  async function saveAllQuickGrades(options?: { suppressSuccessMessage?: boolean }) {
    if (!canManageQuickGrades || !quickGradeCycleNumber) {
      return { ok: false as const, rows: quickGradeRows };
    }

    setQuickGradesSaving(true);
    setQuickGradesMessage(null);

    try {
      const nextRows = quickGradeRows.map((row) => ({ ...row }));
      const nextSavedRows = savedQuickGradeRows.map((row) => ({ ...row }));
      const rowIndexByUser = new Map(nextRows.map((row, index) => [row.userId, index]));
      const savedRowIndexByUser = new Map(nextSavedRows.map((row, index) => [row.userId, index]));
      const applySharedTurnedInDate = quickGradesSharedTurnedInDirty;
      const sharedTurnedInDate = quickGradesSharedTurnedInDate || null;
      let savedCount = 0;
      let turnedInOnlyCount = 0;
      let skippedIncompleteCount = 0;

      for (const row of quickGradeRows) {
        if (row.disabled) {
          continue;
        }

        const effectiveTurnedInDate = applySharedTurnedInDate ? sharedTurnedInDate : row.turnedInDate;
        const turnedInDateChanged = (row.turnedInDate ?? null) !== (effectiveTurnedInDate ?? null);
        const savedBaseline = savedQuickGradeRowMap.get(row.userId);
        const freeExtensionDaysChanged = row.freeExtensionDays !== (savedBaseline?.freeExtensionDays ?? 0);

        if (row.effortPoints === null || row.teamworkPoints === null) {
          if (!turnedInDateChanged && !freeExtensionDaysChanged) {
            skippedIncompleteCount += 1;
            continue;
          }

          const response = await fetch("/api/grades/admin", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "setTurnedInDate",
              cycleNumber: quickGradeCycleNumber,
              userId: row.userId,
              turnedInDate: effectiveTurnedInDate,
              freeExtensionDays: row.freeExtensionDays
            })
          });

          const payload = (await response.json()) as {
            data?: Pick<
              QuickGradeApiRow,
              | "effortPoints"
              | "teamworkPoints"
              | "feedback"
              | "turnedInDate"
              | "freeExtensionDays"
              | "extensionDetails"
              | "published"
              | "publishedAt"
              | "totalPoints"
              | "percentage"
              | "extensionsRemaining"
            >;
            error?: { message?: string };
          };

          if (!response.ok || !payload.data) {
            throw new Error(payload.error?.message ?? `Failed to save ${quickGradePersonLabel(row)}.`);
          }

          const rowIndex = rowIndexByUser.get(row.userId);
          if (rowIndex !== undefined) {
            nextRows[rowIndex] = {
              ...nextRows[rowIndex],
              ...payload.data
            };
          }

          const savedRowIndex = savedRowIndexByUser.get(row.userId);
          if (savedRowIndex !== undefined) {
            nextSavedRows[savedRowIndex] = {
              ...nextSavedRows[savedRowIndex],
              ...payload.data
            };
          }

          turnedInOnlyCount += 1;
          continue;
        }

        const rowToSave = {
          ...row,
          turnedInDate: effectiveTurnedInDate
        };

        if (quickGradeRowsEqual(rowToSave, savedQuickGradeRowMap.get(row.userId))) {
          continue;
        }

        const response = await fetch("/api/grades/admin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "save",
            cycleNumber: quickGradeCycleNumber,
            userId: row.userId,
            effortPoints: row.effortPoints,
            teamworkPoints: row.teamworkPoints,
            feedback: row.feedback,
            turnedInDate: effectiveTurnedInDate,
            freeExtensionDays: row.freeExtensionDays
          })
        });

        const payload = (await response.json()) as {
          data?: Pick<
            QuickGradeApiRow,
            | "effortPoints"
            | "teamworkPoints"
            | "feedback"
            | "turnedInDate"
            | "freeExtensionDays"
            | "extensionDetails"
            | "published"
            | "publishedAt"
            | "totalPoints"
            | "percentage"
            | "extensionsRemaining"
          >;
          error?: { message?: string };
        };

        if (!response.ok || !payload.data) {
          throw new Error(payload.error?.message ?? `Failed to save ${quickGradePersonLabel(row)}.`);
        }

        const rowIndex = rowIndexByUser.get(row.userId);
        if (rowIndex !== undefined) {
          nextRows[rowIndex] = {
            ...nextRows[rowIndex],
            ...payload.data
          };
        }

        const savedRowIndex = savedRowIndexByUser.get(row.userId);
        if (savedRowIndex !== undefined) {
          nextSavedRows[savedRowIndex] = {
            ...nextSavedRows[savedRowIndex],
            ...payload.data
          };
        }

        savedCount += 1;
      }

      setQuickGradeRows(nextRows);
      setSavedQuickGradeRows(nextSavedRows);
      if (applySharedTurnedInDate) {
        setQuickGradesSharedTurnedInDirty(false);
      }
      setQuickGradesSharedTurnedInDate(commonQuickGradeTurnedInDate(nextRows));

      if (!options?.suppressSuccessMessage && savedCount === 0 && turnedInOnlyCount === 0 && skippedIncompleteCount > 0) {
        setQuickGradesMessage("Enter both grades for each person before saving.");
        return { ok: true as const, rows: nextRows };
      }

      if (!options?.suppressSuccessMessage && savedCount === 0 && turnedInOnlyCount === 0) {
        setQuickGradesMessage("No grade changes to save.");
        return { ok: true as const, rows: nextRows };
      }

      if (!options?.suppressSuccessMessage) {
        const savedParts = [];
        if (savedCount > 0) {
          savedParts.push(`Saved ${savedCount} grade${savedCount === 1 ? "" : "s"}`);
        }
        if (turnedInOnlyCount > 0) {
          savedParts.push(`updated turned-in date for ${turnedInOnlyCount} row${turnedInOnlyCount === 1 ? "" : "s"}`);
        }
        const summary = savedParts.length > 0 ? savedParts.join("; ") : "No changes saved";
        setQuickGradesMessage(
          skippedIncompleteCount > 0
            ? `${summary} (${skippedIncompleteCount} incomplete row${skippedIncompleteCount === 1 ? "" : "s"} skipped).`
            : `${summary}.`
        );
      }

      return { ok: true as const, rows: nextRows };
    } catch (error) {
      setQuickGradesMessage(error instanceof Error ? error.message : "Failed to save grades.");
      return { ok: false as const, rows: quickGradeRows };
    } finally {
      setQuickGradesSaving(false);
    }
  }

  async function publishAllQuickGrades() {
    if (!canManageQuickGrades || !quickGradeCycleNumber) {
      return;
    }

    const saveResult = await saveAllQuickGrades({ suppressSuccessMessage: true });
    if (!saveResult.ok) {
      return;
    }

    setQuickGradesSaving(true);
    setQuickGradesMessage(null);

    try {
      const sourceRows = saveResult.rows;
      const nextRows = sourceRows.map((row) => ({ ...row }));
      const nextSavedRows = sourceRows.map((row) => ({ ...row }));
      const rowIndexByUser = new Map(nextRows.map((row, index) => [row.userId, index]));
      const savedRowIndexByUser = new Map(nextSavedRows.map((row, index) => [row.userId, index]));
      let publishedCount = 0;
      let alreadyPublishedCount = 0;
      let skippedIncompleteCount = 0;

      for (const row of sourceRows) {
        if (row.disabled) {
          continue;
        }

        if (row.effortPoints === null || row.teamworkPoints === null) {
          skippedIncompleteCount += 1;
          continue;
        }

        if (row.published) {
          alreadyPublishedCount += 1;
          continue;
        }

        const response = await fetch("/api/grades/admin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "setPublish",
            cycleNumber: quickGradeCycleNumber,
            userId: row.userId,
            published: true
          })
        });

        const payload = (await response.json()) as {
          data?: Pick<
            QuickGradeApiRow,
            "effortPoints" | "teamworkPoints" | "feedback" | "turnedInDate" | "published" | "publishedAt" | "totalPoints" | "percentage" | "extensionsRemaining"
          >;
          error?: { message?: string };
        };

        if (!response.ok || !payload.data) {
          throw new Error(payload.error?.message ?? `Failed to publish ${quickGradePersonLabel(row)}.`);
        }

        const rowIndex = rowIndexByUser.get(row.userId);
        if (rowIndex !== undefined) {
          nextRows[rowIndex] = {
            ...nextRows[rowIndex],
            ...payload.data
          };
        }

        const savedRowIndex = savedRowIndexByUser.get(row.userId);
        if (savedRowIndex !== undefined) {
          nextSavedRows[savedRowIndex] = {
            ...nextSavedRows[savedRowIndex],
            ...payload.data
          };
        }

        publishedCount += 1;
      }

      setQuickGradeRows(nextRows);
      setSavedQuickGradeRows(nextSavedRows);
      setQuickGradesSharedTurnedInDate(commonQuickGradeTurnedInDate(nextRows));

      const parts = [];
      if (publishedCount > 0) {
        parts.push(`Published ${publishedCount} grade${publishedCount === 1 ? "" : "s"}`);
      }
      if (alreadyPublishedCount > 0) {
        parts.push(`${alreadyPublishedCount} already published`);
      }
      if (skippedIncompleteCount > 0) {
        parts.push(`${skippedIncompleteCount} incomplete skipped`);
      }
      setQuickGradesMessage(parts.length > 0 ? `${parts.join("; ")}.` : "No grades to publish.");
    } catch (error) {
      setQuickGradesMessage(error instanceof Error ? error.message : "Failed to publish grades.");
    } finally {
      setQuickGradesSaving(false);
    }
  }

  function toggleQuickGradesPanel() {
    if (!canManageQuickGrades) {
      return;
    }

    setQuickGradesOpen((open) => {
      const nextOpen = !open;
      if (nextOpen) {
        setQuickGradesMessage(null);
        if (quickGradeCycleNumber && quickGradesLoadedCycle !== quickGradeCycleNumber) {
          void loadQuickGrades(quickGradeCycleNumber);
        }
      } else {
        setQuickGradesSharedTurnedInDirty(false);
        setQuickGradesFeedbackEditorUserId(null);
      }
      return nextOpen;
    });
  }

  async function submitComment() {
    if (!allowComment || !composerBody.trim() || !currentVersion) {
      return;
    }

    if (isImageReview && !composerPin) {
      return;
    }

    const clampedTime = isImageReview ? 0 : clampToDuration(composerTimeSeconds, duration);

    setSubmittingComment(true);

    try {
      const response = await fetch("/api/comments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          mediaVersionId: currentVersion.id,
          targetType: isImageReview ? "FRAME_PIN" : "TIMECODE",
          timeSeconds: clampedTime,
          frameNumber: isImageReview ? 0 : frameNumberFromSeconds(clampedTime, DEFAULT_REVIEW_FPS),
          xPct: isImageReview ? composerPin?.xPct : undefined,
          yPct: isImageReview ? composerPin?.yPct : undefined,
          body: composerBody,
          guestToken
        })
      });

      if (!response.ok) {
        throw new Error("Failed");
      }

      const payload = await response.json();
      const created = payload.data as {
        id: string;
        mediaVersionId: string;
        body: string;
        authorId: string | null;
        timeSeconds: number;
        frameNumber: number | null;
        xPct: number | null;
        yPct: number | null;
        targetType: "TIMECODE" | "FRAME_PIN" | "GENERAL";
        createdAt: string;
        resolvedAt: string | null;
        parentCommentId: string | null;
      };

      setComments((current) => [
        ...current,
        {
          id: created.id,
          mediaVersionId: created.mediaVersionId,
          body: created.body,
          authorId: created.authorId,
          authorName: "You",
          timeSeconds: created.timeSeconds,
          frameNumber: created.frameNumber,
          xPct: created.xPct,
          yPct: created.yPct,
          targetType: created.targetType,
          createdAt: created.createdAt,
          resolvedAt: created.resolvedAt,
          parentCommentId: created.parentCommentId
        }
      ]);
      setCommentsTab("COMMENTS");
      setSelectedCommentId(created.id);
      setSidebarHighlightedCommentId(created.id);
      setPendingSidebarFocusCommentId(created.id);
      setComposerBody("");
      if (isImageReview) {
        setComposerPin(null);
      }
    } catch {
      window.alert("Could not send comment.");
    } finally {
      setSubmittingComment(false);
    }
  }

  async function submitReviewComment() {
    if (!allowComment || !reviewComposerBody.trim() || !currentVersion) {
      return;
    }

    setSubmittingReviewComment(true);

    try {
      const response = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mediaVersionId: currentVersion.id,
          targetType: "GENERAL",
          body: reviewComposerBody,
          guestToken
        })
      });

      if (!response.ok) {
        throw new Error("Failed");
      }

      const payload = await response.json();
      const created = payload.data as {
        id: string;
        mediaVersionId: string;
        body: string;
        authorId: string | null;
        timeSeconds: number;
        frameNumber: number | null;
        xPct: number | null;
        yPct: number | null;
        targetType: "TIMECODE" | "FRAME_PIN" | "GENERAL";
        createdAt: string;
        resolvedAt: string | null;
        parentCommentId: string | null;
      };

      setComments((current) => [
        ...current,
        {
          id: created.id,
          mediaVersionId: created.mediaVersionId,
          body: created.body,
          authorId: created.authorId,
          authorName: "You",
          timeSeconds: created.timeSeconds,
          frameNumber: created.frameNumber,
          xPct: created.xPct,
          yPct: created.yPct,
          targetType: created.targetType,
          createdAt: created.createdAt,
          resolvedAt: created.resolvedAt,
          parentCommentId: created.parentCommentId
        }
      ]);
      setReviewComposerBody("");
    } catch {
      window.alert("Could not send comment.");
    } finally {
      setSubmittingReviewComment(false);
    }
  }

  async function submitReply(parentId: string) {
    const draft = (replyDrafts[parentId] ?? "").trim();

    if (!allowComment || draft.length === 0) {
      return;
    }

    setSubmittingReplyFor(parentId);

    try {
      const response = await fetch(`/api/comments/${parentId}/replies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: draft,
          guestToken
        })
      });

      if (!response.ok) {
        throw new Error("Failed");
      }

      const payload = await response.json();
      const created = payload.data as {
        id: string;
        mediaVersionId: string;
        body: string;
        authorId: string | null;
        timeSeconds: number;
        frameNumber: number | null;
        xPct: number | null;
        yPct: number | null;
        targetType: "TIMECODE" | "FRAME_PIN" | "GENERAL";
        createdAt: string;
        resolvedAt: string | null;
        parentCommentId: string | null;
      };

      setComments((current) => [
        ...current,
        {
          id: created.id,
          mediaVersionId: created.mediaVersionId,
          body: created.body,
          authorId: created.authorId,
          authorName: "You",
          timeSeconds: created.timeSeconds,
          frameNumber: created.frameNumber,
          xPct: created.xPct,
          yPct: created.yPct,
          targetType: created.targetType,
          createdAt: created.createdAt,
          resolvedAt: created.resolvedAt,
          parentCommentId: created.parentCommentId
        }
      ]);

      setReplyDrafts((drafts) => ({
        ...drafts,
        [parentId]: ""
      }));
      setReplyingTo(null);
    } catch {
      window.alert("Could not send reply.");
    } finally {
      setSubmittingReplyFor(null);
    }
  }

  async function deleteComment(commentId: string) {
    if (isGuest) {
      return;
    }

    setDeletingCommentId(commentId);

    try {
      const response = await fetch(`/api/comments/${commentId}`, {
        method: "DELETE"
      });

      if (!response.ok && response.status !== 404) {
        throw new Error("Failed");
      }

      let removedIds = new Set<string>([commentId]);
      setComments((current) => {
        removedIds = collectCommentThreadIds(current, commentId);
        return current.filter((comment) => !removedIds.has(comment.id));
      });
      setSelectedCommentId((current) => (current !== null && removedIds.has(current) ? null : current));
      setReplyingTo((current) => (current !== null && removedIds.has(current) ? null : current));
      setPendingSidebarFocusCommentId((current) => (current !== null && removedIds.has(current) ? null : current));
      setSidebarHighlightedCommentId((current) => (current !== null && removedIds.has(current) ? null : current));
      setReplyDrafts((drafts) => {
        const next = { ...drafts };
        for (const removedId of removedIds) {
          delete next[removedId];
        }
        return next;
      });
    } catch {
      window.alert("Could not delete comment.");
    } finally {
      setDeletingCommentId((current) => (current === commentId ? null : current));
    }
  }

  function startEditingComment(commentId: string, currentBody: string) {
    setEditingCommentId(commentId);
    setEditDraft(currentBody);
  }

  function cancelEditingComment() {
    setEditingCommentId(null);
    setEditDraft("");
  }

  async function saveEditComment(commentId: string) {
    if (isGuest || !editDraft.trim()) {
      return;
    }

    setSavingEditCommentId(commentId);

    try {
      const response = await fetch(`/api/comments/${commentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: editDraft.trim() })
      });

      if (!response.ok) {
        throw new Error("Failed");
      }

      setComments((current) =>
        current.map((comment) =>
          comment.id === commentId ? { ...comment, body: editDraft.trim() } : comment
        )
      );
      setEditingCommentId(null);
      setEditDraft("");
    } catch {
      window.alert("Could not save comment.");
    } finally {
      setSavingEditCommentId(null);
    }
  }

  async function importCommentsFromFile(file: File) {
    if (!currentVersion || currentVersion.sourceType !== "VIDEO") {
      window.alert("CSV import is only available for video reviews.");
      return;
    }

    setImportingComments(true);

    try {
      const csvText = await file.text();
      const response = await fetch("/api/comments/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          mediaVersionId: currentVersion.id,
          csvText
        })
      });

      if (!response.ok) {
        throw new Error("Failed");
      }

      const payload = await response.json();
      const imported = (payload.data.comments ?? []) as Array<{
        id: string;
        mediaVersionId: string;
        body: string;
        authorId: string | null;
        timeSeconds: number;
        frameNumber: number | null;
        xPct: number | null;
        yPct: number | null;
        targetType: "TIMECODE" | "FRAME_PIN" | "GENERAL";
        createdAt: string;
        resolvedAt: string | null;
        parentCommentId: string | null;
      }>;

      setComments((current) => [
        ...current,
        ...imported.map((comment) => ({
          ...comment,
          authorName: "You"
        }))
      ]);
      window.alert(`Imported ${payload.data.importedCount} comments${payload.data.skippedCount ? ` (${payload.data.skippedCount} skipped)` : ""}.`);
    } catch {
      window.alert("Could not import comments from CSV.");
    } finally {
      setImportingComments(false);
    }
  }

  function toAiredDateInput(iso: string | null): string {
    const source = iso ? new Date(iso) : new Date();
    if (Number.isNaN(source.getTime())) {
      return "";
    }
    const year = source.getUTCFullYear();
    const month = String(source.getUTCMonth() + 1).padStart(2, "0");
    const day = String(source.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function formatAiredLabel(iso: string): string {
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

  function openAiredDialog() {
    setAiredDateInput(toAiredDateInput(currentVersion?.airedAt ?? null));
    setAiredDialogOpen(true);
  }

  async function submitAiredDate() {
    if (!airedDateInput) {
      return;
    }
    const iso = `${airedDateInput}T00:00:00.000Z`;
    setAiredDialogOpen(false);
    await changeApproval("AIRED", iso);
  }

  async function submitPackageReview() {
    if (!packageReview?.canSubmitReview || !currentVersion) {
      return;
    }

    setSubmittingPackageReview(true);
    setPackageActionMessage(null);

    try {
      const response = await fetch(`/api/media/${data.mediaId}/package-approval`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "SUBMIT_REVIEW",
          mediaVersionId: currentVersion.id
        })
      });

      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(body.error?.message ?? "Could not submit review.");
      }

      setVersions((current) =>
        current.map((version) =>
          version.id === currentVersion.id ? { ...version, approvalStatus: "NEEDS_CHANGES" } : version
        )
      );
      window.location.reload();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Could not submit review.");
    } finally {
      setSubmittingPackageReview(false);
    }
  }

  async function approvePackageCut(feedback?: string, unapprove = false) {
    if (!(unapprove ? packageReview?.canUnapprove : packageReview?.canApprove)) {
      return;
    }

    setStatusUpdating(true);
    setPackageActionMessage(null);

    try {
      const response = await fetch(`/api/media/${data.mediaId}/package-approval`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: unapprove ? "UNAPPROVE" : "DECIDE", approved: true, note: feedback, mediaVersionId: currentVersion?.id })
      });

      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(body.error?.message ?? "Could not approve this cut.");
      }

      window.location.reload();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Could not approve this cut.");
    } finally {
      setStatusUpdating(false);
    }
  }

  async function approvePackageCutAnyway() {
    if (!packageReview?.canApproveAnyway || !window.confirm(APPROVE_ANYWAY_CONFIRM)) {
      return;
    }

    setStatusUpdating(true);
    setPackageActionMessage(null);

    try {
      const response = await fetch(`/api/media/${data.mediaId}/package-approval`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "APPROVE_ANYWAY" })
      });

      if (!response.ok) {
        const body = (await response.json()) as { error?: { message?: string } };
        throw new Error(body.error?.message ?? "Could not send the package to Stage 2.");
      }

      window.location.reload();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Could not send the package to Stage 2.");
    } finally {
      setStatusUpdating(false);
    }
  }

  async function changeApproval(nextStatus: ApprovalStatusValue, airedAtIso?: string) {
    if (!currentVersion || isGuest) {
      return;
    }

    setStatusUpdating(true);

    try {
      const response = await fetch(`/api/media/${data.mediaId}/approval-status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mediaVersionId: currentVersion.id,
          status: nextStatus,
          ...(nextStatus === "AIRED" && airedAtIso ? { airedAt: airedAtIso } : {})
        })
      });

      if (!response.ok) {
        throw new Error("Failed");
      }

      const nextAiredAt = nextStatus === "AIRED" ? airedAtIso ?? null : null;

      setVersions((current) =>
        current.map((version) =>
          version.id === currentVersion.id
            ? { ...version, approvalStatus: nextStatus, airedAt: nextAiredAt }
            : version
        )
      );
    } catch {
      window.alert("Could not update approval state.");
    } finally {
      setStatusUpdating(false);
    }
  }

  async function togglePlayback() {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    if (video.paused) {
      await video.play();
      return;
    }

    video.pause();
  }

  const timelineDuration = duration > 0 ? duration : Math.max(1, ...commentThreads.map((thread) => thread.root.timeSeconds));
  const commentCount = commentThreads.length;
  const reviewPaneMaxHeightClass = isMacDesktopApp ? "lg:max-h-[calc(100dvh-11.5rem)]" : "lg:max-h-[calc(100dvh-7.5rem)]";
  const reviewLayoutHeightClass = isMacDesktopApp ? "xl:h-[calc(100dvh-11.5rem)]" : "xl:h-[calc(100dvh-7.5rem)]";
  const effectiveSidebarWidthPx = manualSidebarWidthPx ?? autoSidebarWidthPx ?? 420;
  const qualityOptions: DropdownOption<QualityValue>[] = [
    { value: "AUTO", label: "Quality: Auto" },
    { value: "1080", label: "Quality: 1080p" },
    { value: "720", label: "Quality: 720p" },
    { value: "480", label: "Quality: 480p" }
  ];

  const clampSidebarWidth = useCallback(
    (requestedWidth: number) => {
      const layoutWidth = reviewLayoutRef.current?.clientWidth ?? 0;
      const layoutDrivenMax = Math.max(minSidebarWidthPx, layoutWidth - reviewSplitterWidthPx - minLeftPaneWidthPx);
      const ceiling = Math.min(maxSidebarWidthPx, layoutDrivenMax);
      return Math.max(minSidebarWidthPx, Math.min(ceiling, requestedWidth));
    },
    [maxSidebarWidthPx, minLeftPaneWidthPx, minSidebarWidthPx, reviewSplitterWidthPx]
  );

  const recalculateReviewSplitLayout = useCallback(() => {
    if (!isDesktopSplitLayout) {
      setComputedMediaStageMaxWidthPx((current) => (current === null ? current : null));
      if (manualSidebarWidthPx === null) {
        setAutoSidebarWidthPx((current) => (current === null ? current : null));
      }
      return;
    }

    const layoutNode = reviewLayoutRef.current;
    const cardNode = reviewMainCardRef.current;
    const mediaNode = mediaStageRef.current;
    if (!layoutNode || !cardNode || !mediaNode) {
      return;
    }

    const layoutRect = layoutNode.getBoundingClientRect();
    const cardRect = cardNode.getBoundingClientRect();
    const mediaRect = mediaNode.getBoundingClientRect();
    const layoutBottom = layoutRect.top + layoutNode.clientHeight;
    const availableHeight = Math.max(0, layoutBottom - cardRect.top);
    const controlsHeight = isImageReview ? 0 : (mediaControlsRef.current?.getBoundingClientRect().height ?? 0);
    const mediaGap = isImageReview ? 0 : 12;
    const leftChromeHeight = Math.max(0, cardRect.height - mediaRect.height);
    const stageAvailableHeight = Math.max(0, availableHeight - leftChromeHeight);
    const targetVideoHeight = isImageReview ? stageAvailableHeight : Math.max(0, stageAvailableHeight - controlsHeight - mediaGap);
    const targetMediaWidth = Math.max(260, targetVideoHeight * (16 / 9));

    if (manualSidebarWidthPx === null) {
      const layoutWidth = layoutNode.clientWidth;
      const autoSidebarCandidate = layoutWidth - reviewSplitterWidthPx - targetMediaWidth;
      const clampedAutoSidebarWidth = clampSidebarWidth(autoSidebarCandidate);
      setAutoSidebarWidthPx((current) =>
        current !== null && Math.abs(current - clampedAutoSidebarWidth) < 1 ? current : clampedAutoSidebarWidth
      );
    }

    const activeSidebarWidth = manualSidebarWidthPx ?? autoSidebarWidthPx ?? clampSidebarWidth(420);
    const availableLeftWidth = Math.max(260, layoutNode.clientWidth - reviewSplitterWidthPx - activeSidebarWidth);
    const clampedMediaWidth = Math.max(260, Math.min(availableLeftWidth, targetMediaWidth));
    setComputedMediaStageMaxWidthPx((current) =>
      current !== null && Math.abs(current - clampedMediaWidth) < 1 ? current : clampedMediaWidth
    );
  }, [
    autoSidebarWidthPx,
    clampSidebarWidth,
    isDesktopSplitLayout,
    isImageReview,
    manualSidebarWidthPx,
    reviewSplitterWidthPx
  ]);

  useEffect(() => {
    recalculateReviewSplitLayout();

    const layoutNode = reviewLayoutRef.current;
    const cardNode = reviewMainCardRef.current;
    const mediaNode = mediaStageRef.current;
    const controlsNode = mediaControlsRef.current;
    const heroNode = reviewHeroRef.current;
    const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => recalculateReviewSplitLayout()) : null;

    if (resizeObserver && layoutNode) {
      resizeObserver.observe(layoutNode);
    }
    if (resizeObserver && heroNode) {
      resizeObserver.observe(heroNode);
    }
    if (resizeObserver && cardNode) {
      resizeObserver.observe(cardNode);
    }
    if (resizeObserver && mediaNode) {
      resizeObserver.observe(mediaNode);
    }
    if (resizeObserver && controlsNode) {
      resizeObserver.observe(controlsNode);
    }

    window.addEventListener("resize", recalculateReviewSplitLayout);
    return () => {
      window.removeEventListener("resize", recalculateReviewSplitLayout);
      resizeObserver?.disconnect();
    };
  }, [currentVersionId, recalculateReviewSplitLayout]);

  useEffect(() => {
    if (!isResizingSidebar) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const drag = sidebarResizeDragRef.current;
      if (!drag) {
        return;
      }

      const nextWidth = clampSidebarWidth(drag.startWidth - (event.clientX - drag.startX));
      setManualSidebarWidthPx(nextWidth);
    };

    const endResize = () => {
      sidebarResizeDragRef.current = null;
      setIsResizingSidebar(false);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", endResize);
    window.addEventListener("pointercancel", endResize);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", endResize);
      window.removeEventListener("pointercancel", endResize);
    };
  }, [clampSidebarWidth, isResizingSidebar]);

  const startSidebarResize = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (!isDesktopSplitLayout || event.button !== 0) {
        return;
      }

      event.preventDefault();
      sidebarResizeDragRef.current = {
        startX: event.clientX,
        startWidth: effectiveSidebarWidthPx
      };
      setManualSidebarWidthPx(effectiveSidebarWidthPx);
      setIsResizingSidebar(true);
    },
    [effectiveSidebarWidthPx, isDesktopSplitLayout]
  );

  return (
    <div
      ref={reviewLayoutRef}
      className={cn(
        "grid gap-5 xl:gap-0",
        reviewLayoutHeightClass,
        isMacDesktopApp ? "xl:place-content-center" : ""
      )}
      style={
        isDesktopSplitLayout
          ? {
              gridTemplateColumns: `minmax(0,1fr) ${reviewSplitterWidthPx}px minmax(${minSidebarWidthPx}px, ${Math.round(effectiveSidebarWidthPx)}px)`
            }
          : undefined
      }
    >
      <section className="min-w-0 space-y-4 xl:min-h-0 xl:overflow-hidden xl:pr-2">
        {/* Hero strip */}
        <section ref={reviewHeroRef} className="relative rounded-2xl border border-border bg-card px-4 py-3">
          <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
            <div
              className="absolute -right-12 -top-32 h-[320px] w-[320px] rounded-full opacity-90"
              style={{ background: "radial-gradient(circle, rgba(0,199,44,0.18) 0%, transparent 60%)" }}
            />
          </div>
          <div className="relative flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="eyebrow flex items-center gap-1.5">
                <span className="rec-dot" />
                Review · {data.projectName} · v{currentVersion?.versionNumber ?? "—"}
              </div>
              <h1 className="display-md mt-2 font-display italic font-extrabold uppercase tracking-tight text-foreground">
                {data.title}
              </h1>
            </div>
            <div
              className={cn(
                "inline-flex max-w-full items-center gap-2 rounded-full border px-3.5 py-2 font-display text-[11px] font-bold uppercase tracking-[0.16em]",
                currentVersion?.approvalStatus === "AIRED"
                  ? "border-[rgb(99,102,241,0.45)] bg-[rgb(99,102,241,0.15)] text-indigo-300"
                  : cutReviewStatus.tone === "approved"
                    ? "border-[rgb(0,199,44,0.35)] bg-[rgb(0,199,44,0.12)] text-[var(--brand-green)]"
                    : cutReviewStatus.tone === "warn"
                      ? "border-[rgb(225,29,44,0.4)] bg-[rgb(225,29,44,0.12)] text-[var(--brand-red)]"
                      : "border-[rgb(242,165,22,0.4)] bg-[rgb(242,165,22,0.12)] text-[var(--brand-amber)]"
              )}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 shrink-0 rounded-full",
                  currentVersion?.approvalStatus === "AIRED"
                    ? "bg-indigo-300"
                    : cutReviewStatus.tone === "approved"
                      ? "bg-[var(--brand-green)]"
                      : cutReviewStatus.tone === "warn"
                        ? "bg-[var(--brand-red)]"
                        : "bg-[var(--brand-amber)]"
                )}
              />
              <span className="truncate">
                {currentVersion?.approvalStatus === "AIRED"
                  ? `Aired${currentVersion.airedAt ? ` · ${formatAiredLabel(currentVersion.airedAt)}` : ""}`
                  : cutReviewStatus.label}
              </span>
            </div>
          </div>
          <div className="relative mt-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <div className="flex items-center gap-2">
              <label className="relative inline-flex">
                <select
                  aria-label="Review version"
                  value={currentVersionId}
                  onChange={(event) => {
                    setCurrentVersionId(event.target.value);
                    setSelectedCommentId(null);
                    setComposerPin(null);
                  }}
                  className="h-9 appearance-none rounded-lg border border-border bg-muted px-3 pr-8 text-sm text-foreground transition hover:border-border"
                >
                  {versions.map((version) => (
                    <option key={version.id} value={version.id}>
                      v{version.versionNumber} ({version.status})
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              </label>
              {canManageQuickGrades ? (
                <div ref={quickGradesRef} className="relative">
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "h-9 px-3",
                      quickGradesOpen ? "bg-white/10 text-white" : ""
                    )}
                    onClick={toggleQuickGradesPanel}
                    title="Quick grades"
                    aria-label="Open quick grades"
                  >
                    <GraduationCap className="h-3.5 w-3.5" />
                  </Button>

                  {quickGradesOpen ? (
                    <div className="absolute left-0 top-[calc(100%+0.55rem)] z-[140] w-[min(96vw,40rem)] rounded-2xl border border-border bg-card/95 p-3 shadow-2xl backdrop-blur-md">
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Quick Grades</p>
                          <p className="truncate text-sm font-semibold text-foreground">
                            {quickGradeCycleNumber ? `Cycle ${quickGradeCycleNumber}` : "Cycle unavailable"}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">{data.projectName}</p>
                        </div>
                        {quickGradesLoading ? <Loader2 className="mt-0.5 h-4 w-4 animate-spin text-muted-foreground" /> : null}
                      </div>

                      {!quickGradeCycleNumber ? (
                        <div className="rounded-xl border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
                          Project name must match <span className="font-medium">Package Cycle X</span> to load grades.
                        </div>
                      ) : quickGradesLoading ? (
                        <div className="rounded-xl border border-border bg-muted px-3 py-6 text-center text-xs text-muted-foreground">
                          Loading grades…
                        </div>
                      ) : data.assignedPeople.length === 0 ? (
                        <div className="rounded-xl border border-border bg-muted px-3 py-6 text-center text-xs text-muted-foreground">
                          No people are assigned to this video.
                        </div>
                      ) : (
                        <>
                          <div className="mb-2 grid grid-cols-[minmax(0,1fr)_6rem_6rem_8rem_8.5rem] items-center gap-2 px-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                            <span>Name</span>
                            <span className="text-center">Effort /25</span>
                            <span className="text-center">Teamwork /15</span>
                            <span className="text-center">Free Ext</span>
                            <span className="text-center">Feedback</span>
                          </div>

                          <div className="max-h-[18.5rem] space-y-1.5 overflow-y-auto pr-1">
                            {quickGradeRows.map((row) => (
                              <div
                                key={row.userId}
                                className={cn(
                                  "grid grid-cols-[minmax(0,1fr)_6rem_6rem_8rem_8.5rem] items-center gap-2 rounded-xl border px-2 py-2",
                                  row.disabled ? "border-white/8 bg-white/[0.03]" : "border-white/10 bg-white/[0.04]"
                                )}
                              >
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <p className={cn("truncate text-sm", row.disabled ? "text-muted-foreground" : "text-foreground")}>
                                      {quickGradePersonLabel(row)}
                                    </p>
                                    {!row.disabled && !row.extensionDetails.exempt ? (
                                      <span
                                        title={`Extension days remaining (out of 14)`}
                                        className={cn(
                                          "shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[10px] font-semibold leading-none",
                                          row.extensionsRemaining < 0
                                            ? "bg-[rgb(220,38,38,0.15)] text-[var(--brand-red)] ring-1 ring-inset ring-[rgb(220,38,38,0.35)]"
                                            : row.extensionsRemaining <= 2
                                              ? "bg-[rgb(242,165,22,0.12)] text-[var(--brand-amber)] ring-1 ring-inset ring-[rgb(242,165,22,0.30)]"
                                              : "bg-[rgb(0,199,44,0.10)] text-[var(--brand-green)] ring-1 ring-inset ring-[rgb(0,199,44,0.25)]"
                                        )}
                                      >
                                        {row.extensionsRemaining}d
                                      </span>
                                    ) : null}
                                  </div>
                                  {row.disabled ? (
                                    <p className="truncate text-[11px] text-muted-foreground">{row.disabledReason}</p>
                                  ) : null}
                                </div>

                                <label className="relative">
                                  <input
                                    type="number"
                                    min={0}
                                    max={MAX_EFFORT_POINTS}
                                    step={1}
                                    inputMode="numeric"
                                    value={row.effortPoints ?? ""}
                                    disabled={row.disabled || quickGradesSaving}
                                    onChange={(event) => {
                                      const nextValue = normalizeQuickGradePoints(event.target.value, MAX_EFFORT_POINTS);
                                      setQuickGradeRows((current) =>
                                        current.map((candidate) =>
                                          candidate.userId === row.userId
                                            ? {
                                                ...candidate,
                                                effortPoints: nextValue
                                              }
                                            : candidate
                                        )
                                      );
                                    }}
                                    className={cn(
                                      "h-9 w-full rounded-lg border bg-background px-2 pr-6 text-center text-sm text-foreground outline-none transition",
                                      row.disabled
                                        ? "cursor-not-allowed border-border text-muted-foreground"
                                        : "border-border hover:border-border focus:ring-1 focus:ring-ring"
                                    )}
                                  />
                                  <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
                                    /{MAX_EFFORT_POINTS}
                                  </span>
                                </label>

                                <label className="relative">
                                  <input
                                    type="number"
                                    min={0}
                                    max={MAX_TEAMWORK_POINTS}
                                    step={1}
                                    inputMode="numeric"
                                    value={row.teamworkPoints ?? ""}
                                    disabled={row.disabled || quickGradesSaving}
                                    onChange={(event) => {
                                      const nextValue = normalizeQuickGradePoints(event.target.value, MAX_TEAMWORK_POINTS);
                                      setQuickGradeRows((current) =>
                                        current.map((candidate) =>
                                          candidate.userId === row.userId
                                            ? {
                                                ...candidate,
                                                teamworkPoints: nextValue
                                              }
                                            : candidate
                                        )
                                      );
                                    }}
                                    className={cn(
                                      "h-9 w-full rounded-lg border bg-background px-2 pr-6 text-center text-sm text-foreground outline-none transition",
                                      row.disabled
                                        ? "cursor-not-allowed border-border text-muted-foreground"
                                        : "border-border hover:border-border focus:ring-1 focus:ring-ring"
                                    )}
                                  />
                                  <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
                                    /{MAX_TEAMWORK_POINTS}
                                  </span>
                                </label>

                                <label className="relative">
                                  <input
                                    type="number"
                                    min={0}
                                    max={14}
                                    step={1}
                                    inputMode="numeric"
                                    value={row.freeExtensionDays}
                                    disabled={row.disabled || quickGradesSaving}
                                    onChange={(event) => {
                                      const parsed = Number(event.target.value);
                                      const nextValue = Number.isFinite(parsed) ? Math.max(0, Math.min(14, Math.round(parsed))) : 0;
                                      setQuickGradeRows((current) =>
                                        current.map((candidate) =>
                                          candidate.userId === row.userId
                                            ? {
                                                ...candidate,
                                                freeExtensionDays: nextValue
                                              }
                                            : candidate
                                        )
                                      );
                                    }}
                                    className={cn(
                                      "h-9 w-full rounded-lg border bg-background px-2 text-center text-sm text-foreground outline-none transition",
                                      row.disabled
                                        ? "cursor-not-allowed border-border text-muted-foreground"
                                        : "border-border hover:border-border focus:ring-1 focus:ring-ring"
                                    )}
                                  />
                                </label>

                                <Button
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  className="h-9 px-2 text-xs"
                                  disabled={row.disabled || quickGradesSaving}
                                  onClick={() =>
                                    setQuickGradesFeedbackEditorUserId((current) => (current === row.userId ? null : row.userId))
                                  }
                                >
                                  {row.feedback.trim() ? "Edit Feedback" : "Add Feedback"}
                                </Button>
                              </div>
                            ))}
                          </div>

                          {quickGradesFeedbackEditorUserId ? (
                            (() => {
                              const activeRow =
                                quickGradeRows.find((row) => row.userId === quickGradesFeedbackEditorUserId) ?? null;
                              if (!activeRow || activeRow.disabled) {
                                return null;
                              }

                              return (
                                <div className="mt-3 rounded-xl border border-border bg-muted p-3">
                                  <div className="mb-2 flex items-center justify-between gap-2">
                                    <p className="truncate text-sm font-medium text-foreground">
                                      Feedback: {quickGradePersonLabel(activeRow)}
                                    </p>
                                    <div className="flex items-center gap-2">
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="ghost"
                                        className="h-8 px-2 text-xs"
                                        disabled={quickGradesSaving}
                                        onClick={() => {
                                          setQuickGradeRows((current) =>
                                            current.map((candidate) =>
                                              candidate.userId === activeRow.userId ? { ...candidate, feedback: "" } : candidate
                                            )
                                          );
                                        }}
                                      >
                                        Clear
                                      </Button>
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="ghost"
                                        className="h-8 px-2 text-xs"
                                        onClick={() => setQuickGradesFeedbackEditorUserId(null)}
                                      >
                                        Done
                                      </Button>
                                    </div>
                                  </div>
                                  <Textarea
                                    value={activeRow.feedback}
                                    onChange={(event) => {
                                      const nextValue = event.target.value.slice(0, 2000);
                                      setQuickGradeRows((current) =>
                                        current.map((candidate) =>
                                          candidate.userId === activeRow.userId ? { ...candidate, feedback: nextValue } : candidate
                                        )
                                      );
                                    }}
                                    disabled={quickGradesSaving}
                                    rows={4}
                                    className="min-h-[7rem] resize-y border-border bg-background text-sm text-foreground placeholder:text-muted-foreground"
                                    placeholder="Add feedback for this student..."
                                  />
                                  <p className="mt-2 text-right text-[11px] text-muted-foreground">
                                    {activeRow.feedback.length}/2000
                                  </p>
                                </div>
                              );
                            })()
                          ) : null}

                          <div className="mt-3 space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span className="uppercase tracking-[0.12em] text-muted-foreground">Turned In</span>
                                <input
                                  type="date"
                                  value={quickGradesSharedTurnedInDate}
                                  disabled={quickGradesSaving || quickGradesLoading || !quickGradeCycleNumber}
                                  onChange={(event) => {
                                    setQuickGradesSharedTurnedInDate(event.target.value);
                                    setQuickGradesSharedTurnedInDirty(true);
                                  }}
                                  className="h-9 rounded-lg border border-border bg-background px-2 text-sm text-foreground outline-none transition hover:border-border focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                                />
                              </label>

                              <div className="flex items-center gap-2">
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  className="h-9 gap-1.5"
                                  disabled={quickGradesSaving || quickGradesLoading || !quickGradeCycleNumber}
                                  onClick={() => void publishAllQuickGrades()}
                                >
                                  {quickGradesSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                                  Publish All
                                </Button>
                                <Button
                                  size="sm"
                                  className="h-9 gap-1.5"
                                  disabled={quickGradesSaving || quickGradesLoading || !quickGradeCycleNumber}
                                  onClick={() => void saveAllQuickGrades()}
                                >
                                  {quickGradesSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                                  Save Assigned
                                </Button>
                              </div>
                            </div>
                            {quickGradesRevisionDeadlineLabel ? (
                              <p className="text-xs text-muted-foreground">Latest revision by: {quickGradesRevisionDeadlineLabel}</p>
                            ) : null}
                            <p className="min-h-4 text-xs text-muted-foreground">
                              {quickGradesMessage ?? "Use one Turned In date to apply to everyone here, then set any free extension days per person before saving or publishing."}
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  ) : null}
                </div>
              ) : null}
              <Button variant="ghost" size="sm" className="h-9 px-3" aria-label="Refresh review" onClick={() => router.refresh()}>
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {packageReview && !isGuest && (packageReview.canSubmitReview || packageReview.canApprove || packageReview.canUnapprove || packageReview.canApproveAnyway) ? (
                <>
                  {packageReview.canSubmitReview ? (
                    <Button
                      type="button"
                      className="h-9"
                      variant="secondary"
                      disabled={submittingPackageReview || statusUpdating || currentVersion?.id !== versions[0]?.id}
                      onClick={() => void submitPackageReview()}
                    >
                      {submittingPackageReview ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Submit review (needs revisions)
                    </Button>
                  ) : null}
                  {packageReview.canUnapprove ? (
                    <Button type="button" variant="secondary" className="h-9"
                      disabled={statusUpdating || submittingPackageReview}
                      onClick={() => void approvePackageCut(undefined, true)}>
                      Unapprove
                    </Button>
                  ) : null}
                  {packageReview.canApprove ? (
                    <Button
                      type="button"
                      className="h-9"
                      disabled={statusUpdating || submittingPackageReview || currentVersion?.id !== versions[0]?.id}
                      onClick={() => setApproveFeedbackOpen(true)}
                    >
                      Approve
                    </Button>
                  ) : null}
                  {packageReview.canApproveAnyway ? (
                    <Button type="button" className="h-9"
                      disabled={statusUpdating || submittingPackageReview}
                      onClick={() => void approvePackageCutAnyway()}>
                      Approve anyway
                    </Button>
                  ) : null}
                </>
              ) : packageReview && !isGuest ? (
                <span className="status-pill status-neutral">
                  {packageReview.stage === "EXECUTIVE_REVIEW" &&
                  packageReview.remainingExecutiveSignoffs != null &&
                  packageReview.remainingExecutiveSignoffs > 0
                    ? executiveWaitPill(packageReview.remainingExecutiveSignoffs)
                    : (approvalStagePillLabel(packageReview.stage) ?? "Not your stage")}
                </span>
              ) : !isGuest && data.canUpdateApprovalStatus ? (
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    disabled={statusUpdating}
                    onClick={() => changeApproval("IN_REVIEW")}
                    className={`h-8 rounded-md border px-3 text-xs font-semibold transition disabled:opacity-50 ${
                      currentVersion?.approvalStatus === "IN_REVIEW"
                        ? "border-[var(--ink-3)] bg-[var(--ink-2)] text-foreground"
                        : "border-[var(--ink-3)] bg-transparent text-muted-foreground hover:bg-[var(--ink-2)] hover:text-foreground"
                    }`}
                  >
                    In Review
                  </button>
                  <button
                    type="button"
                    disabled={statusUpdating}
                    onClick={() => changeApproval("NEEDS_CHANGES")}
                    className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-semibold transition disabled:opacity-50 ${
                      currentVersion?.approvalStatus === "NEEDS_CHANGES"
                        ? "border-[rgb(225,29,44,0.4)] bg-[rgb(225,29,44,0.15)] text-foreground"
                        : "border-[rgb(225,29,44,0.4)] bg-transparent text-muted-foreground hover:bg-[rgb(225,29,44,0.10)] hover:text-foreground"
                    }`}
                  >
                    Needs Changes
                  </button>
                  <button
                    type="button"
                    disabled={statusUpdating}
                    onClick={() => changeApproval("APPROVED")}
                    className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-bold transition disabled:opacity-50 ${
                      currentVersion?.approvalStatus === "APPROVED"
                        ? "border-[var(--brand-green)] bg-[var(--brand-green)] text-[var(--ink)]"
                        : "border-[var(--brand-green)] bg-transparent text-[var(--brand-green)] hover:bg-[var(--brand-green)] hover:text-[var(--ink)]"
                    }`}
                  >
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                    Approve v{currentVersion?.versionNumber ?? "—"}
                  </button>
                  <button
                    type="button"
                    disabled={
                      statusUpdating ||
                      (currentVersion?.approvalStatus !== "APPROVED" &&
                        currentVersion?.approvalStatus !== "AIRED")
                    }
                    onClick={openAiredDialog}
                    className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-bold transition disabled:opacity-50 ${
                      currentVersion?.approvalStatus === "AIRED"
                        ? "border-indigo-400 bg-indigo-500 text-white"
                        : "border-indigo-400 bg-transparent text-indigo-300 hover:bg-indigo-500 hover:text-white"
                    }`}
                    title={
                      currentVersion?.approvalStatus === "APPROVED" ||
                      currentVersion?.approvalStatus === "AIRED"
                        ? undefined
                        : "Approve this version before marking aired"
                    }
                  >
                    {currentVersion?.approvalStatus === "AIRED" && currentVersion.airedAt
                      ? `Aired · ${formatAiredLabel(currentVersion.airedAt)}`
                      : "Aired"}
                  </button>
                </div>
              ) : (
                <Badge>{currentVersion?.approvalStatus.replace("_", " ") ?? "IN REVIEW"}</Badge>
              )}
            </div>
            </div>
            {packageReview && !isGuest ? (
              <p className="text-right text-xs text-muted-foreground">
                {packageActionMessage ??
                  (packageReview.awaitingRevisedInitialCut ? "Approved in Stage 1 · Awaiting revised upload" : null) ??
                  (packageReview.stage === "EXECUTIVE_REVIEW"
                    ? approvalProgressLabel(packageReview.stage, packageReview.remainingExecutiveSignoffs)
                    : null) ??
                  (packageReview.canApprove
                    ? "Leave comments, then submit review to request revisions, or approve this stage."
                    : (approvalStageHandoff(packageReview.stage) ?? "Not your stage."))}
              </p>
            ) : null}

          </div>
        </section>

        <div ref={reviewMainCardRef} className="rounded-2xl border border-border bg-card/80 p-2 sm:p-3">
          <div
            ref={mediaStageRef}
            className="mx-auto w-full"
            style={computedMediaStageMaxWidthPx ? { maxWidth: `${Math.round(computedMediaStageMaxWidthPx)}px` } : undefined}
          >
            {isImageReview && currentVersion?.imageUrl ? (
              <div
                ref={imageCanvasRef}
                className="relative overflow-hidden rounded-2xl border border-border bg-black"
                onClick={handleImageCanvasClick}
              >
                <Image
                  src={currentVersion.imageUrl}
                  alt={data.title}
                  width={1920}
                  height={1080}
                  className="aspect-video w-full object-contain"
                  draggable={false}
                  unoptimized
                />

                <div className="pointer-events-none absolute inset-0 z-20">
                  {commentThreads.map((thread, index) => {
                    if (thread.root.xPct === null || thread.root.yPct === null) {
                      return null;
                    }

                    return (
                      <button
                        key={thread.root.id}
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          focusCommentThread(thread, { scrollSidebar: true });
                        }}
                        title={`Comment #${index + 1}`}
                        className="pointer-events-auto absolute grid h-6 w-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-black/60 text-[10px] font-semibold text-black transition hover:scale-110"
                        style={{
                          left: `${thread.root.xPct}%`,
                          top: `${thread.root.yPct}%`,
                          backgroundColor: selectedCommentId === thread.root.id ? "#5eead4" : "#f59e0b"
                        }}
                      >
                        {initialsFromName(thread.root.authorName).slice(0, 2)}
                      </button>
                    );
                  })}

                  {allowComment && composerPin ? (
                    <div
                      className="absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-primary/60 shadow-[0_0_0_4px_hsl(var(--primary)/0.18)]"
                      style={{
                        left: `${composerPin.xPct}%`,
                        top: `${composerPin.yPct}%`
                      }}
                    />
                  ) : null}
                </div>
              </div>
            ) : currentVersion?.playbackUrl ? (
              <>
                <div className="relative overflow-hidden rounded-2xl border border-border bg-black">
                  <video
                    key={currentVersion?.id ?? "version"}
                    ref={videoRef}
                    className="aspect-video w-full cursor-pointer bg-black"
                    onClick={togglePlayback}
                    playsInline
                    preload="auto"
                    poster={currentVersion?.thumbnailUrl ?? undefined}
                  />
                  {!isPlaying ? (
                    <button
                      onClick={togglePlayback}
                      className="absolute left-1/2 top-1/2 grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white/95 text-[var(--ink)] shadow-2xl transition hover:scale-105"
                    >
                      <Play className="ml-1 h-7 w-7 fill-current" />
                    </button>
                  ) : null}
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
                </div>

                <div ref={mediaControlsRef} className="mt-3 rounded-2xl border border-border bg-card/90 p-3">
                  <div className="relative mb-3 h-6">
                    <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-[var(--ink)]" />

                    <div className="pointer-events-none absolute inset-0 z-20">
                      {commentThreads.map((thread, index) => {
                        const left = `${Math.max(0, Math.min(100, (thread.root.timeSeconds / Math.max(timelineDuration, 1)) * 100))}%`;
                        return (
                          <button
                            key={thread.root.id}
                            onClick={() => focusCommentThread(thread, { scrollSidebar: true })}
                            title={`Comment #${index + 1}`}
                            className="pointer-events-auto absolute top-1/2 grid h-5 w-5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-black/60 text-[10px] font-semibold text-white transition hover:scale-110"
                            style={{
                              left,
                              backgroundColor:
                                selectedCommentId === thread.root.id
                                  ? "var(--brand-green)"
                                  : thread.root.resolvedAt !== null
                                    ? "var(--brand-amber)"
                                    : "var(--brand-red)",
                              color:
                                selectedCommentId === thread.root.id ? "#000" : "#fff"
                            }}
                          >
                            {initialsFromName(thread.root.authorName).slice(0, 2)}
                          </button>
                        );
                      })}
                    </div>

                    <div
                      className="pointer-events-none absolute left-0 top-1/2 z-30 h-2 -translate-y-1/2 rounded-full bg-[var(--brand-green)] transition-all"
                      style={{ width: `${Math.max(0, Math.min(100, (currentTime / Math.max(timelineDuration, 1)) * 100))}%` }}
                    />

                    <input
                      type="range"
                      min={0}
                      max={timelineDuration}
                      step={0.01}
                      value={Math.min(currentTime, timelineDuration)}
                      onChange={(event) => seekTo(Number(event.target.value))}
                      className="frame-range absolute inset-0 z-10 h-full w-full appearance-none bg-transparent"
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={togglePlayback}>
                        {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      </Button>
                      <label className="relative inline-flex">
                        <select
                          value={playbackRate}
                          onChange={(event) => setPlaybackRate(Number(event.target.value))}
                          className="h-8 appearance-none rounded-md border border-border bg-muted px-2.5 pr-7 text-xs text-foreground"
                        >
                          {[0.5, 1, 1.25, 1.5, 2].map((rate) => (
                            <option key={rate} value={rate}>
                              {rate.toFixed(rate % 1 === 0 ? 1 : 2)}x
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                      </label>
                      <Select value={quality} onValueChange={(v) => setQuality(v as typeof quality)}>
                        <SelectTrigger className="h-8 w-[132px] rounded-md text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent side="top">
                          {qualityOptions.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="flex items-center gap-1">
                        {volume === 0 ? <VolumeX className="h-4 w-4 text-muted-foreground" /> : <Volume2 className="h-4 w-4 text-muted-foreground" />}
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.01}
                          value={volume}
                          onChange={(event) => setVolume(Number(event.target.value))}
                          className="frame-range h-4 w-20 appearance-none bg-transparent"
                        />
                      </div>
                    </div>
                    <div className="rounded-md border border-border bg-muted px-2 py-1 font-mono text-sm text-foreground">
                      {formatTimecode(currentTime)} / {formatTimecode(timelineDuration)}
                    </div>
                    <div className="inline-flex items-center gap-1 rounded-md border border-border bg-muted px-2 py-1 text-xs text-muted-foreground">
                      <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />
                      {commentCount} comments
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="grid h-[58vh] min-h-[340px] place-items-center rounded-2xl border border-dashed border-border bg-muted text-sm text-muted-foreground">
                {isImageReview ? "Image preview is not available yet." : "Video is still processing."}
              </div>
            )}
          </div>

        </div>
      </section>

      <div className="relative hidden xl:flex xl:items-stretch xl:justify-center">
        <button
          type="button"
          onPointerDown={startSidebarResize}
          onDoubleClick={() => setManualSidebarWidthPx(null)}
          aria-label="Resize comments panel"
          title="Drag to resize comments panel"
          className={cn(
            "group relative h-full w-full cursor-col-resize touch-none bg-transparent outline-none",
            isResizingSidebar ? "bg-primary/5" : ""
          )}
        >
          <span
            className={cn(
              "pointer-events-none absolute left-1/2 top-2 bottom-2 w-px -translate-x-1/2 rounded-full bg-border transition",
              isResizingSidebar ? "bg-primary shadow-[0_0_0_1px_hsl(var(--primary)/0.25)]" : "group-hover:bg-muted-foreground"
            )}
          />
          <span
            className={cn(
              "pointer-events-none absolute left-1/2 top-1/2 h-12 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full transition",
              isResizingSidebar ? "bg-primary/70" : "bg-secondary group-hover:bg-muted-foreground"
            )}
          />
        </button>
      </div>

      <aside
        className={cn(
          "flex min-h-[620px] flex-col overflow-hidden rounded-2xl border border-border bg-card/95 xl:ml-2 xl:min-h-0 xl:max-h-none",
          reviewPaneMaxHeightClass
        )}
      >
        <div className="border-b border-border">
          <div className="grid grid-cols-2">
            <button
              onClick={() => setCommentsTab("COMMENTS")}
              className={`relative h-11 px-3 text-[13px] font-semibold transition ${
                commentsTab === "COMMENTS"
                  ? "text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-[var(--brand-green)]"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Comments · {commentThreads.length}
            </button>
            <button
              onClick={() => setCommentsTab("REVIEW")}
              className={`relative h-11 px-3 text-[13px] font-semibold transition ${
                commentsTab === "REVIEW"
                  ? "text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-[var(--brand-green)]"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Review · {visibleReviewThreads.length}
            </button>
          </div>
          <div className="p-3 pt-3">

          <div className="mt-3 flex items-center justify-between">
            <div className="inline-flex items-center gap-1 text-base font-medium text-foreground">
              <span>All comments</span>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="flex items-center gap-1 text-muted-foreground">
              <button
                onClick={() => setFilterMode("ALL")}
                title="All"
                className={`rounded-md p-1.5 transition ${filterMode === "ALL" ? "bg-secondary text-foreground" : "hover:text-foreground"}`}
              >
                <ListFilter className="h-4 w-4" />
              </button>
              <button
                onClick={() => setFilterMode("OPEN")}
                title="Open"
                className={`rounded-md p-1.5 transition ${filterMode === "OPEN" ? "bg-secondary text-foreground" : "hover:text-foreground"}`}
              >
                <Clock3 className="h-4 w-4" />
              </button>
              <button
                onClick={() => setFilterMode("RESOLVED")}
                title="Resolved"
                className={`rounded-md p-1.5 transition ${filterMode === "RESOLVED" ? "bg-secondary text-foreground" : "hover:text-foreground"}`}
              >
                <CheckCircle2 className="h-4 w-4" />
              </button>
              <button title="Search" className="rounded-md p-1.5 transition hover:text-foreground">
                <Search className="h-4 w-4" />
              </button>
              <div ref={commentsMenuRef} className="relative">
                <button
                  title="More"
                  onClick={() => setCommentsMenuOpen((open) => !open)}
                  className={`rounded-md p-1.5 transition ${commentsMenuOpen ? "bg-secondary text-foreground" : "hover:text-foreground"}`}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
                {commentsMenuOpen ? (
                  <div className="absolute right-0 top-9 z-40 min-w-[220px] rounded-lg border border-border bg-popover p-1 shadow-2xl">
                    <button
                      type="button"
                      disabled={!canImportComments || importingComments}
                      onClick={() => {
                        setCommentsMenuOpen(false);
                        importFileInputRef.current?.click();
                      }}
                      className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm text-foreground transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span>{importingComments ? "Importing comments..." : "Import comments (CSV)"}</span>
                      <span className="font-mono text-[11px] text-muted-foreground">.csv</span>
                    </button>
                  </div>
                ) : null}
              </div>
              <input
                ref={importFileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) {
                    return;
                  }
                  void importCommentsFromFile(file);
                }}
              />
            </div>
          </div>
          </div>
        </div>

        {commentsTab === "REVIEW" ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 space-y-3 overflow-y-auto p-3">
              {visibleReviewThreads.length === 0 ? (
                <div className="rounded-xl border border-border bg-muted/80 p-4 text-sm text-muted-foreground">No review comments yet.</div>
              ) : (
                visibleReviewThreads.map((thread, index) => {
                  const initials = initialsFromName(thread.root.authorName);
                  const ageLabel = ageLabelFromDate(thread.root.createdAt, nowMs);

                  return (
                    <article
                      key={thread.root.id}
                      className="cursor-default rounded-2xl border border-border bg-muted/85 p-2.5 transition"
                    >
                      <div className="flex items-start gap-2">
                        <div className={cn(
                          "grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold",
                          avatarToneForName(thread.root.authorName)
                        )}>
                          {initials}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <p className="truncate font-semibold text-foreground">{thread.root.authorName}</p>
                            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                              <span>{ageLabel}</span>
                              <span>#{index + 1}</span>
                            </div>
                          </div>
                          <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{thread.root.body}</p>
                        </div>
                      </div>
                      {thread.replies.length > 0 && (
                        <div className="ml-10 mt-2 space-y-2 border-l border-border pl-3">
                          {thread.replies.map((reply) => (
                            <div key={reply.id} className="text-sm">
                              <span className="font-semibold text-foreground">{reply.authorName}</span>
                              <span className="ml-2 text-[11px] text-muted-foreground">{ageLabelFromDate(reply.createdAt, nowMs)}</span>
                              <p className="mt-0.5 whitespace-pre-wrap text-foreground">{reply.body}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </article>
                  );
                })
              )}
            </div>

            <div className="border-t border-border bg-card p-3">
              {!allowComment ? (
                <p className="text-sm text-muted-foreground">
                  {isGuest ? "This link is view-only." : "Associate review closes after Stage 1."}
                </p>
              ) : (
                <>
                  <Textarea
                    value={reviewComposerBody}
                    onChange={(event) => setReviewComposerBody(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
                        return;
                      }
                      event.preventDefault();
                      if (!submittingReviewComment && reviewComposerBody.trim()) {
                        void submitReviewComment();
                      }
                    }}
                    placeholder="Leave a general review comment..."
                    className="min-h-[56px]"
                  />
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">General feedback about this video.</p>
                    <Button
                      className="h-9 gap-1 px-3"
                      onClick={submitReviewComment}
                      disabled={submittingReviewComment || !reviewComposerBody.trim()}
                    >
                      <Send className="h-4 w-4" />
                      Send
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 space-y-3 overflow-y-auto p-3">
              {visibleThreads.length === 0 ? (
                <div className="rounded-xl border border-border bg-muted/80 p-4 text-sm text-muted-foreground">No comments yet.</div>
              ) : (
                visibleThreads.map((thread, index) => {
                  const isSelected = selectedCommentId === thread.root.id;
                  const initials = initialsFromName(thread.root.authorName);
                  const ageLabel = ageLabelFromDate(thread.root.createdAt, nowMs);

                  return (
                    <article
                      key={thread.root.id}
                      ref={(node) => {
                        commentCardRefs.current[thread.root.id] = node;
                      }}
                      onClick={() => focusCommentThread(thread)}
                      className={`cursor-pointer rounded-2xl border p-2.5 transition ${
                        isSelected
                          ? "border-primary/70 bg-secondary"
                          : sidebarHighlightedCommentId === thread.root.id
                            ? "border-primary bg-secondary/95 shadow-[0_0_0_1px_hsl(var(--primary)/0.45)]"
                            : "border-border bg-muted/85"
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <div className={cn(
                          "grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold",
                          avatarToneForName(thread.root.authorName)
                        )}>
                          {initials}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <p className="truncate font-semibold text-foreground">{thread.root.authorName}</p>
                            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                              <span>{ageLabel}</span>
                              <span>#{index + 1}</span>
                            </div>
                          </div>
                          {editingCommentId === thread.root.id ? (
                            <div
                              className="mt-1 flex flex-col gap-2"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <Textarea
                                value={editDraft}
                                onChange={(event) => setEditDraft(event.target.value)}
                                className="min-h-[60px] text-sm"
                                autoFocus
                              />
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  onClick={() => saveEditComment(thread.root.id)}
                                  disabled={savingEditCommentId === thread.root.id || !editDraft.trim()}
                                >
                                  {savingEditCommentId === thread.root.id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    "Save"
                                  )}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={cancelEditingComment}
                                  disabled={savingEditCommentId === thread.root.id}
                                >
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <p className="mt-1 text-sm leading-relaxed text-foreground">{thread.root.body}</p>
                          )}
                        </div>
                      </div>

                      <div className="mt-2 flex items-center justify-between gap-2">
                        <div className="inline-flex items-center gap-2">
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              focusCommentThread(thread);
                            }}
                            className="inline-flex rounded-md bg-amber-500/20 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-amber-300 transition hover:bg-amber-500/30"
                          >
                            {isImageReview
                              ? formatPinLabel(thread.root.xPct, thread.root.yPct)
                              : formatFrameAccurateTimecode(thread.root.timeSeconds, thread.root.frameNumber, DEFAULT_REVIEW_FPS)}
                          </button>
                          {allowComment ? (
                            <button
                              onClick={(event) => {
                                event.stopPropagation();
                                setReplyingTo((current) => (current === thread.root.id ? null : thread.root.id));
                              }}
                              className="inline-flex items-center gap-1 text-xs text-muted-foreground transition hover:text-foreground"
                            >
                              <MessageCircleReply className="h-3.5 w-3.5" />
                              Reply
                            </button>
                          ) : null}
                        </div>

                        {allowComment && !isGuest ? (
                          <div className="flex items-center gap-1">
                            {data.currentUserId && thread.root.authorId === data.currentUserId && editingCommentId !== thread.root.id ? (
                              <button
                                type="button"
                                aria-label="Edit comment"
                                title="Edit comment"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  startEditingComment(thread.root.id, thread.root.body);
                                }}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                            ) : null}
                            <button
                              type="button"
                              aria-label="Delete comment"
                              title="Delete comment"
                              onClick={(event) => {
                                event.stopPropagation();
                                void deleteComment(thread.root.id);
                              }}
                              disabled={deletingCommentId === thread.root.id}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-destructive transition hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : null}
                      </div>

                      {thread.replies.length > 0 ? (
                        <div className="mt-2 space-y-1.5 border-t border-border pt-2">
                          {thread.replies.map((reply) => (
                            <div key={reply.id} className="group rounded-lg bg-background px-2 py-1.5 text-xs text-foreground">
                              {editingCommentId === reply.id ? (
                                <div
                                  className="flex flex-col gap-2"
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  <Textarea
                                    value={editDraft}
                                    onChange={(event) => setEditDraft(event.target.value)}
                                    className="min-h-[50px] text-xs"
                                    autoFocus
                                  />
                                  <div className="flex gap-2">
                                    <Button
                                      size="sm"
                                      className="h-6 px-2 text-xs"
                                      onClick={() => saveEditComment(reply.id)}
                                      disabled={savingEditCommentId === reply.id || !editDraft.trim()}
                                    >
                                      {savingEditCommentId === reply.id ? (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                      ) : (
                                        "Save"
                                      )}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-6 px-2 text-xs"
                                      onClick={cancelEditingComment}
                                      disabled={savingEditCommentId === reply.id}
                                    >
                                      Cancel
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <span className="font-semibold text-foreground">{reply.authorName}:</span> {reply.body}
                                  </div>
                                  {data.currentUserId && reply.authorId === data.currentUserId && !isGuest ? (
                                    <button
                                      type="button"
                                      aria-label="Edit reply"
                                      title="Edit reply"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        startEditingComment(reply.id, reply.body);
                                      }}
                                      className="shrink-0 opacity-0 group-hover:opacity-100 inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition hover:bg-muted hover:text-foreground"
                                    >
                                      <Pencil className="h-3 w-3" />
                                    </button>
                                  ) : null}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : null}

                      {allowComment ? (
                        <div className="mt-2 border-t border-border pt-2">
                          {replyingTo === thread.root.id ? (
                            <div
                              className="mt-2 flex gap-2"
                              onClick={(event) => {
                                event.stopPropagation();
                              }}
                            >
                              <Input
                                value={replyDrafts[thread.root.id] ?? ""}
                                onChange={(event) =>
                                  setReplyDrafts((drafts) => ({
                                    ...drafts,
                                    [thread.root.id]: event.target.value
                                  }))
                                }
                                placeholder="Write a reply"
                                className="h-8"
                              />
                              <Button
                                size="sm"
                                onClick={() => submitReply(thread.root.id)}
                                disabled={submittingReplyFor === thread.root.id || !(replyDrafts[thread.root.id] ?? "").trim()}
                              >
                                Send
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </article>
                  );
                })
              )}
            </div>

            <div className="border-t border-border bg-card p-3">
              {!allowComment ? (
                <p className="text-sm text-muted-foreground">
                  {isGuest ? "This link is view-only." : "Associate review closes after Stage 1."}
                </p>
              ) : (
                <>
                  <div className="mb-2 flex items-center gap-2">
                    {isImageReview ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-primary/20 px-2 py-1 text-sm font-semibold text-foreground">
                        <MapPin className="h-3.5 w-3.5" />
                        {composerPin ? formatPinLabel(composerPin.xPct, composerPin.yPct) : "Click image to place a pin"}
                      </span>
                    ) : (
                      <span className="rounded-md border border-[var(--brand-green)]/30 bg-[var(--brand-green)]/15 px-2 py-1 font-mono-broadcast text-xs font-semibold text-[var(--brand-green)]">
                        @ {formatFrameAccurateTimecode(composerTimeSeconds, undefined, DEFAULT_REVIEW_FPS)}
                      </span>
                    )}
                  </div>
                  <Textarea
                    value={composerBody}
                    onChange={(event) => setComposerBody(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
                        return;
                      }

                      event.preventDefault();

                      if (!submittingComment && composerBody.trim() && (!isImageReview || composerPin)) {
                        void submitComment();
                      }
                    }}
                    placeholder="Drop a comment at this timestamp…"
                    className="min-h-[60px] border-[var(--brand-green)]/60 focus-visible:border-[var(--brand-green)] focus-visible:ring-2 focus-visible:ring-[rgb(0,199,44,0.3)]"
                  />
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">
                      {isImageReview
                        ? "Pin a point on the image, then press send to add your comment."
                        : "Press send to add this comment to the timeline."}
                    </p>
                    <Button
                      className="h-9 gap-1 px-3"
                      onClick={submitComment}
                      disabled={submittingComment || !composerBody.trim() || (isImageReview && !composerPin)}
                    >
                      <Send className="h-4 w-4" />
                      Send
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </aside>
      <ApproveFeedbackDialog
        open={approveFeedbackOpen}
        saving={statusUpdating}
        onOpenChange={setApproveFeedbackOpen}
        onConfirm={(feedback) => void approvePackageCut(feedback)}
      />
      <Dialog open={airedDialogOpen} onOpenChange={setAiredDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Mark as Aired</DialogTitle>
            <DialogDescription>Pick the date this video aired.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label htmlFor="aired-date" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Air date
            </label>
            <Input
              id="aired-date"
              type="date"
              value={airedDateInput}
              onChange={(event) => setAiredDateInput(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAiredDialogOpen(false)} disabled={statusUpdating}>
              Cancel
            </Button>
            <Button onClick={submitAiredDate} disabled={!airedDateInput || statusUpdating}>
              Mark as Aired
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
