"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowUpDown,
  Check,
  Copy,
  Download,
  FolderPlus,
  Grid3X3,
  LayoutGrid,
  List,
  Plus,
  RefreshCw,
  Share2,
  Terminal,
  Trash2,
  UploadCloud
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { DropdownOption } from "@/components/video-card-menu";
import { cn } from "@/src/lib/utils";

type ProjectAssetsToolbarProps = {
  projectId: string;
  projectName: string;
  canUpload: boolean;
  filterValue: "all" | "ready" | "in-progress" | "failed";
  sortValue: "recent" | "name" | "status";
  viewValue: "grid" | "list";
  showSyncTurnedInButton?: boolean;
  syncTurnedInFolderId?: string | null;
};

type QueryUpdates = {
  filter?: "all" | "ready" | "in-progress" | "failed";
  sort?: "recent" | "name" | "status";
  view?: "grid" | "list";
  new?: "folder" | "upload" | null;
  preservePage?: boolean;
};

export function ProjectAssetsToolbar({
  projectId,
  projectName,
  canUpload,
  filterValue,
  sortValue,
  viewValue,
  showSyncTurnedInButton = false,
  syncTurnedInFolderId = null
}: ProjectAssetsToolbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const [scriptDialogOpen, setScriptDialogOpen] = useState(false);
  const [scriptText, setScriptText] = useState<string | null>(null);
  const [scriptLoading, setScriptLoading] = useState(false);
  const [scriptError, setScriptError] = useState<string | null>(null);
  const [scriptCopied, setScriptCopied] = useState(false);
  const [syncingTurnedInDates, setSyncingTurnedInDates] = useState(false);
  const [syncTurnedInMessage, setSyncTurnedInMessage] = useState<string | null>(null);
  const [deletingAllMedia, setDeletingAllMedia] = useState(false);
  const [deleteAllMessage, setDeleteAllMessage] = useState<string | null>(null);
  const newMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDocumentClick(event: MouseEvent) {
      if (!newMenuRef.current) {
        return;
      }

      const target = event.target;
      if (target instanceof Node && !newMenuRef.current.contains(target)) {
        setNewMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", onDocumentClick);
    return () => document.removeEventListener("mousedown", onDocumentClick);
  }, []);

  function updateQuery(updates: QueryUpdates) {
    const next = new URLSearchParams(searchParams.toString());

    if (updates.filter) {
      next.set("filter", updates.filter);
    }

    if (updates.sort) {
      next.set("sort", updates.sort);
    }

    if (updates.view) {
      next.set("view", updates.view);
    }

    if (updates.new === null) {
      next.delete("new");
    } else if (updates.new) {
      next.set("new", updates.new);
    }

    if (!updates.preservePage) {
      next.delete("page");
    }

    router.push(`${pathname}?${next.toString()}` as never);
  }

  const sortOptions: DropdownOption<ProjectAssetsToolbarProps["sortValue"]>[] = [
    { value: "recent", label: "Sort: Recent" },
    { value: "name", label: "Sort: Name" },
    { value: "status", label: "Sort: Status" }
  ];

  const statusOptions: DropdownOption<ProjectAssetsToolbarProps["filterValue"]>[] = [
    { value: "all", label: "Status: All" },
    { value: "ready", label: "Status: Ready" },
    { value: "in-progress", label: "Status: In Progress" },
    { value: "failed", label: "Status: Failed" }
  ];

  async function syncTurnedInDates() {
    if (syncingTurnedInDates) {
      return;
    }

    setSyncingTurnedInDates(true);
    setSyncTurnedInMessage(null);

    try {
      const response = await fetch(`/api/projects/${projectId}/sync-turned-in-dates`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          folderId: syncTurnedInFolderId
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
        setSyncTurnedInMessage(payload.error?.message ?? "Sync failed.");
        return;
      }

      const processedVideoCount = payload.data?.processedVideoCount ?? 0;
      const syncedTurnedInRows = payload.data?.syncedTurnedInRows ?? 0;
      setSyncTurnedInMessage(`Synced ${syncedTurnedInRows} turned-in date${syncedTurnedInRows === 1 ? "" : "s"} across ${processedVideoCount} video${processedVideoCount === 1 ? "" : "s"}.`);
    } catch {
      setSyncTurnedInMessage("Sync failed.");
    } finally {
      setSyncingTurnedInDates(false);
    }
  }

  async function deleteAllMedia() {
    if (deletingAllMedia) {
      return;
    }

    const confirmed = window.confirm(
      `Delete all media in "${projectName}"? This will move every media item in this project to trash. You can restore items individually from each media's trash view.`
    );

    if (!confirmed) {
      return;
    }

    setDeletingAllMedia(true);
    setDeleteAllMessage(null);

    try {
      const response = await fetch(`/api/projects/${projectId}/media/delete-all`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        }
      });

      const payload = (await response.json()) as {
        data?: { deletedCount: number };
        error?: { message?: string };
      };

      if (!response.ok) {
        setDeleteAllMessage(payload.error?.message ?? "Delete all failed.");
        return;
      }

      const deletedCount = payload.data?.deletedCount ?? 0;
      setDeleteAllMessage(
        deletedCount === 0
          ? "No media to delete."
          : `Deleted ${deletedCount} media item${deletedCount === 1 ? "" : "s"}.`
      );
      router.refresh();
    } catch {
      setDeleteAllMessage("Delete all failed.");
    } finally {
      setDeletingAllMedia(false);
    }
  }

  async function openTerminalCommands() {
    setScriptDialogOpen(true);
    setScriptCopied(false);

    if (scriptText) {
      // Already fetched in this session; reuse to avoid re-issuing tokens.
      return;
    }

    setScriptLoading(true);
    setScriptError(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/download/script`, {
        cache: "no-store"
      });
      if (!response.ok) {
        let message = `Failed to load script (HTTP ${response.status}).`;
        try {
          const payload = (await response.json()) as { error?: { message?: string } };
          message = payload.error?.message ?? message;
        } catch {
          // Keep the HTTP status fallback for non-JSON error bodies.
        }
        throw new Error(message);
      }
      const text = await response.text();
      setScriptText(text);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load script.";
      setScriptError(message);
    } finally {
      setScriptLoading(false);
    }
  }

  async function copyScript() {
    if (!scriptText) {
      return;
    }
    try {
      await navigator.clipboard.writeText(scriptText);
      setScriptCopied(true);
      window.setTimeout(() => setScriptCopied(false), 2000);
    } catch {
      setScriptError("Couldn't copy to clipboard. Select the text manually instead.");
    }
  }


  return (
    <section className="relative z-40 rounded-xl border border-border bg-card px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted px-2.5 py-2 text-sm text-muted-foreground">
            <LayoutGrid className="h-3.5 w-3.5 text-muted-foreground" />
            Appearance
          </span>

          <div className="inline-flex rounded-lg border border-border bg-muted p-1">
            <button
              className={cn(
                "rounded-md p-2",
                viewValue === "grid" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
              type="button"
              onClick={() => updateQuery({ view: "grid", preservePage: true })}
              title="Grid view"
            >
              <Grid3X3 className="h-4 w-4" />
            </button>
            <button
              className={cn(
                "rounded-md p-2",
                viewValue === "list" ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
              type="button"
              onClick={() => updateQuery({ view: "list", preservePage: true })}
              title="List view"
            >
              <List className="h-4 w-4" />
            </button>
          </div>

          <div className="inline-flex min-w-[160px] items-center gap-1 rounded-lg border border-border bg-muted p-1 text-sm">
            <Select value={filterValue} onValueChange={(value) => updateQuery({ filter: value as ProjectAssetsToolbarProps["filterValue"] })}>
              <SelectTrigger className="h-9 border-0 bg-transparent text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="inline-flex min-w-[160px] items-center gap-1 rounded-lg border border-border bg-muted p-1 text-sm">
            <div className="pointer-events-none inline-flex items-center pl-2 text-muted-foreground">
              <ArrowUpDown className="h-3.5 w-3.5" />
            </div>
            <Select value={sortValue} onValueChange={(value) => updateQuery({ sort: value as ProjectAssetsToolbarProps["sortValue"] })}>
              <SelectTrigger className="h-9 border-0 bg-transparent text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sortOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <button
            type="button"
            onClick={() => void deleteAllMedia()}
            disabled={deletingAllMedia}
            className={cn(
              "inline-flex items-center gap-1 rounded-lg border border-destructive/40 bg-destructive/10 px-2.5 py-2 text-sm text-destructive hover:bg-destructive/20",
              deletingAllMedia ? "cursor-not-allowed opacity-70" : ""
            )}
            title={`Delete all media in ${projectName}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
            {deletingAllMedia ? "Deleting…" : "Delete All Media"}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void openTerminalCommands()}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-muted px-3 text-sm text-foreground hover:bg-accent"
            title={`Download ${projectName} via Terminal`}
          >
            <Download className="h-4 w-4 text-muted-foreground" />
            Download Project
          </button>

          {showSyncTurnedInButton ? (
            <button
              type="button"
              onClick={() => void syncTurnedInDates()}
              disabled={syncingTurnedInDates}
              className={cn(
                "inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-muted px-3 text-sm text-foreground hover:bg-accent",
                syncingTurnedInDates ? "cursor-not-allowed opacity-70" : ""
              )}
            >
              <RefreshCw className={cn("h-4 w-4 text-muted-foreground", syncingTurnedInDates ? "animate-spin" : "")} />
              Sync All
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => {
              window.dispatchEvent(new CustomEvent("infocus:open-project-share"));
            }}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-muted px-3 text-sm text-foreground hover:bg-accent"
          >
            <Share2 className="h-4 w-4 text-muted-foreground" />
            Share
          </button>

          <div ref={newMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setNewMenuOpen((current) => !current)}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-secondary px-3 text-sm font-medium text-foreground hover:bg-accent"
            >
              <Plus className="h-4 w-4" />
              New
            </button>

            {newMenuOpen ? (
              <div className="absolute right-0 top-[calc(100%+8px)] z-40 w-48 rounded-xl border border-border bg-popover p-1.5 shadow-xl">
                <button
                  type="button"
                  onClick={() => {
                    setNewMenuOpen(false);
                    updateQuery({ new: "folder" });
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-foreground hover:bg-accent"
                >
                  <FolderPlus className="h-4 w-4 text-muted-foreground" />
                  New folder
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!canUpload) {
                      return;
                    }
                    setNewMenuOpen(false);
                    updateQuery({ new: "upload" });
                  }}
                  className={cn(
                    "mt-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm",
                    canUpload ? "text-foreground hover:bg-accent" : "cursor-not-allowed text-muted-foreground"
                  )}
                >
                  <UploadCloud className="h-4 w-4 text-muted-foreground" />
                  Upload media
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <Dialog open={scriptDialogOpen} onOpenChange={setScriptDialogOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Terminal className="h-4 w-4 text-muted-foreground" />
              Terminal download script
            </DialogTitle>
            <DialogDescription>
              Paste this whole block into a Terminal window. It will create the project folder under
              ~/Downloads, fetch each file directly from Bunny CDN, then zip the folder.
              Signed URLs are valid for 6 hours.
            </DialogDescription>
          </DialogHeader>

          {scriptLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading script…</p>
          ) : scriptError ? (
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {scriptError}
            </p>
          ) : scriptText ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => void copyScript()}
                className="absolute right-2 top-2 inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-2 text-xs text-foreground hover:bg-accent"
              >
                {scriptCopied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-green-500 light:text-green-700" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                    Copy
                  </>
                )}
              </button>
              <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-all rounded-lg border border-border bg-muted px-3 py-3 pr-20 font-mono text-xs leading-relaxed text-foreground">
                <code>{scriptText}</code>
              </pre>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>


      {syncTurnedInMessage ? (
        <p className="mt-2 text-xs text-muted-foreground">{syncTurnedInMessage}</p>
      ) : null}

      {deleteAllMessage ? (
        <p className="mt-2 text-xs text-muted-foreground">{deleteAllMessage}</p>
      ) : null}
    </section>
  );
}
