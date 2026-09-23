"use client";

import { useState } from "react";
import { Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Person = { name: string | null; email: string | null };
type Roster = { managers: (Person & { userId: string })[]; candidates: (Person & { id: string })[] };
const endpoint = "/api/package-cycle/queue/managers";

export default function PublishingManagers() {
  const [open, setOpen] = useState(false);
  const [roster, setRoster] = useState<Roster | null>(null);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const response = await fetch(endpoint, { cache: "no-store" });
    if (!response.ok) throw new Error("Could not load publishing managers.");
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
    catch { setError("Could not load publishing managers. Close this dialog and try again."); }
    finally { setBusy(false); }
  }

  async function changeManager(userId: string, remove: boolean) {
    setBusy(true);
    try {
      const response = await fetch(remove ? `${endpoint}?userId=${encodeURIComponent(userId)}` : endpoint, {
        method: remove ? "DELETE" : "POST",
        ...(remove ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId }) })
      });
      if (!response.ok) throw new Error("Could not update publishing managers.");
      setSelected("");
      await load();
      toast.success(remove ? "Manager removed." : "Manager added.");
    } catch { toast.error("Could not update publishing managers. Please try again."); }
    finally { setBusy(false); }
  }

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => void showManagers()}><Users className="h-4 w-4" />Managers</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Publishing managers</DialogTitle>
            <DialogDescription>Managers can view published packages and copy YouTube embed codes. Producers manage the queue.</DialogDescription>
          </DialogHeader>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          {busy && !roster ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
          {roster ? (
            <div className="space-y-4">
              <ul className="max-h-64 space-y-2 overflow-y-auto">
                {roster.managers.map((manager) => (
                  <li key={manager.userId} className="flex items-center justify-between gap-3">
                    <div className="min-w-0"><p className="truncate text-sm">{manager.name || manager.email}</p><p className="truncate text-xs text-muted-foreground">{manager.email}</p></div>
                    <Button type="button" size="sm" variant="destructive" disabled={busy} aria-label={`Remove ${manager.name || manager.email}`} onClick={() => void changeManager(manager.userId, true)}>Remove</Button>
                  </li>
                ))}
              </ul>
              {!roster.managers.length ? <p className="text-sm text-muted-foreground">No managers yet.</p> : null}
              <div className="flex gap-2">
                <select aria-label="Registered user" value={selected} disabled={busy} onChange={(event) => setSelected(event.target.value)} className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-sm">
                  <option value="">Choose a registered user</option>
                  {roster.candidates.filter((person) => !roster.managers.some((manager) => manager.userId === person.id)).map((person) => (
                    <option key={person.id} value={person.id}>{person.name || person.email} ({person.email})</option>
                  ))}
                </select>
                <Button type="button" disabled={busy || !selected} onClick={() => void changeManager(selected, false)}>Add manager</Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
