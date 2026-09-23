"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

type CreateProjectTileProps = {
  workspaceId: string;
};

export function CreateProjectTile({ workspaceId }: CreateProjectTileProps) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function onCreate() {
    const name = projectName.trim();
    if (!name) {
      return;
    }

    setCreating(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          name: name.trim()
        })
      });

      if (!response.ok) {
        throw new Error("Failed");
      }

      setOpen(false);
      setProjectName("");
      router.refresh();
    } catch {
      setErrorMessage("Could not create project.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={creating}
        className="flex min-h-[204px] items-center justify-center rounded-2xl border border-dashed border-border bg-card p-4 hover:bg-accent"
      >
        <div className="text-center">
          <div className="mx-auto mb-2 grid h-11 w-11 place-items-center rounded-xl border border-border bg-accent text-foreground">
            <Plus className="h-5 w-5" />
          </div>
          <p className="text-sm font-semibold text-foreground">{creating ? "Creating..." : "New Project"}</p>
          <p className="text-xs text-muted-foreground">Create a project in this workspace.</p>
        </div>
      </button>

      <Dialog
        open={open}
        onOpenChange={(isOpen) => {
          if (!isOpen && creating) return;
          setOpen(isOpen);
          if (!isOpen) setErrorMessage(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Project</DialogTitle>
            <DialogDescription>Add a new project to this workspace.</DialogDescription>
          </DialogHeader>
          <input
            value={projectName}
            onChange={(event) => setProjectName(event.target.value)}
            placeholder="Project name"
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          {errorMessage ? <p className="mt-2 text-sm text-amber-300">{errorMessage}</p> : null}
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setOpen(false);
                setErrorMessage(null);
              }}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button onClick={() => void onCreate()} disabled={creating || !projectName.trim()}>
              {creating ? "Creating..." : "Create Project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
