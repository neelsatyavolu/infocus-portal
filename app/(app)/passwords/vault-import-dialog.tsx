"use client";

import { useMemo, useRef, useState } from "react";
import { FileUp, Loader2, Search, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { VaultEntrySummary, VaultImportResult } from "@/src/lib/password-vault";
import type { ImportCandidate } from "@/src/lib/vault-import";
import { vaultRequest } from "./vault-api";

/** Keeps each request well under the 4.5 MB function body limit. */
const IMPORT_BATCH = 100;

function duplicateKey(name: string, username: string | null | undefined) {
  return `${name.trim().toLowerCase()}\u0000${(username ?? "").trim().toLowerCase()}`;
}

export function VaultImportDialog({
  open,
  existing,
  onOpenChange,
  onImported
}: {
  open: boolean;
  existing: VaultEntrySummary[];
  onOpenChange: (open: boolean) => void;
  onImported: (result: VaultImportResult) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [candidates, setCandidates] = useState<ImportCandidate[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<"parse" | "import" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const existingKeys = useMemo(
    () => new Set(existing.map((entry) => duplicateKey(entry.name, entry.username))),
    [existing]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!candidates || !q) return candidates ?? [];
    return candidates.filter((item) =>
      [item.name, item.username, item.url, item.folder ?? ""].some((value) => value.toLowerCase().includes(q))
    );
  }, [candidates, query]);

  // Parsed secrets live only in this dialog's memory; closing wipes them.
  function reset() {
    setCandidates(null);
    setSelected(new Set());
    setQuery("");
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy("parse");
    setError(null);
    try {
      // Loaded on demand: the parser pulls in fflate for zip exports.
      const { parseVaultImportFile } = await import("@/src/lib/vault-import");
      const items = await parseVaultImportFile(file);
      if (!items.length) throw new Error("No logins with a username, password, or 2FA key were found.");
      setCandidates(items);
      setSelected(new Set(items.filter((item) => !existingKeys.has(duplicateKey(item.name, item.username))).map((item) => item.key)));
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : "Could not read that file.");
    } finally {
      setBusy(null);
    }
  }

  function toggle(key: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function setVisible(checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      for (const item of visible) {
        if (checked) next.add(item.key);
        else next.delete(item.key);
      }
      return next;
    });
  }

  async function runImport() {
    const chosen = (candidates ?? []).filter((item) => selected.has(item.key));
    if (!chosen.length) return;
    setBusy("import");
    setError(null);
    const total: VaultImportResult = { imported: 0, warnings: [] };
    try {
      for (let start = 0; start < chosen.length; start += IMPORT_BATCH) {
        const entries = chosen.slice(start, start + IMPORT_BATCH).map(({ name, url, username, password, totp, notes }) => ({
          name,
          url,
          username,
          password,
          totp,
          notes
        }));
        const result = await vaultRequest<VaultImportResult>("/api/vault/import", { method: "POST", body: { entries } });
        total.imported += result.imported;
        total.warnings.push(...result.warnings);
      }
      onImported(total);
      handleOpenChange(false);
    } catch (importError) {
      const done = total.imported ? ` ${total.imported} were imported before the error.` : "";
      setError(`${importError instanceof Error ? importError.message : "Import failed."}${done}`);
      if (total.imported) onImported(total);
    } finally {
      setBusy(null);
    }
  }

  const allVisibleSelected = visible.length > 0 && visible.every((item) => selected.has(item.key));

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Import from 1Password</DialogTitle>
          <DialogDescription>
            In 1Password, choose File → Export, pick the account, and save as <span className="text-foreground">.1pux</span> or{" "}
            <span className="text-foreground">CSV</span>. The file is read in this browser; only the items you tick are uploaded,
            then encrypted.
          </DialogDescription>
        </DialogHeader>

        <input
          ref={inputRef}
          type="file"
          accept=".1pux,.csv"
          className="hidden"
          onChange={(event) => void onFile(event.target.files?.[0])}
        />

        {!candidates ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy === "parse"}
            className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-4 py-10 text-sm text-muted-foreground transition hover:border-[var(--brand-green)]/50 hover:text-foreground"
          >
            {busy === "parse" ? <Loader2 className="h-5 w-5 animate-spin" /> : <FileUp className="h-5 w-5" />}
            Choose a .1pux or .csv export
          </button>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <label className="relative min-w-[12rem] flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Filter items…"
                  className="h-9 w-full rounded-md border border-border bg-muted pl-8 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground"
                />
              </label>
              <Button type="button" variant="outline" size="sm" onClick={() => setVisible(!allVisibleSelected)}>
                {allVisibleSelected ? "Select none" : "Select all"}
              </Button>
              <span className="meta-pill">
                {selected.size} of {candidates.length} selected
              </span>
            </div>

            <ul className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border">
              {visible.map((item) => {
                const duplicate = existingKeys.has(duplicateKey(item.name, item.username));
                return (
                  <li key={item.key} className="border-b border-border last:border-b-0">
                    <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-foreground/[0.03]">
                      <input
                        type="checkbox"
                        checked={selected.has(item.key)}
                        onChange={() => toggle(item.key)}
                        className="h-4 w-4 shrink-0 accent-[var(--brand-green)]"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-foreground">{item.name}</span>
                        <span className="block truncate font-mono-broadcast text-[11px] text-muted-foreground">
                          {[item.username, item.url, item.folder].filter(Boolean).join(" · ") || "No username"}
                        </span>
                      </span>
                      {item.totp ? (
                        <span className="meta-pill inline-flex items-center gap-1" title="Has 2FA">
                          <ShieldCheck className="h-3 w-3" />
                          2FA
                        </span>
                      ) : null}
                      {duplicate ? <span className="meta-pill text-amber-300">Already saved</span> : null}
                    </label>
                  </li>
                );
              })}
              {!visible.length ? <li className="px-3 py-6 text-center text-sm text-muted-foreground">No items match.</li> : null}
            </ul>
          </div>
        )}

        {error ? (
          <p className="rounded-lg border border-amber-300/40 bg-amber-300/10 px-3 py-2 text-sm text-amber-100">{error}</p>
        ) : null}

        <DialogFooter className="gap-2 sm:justify-between">
          {candidates ? (
            <Button type="button" variant="ghost" size="sm" onClick={reset} disabled={busy !== null}>
              Choose another file
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={() => void runImport()} disabled={!selected.size || busy !== null}>
              {busy === "import" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Import {selected.size || ""}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
