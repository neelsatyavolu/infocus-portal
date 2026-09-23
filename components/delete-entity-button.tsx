"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

type DeleteEntityButtonProps = {
  endpoint: string;
  label: string;
  description?: string;
  redirectTo?: string;
  className?: string;
};

export function DeleteEntityButton({
  endpoint,
  label,
  description,
  redirectTo,
  className
}: DeleteEntityButtonProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [open, setOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function onDelete() {
    setIsDeleting(true);
    setErrorMessage(null);

    try {
      const response = await fetch(endpoint, { method: "DELETE" });

      if (!response.ok) {
        throw new Error("Failed to delete");
      }

      setOpen(false);
      if (redirectTo) {
        router.replace(redirectTo as Parameters<typeof router.replace>[0]);
        return;
      }

      router.refresh();
    } catch {
      setErrorMessage(`Could not delete ${label}.`);
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className={className}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen(true);
        }}
        disabled={isDeleting}
        aria-label={`Delete ${label}`}
      >
        <Trash2 className="h-4 w-4 text-rose-300" />
      </Button>

      <Dialog
        open={open}
        onOpenChange={(isOpen) => {
          if (!isOpen && isDeleting) return;
          setOpen(isOpen);
          if (!isOpen) setErrorMessage(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{`Delete ${label}`}</DialogTitle>
            <DialogDescription>{description ?? "This action cannot be undone."}</DialogDescription>
          </DialogHeader>
          {errorMessage ? <p className="text-sm text-amber-300">{errorMessage}</p> : null}
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setOpen(false);
                setErrorMessage(null);
              }}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void onDelete()} disabled={isDeleting}>
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
