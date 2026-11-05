"use client";

import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { MeetingPerson } from "@/src/lib/meetings/types";
import { LinkedPersonSelect } from "./linked-person-select";

export type NewInvite = { email: string; name: string; userId: string | null };

/** Fields and the button: 40px on phones like the invite rows, 36px from md. */
const TOUCH = "max-md:h-10";

/** One heading style for the sheet's two sections ("Invited addresses", "Add an address"). */
export const INVITES_SECTION_HEADING = "flex items-center gap-2 text-sm font-semibold text-foreground";

/**
 * "Add an address" (execs): email on its own row, then name and producer side by side, and the
 * sheet's one primary button. Clears itself when the address was added.
 */
export function AddInviteForm({
  people,
  busy,
  onAdd
}: {
  people: MeetingPerson[] | null;
  /** Shared with Sync now: either one running disables both. */
  busy: "add" | "resend" | null;
  onAdd: (invite: NewInvite) => Promise<boolean>;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [userId, setUserId] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (await onAdd({ email, name, userId })) {
      setEmail("");
      setName("");
      setUserId(null);
    }
  }

  return (
    <form onSubmit={submit} aria-labelledby="invite-add-title" className="space-y-4 rounded-md border border-border p-4">
      <h3 id="invite-add-title" className={INVITES_SECTION_HEADING}>
        Add an address
      </h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="invite-email">Email</Label>
          <Input id="invite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.edu" required className={TOUCH} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="invite-name">Name (optional)</Label>
          <Input id="invite-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} className={TOUCH} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="invite-producer">Producer (optional)</Label>
          <LinkedPersonSelect id="invite-producer" people={people} value={userId} onChange={setUserId} className={TOUCH} />
        </div>
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={busy !== null} className={`max-sm:w-full ${TOUCH}`}>
          {busy === "add" ? <Loader2 className="animate-spin" aria-hidden /> : null}
          Add and invite
        </Button>
      </div>
    </form>
  );
}
