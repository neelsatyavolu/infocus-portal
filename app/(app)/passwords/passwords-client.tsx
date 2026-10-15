"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileUp, KeyRound, Loader2, Plus, Search } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import type { VaultAccess, VaultEntrySummary, VaultImportResult } from "@/src/lib/password-vault";
import { vaultRequest } from "./vault-api";
import { VaultEntryDialog } from "./vault-entry-dialog";
import { VaultEntryRow } from "./vault-entry-row";
import { VaultImportDialog } from "./vault-import-dialog";
import { VaultShareDialog } from "./vault-share-dialog";

export default function PasswordsClient({ access }: { access: VaultAccess }) {
  const full = access === "full";
  const [entries, setEntries] = useState<VaultEntrySummary[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<VaultEntrySummary | null>(null);
  const [sharing, setSharing] = useState<VaultEntrySummary | null>(null);

  const load = useCallback(async () => {
    try {
      setEntries(await vaultRequest<VaultEntrySummary[]>("/api/vault"));
      setMessage(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to load passwords.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleEntries = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((entry) =>
      [entry.name, entry.url ?? "", entry.username ?? ""].some((value) => value.toLowerCase().includes(q))
    );
  }, [entries, query]);

  function openAdd() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(entry: VaultEntrySummary) {
    setEditing(entry);
    setDialogOpen(true);
  }

  function onImported(result: VaultImportResult) {
    const warnings = result.warnings.length ? ` ${result.warnings.join(" ")}` : "";
    setNotice(`Imported ${result.imported} password${result.imported === 1 ? "" : "s"}.${warnings}`);
    void load();
  }

  const withTotp = entries.filter((entry) => entry.hasTotp).length;

  return (
    <div className="route-enter mx-auto w-full max-w-[80rem] space-y-5 pb-24">
      <PageHeader
        eyebrow={full ? "Producer view" : "Shared with you"}
        title="Passwords"
        description={
          <>
            {full
              ? "Shared InFocus logins and 2FA codes. Encrypted at rest; every view is logged."
              : "InFocus logins an executive producer shared with you. Every view is logged."}
            {` · ${entries.length} login${entries.length === 1 ? "" : "s"}`}
            {withTotp > 0 ? ` · ${withTotp} with 2FA` : ""}
          </>
        }
        actions={
          <>
            <label className="relative w-full sm:w-56">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search passwords…"
                className="h-9 w-full rounded-md border border-border bg-muted pl-8 pr-3 text-base text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring md:text-sm"
              />
            </label>
            {full ? (
              <>
                <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
                  <FileUp className="h-3.5 w-3.5" />
                  Import from 1Password
                </Button>
                <Button size="sm" onClick={openAdd}>
                  <Plus className="h-3.5 w-3.5" />
                  Add password
                </Button>
              </>
            ) : null}
          </>
        }
      />

      {message ? (
        <p className="rounded-md border border-danger/40 bg-danger-tint px-3 py-2 text-sm text-danger">
          {message}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-md border border-[var(--brand-green)]/40 bg-[var(--brand-green)]/10 px-3 py-2 text-sm text-foreground">
          {notice}
        </p>
      ) : null}

      <section className="overflow-hidden rounded-md border border-border bg-card">
        {loading ? (
          <p className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading passwords…
          </p>
        ) : visibleEntries.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-muted-foreground">
            <KeyRound className="h-5 w-5" />
            {query.trim()
              ? "No passwords match that search."
              : full
                ? "No passwords yet. Add one or import from 1Password."
                : "Nothing is shared with you right now."}
          </div>
        ) : (
          <ul>
            {visibleEntries.map((entry) => (
              <VaultEntryRow
                key={entry.id}
                entry={entry}
                onEdit={() => openEdit(entry)}
                onShare={() => setSharing(entry)}
                onError={setMessage}
              />
            ))}
          </ul>
        )}
      </section>

      {full ? (
        <>
          <VaultEntryDialog open={dialogOpen} entry={editing} onOpenChange={setDialogOpen} onSaved={() => void load()} />
          <VaultImportDialog open={importOpen} existing={entries} onOpenChange={setImportOpen} onImported={onImported} />
          <VaultShareDialog entry={sharing} onOpenChange={(open) => !open && setSharing(null)} onSaved={() => void load()} />
        </>
      ) : null}
    </div>
  );
}
