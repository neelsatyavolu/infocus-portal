"use client";

import Image from "next/image";
import { BrandWordmark } from "@/components/brand-wordmark";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore, useTransition } from "react";
import type { MouseEvent } from "react";
import type { PlatformRole } from "@prisma/client";
import {
  Briefcase,
  LayoutDashboard,
  CalendarDays,
  Cloud,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Ellipsis,
  FileVideo2,
  Folder,
  Grid3X3,
  GitBranch,
  ListChecks,
  Users,
  UsersRound,
  Layers,
  Lightbulb,
  Link2,
  List,
  ScrollText,
  Hourglass,
  Info,
  KeyRound,
  Megaphone,
  Mic2,
  LogOut,
  Menu,
  Plus,
  Edit3,
  CheckSquare,
  Radio,
  Film,
  Clapperboard,
  Search,
  Settings,
  Shield,
  Trash2,
  X
} from "lucide-react";
import { AssistantChat } from "@/components/assistant-chat";
import { DashboardWorkspaceSelector } from "@/components/dashboard-workspace-selector";
import { ViewAsMenu } from "@/components/view-as-menu";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  PROJECT_SHELL_STATE_EVENT,
  PROJECT_SHELL_STATE_SCRIPT_ID,
  type ProjectShellAsset,
  type ProjectShellData,
  type ProjectShellFolder
} from "@/src/lib/project-shell";
import { StageStatusChip } from "@/components/package-cycle/stage-status-chip";
import {
  buildGroupsBreadcrumbs,
  publishedGroupTopicForRow,
  formatSegmentLabel,
  getGroupBreadcrumbTopic,
  subscribeGroupBreadcrumbTopic
} from "@/src/lib/app-breadcrumbs";
import { STAGE_FEEDBACK_READ_EVENT, type StageCommentUnread } from "@/src/lib/package-stage-comments";
import { EXTENSION_REQUESTS_CHANGED_EVENT } from "@/src/lib/package-extensions";
import { executiveWaitPill } from "@/src/lib/package-approval";
import type { CycleStageStatus } from "@/src/lib/package-stage-status";
import { folderDisplayName, folderPathSegments } from "@/src/lib/project-folders";
import { cn } from "@/src/lib/utils";

function hasRole(role: PlatformRole | null, minimum: PlatformRole) {
  if (!role) {
    return false;
  }

  const weight: Record<PlatformRole, number> = {
    ASSOCIATE_PRODUCER: 1,
    ADVISER: 2,
    EXECUTIVE_PRODUCER: 2,
    SUPER_ADMIN: 3
  };

  return weight[role] >= weight[minimum];
}

type AppShellProps = {
  children: React.ReactNode;
  platformRole: PlatformRole | null;
  currentUser: {
    name: string | null;
    email: string | null;
    imageUrl: string | null;
  };
  canViewAs?: boolean;
  viewingAs?: boolean;
};

type ProjectShareLinkItem = {
  id: string;
  token: string;
  permission: "VIEW" | "COMMENT";
  revokedAt: string | null;
};

const ONE_TB_BYTES = 1_000_000_000_000;

function formatStorage(bytes: number) {
  if (bytes >= 1_000_000_000_000) {
    return `${(bytes / 1_000_000_000_000).toFixed(2)} TB`;
  }

  if (bytes >= 1_000_000_000) {
    return `${(bytes / 1_000_000_000).toFixed(2)} GB`;
  }

  if (bytes >= 1_000_000) {
    return `${(bytes / 1_000_000).toFixed(2)} MB`;
  }

  return `${Math.round(bytes / 1_000)} KB`;
}

type BreadcrumbItem = {
  label: string;
  href?: string;
};

