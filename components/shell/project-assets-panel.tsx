"use client";

import Link from "next/link";
import { useEffect, useId, useState, type ReactNode } from "react";
import { ChevronDown, Cloud, Copy, FileVideo2, Folder, FolderPlus, Layers, Link2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { IconButton } from "@/components/kit/icon-button";
import { useRememberedState } from "@/components/kit/remembered-state";
import { Skeleton } from "@/components/kit/skeleton";
import { folderDisplayName, folderPathSegments } from "@/src/lib/project-folders";
import type { ProjectShellData } from "@/src/lib/project-shell";
import { cn } from "@/src/lib/utils";
import { projectDestinations, type ProjectAssetView, type ProjectDestination } from "@/components/shell/project-nav";
import type { ShellLinkClick } from "@/components/shell/use-shell-link";

const ONE_TB_BYTES = 1_000_000_000_000;
const SHARE_LINKS_SHOWN = 4;

type ProjectShareLinkItem = {
  id: string;
  token: string;
  permission: "VIEW" | "COMMENT";
  revokedAt: string | null;
};

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

export function formatStorage(bytes: number) {
  if (bytes >= 1_000_000_000_000) return `${(bytes / 1_000_000_000_000).toFixed(2)} TB`;
  if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(2)} GB`;
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(2)} MB`;
  return `${Math.round(bytes / 1_000)} KB`;
}

function runWhenIdle(callback: () => void) {
  const idleWindow = window as Window & {
    requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
    cancelIdleCallback?: (handle: number) => void;
  };
  if (typeof idleWindow.requestIdleCallback === "function") {
    const id = idleWindow.requestIdleCallback(callback, { timeout: 500 });
    return () => idleWindow.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(callback, 150);
  return () => window.clearTimeout(id);
}

type ProjectStorage = { state: "loading" } | { state: "failed" } | { state: "ready"; bytes: number; estimated: boolean };

/** Used storage for the project, loaded when the browser is idle. */
function useProjectStorage(projectId: string) {
  const [storage, setStorage] = useState<ProjectStorage>({ state: "loading" });
  useEffect(() => {
    let cancelled = false;
    setStorage({ state: "loading" });
    const cancelIdle = runWhenIdle(() => {
      void (async () => {
        try {
          const response = await fetch(`/api/projects/${projectId}/storage`);
          if (cancelled) return;
          if (!response.ok) {
            console.error(`Project storage failed to load (${response.status})`);
            setStorage({ state: "failed" });
            return;
          }
          const payload = (await response.json()) as { data: { totalBytes: number; isEstimated: boolean } };
          if (cancelled) return;
          setStorage({
            state: "ready",
            bytes: Math.max(0, Number(payload.data.totalBytes) || 0),
            estimated: Boolean(payload.data.isEstimated)
          });
        } catch (error) {
          console.error("Project storage failed to load", error);
          if (!cancelled) setStorage({ state: "failed" });
        }
      })();
    });
    return () => {
      cancelled = true;
      cancelIdle();
    };
  }, [projectId]);
  return storage;
}

/** Active share links, fetched only while the section is open and only for people who may see them. */
function useShareLinks(projectId: string, enabled: boolean) {
  const [links, setLinks] = useState<ProjectShareLinkItem[] | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void (async () => {
      try {
        const response = await fetch(`/api/projects/${projectId}/guest-links`, { cache: "no-store" });
        if (!active) return;
        // A failed load reads as no links, as before, instead of "Loading…" forever.
        if (!response.ok) {
          console.error(`Share links failed to load (${response.status})`);
          setLinks([]);
          return;
        }
        const payload = (await response.json()) as { data?: ProjectShareLinkItem[] };
        if (active) setLinks(payload.data ?? []);
      } catch (error) {
        console.error("Share links failed to load", error);
        if (active) setLinks([]);
      }
    })();
    return () => {
      active = false;
    };
  }, [projectId, enabled]);
  return links?.filter((link) => link.revokedAt === null) ?? null;
}

