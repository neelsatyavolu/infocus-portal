"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Alert } from "@/components/kit/alert";
import { Spinner } from "@/components/kit/spinner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NativeSelect } from "@/components/ui/native-select";
import { memberLabel, personLabel, type Member, type Person } from "./livestreams-model";
import { errorMessage } from "./use-livestreams-data";

/**
 * Producers appoint and remove livestream managers (laid out like the Publishing Queue's
 * Managers dialog). Uses the managers already in the payload and the member picker list.
 */
export function ManagersDialog({
  open,
  onOpenChange,
  managers,
  members,
  membersError,
  onRetryMembers,
  onAdd,
  onRemove
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  managers: Person[];
  members: Member[] | null;
  membersError: string | null;
  onRetryMembers: () => void;
  onAdd: (userId: string) => Promise<void>;
  onRemove: (userId: string) => Promise<void>;
}) {
  const [pick, setPick] = useState("");
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<Person | null>(null);
  const candidates = (members ?? []).filter((member) => !managers.some((manager) => manager.id === member.id));

  async function add() {
    if (!pick) return;
    setAdding(true);
    try {
      await onAdd(pick);
      setPick("");
      toast.success("Manager added.");
    } catch (e) {
      toast.error(errorMessage(e, "Could not add manager"));
    } finally {
      setAdding(false);
    }
  }

  // Throws on failure so the confirm dialog stays open for a retry.
  async function remove(person: Person) {
    try {
      await onRemove(person.id);
      toast.success("Manager removed.");
    } catch (e) {
      toast.error(errorMessage(e, "Could not remove manager"));
      throw e;
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Livestream managers</DialogTitle>
            <DialogDescription>
              Producers appoint managers. Managers can edit the schedule, approve sign-ups, and view completion.
            </DialogDescription>
          </DialogHeader>
          {/* min-w-0: DialogContent is a grid, and a native <select> is as wide as its longest option. */}
          <div className="min-w-0 space-y-4">
            {managers.length ? (
              <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-md border border-border">
                {managers.map((manager) => (
                  <li key={manager.id} className="flex min-h-14 items-center justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{personLabel(manager)}</p>
                      {manager.email ? <p className="truncate text-xs text-muted-foreground">{manager.email}</p> : null}
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive-quiet"
                      className="shrink-0 max-sm:h-10"
                      aria-label={`Remove ${personLabel(manager)} as livestream manager`}
                      onClick={() => setRemoving(manager)}
                    >
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-md border border-border px-3 py-4 text-center text-sm text-muted-foreground">No managers yet.</p>
            )}
            {membersError && !members ? (
              <Alert
                tone="danger"
                compact
                action={
                  <Button type="button" variant="outline" size="sm" onClick={onRetryMembers}>
                    Try again
                  </Button>
                }
              >
                {membersError}
              </Alert>
            ) : (
              <div className="flex gap-2">
                <NativeSelect
                  aria-label="Add livestream manager"
                  value={pick}
                  disabled={adding || !members}
                  onChange={(event) => setPick(event.target.value)}
                  wrapperClassName="flex-1"
                  placeholderOption={members ? "Add manager…" : "Loading members…"}
                >
                  {candidates.map((member) => (
                    <option key={member.id} value={member.id}>
                      {memberLabel(member)}
                      {member.email ? ` (${member.email})` : ""}
                    </option>
                  ))}
                </NativeSelect>
                <Button type="button" className="shrink-0" disabled={!pick || adding} onClick={() => void add()}>
                  {adding ? <Spinner /> : <UserPlus aria-hidden />}
                  Add manager
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(next) => {
          if (!next) setRemoving(null);
        }}
        title={`Remove ${personLabel(removing)} as a livestream manager?`}
        description="They can no longer edit the schedule, approve sign-ups, or view completion."
        confirmLabel="Remove"
        onConfirm={() => (removing ? remove(removing) : undefined)}
      />
    </>
  );
}
