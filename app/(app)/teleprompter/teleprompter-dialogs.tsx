"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

/** New script / Rename script. A form, so Enter saves (the disabled Save button blocks an empty title). */
export function ScriptTitleDialog({
  open,
  renaming,
  title,
  working,
  onTitleChange,
  onOpenChange,
  onCancel,
  onSave
}: {
  open: boolean;
  renaming: boolean;
  title: string;
  working: boolean;
  onTitleChange: (title: string) => void;
  onOpenChange: (open: boolean) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          className="contents"
          onSubmit={(event) => {
            event.preventDefault();
            if (!working && title.trim()) {
              onSave();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>{renaming ? "Rename script" : "New script"}</DialogTitle>
            <DialogDescription>Name this show script.</DialogDescription>
          </DialogHeader>
          <Input
            value={title}
            onChange={(event) => onTitleChange(event.target.value)}
            placeholder="Friday show"
            aria-label="Script name"
          />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onCancel} disabled={working}>
              Cancel
            </Button>
            <Button type="submit" disabled={working || !title.trim()}>
              {working ? "Saving..." : renaming ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