function AssetRow({
  destination,
  icon: Icon,
  label,
  depth = 0,
  countLoading = false,
  onLinkClick
}: {
  destination: ProjectDestination;
  icon: typeof Folder;
  label: ReactNode;
  depth?: number;
  /** The count isn't known yet: a small placeholder holds its place. */
  countLoading?: boolean;
  onLinkClick: ShellLinkClick;
}) {
  return (
    <li>
      <Link
        href={destination.href as never}
        onClick={(event) => onLinkClick(event, destination.href)}
        aria-current={destination.active ? "page" : undefined}
        style={depth > 0 ? { paddingLeft: `${0.5 + depth * 0.75}rem` } : undefined}
        className={cn(
          "flex h-8 min-w-0 items-center gap-2 rounded-md px-2 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          destination.active
            ? "bg-[var(--brand-green)]/10 font-medium text-foreground"
            : "text-muted-foreground hover:bg-[var(--ink-3)] hover:text-foreground"
        )}
      >
        <Icon className={cn("h-4 w-4 shrink-0", destination.active && "text-[var(--brand-green)]")} aria-hidden />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {destination.count !== null ? (
          <span className="font-mono-broadcast text-[11px] tabular-nums text-muted-foreground">{destination.count}</span>
        ) : countLoading ? (
          <Skeleton className="h-3 w-4 shrink-0" />
        ) : null}
      </Link>
    </li>
  );
}

/** Folder rows while the project's data loads, the same 32px rows as the real ones. */
function FolderRowsSkeleton() {
  return (
    <ul aria-hidden className="space-y-0.5">
      {["w-24", "w-32", "w-20"].map((width) => (
        <li key={width} className="flex h-8 items-center gap-2 px-2">
          <Skeleton className="h-4 w-4 shrink-0" />
          <Skeleton className={cn("h-3", width)} />
        </li>
      ))}
    </ul>
  );
}

function SectionToggle({ label, count, open, onToggle }: { label: string; count?: number; open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onToggle}
      className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", !open && "-rotate-90")} aria-hidden />
      <span className="flex-1 text-left">{label}</span>
      {count !== undefined ? <span className="font-mono-broadcast tabular-nums">{count}</span> : null}
    </button>
  );
}

/**
 * The project's assets panel (lg, project asset pages): one 56px header on the top bar's line,
 * then one row style for every destination (project, Videos, folders, Recently Deleted), share
 * links for people who may see them, and storage. The header chevron folds the asset tree
 * (project, folders, Recently Deleted; Videos stays, as before), and the Folders and Share links
 * sections fold too; each open state is remembered per browser.
 */