function getInitials(name: string | null, email: string | null) {
  const source = (name?.trim() || email?.split("@")[0] || "").trim();
  if (!source) {
    return "IF";
  }

  return source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

type SideNavIcon = (props: { className?: string }) => React.ReactNode;

function NavUnread({ count, onBrand = false }: { count?: number; onBrand?: boolean }) {
  if (!count || count < 1) return null;
  return (
    <span
      className={cn(
        "ml-auto rounded-md px-1.5 py-0.5 text-[10px] font-semibold leading-none",
        onBrand
          ? "bg-[var(--on-brand)] text-[var(--brand-fill)]"
          : "bg-[var(--brand-fill)] text-[var(--on-brand)]"
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

function SideNavLink({
  href,
  icon: Icon,
  label,
  active,
  external = false,
  newTab = false,
  disabled = false,
  unread,
  status,
  statusLabel
}: {
  href: string;
  icon: SideNavIcon;
  label: string;
  active: boolean;
  external?: boolean;
  /** When external, open in a new tab (default false — same-window app switch). */
  newTab?: boolean;
  disabled?: boolean;
  unread?: number;
  status?: CycleStageStatus;
  statusLabel?: string;
}) {
  const className = cn(
    "flex items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-[13px] font-medium transition lg:py-2",
    disabled && "cursor-not-allowed opacity-40 hover:bg-transparent hover:text-muted-foreground",
    !disabled && active
      ? "rounded-none rounded-tr-[14px] bg-[var(--brand-fill)] text-[var(--on-brand)]"
      : !disabled && "text-muted-foreground hover:bg-card hover:text-foreground"
  );
  const trailing = (
    <>
      {status ? <StageStatusChip status={status} size="sm" label={statusLabel} /> : null}
      <NavUnread count={unread} onBrand={!disabled && active} />
    </>
  );

  if (disabled) {
    return (
      <span className={className} aria-disabled="true">
        <Icon className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {trailing}
      </span>
    );
  }

  if (external) {
    return (
      <a
        href={href}
        className={className}
        {...(newTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {trailing}
      </a>
    );
  }

  return (
    <Link href={href as never} className={className}>
      <Icon className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {trailing}
    </Link>
  );
}

function SideSection({ label }: { label: string }) {
  return (
    <div className="mt-[0.675rem] px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--ink-5)]">
      {label}
    </div>
  );
}

function readProjectShellStateFromDom(expectedProjectId: string) {
  const element = document.getElementById(PROJECT_SHELL_STATE_SCRIPT_ID);
  if (!(element instanceof HTMLScriptElement) || !element.textContent) {
    return null;
  }

  try {
    const parsed = JSON.parse(element.textContent) as ProjectShellData;
    return parsed.projectId === expectedProjectId ? parsed : null;
  } catch {
    return null;
  }
}

export function AppShell({ children, platformRole, currentUser, canViewAs = false, viewingAs = false }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();
  const workspaceIdQuery = searchParams.get("workspaceId");
  const segments = pathname.split("/").filter(Boolean);
  const isProjectRoute = segments[0] === "projects";
  const isDashboardRoute = segments[0] === "dashboard";
  const isReviewRoute = isProjectRoute && segments[2] === "review";
  const isBareReview = isReviewRoute && searchParams.get("bare") === "1";
  const isClassBoard = pathname === "/class-board";
  const hideChrome = isBareReview || isClassBoard;
  const isProjectAssetsRoute = isProjectRoute && !isReviewRoute;
  const projectId = isProjectRoute ? segments[1] : null;
  const mediaId = isReviewRoute ? segments[3] : null;

  const [workspaceName, setWorkspaceName] = useState<string | null>(null);
  const [workspaceIdState, setWorkspaceIdState] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<string | null>(null);
  const [projectAssetCount, setProjectAssetCount] = useState(0);
  const [projectFolders, setProjectFolders] = useState<ProjectShellFolder[]>([]);
  const [currentAsset, setCurrentAsset] = useState<ProjectShellAsset | null>(null);
  const [canViewShareLinks, setCanViewShareLinks] = useState(false);
  const [assetsOpen, setAssetsOpen] = useState(true);
  const [assetTreeOpen, setAssetTreeOpen] = useState(true);
  const [shareLinksOpen, setShareLinksOpen] = useState(false);
  const [projectShareLinks, setProjectShareLinks] = useState<ProjectShareLinkItem[]>([]);
  const [estimatedStorageBytes, setEstimatedStorageBytes] = useState(0);
  const [storageIsEstimated, setStorageIsEstimated] = useState(true);
  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [folderNameInput, setFolderNameInput] = useState("");
  const [folderCreating, setFolderCreating] = useState(false);
  const [shellMessage, setShellMessage] = useState<string | null>(null);
  const [breadcrumbPending, startBreadcrumbTransition] = useTransition();
  const groupBreadcrumb = useSyncExternalStore(
    subscribeGroupBreadcrumbTopic,
    getGroupBreadcrumbTopic,
    () => null
  );

  const canManageWorkspaces = hasRole(platformRole, "ASSOCIATE_PRODUCER");
  const isProducer = canManageWorkspaces;
  const isAssociate = platformRole === "ASSOCIATE_PRODUCER";
  const [onStudentPackage, setOnStudentPackage] = useState(false);
  const [cycleNav, setCycleNav] = useState<{
    "a-roll": boolean;
    "initial-cut": boolean;
    "final-cut": boolean;
  } | null>(null);
  const [cycleStatuses, setCycleStatuses] = useState<Record<
    "brainstorming" | "a-roll" | "initial-cut" | "final-cut",
    CycleStageStatus
  > | null>(null);
  const [feedbackUnread, setFeedbackUnread] = useState<StageCommentUnread | null>(null);
  const [remainingExecutiveSignoffs, setRemainingExecutiveSignoffs] = useState<number | null>(null);
  const [extensionRequestsAwaiting, setExtensionRequestsAwaiting] = useState(0);
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    void fetch("/api/slack/sync", { method: "POST", cache: "no-store" }).catch(() => {
      /* Slack catch-up is best-effort */
    });
  }, []);

  useEffect(() => {
    if (isProducer && !isAssociate) return;
    let cancelled = false;
    const loadNav = () => {
      void fetch("/api/package-cycle/stage", { cache: "no-store" })
        .then(async (response) => {
          const body = (await response.json()) as {
            data?: {
              hasRow?: boolean;
              unlocked?: typeof cycleNav;
              statuses?: Record<"brainstorming" | "a-roll" | "initial-cut" | "final-cut", CycleStageStatus>;
              remainingExecutiveSignoffs?: number;
              unread?: StageCommentUnread;
            };
          };
          if (cancelled || !body.data) return;
          setOnStudentPackage(Boolean(body.data.hasRow));
          if (body.data.unlocked) {
            setCycleNav(body.data.unlocked);
          }
          setCycleStatuses(body.data.hasRow && body.data.statuses ? body.data.statuses : null);
          setRemainingExecutiveSignoffs(
            body.data.hasRow && typeof body.data.remainingExecutiveSignoffs === "number"
              ? body.data.remainingExecutiveSignoffs
              : null
          );
          if (body.data.unread) {
            setFeedbackUnread(body.data.unread);
          }
        })
        .catch(() => {
          /* nav stays locked until we know */
        });
    };
    loadNav();
    window.addEventListener(STAGE_FEEDBACK_READ_EVENT, loadNav);
    return () => {
      cancelled = true;
      window.removeEventListener(STAGE_FEEDBACK_READ_EVENT, loadNav);
    };
  }, [isProducer, isAssociate, pathname]);

  useEffect(() => {
    let cancelled = false;
    const loadAwaiting = () => {
      void fetch("/api/extensions/requests/awaiting", { cache: "no-store" })
        .then(async (response) => {
          const body = (await response.json()) as { data?: { count?: number } };
          if (!cancelled && typeof body.data?.count === "number") {
            setExtensionRequestsAwaiting(body.data.count);
          }
        })
        .catch(() => {
          /* badge is best-effort */
        });
    };
    loadAwaiting();
    window.addEventListener(EXTENSION_REQUESTS_CHANGED_EVENT, loadAwaiting);
    return () => {
      cancelled = true;
      window.removeEventListener(EXTENSION_REQUESTS_CHANGED_EVENT, loadAwaiting);
    };
  }, [pathname]);

  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!navOpen) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setNavOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [navOpen]);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const onChange = () => {
      if (media.matches) {
        setNavOpen(false);
      }
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const showCycleTabs = !isProducer || (isAssociate && onStudentPackage);
  const canManageAllowedEmails = hasRole(platformRole, "EXECUTIVE_PRODUCER");
  const canManageGrades = hasRole(platformRole, "EXECUTIVE_PRODUCER");
  const canManageExtensions = hasRole(platformRole, "ASSOCIATE_PRODUCER");
  const currentView = searchParams.get("view") === "list" ? "list" : "grid";
  const canControlLayout = isDashboardRoute || isProjectAssetsRoute;
  const currentScope = searchParams.get("scope") === "deleted" ? "deleted" : "active";
  const currentFolderId = searchParams.get("folderId") ?? "all";
  const currentCollection = searchParams.get("collection") === "videos" ? "videos" : null;
  const currentFolderName =
    isProjectAssetsRoute && currentScope === "active" && currentFolderId !== "all" && currentFolderId !== "root"
      ? projectFolders.find((folder) => folder.id === currentFolderId)?.name ?? null
      : null;

  useEffect(() => {
    function applyProjectShellData(data: ProjectShellData) {
      if (!isProjectRoute || data.projectId !== projectId) {
        return;
      }

      setProjectName(data.projectName);
      setWorkspaceName(data.workspace.name);
      setWorkspaceIdState(data.workspace.id);
      setProjectAssetCount(data.assetCount);
      setProjectFolders(data.folders);
      setCurrentAsset(data.currentAsset);
      setCanViewShareLinks(data.canViewShareLinks);
    }

    function handleProjectShellEvent(event: Event) {
      const detail = (event as CustomEvent<ProjectShellData>).detail;
      if (detail) {
        applyProjectShellData(detail);
      }
    }

    window.addEventListener(PROJECT_SHELL_STATE_EVENT, handleProjectShellEvent as EventListener);

    return () => {
      window.removeEventListener(PROJECT_SHELL_STATE_EVENT, handleProjectShellEvent as EventListener);
    };
  }, [isProjectRoute, projectId]);

  useEffect(() => {
    let active = true;

    async function hydrateNames() {
      if (isDashboardRoute) {
        const response = await fetch("/api/workspaces", { cache: "no-store" });
        const payload = await response.json();
        if (!active || !response.ok) {
          return;
        }

        const allWorkspaces = (payload.data as Array<{ id: string; name: string }>) ?? [];
        const selected = allWorkspaces.find((workspace) => workspace.id === workspaceIdQuery) ?? allWorkspaces[0] ?? null;
        setWorkspaceName(selected?.name ?? null);
        setWorkspaceIdState(selected?.id ?? null);
        setProjectName(null);
        setProjectAssetCount(0);
        setProjectFolders([]);
        setCurrentAsset(null);
        setCanViewShareLinks(false);
        setProjectShareLinks([]);
        setEstimatedStorageBytes(0);
        setStorageIsEstimated(true);
        return;
      }

      if (isProjectRoute && projectId) {
        const domState = readProjectShellStateFromDom(projectId);
        if (domState) {
          setProjectName(domState.projectName);
          setWorkspaceName(domState.workspace.name);
          setWorkspaceIdState(domState.workspace.id);
          setProjectAssetCount(domState.assetCount);
          setProjectFolders(domState.folders);
          setCurrentAsset(domState.currentAsset);
          setCanViewShareLinks(domState.canViewShareLinks);
        } else {
          const response = await fetch(
            mediaId ? `/api/projects/${projectId}/shell?mediaId=${mediaId}` : `/api/projects/${projectId}/shell`
          );

          if (!active) return;

          if (response.ok) {
            const payload = await response.json();
            const data = payload.data as ProjectShellData;
            setProjectName(data.projectName);
            setWorkspaceName(data.workspace.name);
            setWorkspaceIdState(data.workspace.id);
            setProjectAssetCount(data.assetCount);
            setProjectFolders(data.folders);
            setCurrentAsset(data.currentAsset);
            setCanViewShareLinks(data.canViewShareLinks);
          }
        }

        return;
      }

      setWorkspaceName(null);
      setWorkspaceIdState(null);
      setProjectName(null);
      setProjectAssetCount(0);
      setProjectFolders([]);
      setCurrentAsset(null);
      setCanViewShareLinks(false);
      setProjectShareLinks([]);
      setEstimatedStorageBytes(0);
      setStorageIsEstimated(true);
    }

    void hydrateNames();

    return () => {
      active = false;
    };
  }, [isDashboardRoute, isProjectRoute, mediaId, projectId, workspaceIdQuery]);

  useEffect(() => {
    if (!isProjectRoute || !projectId) {
      return;
    }

    let cancelled = false;
    const run = () => {
      void (async () => {
        try {
          const response = await fetch(`/api/projects/${projectId}/storage`);
          if (!response.ok || cancelled) {
            return;
          }

          const payload = await response.json();
          const data = payload.data as {
            totalBytes: number;
            isEstimated: boolean;
          };

          setEstimatedStorageBytes(Math.max(0, Number(data.totalBytes) || 0));
          setStorageIsEstimated(Boolean(data.isEstimated));
        } catch {
          if (!cancelled) {
            setEstimatedStorageBytes(0);
            setStorageIsEstimated(true);
          }
        }
      })();
    };

    let timeoutId: number | null = null;
    let idleCallbackId: number | null = null;
    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    if (typeof idleWindow.requestIdleCallback === "function") {
      idleCallbackId = idleWindow.requestIdleCallback(run, { timeout: 500 });
    } else {
      timeoutId = window.setTimeout(run, 150);
    }

    return () => {
      cancelled = true;
      if (typeof idleWindow.cancelIdleCallback === "function" && idleCallbackId !== null) {
        idleWindow.cancelIdleCallback(idleCallbackId);
      }
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [isProjectRoute, projectId]);

  useEffect(() => {
    if (!shareLinksOpen || !isProjectRoute || !projectId || !canViewShareLinks) {
      return;
    }

    let active = true;

    void (async () => {
      try {
        const response = await fetch(`/api/projects/${projectId}/guest-links`, { cache: "no-store" });
        if (!response.ok || !active) {
          return;
        }

        const payload = await response.json();
        setProjectShareLinks((payload.data as ProjectShareLinkItem[]) ?? []);
      } catch {
        if (active) {
          setProjectShareLinks([]);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [canViewShareLinks, isProjectRoute, projectId, shareLinksOpen]);

  useEffect(() => {
    if (!isProjectRoute || !projectId) {
      return;
    }

    const hrefs = [
      `/projects/${projectId}?scope=active&folderId=all`,
      `/projects/${projectId}?scope=active&folderId=all&collection=videos`,
      ...projectFolders.slice(0, 12).map((folder) => `/projects/${projectId}?scope=active&folderId=${folder.id}`)
    ];

    for (const href of hrefs) {
      router.prefetch(href as never);
    }
  }, [isProjectRoute, projectId, projectFolders, router]);

  async function createFolderFromSidebar() {
    if (!projectId) {
      return;
    }
    setFolderModalOpen(true);
  }

  async function submitFolderFromSidebar() {
    if (!projectId) {
      return;
    }

    const folderName = folderNameInput.trim();
    if (!folderName) {
      return;
    }

    setFolderCreating(true);
    setShellMessage(null);

    try {
      const response = await fetch(`/api/projects/${projectId}/folders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: folderName
        })
      });

      if (!response.ok) {
        setShellMessage("Could not create folder.");
        return;
      }

      const payload = await response.json();
      const created = payload.data as { id: string; name: string };

      setProjectFolders((current) => [
        ...current,
        {
          id: created.id,
          name: created.name,
          activeMediaCount: 0
        }
      ]);
      setFolderModalOpen(false);
      setFolderNameInput("");
      router.refresh();
    } catch {
      setShellMessage("Could not create folder.");
    } finally {
      setFolderCreating(false);
    }
  }

  async function copyShareLink(token: string) {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/g/${token}`);
    } catch {
      setShellMessage("Could not copy share link.");
    }
  }

  const breadcrumbs = useMemo<BreadcrumbItem[]>(() => {
    const groupsCrumbs = buildGroupsBreadcrumbs(
      segments,
      publishedGroupTopicForRow(groupBreadcrumb, segments[1])
    );
    if (groupsCrumbs) {
      return groupsCrumbs;
    }

    if (isDashboardRoute) {
      return [
        {
          label: workspaceName ?? "Workspace",
          href: workspaceIdState ? `/dashboard?workspaceId=${workspaceIdState}` : "/dashboard"
        },
        { label: "Dashboard" }
      ];
    }

    if (isProjectRoute && projectId) {
      const baseCrumbs: BreadcrumbItem[] = [
        {
          label: workspaceName ?? "Workspace",
          href: workspaceIdState ? `/dashboard?workspaceId=${workspaceIdState}` : "/dashboard"
        },
        {
          label: projectName ?? "Project",
          href: `/projects/${projectId}`
        }
      ];

      if (isReviewRoute && currentAsset?.folderName) {
        const folderCrumbs = folderPathSegments(currentAsset.folderName).map((segment, index, parts) => {
          const path = parts.slice(0, index + 1).join("/");
          const folder = projectFolders.find((entry) => entry.name === path);
          return {
            label: segment,
            href: folder ? `/projects/${projectId}?scope=active&folderId=${folder.id}` : undefined
          };
        });
        baseCrumbs.push(...folderCrumbs);
      }

      baseCrumbs.push({
        label: isReviewRoute ? currentAsset?.title ?? "Asset" : "Assets",
        href: isReviewRoute ? `/projects/${projectId}/review/${mediaId}` : `/projects/${projectId}`
      });

      if (!isReviewRoute && currentFolderName) {
        const folderCrumbs = folderPathSegments(currentFolderName).map((segment, index, parts) => {
          const path = parts.slice(0, index + 1).join("/");
          const folder = projectFolders.find((entry) => entry.name === path);
          return {
            label: segment,
            href: index === parts.length - 1 ? undefined : folder ? `/projects/${projectId}?scope=active&folderId=${folder.id}` : undefined
          };
        });
        baseCrumbs.push(...folderCrumbs);
      }

      return baseCrumbs;
    }

    if (segments.length === 0) {
      return [{ label: "Dashboard" }];
    }

    return segments.map((segment) => ({
      label: formatSegmentLabel(segment)
    }));
  }, [
    currentAsset?.folderName,
    currentAsset?.title,
    currentFolderName,
    projectFolders,
    groupBreadcrumb,
    isDashboardRoute,
    isProjectRoute,
    isReviewRoute,
    mediaId,
    projectId,
    projectName,
    segments,
    workspaceIdState,
    workspaceName
  ]);

  function updateView(nextView: "grid" | "list") {
    if (!canControlLayout) {
      return;
    }

    const next = new URLSearchParams(searchParams.toString());
    next.set("view", nextView);

    if (isDashboardRoute && !next.has("sort")) {
      next.set("sort", "name");
    }

    router.push(`${pathname}?${next.toString()}` as never);
  }

  function handleBreadcrumbClick(href: string) {
    const currentHref = searchParamsString ? `${pathname}?${searchParamsString}` : pathname;
    if (href === currentHref) {
      return;
    }

    startBreadcrumbTransition(() => {
      router.push(href as never);
    });
  }

  function handleProjectSidebarLinkClick(event: MouseEvent<HTMLAnchorElement>, href: string) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }

    const currentHref = searchParamsString ? `${pathname}?${searchParamsString}` : pathname;
    if (href === currentHref) {
      event.preventDefault();
      return;
    }

    event.preventDefault();
    startBreadcrumbTransition(() => {
      router.push(href as never);
    });
  }

  function buildProjectHref(updates: Record<string, string | null>) {
    if (!projectId) {
      return "/dashboard";
    }

    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null) {
        next.delete(key);
      } else {
        next.set(key, value);
      }
    }

    if (!next.has("scope")) {
      next.set("scope", "active");
    }

    if (!next.has("folderId")) {
      next.set("folderId", "all");
    }

    return `/projects/${projectId}?${next.toString()}`;
  }

  const usedStoragePct = Math.min(100, (estimatedStorageBytes / ONE_TB_BYTES) * 100);
  const activeShareLinks = projectShareLinks.filter((link) => link.revokedAt === null);
  const homeUrl = "/";

  return (
    <div
      className={cn(
        hideChrome ? "h-dvh overflow-hidden" : "min-h-screen lg:h-screen lg:overflow-hidden",
        hideChrome ? "" : "lg:pl-[240px]"
      )}
    >
      {hideChrome ? null : (
      <>
      {navOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-50 bg-black/60 lg:hidden"
          aria-label="Close menu"
          onClick={() => setNavOpen(false)}
        />
      ) : null}
      <aside
        id="app-sidebar"
        className={cn(
          "fixed inset-y-0 left-0 z-[60] flex h-dvh w-[min(240px,85vw)] flex-col gap-3 border-r border-border bg-[var(--ink)] px-3 py-4 pt-[max(1rem,env(safe-area-inset-top))] transition-transform duration-200 ease-out lg:z-40",
          navOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Brand */}
        <div className="flex items-center justify-between gap-2">
          <a
            href={homeUrl}
            className="flex min-w-0 items-center px-2 py-1.5"
            aria-label="InFocus Portal home"
          >
            <BrandWordmark className="h-9 w-auto object-contain" priority />
          </a>
          <button
            type="button"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-card hover:text-foreground lg:hidden"
            onClick={() => setNavOpen(false)}
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Nav */}
        <nav
          className="flex flex-1 flex-col gap-0.5 overflow-y-auto"
          onClick={(event) => {
            if ((event.target as HTMLElement).closest("a")) {
              setNavOpen(false);
            }
          }}
        >
          <SideNavLink
            href={"/announcements" as never}
            icon={Megaphone}
            label="Announcements"
            active={pathname === "/announcements"}
          />
          {isProducer ? (
            <SideNavLink
              href="/dashboard"
              icon={Briefcase}
              label="Packages"
              active={pathname === "/dashboard" || pathname.startsWith("/projects")}
            />
          ) : (
            <SideNavLink
              href="/dashboard"
              icon={LayoutDashboard}
              label="Dashboard"
              active={pathname.startsWith("/dashboard")}
            />
          )}
          {!canManageGrades ? (
            <SideNavLink
              href={"/grades" as never}
              icon={CheckSquare}
              label="Grades"
              active={pathname.startsWith("/grades")}
            />
          ) : null}

          <SideSection label="Production" />
          <SideNavLink
            href={"/master-calendar" as never}
            icon={CalendarDays}
            label="Master Calendar"
            active={pathname.startsWith("/master-calendar")}
          />
          <SideNavLink
            href={"/package-cycles" as never}
            icon={GitBranch}
            label="Package Cycles"
            active={pathname.startsWith("/package-cycles")}
          />
          <SideNavLink
            href="https://drive.infocuspaly.com"
            icon={Cloud}
            label="InFocus Drive"
            active={false}
            external
            newTab
          />
          <SideNavLink
            href="https://teleprompter.infocuspaly.com"
            icon={ScrollText}
            label="Teleprompter"
            active={false}
            external
          />

          {showCycleTabs ? (
            <>
              <SideSection label="The Cycle" />
              <SideNavLink
                href={"/information" as never}
                icon={Info}
                label="Information"
                active={pathname.startsWith("/information")}
              />
              <SideNavLink
                href={"/brainstorming" as never}
                icon={Lightbulb}
                label="Brainstorming"
                active={pathname.startsWith("/brainstorming")}
                unread={feedbackUnread?.brainstorming}
                status={cycleStatuses?.brainstorming}
              />
              <SideNavLink
                href={"/a-roll" as never}
                icon={Film}
                label="A-roll/B-roll"
                active={pathname.startsWith("/a-roll")}
                disabled={!cycleNav?.["a-roll"]}
                unread={feedbackUnread?.["a-roll"]}
                status={cycleStatuses?.["a-roll"]}
              />
              <SideNavLink
                href={"/initial-cut" as never}
                icon={Clapperboard}
                label="Initial Cut"
                active={pathname.startsWith("/initial-cut")}
                disabled={!cycleNav?.["initial-cut"]}
                unread={feedbackUnread?.["initial-cut"]}
                status={cycleStatuses?.["initial-cut"]}
                statusLabel={
                  cycleStatuses?.["initial-cut"] === "stage-3" && remainingExecutiveSignoffs != null
                    ? (executiveWaitPill(remainingExecutiveSignoffs) ?? undefined)
                    : undefined
                }
              />
              <SideNavLink
                href={"/final-cut" as never}
                icon={FileVideo2}
                label="Final Cut"
                active={pathname.startsWith("/final-cut")}
                disabled={!cycleNav?.["final-cut"]}
                unread={feedbackUnread?.["final-cut"]}
                status={cycleStatuses?.["final-cut"]}
              />
            </>
          ) : null}

          <SideSection label="Livestreams" />
          <SideNavLink
            href={"/livestreams" as never}
            icon={Radio}
            label="Livestream Tracker"
            active={pathname.startsWith("/livestreams")}
          />

          <SideSection label="Producers" />
          {canManageWorkspaces ? (
            <SideNavLink
              href={"/groups" as never}
              icon={UsersRound}
              label="Groups"
              active={pathname.startsWith("/groups")}
            />
          ) : null}
          {canManageWorkspaces ? (
            <SideNavLink
              href={"/members" as never}
              icon={Users}
              label="Members"
              active={pathname.startsWith("/members")}
            />
          ) : null}
          {canManageWorkspaces ? (
            <SideNavLink
              href={"/package-progress" as never}
              icon={ListChecks}
              label="Package Cycle"
              active={pathname.startsWith("/package-progress")}
            />
          ) : null}
          {canManageWorkspaces ? (
            <SideNavLink
              href={"/publishing-queue" as never}
              icon={Radio}
              label="Publishing Queue"
              active={pathname.startsWith("/publishing-queue")}
            />
          ) : null}
          {canManageGrades ? (
            <SideNavLink
              href={"/grade-editor" as never}
              icon={Edit3}
              label="Grade Editor"
              active={pathname.startsWith("/grade-editor")}
            />
          ) : null}
          {canManageWorkspaces ? (
            <SideNavLink
              href={"/show-roles" as never}
              icon={Mic2}
              label="The Show"
              active={pathname.startsWith("/show-roles")}
            />
          ) : null}
          {canManageExtensions ? (
            <SideNavLink
              href={"/participation" as never}
              icon={Edit3}
              label="Participation"
              active={pathname.startsWith("/participation")}
            />
          ) : null}
          <SideNavLink
            href={"/extension-requests" as never}
            icon={Hourglass}
            label="Extension Requests"
            active={pathname.startsWith("/extension-requests")}
            unread={extensionRequestsAwaiting}
          />

          <SideSection label="Announcements" />
          <SideNavLink
            href={"/announcements/submitted" as never}
            icon={List}
            label="Submitted"
            active={pathname === "/announcements/submitted"}
          />
          <SideNavLink
            href={"/announcements/pa" as never}
            icon={Mic2}
            label="PA"
            active={pathname === "/announcements/pa"}
          />

          <SideSection label="Admin" />
          {canManageAllowedEmails ? (
            <SideNavLink
              href="/admin"
              icon={Shield}
              label="Admin Dashboard"
              active={pathname.startsWith("/admin")}
            />
          ) : null}
          <SideNavLink
            href="/settings"
            icon={Settings}
            label="Settings"
            active={pathname.startsWith("/settings")}
          />
        </nav>

        {/* Footer */}
        <div className="mt-auto flex items-center gap-2 border-t border-border px-1 pt-3">
          <ViewAsMenu currentUser={currentUser} canViewAs={canViewAs} viewingAs={viewingAs}>
            {currentUser.imageUrl ? (
              <Image
                src={currentUser.imageUrl}
                alt={currentUser.name ?? currentUser.email ?? "Signed-in user"}
                width={28}
                height={28}
                className="h-7 w-7 shrink-0 rounded-full border border-border object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--ink-3)] text-[10px] font-bold text-foreground">
                {getInitials(currentUser.name, currentUser.email)}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-foreground">
                {currentUser.name ?? "InFocus User"}
              </p>
              <p className="truncate text-[10px] text-muted-foreground">
                {viewingAs ? "Viewing as" : currentUser.email ?? "no-email"}
              </p>
            </div>
          </ViewAsMenu>
          {canManageWorkspaces ? (
            <Link
              href={"/passwords" as never}
              onClick={() => setNavOpen(false)}
              className={cn(
                "grid h-7 w-7 place-items-center rounded-md hover:bg-card hover:text-foreground",
                pathname.startsWith("/passwords") ? "bg-card text-foreground" : "text-muted-foreground"
              )}
              title="Passwords"
              aria-label="Passwords"
            >
              <KeyRound className="h-3.5 w-3.5" />
            </Link>
          ) : null}
          <form action="/api/auth/sign-out?returnTo=/" method="post">
            <button
              type="submit"
              className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-card hover:text-foreground"
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </form>
        </div>
      </aside>
      </>
      )}

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
            <DialogDescription>Add a new folder to organize project assets.</DialogDescription>
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
            <Button onClick={() => void submitFolderFromSidebar()} disabled={folderCreating || !folderNameInput.trim()}>
              {folderCreating ? "Creating..." : "Create Folder"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div
        className={cn(
          hideChrome ? "h-full min-h-0 min-w-0" : "min-h-screen min-w-0 lg:h-screen lg:overflow-y-auto",
          isProjectRoute && !isReviewRoute ? "lg:grid lg:grid-cols-[240px_1fr]" : ""
        )}
      >
        {isProjectRoute && !isReviewRoute ? (
          <aside className="hidden border-r border-[var(--ink-2)] bg-background light:bg-card lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
            <div className="flex items-center justify-between border-b border-[var(--ink-2)] px-4 pb-3 pt-4">
              <button
                type="button"
                onClick={() => setAssetTreeOpen((current) => !current)}
                className="text-[20px] font-semibold tracking-tight text-foreground"
              >
                Assets
              </button>
              <button
                type="button"
                onClick={createFolderFromSidebar}
                className="grid h-6 w-6 place-items-center rounded border border-transparent text-muted-foreground transition hover:border-[var(--ink-3)] hover:bg-[var(--ink-2)] hover:text-foreground"
                title="Create folder"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <div className="mb-2 hidden">
                <button
                  type="button"
                  onClick={() => setAssetTreeOpen((current) => !current)}
                >
                  Assets
                  <ChevronLeft className={cn("h-4 w-4 text-muted-foreground transition", assetTreeOpen ? "" : "-rotate-90")} />
                </button>
              </div>

              {assetTreeOpen ? (
                <div className="space-y-1 text-sm">
                  <Link
                    href={buildProjectHref({ scope: "active", folderId: "all", collection: null }) as never}
                    onClick={(event) =>
                      handleProjectSidebarLinkClick(
                        event,
                        buildProjectHref({ scope: "active", folderId: "all", collection: null })
                      )
                    }
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-foreground hover:bg-accent",
                      currentScope === "active" && (currentFolderId === "all" || currentFolderId === "root") ? "bg-accent" : ""
                    )}
                  >
                    <Layers className="h-4 w-4 text-muted-foreground" />
                    <span className="truncate">{projectName ?? "Project"}</span>
                  </Link>

                  {projectFolders.length > 0 ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setAssetsOpen((current) => !current)}
                        className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-muted-foreground hover:bg-accent"
                      >
                        <span className="inline-flex items-center gap-2">
                          <Folder className="h-4 w-4 text-muted-foreground" />
                          Folders
                        </span>
                        <ChevronDown className={cn("h-4 w-4 transition", assetsOpen ? "rotate-180" : "")} />
                      </button>

                      {assetsOpen ? (
                        <div className="space-y-1 pl-4">
                          {[...projectFolders]
                            .sort((left, right) => left.name.localeCompare(right.name))
                            .map((folder) => {
                              const depth = Math.max(0, folderPathSegments(folder.name).length - 1);
                              return (
                            <Link
                              key={folder.id}
                              href={buildProjectHref({ scope: "active", folderId: folder.id, collection: null }) as never}
                              onClick={(event) =>
                                handleProjectSidebarLinkClick(
                                  event,
                                  buildProjectHref({ scope: "active", folderId: folder.id, collection: null })
                                )
                              }
                              className={cn(
                                "flex items-center justify-between rounded-md border px-2 py-1.5 text-[13px] text-muted-foreground transition hover:bg-[var(--ink-2)] hover:text-foreground",
                                currentScope === "active" && currentFolderId === folder.id
                                  ? "border-[rgb(43,179,110,0.25)] bg-[rgb(43,179,110,0.10)] text-foreground"
                                  : "border-transparent"
                              )}
                              style={{ paddingLeft: 8 + depth * 12 }}
                            >
                              <span className="inline-flex items-center gap-2 truncate">
                                <ChevronRight className="h-3 w-3 text-muted-foreground" />
                                <Folder
                                  className={cn(
                                    "h-3.5 w-3.5",
                                    currentScope === "active" && currentFolderId === folder.id
                                      ? "text-[var(--brand-green)]"
                                      : "text-muted-foreground"
                                  )}
                                />
                                {folderDisplayName(folder.name)}
                              </span>
                              <span className="font-mono-broadcast text-[10px] font-medium tabular-nums text-muted-foreground">
                                {folder.activeMediaCount}
                              </span>
                            </Link>
                              );
                            })}
                        </div>
                      ) : null}
                    </>
                  ) : null}

                  <Link
                    href={buildProjectHref({ scope: "deleted", folderId: "all", collection: null }) as never}
                    onClick={(event) =>
                      handleProjectSidebarLinkClick(event, buildProjectHref({ scope: "deleted", folderId: "all", collection: null }))
                    }
                    className={cn(
                      "mt-1 flex items-center gap-3 rounded-md px-2 py-1.5 text-muted-foreground hover:bg-accent",
                      currentScope === "deleted" ? "bg-accent text-foreground" : ""
                    )}
                  >
                    <Trash2 className="h-4 w-4" />
                    Recently Deleted
                  </Link>
                </div>
              ) : null}
            </div>

            <div className="border-t border-border px-3 py-3">
              <div className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Videos</div>
              <Link
                href={buildProjectHref({ collection: "videos", scope: "active", folderId: "all" }) as never}
                onClick={(event) =>
                  handleProjectSidebarLinkClick(
                    event,
                    buildProjectHref({ collection: "videos", scope: "active", folderId: "all" })
                  )
                }
                className={cn(
                  "flex w-full items-center justify-between rounded-md px-2 py-1.5 hover:bg-accent",
                  currentCollection === "videos" ? "bg-accent text-foreground" : "text-muted-foreground"
                )}
              >
                <span className="inline-flex items-center gap-2">
                  <FileVideo2 className={cn("h-4 w-4", currentCollection === "videos" ? "text-foreground" : "text-muted-foreground")} />
                  Videos
                </span>
                <span className="text-xs text-muted-foreground">{projectAssetCount}</span>
              </Link>
            </div>

            <div className="border-t border-border">
              <button
                type="button"
                onClick={() => setShareLinksOpen((current) => !current)}
                className="flex w-full items-center justify-between px-4 py-3 text-left text-foreground hover:bg-accent"
              >
                <span>Share Links</span>
                <div className="flex items-center gap-2">
                  <Ellipsis className="h-4 w-4 text-muted-foreground" />
                  <Plus className="h-4 w-4 text-muted-foreground" />
                  <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition", shareLinksOpen ? "rotate-180" : "")} />
                </div>
              </button>
              {shareLinksOpen ? (
                <div className="space-y-1 px-3 pb-3 text-sm">
                  {activeShareLinks.length === 0 ? (
                    <p className="px-2 py-1 text-xs text-muted-foreground">No active share links</p>
                  ) : (
                    activeShareLinks.slice(0, 4).map((link) => (
                      <button
                        key={link.id}
                        type="button"
                        onClick={() => void copyShareLink(link.token)}
                        className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-muted-foreground hover:bg-accent"
                      >
                        <span className="inline-flex items-center gap-2 truncate">
                          <Link2 className="h-4 w-4 text-muted-foreground" />
                          {link.permission === "COMMENT" ? "Comment link" : "View link"}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              ) : null}
            </div>

            <div className="border-t border-border px-4 py-3">
              <div className="mb-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-2">
                  <Cloud className="h-4 w-4 text-muted-foreground" />
                  Storage
                </span>
                <span className="whitespace-nowrap text-[11px]">{formatStorage(estimatedStorageBytes)} / 1 TB</span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-[var(--ink-2)]">
                <div
                  className="h-full rounded-full bg-[var(--brand-green)] transition-all"
                  style={{ width: `${usedStoragePct}%` }}
                />
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {storageIsEstimated ? "Estimated from encoded durations" : "Synced from Bunny Stream"}
              </p>
            </div>
          </aside>
        ) : null}

        <div className={cn("flex min-w-0 flex-col", hideChrome ? "h-full min-h-0" : "min-h-screen")}>
          {isClassBoard ? null : isBareReview ? (
            <div className="flex items-center gap-2 px-4 pt-3 md:px-6">
              <button
                type="button"
                onClick={() => router.back()}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <ChevronLeft className="h-4 w-4" />
                Back
              </button>
            </div>
          ) : (
          <header className="sticky top-0 z-40 border-b border-border bg-background px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] md:px-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
                <button
                  type="button"
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-foreground hover:bg-accent lg:hidden"
                  onClick={() => setNavOpen(true)}
                  aria-label="Open menu"
                  aria-expanded={navOpen}
                  aria-controls="app-sidebar"
                >
                  <Menu className="h-5 w-5" />
                </button>
                <div className="flex min-w-0 items-center gap-2 overflow-x-auto">
                {breadcrumbs.map((crumb, index) => {
                  const href = crumb.href;
                  return (
                    <div key={`${crumb.label}-${index}`} className="flex items-center gap-2">
                      {href && index < breadcrumbs.length ? (
                        <button
                          type="button"
                          onClick={() => handleBreadcrumbClick(href)}
                          className="rounded-md px-2 py-1 text-muted-foreground hover:text-foreground hover:bg-accent"
                        >
                          {crumb.label}
                        </button>
                      ) : (
                        <span className={index === breadcrumbs.length - 1 ? "font-semibold text-foreground" : ""}>{crumb.label}</span>
                      )}
                      {index < breadcrumbs.length - 1 ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /> : null}
                    </div>
                  );
                })}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <DashboardWorkspaceSelector />

                <label className="hidden items-center gap-2 rounded-lg border border-border bg-muted px-2.5 py-2 text-sm text-muted-foreground md:flex">
                  <Search className="h-4 w-4 text-muted-foreground" />
                  <input
                    placeholder="Search assets, projects, comments..."
                    className="w-64 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                  />
                </label>

                {canControlLayout ? (
                  <div className="inline-flex rounded-lg border border-border bg-muted p-1">
                    <button
                      className={cn(
                        "rounded-md p-2 hover:bg-accent",
                        currentView === "grid" ? "bg-secondary text-foreground" : "text-muted-foreground"
                      )}
                      type="button"
                      onClick={() => updateView("grid")}
                      title="Grid"
                    >
                      <Grid3X3 className="h-4 w-4" />
                    </button>
                    <button
                      className={cn(
                        "rounded-md p-2 hover:bg-accent",
                        currentView === "list" ? "bg-secondary text-foreground" : "text-muted-foreground"
                      )}
                      type="button"
                      onClick={() => updateView("list")}
                      title="List"
                    >
                      <List className="h-4 w-4" />
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
            {breadcrumbPending ? (
              <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-secondary">
                <div className="h-full w-1/3 animate-[loading-bar_1s_ease-in-out_infinite] rounded-full bg-primary" />
              </div>
            ) : null}
            {viewingAs ? (
              <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-amber-300/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-200">
                <p>
                  Viewing as {currentUser.name ?? currentUser.email ?? "another user"}. Click your name at the bottom of
                  the menu to switch or stop.
                </p>
              </div>
            ) : null}
            {shellMessage ? (
              <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-amber-300/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-200">
                <p>{shellMessage}</p>
                <button
                  type="button"
                  onClick={() => setShellMessage(null)}
                  className="rounded-md p-1 text-amber-100 hover:text-foreground hover:bg-accent"
                  aria-label="Dismiss message"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : null}
          </header>
          )}
          {isBareReview && viewingAs ? (
            <div className="mx-4 mt-3 flex items-center justify-between gap-2 rounded-lg border border-amber-300/30 bg-amber-400/10 px-3 py-2 text-sm text-amber-200 md:mx-6">
              <p>Viewing as {currentUser.name ?? currentUser.email ?? "another user"}.</p>
            </div>
          ) : null}

          <main className={cn("min-w-0 flex-1", isClassBoard ? "flex min-h-0 flex-col overflow-hidden" : "p-4 pb-24 md:p-6 lg:pb-6")}>
            {children}
          </main>
        </div>
      </div>
      {!hideChrome ? (
        <AssistantChat
          canMutate={platformRole === "SUPER_ADMIN" || platformRole === "ADVISER"}
          audience={
            platformRole === "SUPER_ADMIN" || platformRole === "ADVISER"
              ? "admin"
              : platformRole === "EXECUTIVE_PRODUCER"
                ? "executive"
                : platformRole === "ASSOCIATE_PRODUCER"
                  ? "associate"
                  : "member"
          }
        />
      ) : null}
    </div>
  );
}
