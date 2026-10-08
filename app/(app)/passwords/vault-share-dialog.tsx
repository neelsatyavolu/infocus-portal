"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { PeoplePicker } from "@/components/meetings/people-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { VaultEntrySummary, VaultPerson } from "@/src/lib/password-vault";
import { vaultRequest } from "./vault-api";

type PeopleResponse = { people: VaultPerson[] };

/** Execs pick who outside the vault can use this login. */
export function VaultShareDialog({
  entry,
  onOpenChange,
  onSaved
}: {
  entry: VaultEntrySummary | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [people, setPeople] = useState<VaultPerson[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const entryId = entry?.id ?? null;

  useEffect(() => {
    if (!entryId) return;
    let cancelled = false;
    setPeople(null);
    setSelected([]);
    setLoadError(null);
    setError(null);
    Promise.all([
      vaultRequest<PeopleResponse>("/api/vault/people"),
      vaultRequest<PeopleResponse>(`/api/vault/${entryId}/shares`)
    ])
      .then(([candidates, current]) => {
        if (cancelled) return;
        // Keep current people listed even if they've since joined the vault, so they can be removed.
        const known = new Set(candidates.people.map((person) => person.id));
        setPeople([...candidates.people, ...current.people.filter((person) => !known.has(person.id))]);
        setSelected(current.people.map((person) => person.id));
      })
      .catch((err) => !cancelled && setLoadError(err instanceof Error ? err.message : "Couldn't load people."));
    return () => {
      cancelled = true;
    };
  }, [entryId]);

  async function save() {
    if (!entryId) return;
    setSaving(true);
    setError(null);
    try {
      await vaultRequest<PeopleResponse>(`/api/vault/${entryId}/shares`, { method: "PUT", body: { userIds: selected } });
      onSaved();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save sharing.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={Boolean(entry)} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Share {entry?.name}</DialogTitle>
          <DialogDescription>
            They can copy the username, password, and 2FA code and open the website from Passwords. They can&apos;t
            see notes or edit. Every view is logged. Producers already see every login.
          </DialogDescription>
        </DialogHeader>

        <PeoplePicker people={people} error={loadError} selected={selected} onChange={setSelected} noun="people" />

        {error ? (
          <p className="rounded-lg border border-danger/40 bg-danger-tint px-3 py-2 text-sm text-danger">{error}</p>
        ) : null}

        <DialogFooter className="gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={() => void save()} disabled={saving || !people}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
