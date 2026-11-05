"use client";

import { useState } from "react";
import { Users } from "lucide-react";
import { toast } from "sonner";
import { Alert } from "@/components/kit/alert";
import { ListSkeleton } from "@/components/kit/skeleton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NativeSelect } from "@/components/ui/native-select";

type Person = { name: string | null; email: string | null };
type Roster = { managers: (Person & { userId: string })[]; candidates: (Person & { id: string })[] };
type ManagerRosterProps = {
  /** Roster API: GET roster + candidates, POST { userId }, DELETE ?userId= (producers only). */
  endpoint: string;
  /** Lowercase plural used in messages, e.g. "publishing managers". */
  noun: string;
  title: string;
  description: string;
  /** Match the buttons beside it: "sm" (h-8, default) or "default" (h-9). Inside PageHeader actions it is held to h-9 either way. */
  size?: "default" | "sm";
};

/** Producers' "Managers" button: appoint or remove people on a manager roster. */
export function ManagerRosterButton({ endpoint, noun, title, description, size = "sm" }: ManagerRosterProps) {
  const [open, setOpen] = useState(false);
  const [roster, setRoster] = useState<Roster | null>(null);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const response = await fetch(endpoint, { cache: "no-store" });
    if (!response.ok) throw new Error(`Could not load ${noun}.`);
    const body = await response.json() as { data: Roster };
    setRoster(body.data);
  }

  async function showManagers() {
    setOpen(true);
    setBusy(true);
    setError(null);
    setRoster(null);
    setSelected("");
    try { await load(); }
    catch { setError(`Could not load ${noun}. Close this dialog and try again.`); }
    finally { setBusy(false); }
  }

  async function changeManager(userId: string, remove: boolean) {
    setBusy(true);
    try {
      const response = await fetch(remove ? `${endpoint}?userId=${encodeURIComponent(userId)}` : endpoint, {
        method: remove ? "DELETE" : "POST",
        ...(remove ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId }) })
      });
      if (!response.ok) throw new Error(`Could not update ${noun}.`);
      setSelected("");
      await load();
      toast.success(remove ? "Manager removed." : "Manager added.");
    } catch { toast.error(`Could not update ${noun}. Please try again.`); }
    finally { setBusy(false); }
  }

  return (
    <>
      <Button type="button" size={size} variant="outline" onClick={() => void showManagers()}><Users className="h-4 w-4" aria-hidden />Managers</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          {error ? <Alert tone="danger" compact>{error}</Alert> : null}
          {busy && !roster ? <ListSkeleton rows={3} leading={false} /> : null}
          {roster ? (
            // min-w-0: DialogContent is a grid, and a native <select> is as wide as its longest option.
            <div className="min-w-0 space-y-4">
              {roster.managers.length ? (
                <ul className="max-h-64 divide-y divide-border overflow-y-auto rounded-md border border-border">
                  {roster.managers.map((manager) => (
                    <li key={manager.userId} className="flex min-h-14 items-center justify-between gap-3 px-3 py-2">
                      <div className="min-w-0"><p className="truncate text-sm font-medium">{manager.name || manager.email}</p><p className="truncate text-xs text-muted-foreground">{manager.email}</p></div>
                      <Button type="button" size="sm" variant="destructive-quiet" className="shrink-0" disabled={busy} aria-label={`Remove ${manager.name || manager.email}`} onClick={() => void changeManager(manager.userId, true)}>Remove</Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-md border border-border px-3 py-4 text-center text-sm text-muted-foreground">No managers yet.</p>
              )}
              <div className="flex gap-2">
                <NativeSelect aria-label="Registered user" value={selected} disabled={busy} onChange={(event) => setSelected(event.target.value)} wrapperClassName="flex-1" placeholderOption="Choose a registered user">
                  {roster.candidates.filter((person) => !roster.managers.some((manager) => manager.userId === person.id)).map((person) => (
                    <option key={person.id} value={person.id}>{person.name || person.email} ({person.email})</option>
                  ))}
                </NativeSelect>
                <Button type="button" className="shrink-0" disabled={busy || !selected} onClick={() => void changeManager(selected, false)}>Add manager</Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
