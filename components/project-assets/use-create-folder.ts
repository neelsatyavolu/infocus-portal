"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import type { FolderItem } from "@/components/project-assets/types";

/**
 * The Create folder dialog: makes "{open folder}/{name}" inside a folder, or "{name}" at the top.
 * Moved verbatim from project-media-tiles.tsx; the error shows inside the dialog.
 */
export function useCreateFolder({
  projectId,
  selectedFolderId,
  foldersState,
  setFoldersState,
  refresh
}: {
  projectId: string;
  selectedFolderId: string;
  foldersState: FolderItem[];
  setFoldersState: Dispatch<SetStateAction<FolderItem[]>>;
  refresh: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parentName =
    selectedFolderId !== "all" && selectedFolderId !== "root"
      ? foldersState.find((folder) => folder.id === selectedFolderId)?.name ?? null
      : null;

  async function createFolder(rawName: string) {
    const name = rawName.trim();
    if (!name) {
      return false;
    }

    const fullName = parentName ? `${parentName}/${name}` : name;

    setBusy(true);
    setError(null);

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
        setError("Could not create folder.");
        return false;
      }

      const payload = await response.json();
      const folder = payload.data as { id: string; name: string };

      setFoldersState((current) => [...current, { id: folder.id, name: folder.name, itemCount: 0 }]);
      refresh();
      return true;
    } catch {
      setError("Could not create folder.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  function cancel() {
    setOpen(false);
    setValue("");
  }

  async function submit() {
    const created = await createFolder(value);
    if (!created) {
      return;
    }
    cancel();
  }

  return {
    open,
    value,
    busy,
    error,
    parentName,
    setValue,
    openDialog: () => {
      setError(null);
      setOpen(true);
    },
    cancel,
    submit
  };
}
