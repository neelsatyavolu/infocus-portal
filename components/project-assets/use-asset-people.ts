"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { MediaTileItem, WorkspaceMemberOption } from "@/components/project-assets/types";

/**
 * People on Final Cut videos: the per-card popover, the Add people dialog, the lazily loaded
 * workspace member list and the optimistic PATCH. Moved from project-media-tiles.tsx; errors
 * raised while the dialog is open show inside it (not also behind it). A failed member list
 * load is not retried by itself: opening the popover or the dialog again tries once more.
 */
export function useAssetPeople({
  projectId,
  items,
  setItems,
  showPackageActions,
  onError
}: {
  projectId: string;
  items: MediaTileItem[];
  setItems: Dispatch<SetStateAction<MediaTileItem[]>>;
  showPackageActions: boolean;
  onError: (message: string) => void;
}) {
  const [memberPickerForMediaId, setMemberPickerForMediaId] = useState<string | null>(null);
  const [memberAddModalForMediaId, setMemberAddModalForMediaId] = useState<string | null>(null);
  const [membersUpdatingMediaId, setMembersUpdatingMediaId] = useState<string | null>(null);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [workspaceMembers, setWorkspaceMembers] = useState<WorkspaceMemberOption[]>([]);
  const [workspaceMembersLoading, setWorkspaceMembersLoading] = useState(false);
  const [workspaceMembersLoaded, setWorkspaceMembersLoaded] = useState(false);
  /** The Add people dialog is open (it shows load errors itself). */
  const addDialogOpenRef = useRef(false);

  const ensureWorkspaceMembersLoaded = useCallback(async () => {
    if (workspaceMembersLoaded || workspaceMembersLoading) {
      return;
    }

    setWorkspaceMembersLoading(true);
    setMembersError(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/member-candidates`, { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Failed");
      }

      const payload = await response.json();
      setWorkspaceMembers((payload.data as WorkspaceMemberOption[]) ?? []);
      setWorkspaceMembersLoaded(true);
    } catch {
      setMembersError("Could not load people for this project.");
      if (!addDialogOpenRef.current) {
        onError("Could not load people for this project.");
      }
    } finally {
      setWorkspaceMembersLoading(false);
    }
  }, [onError, projectId, workspaceMembersLoaded, workspaceMembersLoading]);

  const [membersProjectId, setMembersProjectId] = useState(projectId);
  if (projectId !== membersProjectId) {
    setMembersProjectId(projectId);
    setWorkspaceMembers([]);
    setWorkspaceMembersLoaded(false);
    setWorkspaceMembersLoading(false);
  }

  useEffect(() => {
    addDialogOpenRef.current = memberAddModalForMediaId !== null;
  }, [memberAddModalForMediaId]);

  // The popover and the dialog close once their item leaves the list.
  if (memberPickerForMediaId && !items.some((item) => item.id === memberPickerForMediaId)) {
    setMemberPickerForMediaId(null);
  }
  if (memberAddModalForMediaId && !items.some((item) => item.id === memberAddModalForMediaId)) {
    setMemberAddModalForMediaId(null);
  }

  // People only exist in a Final Cut folder; leaving it closes the picker and the dialog.
  const [prevShowPackageActions, setPrevShowPackageActions] = useState(showPackageActions);
  if (showPackageActions !== prevShowPackageActions) {
    setPrevShowPackageActions(showPackageActions);
    if (!showPackageActions) {
      setMemberPickerForMediaId(null);
      setMemberAddModalForMediaId(null);
    }
  }

  async function updateMediaAssignedMembers(mediaId: string, memberIds: string[]) {
    setMembersUpdatingMediaId(mediaId);
    setMembersError(null);

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
      if (memberAddModalForMediaId === mediaId) {
        setMembersError("Could not update assigned members.");
      } else {
        onError("Could not update assigned members.");
      }
    } finally {
      setMembersUpdatingMediaId(null);
    }
  }

  function toggleAssignedMember(mediaId: string, userId: string) {
    const item = items.find((entry) => entry.id === mediaId);
    if (!item) {
      return;
    }

    const assignedIds = new Set(item.assignedMembers.map((member) => member.userId));
    if (assignedIds.has(userId)) {
      assignedIds.delete(userId);
    } else {
      assignedIds.add(userId);
    }

    void updateMediaAssignedMembers(mediaId, [...assignedIds]);
  }

  function setPickerOpen(mediaId: string, open: boolean) {
    if (open) {
      // Opening it again is also the retry after a failed load.
      void ensureWorkspaceMembersLoaded();
    }
    setMemberPickerForMediaId((current) => (open ? mediaId : current === mediaId ? null : current));
  }

  function openAddPeople(mediaId: string) {
    addDialogOpenRef.current = true;
    void ensureWorkspaceMembersLoaded();
    setMembersError(null);
    setMemberAddModalForMediaId(mediaId);
    setMemberPickerForMediaId(null);
  }

  return {
    memberPickerForMediaId,
    memberAddModalForMediaId,
    membersUpdatingMediaId,
    membersError,
    workspaceMembers,
    workspaceMembersLoading,
    workspaceMembersLoaded,
    toggleAssignedMember,
    setPickerOpen,
    openAddPeople,
    closeAddPeople: () => {
      addDialogOpenRef.current = false;
      setMemberAddModalForMediaId(null);
    }
  };
}
