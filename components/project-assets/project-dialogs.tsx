"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { MediaTileItem } from "@/components/project-assets/types";
import type { useAssetDelete } from "@/components/project-assets/use-asset-delete";
import type { useAssetEdits } from "@/components/project-assets/use-asset-edits";
import type { useAssetPeople } from "@/components/project-assets/use-asset-people";
import type { useCreateFolder } from "@/components/project-assets/use-create-folder";
import { folderDisplayName } from "@/src/lib/project-folders";

// Each dialog's code loads the first time it opens, so the page ships less JS.
const AddPeopleDialog = dynamic(() => import("@/components/project-assets/add-people-dialog"), { ssr: false });
const ShareLinksDialog = dynamic(() => import("@/components/project-assets/share-links-dialog"), { ssr: false });
const RenameDialog = dynamic(() => import("@/components/project-assets/asset-dialogs").then((m) => m.RenameDialog), {
  ssr: false
});
const CreateFolderDialog = dynamic(
  () => import("@/components/project-assets/asset-dialogs").then((m) => m.CreateFolderDialog),
  { ssr: false }
);
const MoveIntoVersionDialog = dynamic(
  () => import("@/components/project-assets/asset-dialogs").then((m) => m.MoveIntoVersionDialog),
  { ssr: false }
);
const MarkAiredDialog = dynamic(() => import("@/components/project-assets/asset-dialogs").then((m) => m.MarkAiredDialog), {
  ssr: false
});

/** Mounts a lazily loaded dialog the first time it opens and keeps it (state and exit animation). */
function useMountOnce(open: boolean) {
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);
  return mounted || open;
}

/** Every dialog of the project assets page, fed by the page's hooks. */
export function ProjectDialogs({
  projectId,
  projectName,
  shareOpen,
  onShareOpenChange,
  people,
  addPeopleOpen,
  addPeopleItem,
  edits,
  removal,
  folder
}: {
  projectId: string;
  projectName: string;
  shareOpen: boolean;
  onShareOpenChange: (open: boolean) => void;
  people: ReturnType<typeof useAssetPeople>;
  addPeopleOpen: boolean;
  addPeopleItem: MediaTileItem | null;
  edits: ReturnType<typeof useAssetEdits>;
  removal: ReturnType<typeof useAssetDelete>;
  folder: ReturnType<typeof useCreateFolder>;
}) {
  const { rename, moveIntoVersion, status, download } = edits;
  const { confirmAction } = removal;
  const airedOpen = status.airedDialog !== null;
  const shareMounted = useMountOnce(shareOpen);
  const renameMounted = useMountOnce(rename.open);
  const folderMounted = useMountOnce(folder.open);
  const moveMounted = useMountOnce(moveIntoVersion.open);
  const addPeopleMounted = useMountOnce(addPeopleOpen);
  const airedMounted = useMountOnce(airedOpen);
  const closeConfirm = (open: boolean) => {
    if (!open) removal.closeConfirm();
  };

  return (
    <>
      {addPeopleMounted ? (
        <AddPeopleDialog
          key={people.memberAddModalForMediaId ?? "none"}
          open={addPeopleOpen}
          item={addPeopleItem}
          members={people.workspaceMembers}
          loading={people.workspaceMembersLoading}
          loaded={people.workspaceMembersLoaded}
          error={people.membersError}
          busy={people.membersUpdatingMediaId !== null && people.membersUpdatingMediaId === people.memberAddModalForMediaId}
          onAdd={people.toggleAssignedMember}
          onClose={people.closeAddPeople}
        />
      ) : null}

      {shareMounted ? <ShareLinksDialog projectId={projectId} open={shareOpen} onOpenChange={onShareOpenChange} /> : null}

      {renameMounted ? (
        <RenameDialog
          open={rename.open}
          value={rename.value}
          busy={rename.busy}
          error={rename.error}
          onChange={rename.setValue}
          onCancel={rename.cancel}
          onSubmit={() => void rename.confirm()}
        />
      ) : null}

      {moveMounted ? (
        <MoveIntoVersionDialog
          open={moveIntoVersion.open}
          sourceTitle={moveIntoVersion.source?.title ?? null}
          sourceVersionCount={moveIntoVersion.source?.versions.length ?? 0}
          candidates={moveIntoVersion.candidates.map((item) => ({ id: item.id, title: item.title }))}
          targetId={moveIntoVersion.targetId}
          targetTitle={moveIntoVersion.target?.title ?? null}
          busy={moveIntoVersion.busy}
          error={moveIntoVersion.error}
          onTargetChange={moveIntoVersion.setTarget}
          onCancel={moveIntoVersion.cancel}
          onSubmit={() => void moveIntoVersion.confirm()}
        />
      ) : null}

      {folderMounted ? (
        <CreateFolderDialog
          open={folder.open}
          value={folder.value}
          destination={
            folder.parentName
              ? `Creates inside ${folderDisplayName(folder.parentName)}`
              : `Creates at the top of ${projectName}`
          }
          busy={folder.busy}
          error={folder.error}
          onChange={folder.setValue}
          onCancel={folder.cancel}
          onSubmit={() => void folder.submit()}
        />
      ) : null}

      {airedMounted ? (
        <MarkAiredDialog
          open={airedOpen}
          date={status.airedDialog?.date ?? ""}
          busy={status.updatingMediaId !== null}
          onDateChange={status.setAiredDate}
          onCancel={status.cancelAired}
          onSubmit={() => void status.submitAired()}
        />
      ) : null}

      <ConfirmDialog
        open={confirmAction?.type === "soft-delete"}
        onOpenChange={closeConfirm}
        tone="default"
        title="Move to recently deleted"
        description={`Move ${confirmAction?.label ?? "these videos"} to Recently Deleted?`}
        confirmLabel="Move to deleted"
        busyLabel="Moving…"
        cancelLabel="Cancel"
        error={removal.confirmError}
        onConfirm={removal.confirm}
      />

      <ConfirmDialog
        open={confirmAction?.type === "permanent-delete"}
        onOpenChange={closeConfirm}
        title="Delete permanently"
        description={`Permanently delete ${confirmAction?.label ?? "these videos"}? This action cannot be undone.`}
        confirmLabel="Delete permanently"
        busyLabel="Deleting…"
        cancelLabel="Cancel"
        error={removal.confirmError}
        onConfirm={removal.confirm}
      />

      <Dialog open={confirmAction?.type === "permission-denied"} onOpenChange={closeConfirm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete not allowed</DialogTitle>
            <DialogDescription>{`You don't have permission to delete ${confirmAction?.label ?? "these videos"}.`}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={removal.closeConfirm}>
              OK
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(download.action)}
        onOpenChange={(open) => {
          if (!open) download.close();
        }}
        tone="default"
        title="Download original video"
        description={
          download.action ? `Download ${download.action.title} (v${download.action.versionNumber}) now?` : "Download this video now?"
        }
        confirmLabel="Download"
        busyLabel="Starting..."
        cancelLabel="Cancel"
        onConfirm={download.confirm}
      />
    </>
  );
}
