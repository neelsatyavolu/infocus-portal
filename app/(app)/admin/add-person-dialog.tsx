"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { InlineError } from "@/components/kit/alert";
import { Field } from "@/components/kit/field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { errorText, type ReportMessage } from "./admin-types";

/**
 * Admin → Add person (the header's one action on Overview and People): name, email, and whether to email
 * an invite. Errors show in the dialog and as a toast; the dialog stays open until it works.
 */
export function AddPersonDialog({
  open,
  onOpenChange,
  onChanged,
  onMessage
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => Promise<void>;
  onMessage: ReportMessage;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [sendInvite, setSendInvite] = useState(true);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Escape, the overlay, the close button and Cancel all come through here, so a reopened dialog starts clean.
  function changeOpen(next: boolean) {
    if (!next && adding) return;
    if (!next) setError(null);
    onOpenChange(next);
  }

  function fail(text: string) {
    setError(text);
    toast.error(text);
  }

  async function addPerson(event: FormEvent) {
    event.preventDefault();
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    if (!trimmedName || !trimmedEmail) {
      fail("Enter a name and email.");
      return;
    }

    setAdding(true);
    setError(null);
    onMessage(null);

    try {
      const response = await fetch("/api/platform/allowed-emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail, name: trimmedName, sendInvite })
      });
      const payload = await response.json();

      if (!response.ok) {
        fail(payload?.error?.message ?? "Failed to add person.");
        return;
      }

      setName("");
      setEmail("");
      onOpenChange(false);
      const emailed = Number(payload?.data?.emailed ?? 0);
      toast.success(
        sendInvite
          ? emailed > 0
            ? `${trimmedName} can sign in. Invite email sent.`
            : `${trimmedName} can sign in. Invite email was not sent.`
          : `${trimmedName} can sign in with Google.`
      );
      await onChanged();
    } catch (caught) {
      fail(errorText(caught, "Failed to add person."));
    } finally {
      setAdding(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="max-w-md">
        <form onSubmit={addPerson} className="space-y-5">
          <DialogHeader>
            <DialogTitle>Add person</DialogTitle>
            <DialogDescription>
              Everyone who can sign in. Add someone with their name and email; they sign in with that Google account.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Field label="Full name" htmlFor="add-person-name">
              <Input
                id="add-person-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="name"
                autoFocus
                aria-invalid={Boolean(error && !name.trim()) || undefined}
              />
            </Field>
            <Field label="Email" htmlFor="add-person-email">
              <Input
                id="add-person-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@pausd.us"
                autoComplete="email"
                aria-invalid={Boolean(error && !email.trim()) || undefined}
              />
            </Field>
            <Checkbox checked={sendInvite} onCheckedChange={setSendInvite} labelClassName="text-[13px] text-muted-foreground">
              Email them an invite to sign in
            </Checkbox>
            {error ? <InlineError>{error}</InlineError> : null}
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => changeOpen(false)} disabled={adding}>
              Cancel
            </Button>
            <Button type="submit" disabled={adding}>
              {adding ? "Adding…" : "Add person"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
