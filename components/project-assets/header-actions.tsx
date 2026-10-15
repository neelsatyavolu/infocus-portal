"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FolderPlus, Loader2, RefreshCw, Share2, Terminal, Trash2, UploadCloud } from "lucide-react";
import { ActionMenu } from "@/components/kit/menu";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { ScopeMode } from "@/components/project-assets/types";

const TerminalScriptDialog = dynamic(() => import("@/components/project-assets/terminal-script-dialog"), { ssr: false });

/** The page listens for this (and so can any other "Share links" entry point). */
const OPEN_SHARE_EVENT = "infocus:open-project-share";

/**
 * The project header's actions: More (⋯) then the one primary, Upload. More holds New folder,
 * Share links, Download project (Terminal), Sync all turn-in dates (EP+, Final Cut folder) and
 * Delete all media. In Recently deleted there is no primary: Upload media moves into More, and
 * New folder and Delete all media (which trashes the active assets, not these) wait for the
 * project view, so the trash has one "delete all": the toolbar's Delete all permanently.
 * Results show as toasts; failures go to the page notice or stay in the dialog.
 */
export function ProjectHeaderActions({
  projectId,
  projectName,
  scope,
  canUpload,
  uploadDestination,
  onUpload,
  onNewFolder,
  showSyncAll,
  syncFolderId,
  onError
}: {
  projectId: string;
  projectName: string;
  scope: ScopeMode;
  canUpload: boolean;
  /** Where Upload puts files: the open folder's name or the project's. */
  uploadDestination: string;
  onUpload: () => void;
  onNewFolder: () => void;
  showSyncAll: boolean;
  syncFolderId: string | null;
  onError: (message: string) => void;
}) {
  const router = useRouter();
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [terminalMounted, setTerminalMounted] = useState(false);
  const [syncingTurnedInDates, setSyncingTurnedInDates] = useState(false);
  const [confirmDeleteAllOpen, setConfirmDeleteAllOpen] = useState(false);
  const [deleteAllError, setDeleteAllError] = useState<string | null>(null);
  const active = scope === "active";

  async function syncTurnedInDates() {
    if (syncingTurnedInDates) {
      return;
    }

    setSyncingTurnedInDates(true);

    try {
      const response = await fetch(`/api/projects/${projectId}/sync-turned-in-dates`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          folderId: syncFolderId
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
        onError(payload.error?.message ?? "Sync failed.");
        return;
      }

      const processedVideoCount = payload.data?.processedVideoCount ?? 0;
      const syncedTurnedInRows = payload.data?.syncedTurnedInRows ?? 0;
      toast.success(
        `Synced ${syncedTurnedInRows} turned-in date${syncedTurnedInRows === 1 ? "" : "s"} across ${processedVideoCount} video${processedVideoCount === 1 ? "" : "s"}.`
      );
    } catch {
      onError("Sync failed.");
    } finally {
      setSyncingTurnedInDates(false);
    }
  }

  /** Throws on failure so the confirm dialog stays open and shows the error. */
  async function deleteAllMedia() {
    setDeleteAllError(null);
    let message = "Delete all failed.";

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
        message = payload.error?.message ?? message;
        throw new Error(message);
      }

      const deletedCount = payload.data?.deletedCount ?? 0;
      toast.success(
        deletedCount === 0 ? "No media to delete." : `Deleted ${deletedCount} media item${deletedCount === 1 ? "" : "s"}.`
      );
      router.refresh();
    } catch (error) {
      setDeleteAllError(message);
      throw error;
    }
  }

  return (
    <>
      <ActionMenu
        label="More project actions"
        variant="outline"
        items={[
          {
            key: "upload",
            label: "Upload media",
            icon: UploadCloud,
            hint: `To ${uploadDestination}`,
            hidden: active || !canUpload,
            onSelect: onUpload
          },
          { key: "new-folder", label: "New folder", icon: FolderPlus, hidden: !active, onSelect: onNewFolder },
          {
            key: "share",
            label: "Share links…",
            icon: Share2,
            onSelect: () => window.dispatchEvent(new CustomEvent(OPEN_SHARE_EVENT))
          },
          {
            key: "download",
            label: "Download project (Terminal)",
            icon: Terminal,
            onSelect: () => {
              setTerminalMounted(true);
              setTerminalOpen(true);
            }
          },
          {
            key: "sync-all",
            label: "Sync all turn-in dates",
            icon: syncingTurnedInDates ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden /> : RefreshCw,
            hidden: !showSyncAll || !active,
            disabled: syncingTurnedInDates,
            onSelect: () => void syncTurnedInDates()
          },
          "separator",
          {
            key: "delete-all",
            label: "Delete all media…",
            icon: Trash2,
            tone: "danger",
            hidden: !active,
            onSelect: () => {
              setDeleteAllError(null);
              setConfirmDeleteAllOpen(true);
            }
          }
        ]}
      />
      {active && canUpload ? (
        <Button type="button" onClick={onUpload} title={`Upload to ${uploadDestination}`}>
          <UploadCloud aria-hidden />
          Upload
        </Button>
      ) : null}

      {terminalMounted ? (
        <TerminalScriptDialog projectId={projectId} open={terminalOpen} onOpenChange={setTerminalOpen} />
      ) : null}

      <ConfirmDialog
        open={confirmDeleteAllOpen}
        onOpenChange={setConfirmDeleteAllOpen}
        title={`Delete all media in "${projectName}"?`}
        description="This will move every media item in this project to trash. You can restore items individually from each media's trash view."
        confirmLabel="Delete all media"
        busyLabel="Deleting…"
        cancelLabel="Cancel"
        error={deleteAllError}
        onConfirm={deleteAllMedia}
      />
    </>
  );
}
