"use client";

import { useMemo, useRef, useState } from "react";
import { FileUp, ShieldCheck } from "lucide-react";
import { ActionBar } from "@/components/kit/action-bar";
import { Alert } from "@/components/kit/alert";
import { SearchField } from "@/components/kit/search-field";
import { Spinner } from "@/components/kit/spinner";
import { StatusTag } from "@/components/kit/status-tag";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { VaultEntrySummary, VaultImportResult } from "@/src/lib/password-vault";
import type { ImportCandidate } from "@/src/lib/vault-import";
import { vaultRequest } from "./vault-api";

/** Keeps each request well under the 4.5 MB function body limit. */
const IMPORT_BATCH = 100;

function duplicateKey(name: string, username: string | null | undefined) {
  return `${name.trim().toLowerCase()}\u0000${(username ?? "").trim().toLowerCase()}`;
}

function Steps() {
  const steps = [
    <>In 1Password, choose File → Export.</>,
    <>
      Pick the account and save it as <span className="text-foreground">.1pux</span> or{" "}
      <span className="text-foreground">CSV</span>.
    </>,
    <>Choose that file below.</>
  ];
  return (
    <ol className="space-y-2 text-sm text-[var(--ink-text)]">
      {steps.map((step, index) => (
        <li key={index} className="flex items-start gap-3">
          <span
            aria-hidden
            className="grid h-5 w-5 shrink-0 place-items-center rounded-sm bg-[var(--ink-3)] text-[11px] tabular-nums text-foreground"
          >
            {index + 1}
          </span>
          <span className="min-w-0">{step}</span>
        </li>
      ))}
    </ol>
  );
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

  function clearFileInput() {
    if (inputRef.current) inputRef.current.value = "";
  }

  // Parsed secrets live only in this dialog's memory; closing wipes them.
  function reset() {
    setCandidates(null);
    setSelected(new Set());
    setQuery("");
    setError(null);
    clearFileInput();
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
      // Let the same (fixed) file be chosen again.
      clearFileInput();
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
    let total: VaultImportResult = { imported: 0, warnings: [] };
    // Keys of batches the server already took, so a retry after an error doesn't add them twice.
    let doneKeys: string[] = [];
    try {
      for (let start = 0; start < chosen.length; start += IMPORT_BATCH) {
        const batch = chosen.slice(start, start + IMPORT_BATCH);
        const entries = batch.map(({ name, url, username, password, totp, notes }) => ({
          name,
          url,
          username,
          password,
          totp,
          notes
        }));
        const result = await vaultRequest<VaultImportResult>("/api/vault/import", { method: "POST", body: { entries } });
        total = { imported: total.imported + result.imported, warnings: [...total.warnings, ...result.warnings] };
        doneKeys = [...doneKeys, ...batch.map((item) => item.key)];
      }
      onImported(total);
      handleOpenChange(false);
    } catch (importError) {
      const done = total.imported ? ` ${total.imported} were imported before the error.` : "";
      setError(`${importError instanceof Error ? importError.message : "Import failed."}${done}`);
      if (doneKeys.length) {
        const imported = new Set(doneKeys);
        setSelected((current) => new Set(Array.from(current).filter((key) => !imported.has(key))));
      }
      if (total.imported) onImported(total);
    } finally {
      setBusy(null);
    }
  }

  const allVisibleSelected = visible.length > 0 && visible.every((item) => selected.has(item.key));

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[90dvh] max-w-2xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>Import from 1Password</DialogTitle>
          <DialogDescription>
            The file is read in this browser; only the items you tick are uploaded, then encrypted.
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
          <div className="space-y-4">
            <Steps />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy === "parse"}
              className="flex w-full flex-col items-center gap-2 rounded-md border border-dashed border-input px-4 py-10 text-sm text-muted-foreground transition-colors hover:border-[var(--brand-green)]/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            >
              {busy === "parse" ? <Spinner label="Reading the file" /> : <FileUp className="h-6 w-6" aria-hidden />}
              Choose a .1pux or .csv export
            </button>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <ActionBar>
              <SearchField
                value={query}
                onChange={setQuery}
                placeholder="Filter items…"
                ariaLabel="Filter items"
                className="min-w-[12rem] flex-1"
              />
              <Button type="button" variant="outline" onClick={() => setVisible(!allVisibleSelected)}>
                {allVisibleSelected ? "Select none" : "Select all"}
              </Button>
              <span aria-live="polite" className="flex items-center whitespace-nowrap text-sm text-muted-foreground">
                <span className="font-mono-broadcast tabular-nums text-foreground">{selected.size}</span>
                &nbsp;of&nbsp;
                <span className="font-mono-broadcast tabular-nums text-foreground">{candidates.length}</span>
                &nbsp;selected
              </span>
            </ActionBar>

            <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto rounded-md border border-border">
              {visible.map((item) => {
                const duplicate = existingKeys.has(duplicateKey(item.name, item.username));
                return (
                  <li key={item.key}>
                    <label className="grid cursor-pointer grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 transition-colors hover:bg-[var(--ink-3)]">
                      <Checkbox checked={selected.has(item.key)} onCheckedChange={() => toggle(item.key)} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-foreground">{item.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {[item.username, item.url, item.folder].filter(Boolean).join(" · ") || "No username"}
                        </span>
                      </span>
                      <span className="flex items-center gap-1.5">
                        {item.totp ? (
                          <StatusTag size="sm" icon={ShieldCheck} title="Has 2FA">
                            2FA
                          </StatusTag>
                        ) : null}
                        {duplicate ? (
                          <StatusTag size="sm" tone="warning">
                            Already saved
                          </StatusTag>
                        ) : null}
                      </span>
                    </label>
                  </li>
                );
              })}
              {!visible.length ? <li className="px-3 py-6 text-center text-sm text-muted-foreground">No items match.</li> : null}
            </ul>
          </div>
        )}

        {error ? (
          <Alert tone="danger" compact>
            {error}
          </Alert>
        ) : null}

        <DialogFooter className="flex-row flex-wrap items-center justify-between gap-2 sm:justify-between sm:space-x-0">
          <div>
            {candidates ? (
              <Button type="button" variant="ghost" onClick={reset} disabled={busy !== null}>
                Choose another file
              </Button>
            ) : null}
          </div>
          <div className="ml-auto flex gap-2">
            <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void runImport()} disabled={!selected.size || busy !== null}>
              {busy === "import" ? <Spinner /> : null}
              Import {selected.size || ""}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