export function ProjectAssetsPanel({
  projectId,
  data,
  searchParams,
  view,
  loading,
  onLinkClick,
  onCreateFolder
}: {
  projectId: string;
  data: ProjectShellData | null;
  searchParams: string;
  view: ProjectAssetView;
  /** The project's names, folders and counts haven't arrived yet. */
  loading: boolean;
  onLinkClick: ShellLinkClick;
  onCreateFolder: () => void;
}) {
  const [treeOpen, setTreeOpen] = useRememberedState("shell:assets-tree:v1", true, isBoolean);
  const [foldersOpen, setFoldersOpen] = useRememberedState("shell:assets-folders:v1", true, isBoolean);
  const navId = useId();
  const [linksOpen, setLinksOpen] = useRememberedState("shell:share-links:v1", false, isBoolean);
  const canViewShareLinks = Boolean(data?.canViewShareLinks);
  const shareLinks = useShareLinks(projectId, linksOpen && canViewShareLinks);
  const storage = useProjectStorage(projectId);
  const places = projectDestinations({
    projectId,
    searchParams,
    view,
    folders: data?.folders ?? [],
    assetCount: data ? data.assetCount : null
  });
  const usedPct = storage.state === "ready" ? Math.min(100, (storage.bytes / ONE_TB_BYTES) * 100) : 0;

  async function copyShareLink(token: string) {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/g/${token}`);
      toast.success("Share link copied");
    } catch {
      toast.error("Could not copy share link.");
    }
  }

  return (
    <aside
      aria-label="Project assets"
      className="hidden border-r border-border bg-[var(--ink)] lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col"
    >
      <div className="flex h-14 shrink-0 items-center gap-1 border-b border-border pl-4 pr-2">
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">Assets</h2>
        <IconButton label="Create folder" icon={Plus} size="sm" tooltip="bottom" onClick={onCreateFolder} />
        <IconButton
          label={treeOpen ? "Collapse assets" : "Expand assets"}
          icon={<ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", !treeOpen && "-rotate-90")} aria-hidden />}
          size="sm"
          tooltip="bottom"
          aria-expanded={treeOpen}
          aria-controls={navId}
          onClick={() => setTreeOpen((open) => !open)}
        />
      </div>

      <nav id={navId} aria-label="Project folders" aria-busy={loading || undefined} className="flex-1 overflow-y-auto p-2">
        <ul className="space-y-0.5">
          {treeOpen ? (
            <AssetRow destination={places.all} icon={Layers} label={data?.projectName ?? "Project"} onLinkClick={onLinkClick} />
          ) : null}
          <AssetRow destination={places.videos} icon={FileVideo2} label="Videos" countLoading={loading} onLinkClick={onLinkClick} />
        </ul>
        {treeOpen ? (
          <>
            <div className="mt-3">
              {loading ? (
                <FolderRowsSkeleton />
              ) : !data ? (
                <p className="flex h-8 items-center px-2 text-[13px] text-muted-foreground">Folders didn&apos;t load</p>
              ) : places.folders.length > 0 ? (
                <>
                  <SectionToggle
                    label="Folders"
                    count={places.folders.length}
                    open={foldersOpen}
                    onToggle={() => setFoldersOpen((open) => !open)}
                  />
                  {foldersOpen ? (
                    <ul className="mt-0.5 space-y-0.5">
                      {places.folders.map((place) => (
                        <AssetRow
                          key={place.key}
                          destination={place}
                          icon={Folder}
                          label={folderDisplayName(place.folder?.name ?? "")}
                          depth={Math.max(0, folderPathSegments(place.folder?.name ?? "").length - 1)}
                          onLinkClick={onLinkClick}
                        />
                      ))}
                    </ul>
                  ) : null}
                </>
              ) : (
                <button
                  type="button"
                  onClick={onCreateFolder}
                  className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-[13px] text-muted-foreground transition-colors hover:bg-[var(--ink-3)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <FolderPlus className="h-4 w-4 shrink-0" aria-hidden />
                  No folders yet · Create one
                </button>
              )}
            </div>
            <ul className="mt-3 border-t border-border pt-3">
              <AssetRow destination={places.deleted} icon={Trash2} label="Recently Deleted" onLinkClick={onLinkClick} />
            </ul>
          </>
        ) : null}
      </nav>

      {canViewShareLinks ? (
        <div className="shrink-0 border-t border-border p-2">
          <SectionToggle label="Share links" open={linksOpen} onToggle={() => setLinksOpen((open) => !open)} />
          {linksOpen ? (
            shareLinks === null ? (
              <p className="px-2 py-1.5 text-xs text-muted-foreground">Loading…</p>
            ) : shareLinks.length === 0 ? (
              <p className="px-2 py-1.5 text-xs text-muted-foreground">No active share links</p>
            ) : (
              <ul className="mt-0.5 space-y-0.5">
                {shareLinks.slice(0, SHARE_LINKS_SHOWN).map((link) => {
                  const label = link.permission === "COMMENT" ? "Comment link" : "View link";
                  return (
                    <li key={link.id}>
                      <button
                        type="button"
                        onClick={() => void copyShareLink(link.token)}
                        aria-label={`Copy ${label.toLowerCase()}`}
                        className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-[13px] text-muted-foreground transition-colors hover:bg-[var(--ink-3)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <Link2 className="h-4 w-4 shrink-0" aria-hidden />
                        <span className="min-w-0 flex-1 truncate text-left">{label}</span>
                        <Copy className="h-4 w-4 shrink-0" aria-hidden />
                      </button>
                    </li>
                  );
                })}
                {shareLinks.length > SHARE_LINKS_SHOWN ? (
                  <li className="px-2 py-1 text-xs text-muted-foreground">
                    and <span className="font-mono-broadcast tabular-nums">{shareLinks.length - SHARE_LINKS_SHOWN}</span> more
                  </li>
                ) : null}
              </ul>
            )
          ) : null}
        </div>
      ) : null}

      <div className="shrink-0 border-t border-border p-3">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground">
            <Cloud className="h-4 w-4" aria-hidden />
            Storage
          </span>
          {storage.state === "loading" ? (
            <Skeleton className="h-3 w-20" />
          ) : (
            <span className="whitespace-nowrap font-mono-broadcast text-[11px] tabular-nums text-muted-foreground">
              {storage.state === "ready" ? formatStorage(storage.bytes) : "—"} / 1 TB
            </span>
          )}
        </div>
        {storage.state === "ready" ? (
          <div
            role="meter"
            aria-label="Storage used"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(usedPct)}
            className="h-1 overflow-hidden rounded-full bg-[var(--ink-3)]"
          >
            <div className="h-full rounded-full bg-[var(--brand-green)] transition-all" style={{ width: `${usedPct}%` }} />
          </div>
        ) : (
          <Skeleton className={cn("h-1 w-full rounded-full", storage.state === "failed" && "motion-safe:animate-none")} />
        )}
        {storage.state === "loading" ? (
          <Skeleton className="mt-2 h-3 w-40" />
        ) : (
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {storage.state === "failed"
              ? "Storage couldn't load"
              : storage.estimated
                ? "Estimated from encoded durations"
                : "Synced from Bunny Stream"}
          </p>
        )}
      </div>
    </aside>
  );
}
