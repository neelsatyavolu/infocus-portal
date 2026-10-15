"use client";

import { useEffect, useState } from "react";
import { PeoplePicker } from "@/components/meetings/people-picker";
import { Alert } from "@/components/kit/alert";
import { Spinner } from "@/components/kit/spinner";
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

  // Another entry starts over (adjusted during render).
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  if (loadedFor !== entryId) {
    setLoadedFor(entryId);
    if (entryId) {
      setPeople(null);
      setSelected([]);
      setLoadError(null);
      setError(null);
    }
  }

  useEffect(() => {
    if (!entryId) return;
    let cancelled = false;
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
          <Alert tone="danger" compact>
            {error}
          </Alert>
        ) : null}

        <DialogFooter className="flex-row justify-end gap-2 sm:space-x-0">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void save()} disabled={saving || !people}>
            {saving ? <Spinner /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
