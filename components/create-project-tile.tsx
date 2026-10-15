"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Field } from "@/components/kit/field";
import { Spinner } from "@/components/kit/spinner";
import {
  PROJECT_NAME_MAX,
  PROJECT_NAME_MIN,
  createProjectErrorMessage,
  isValidProjectName
} from "@/components/home/home-format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

type CreateProjectButtonProps = {
  workspaceId: string;
  /** Named in the dialog ("Add a project to InFocus News."). */
  workspaceName?: string;
};

const NAME_FIELD_ID = "new-project-name";

/**
 * "New project": the primary button (page header, or the empty state when there are no
 * projects yet) and its dialog. POST /api/projects { workspaceId, name }, then refresh.
 */
export function CreateProjectButton({ workspaceId, workspaceName }: CreateProjectButtonProps) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const trimmedLength = projectName.trim().length;
  const tooShort = trimmedLength > 0 && trimmedLength < PROJECT_NAME_MIN;

  async function onCreate() {
    const name = projectName.trim();
    if (!isValidProjectName(name)) {
      return;
    }

    setCreating(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, name })
      });

      if (!response.ok) {
        setErrorMessage(createProjectErrorMessage(response.status));
        return;
      }

      setOpen(false);
      setProjectName("");
      router.refresh();
    } catch {
      setErrorMessage(createProjectErrorMessage(0));
    } finally {
      setCreating(false);
    }
  }

  function onOpenChange(isOpen: boolean) {
    if (!isOpen && creating) return;
    setOpen(isOpen);
    if (!isOpen) setErrorMessage(null);
  }

  const describedBy = errorMessage ? `${NAME_FIELD_ID}-error` : `${NAME_FIELD_ID}-hint`;

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)} disabled={creating}>
        <Plus aria-hidden />
        New project
      </Button>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>
              {workspaceName ? `Add a project to ${workspaceName}.` : "Add a project to this workspace."}
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!creating) {
                void onCreate();
              }
            }}
          >
            <Field
              label="Project name"
              htmlFor={NAME_FIELD_ID}
              hint={tooShort ? `Use at least ${PROJECT_NAME_MIN} characters.` : `${PROJECT_NAME_MIN}–${PROJECT_NAME_MAX} characters.`}
              error={errorMessage}
            >
              <Input
                id={NAME_FIELD_ID}
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
                placeholder="e.g. Cycle 3"
                aria-invalid={errorMessage ? true : undefined}
                aria-describedby={describedBy}
                maxLength={PROJECT_NAME_MAX}
                autoFocus
                disabled={creating}
              />
            </Field>
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={creating}>
                Cancel
              </Button>
              <Button type="submit" disabled={creating || !isValidProjectName(projectName)}>
                {creating ? <Spinner /> : null}
                {creating ? "Creating…" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
