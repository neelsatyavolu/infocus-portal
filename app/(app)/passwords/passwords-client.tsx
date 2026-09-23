"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileUp, KeyRound, Loader2, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { VaultEntrySummary, VaultImportResult } from "@/src/lib/password-vault";
import { vaultRequest } from "./vault-api";
import { VaultEntryDialog } from "./vault-entry-dialog";
import { VaultEntryRow } from "./vault-entry-row";
import { VaultImportDialog } from "./vault-import-dialog";

export default function PasswordsClient() {
  const [entries, setEntries] = useState<VaultEntrySummary[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<VaultEntrySummary | null>(null);

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
    <div className="route-enter mx-auto w-full max-w-[80rem] space-y-3 pb-24">
      <section className="relative overflow-hidden rounded-2xl border border-border bg-card px-4 py-4 md:px-5">
        <div className="pointer-events-none absolute inset-0 brand-hero-gradient opacity-40" />
        <div className="relative flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="eyebrow">Producer view</div>
            <h1 className="display-md mt-1 text-balance text-foreground">Passwords</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              Shared InFocus logins and 2FA codes. Encrypted at rest; every view is logged.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="meta-pill">
              {entries.length} login{entries.length === 1 ? "" : "s"}
              {withTotp > 0 ? ` · ${withTotp} with 2FA` : ""}
            </span>
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              <FileUp className="h-3.5 w-3.5" />
              Import from 1Password
            </Button>
            <Button size="sm" onClick={openAdd}>
              <Plus className="h-3.5 w-3.5" />
              Add password
            </Button>
          </div>
        </div>

        <div className="relative mt-3">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search passwords…"
              className="h-9 w-full rounded-md border border-border bg-muted pl-8 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </label>
        </div>

        {message ? (
          <p className="relative mt-3 rounded-lg border border-amber-300/40 bg-amber-300/10 px-3 py-2 text-sm text-amber-100">
            {message}
          </p>
        ) : null}
        {notice ? (
          <p className="relative mt-3 rounded-lg border border-[var(--brand-green)]/40 bg-[var(--brand-green)]/10 px-3 py-2 text-sm text-foreground">
            {notice}
          </p>
        ) : null}
      </section>

      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        {loading ? (
          <p className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading passwords…
          </p>
        ) : visibleEntries.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-muted-foreground">
            <KeyRound className="h-5 w-5" />
            {query.trim() ? "No passwords match that search." : "No passwords yet. Add one or import from 1Password."}
          </div>
        ) : (
          <ul>
            {visibleEntries.map((entry) => (
              <VaultEntryRow key={entry.id} entry={entry} onEdit={() => openEdit(entry)} onError={setMessage} />
            ))}
          </ul>
        )}
      </section>

      <VaultEntryDialog open={dialogOpen} entry={editing} onOpenChange={setDialogOpen} onSaved={() => void load()} />
      <VaultImportDialog open={importOpen} existing={entries} onOpenChange={setImportOpen} onImported={onImported} />
    </div>
  );
}
