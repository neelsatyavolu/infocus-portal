"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { Spinner } from "@/components/kit/spinner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { ProjectShellFolder } from "@/src/lib/project-shell";

/**
 * Create Folder from the assets panel or the phone folder chips. It can't be closed while the
 * folder is being created; on success the new folder shows in the shell at once and the page
 * refreshes.
 */
export function CreateFolderDialog({
  projectId,
  open,
  onOpenChange,
  onCreated
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (folder: ProjectShellFolder) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    onOpenChange(false);
    setName("");
    setError(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const folderName = name.trim();
    if (!folderName) return;
    setCreating(true);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/folders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: folderName })
      });
      if (!response.ok) {
        setError("Could not create folder. Try again.");
        return;
      }
      const payload = (await response.json()) as { data: { id: string; name: string } };
      onCreated({ id: payload.data.id, name: payload.data.name, activeMediaCount: 0 });
      close();
      router.refresh();
    } catch {
      setError("Could not create folder. Try again.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && creating) return;
        if (next) onOpenChange(true);
        else close();
      }}
    >
      <DialogContent className="max-w-md">
        <form onSubmit={(event) => void submit(event)} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Create Folder</DialogTitle>
            <DialogDescription>Add a new folder to organize project assets.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Folder name"
              aria-label="Folder name"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "create-folder-error" : undefined}
              autoFocus
            />
            {error ? (
              <p id="create-folder-error" role="alert" className="flex items-center gap-1.5 text-sm text-danger">
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
                {error}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={close} disabled={creating}>
              Cancel
            </Button>
            <Button type="submit" disabled={creating || !name.trim()}>
              {creating ? <Spinner /> : null}
              {creating ? "Creating..." : "Create Folder"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
