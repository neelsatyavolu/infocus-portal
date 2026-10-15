"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { IconButton } from "@/components/kit/icon-button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/src/lib/utils";

type DeleteEntityButtonProps = {
  endpoint: string;
  label: string;
  description?: string;
  redirectTo?: string;
  className?: string;
};

/**
 * Quiet trash icon (muted at rest, Danger on hover or focus) that opens the "are you sure?"
 * step, then DELETEs `endpoint`. Afterwards it goes to `redirectTo`, or refreshes in place.
 * Safe inside a link or a clickable card: the trigger stops the click, and the dialog's clicks
 * (which bubble through the React tree past the portal) never reach an ancestor's handlers.
 */
export function DeleteEntityButton({ endpoint, label, description, redirectTo, className }: DeleteEntityButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function onDelete() {
    setErrorMessage(null);
    let response: Response;
    try {
      response = await fetch(endpoint, { method: "DELETE" });
    } catch (error) {
      setErrorMessage(`Could not delete ${label}.`);
      throw error;
    }

    if (!response.ok) {
      setErrorMessage(`Could not delete ${label}.`);
      // ConfirmDialog stays open when the action throws, so the error can be read and retried.
      throw new Error("DELETE_FAILED");
    }

    if (redirectTo) {
      router.replace(redirectTo as Parameters<typeof router.replace>[0]);
      return;
    }

    router.refresh();
  }

  return (
    <>
      <IconButton
        label={`Delete ${label}`}
        icon={Trash2}
        size="touch"
        className={cn(
          "text-muted-foreground hover:bg-danger-tint hover:text-danger focus-visible:text-danger",
          className
        )}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen(true);
        }}
      />

      <span className="contents" onClick={(event) => event.stopPropagation()}>
        <ConfirmDialog
          open={open}
          onOpenChange={(isOpen) => {
            setOpen(isOpen);
            if (!isOpen) setErrorMessage(null);
          }}
          title={`Delete ${label}?`}
          description={description ?? "This can't be undone."}
          confirmLabel="Delete"
          busyLabel="Deleting…"
          cancelLabel="Cancel"
          error={errorMessage}
          onConfirm={onDelete}
        />
      </span>
    </>
  );
}
