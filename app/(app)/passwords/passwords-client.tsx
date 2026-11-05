"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { FileUp, KeyRound, Plus } from "lucide-react";
import { Alert } from "@/components/kit/alert";
import { EmptyState, ErrorState } from "@/components/kit/empty-state";
import { LoadingRegion } from "@/components/kit/skeleton";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import type { VaultAccess, VaultEntrySummary, VaultImportResult } from "@/src/lib/password-vault";
import { useElementWidth } from "./use-element-width";
import { useVaultFilters } from "./use-vault-filters";
import { vaultRequest } from "./vault-api";
import { VaultBrowser, revealVaultEntry } from "./vault-browser";
import { VaultEntryDialog, type VaultEntryChange } from "./vault-entry-dialog";
import { VaultImportDialog } from "./vault-import-dialog";
import { ImportNotice } from "./vault-import-notice";
import { layoutFor } from "./vault-logic";
import { VaultShareDialog } from "./vault-share-dialog";
import { VaultSharedCards } from "./vault-shared-cards";
import { VaultCardsSkeleton, VaultPanelSkeleton } from "./vault-skeleton";

/** One polite live region for "Password copied" and friends (the check icon is visual only). */
function useAnnouncer() {
  const [message, setMessage] = useState("");
  const announce = useCallback((text: string) => {
    setMessage("");
    window.requestAnimationFrame(() => setMessage(text));
  }, []);
  return [message, announce] as const;
}

export default function PasswordsClient({ access }: { access: VaultAccess }) {
  const full = access === "full";
  const [entries, setEntries] = useState<VaultEntrySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [version, setVersion] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<VaultImportResult | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<VaultEntrySummary | null>(null);
  const [sharing, setSharing] = useState<VaultEntrySummary | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** A login just added: scrolled into view once the reload has rendered it. */
  const revealAfterLoad = useRef<string | null>(null);
  const [announcement, announce] = useAnnouncer();
  const [measureRef, width] = useElementWidth<HTMLDivElement>();
  const layout = layoutFor(width);
  const canShare = entries.some((entry) => entry.canShare);
  const filters = useVaultFilters(entries, canShare);

  // Only the first load shows the skeleton; reloads after a change refresh in place.
  const load = useCallback(
    () =>
      vaultRequest<VaultEntrySummary[]>("/api/vault")
        .then((next) => {
          setEntries(next);
          setMessage(null);
          setVersion((current) => current + 1);
        })
        .catch((error) => setMessage(error instanceof Error ? error.message : "Failed to load passwords."))
        .finally(() => setLoading(false)),
    []
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const id = revealAfterLoad.current;
    if (!id || !entries.some((entry) => entry.id === id)) return;
    revealAfterLoad.current = null;
    window.requestAnimationFrame(() => revealVaultEntry(id));
  }, [entries]);

  async function retry() {
    setRetrying(true);
    await load();
    setRetrying(false);
  }

  function openAdd() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(entry: VaultEntrySummary) {
    setEditing(entry);
    setDialogOpen(true);
  }

  function onEntryChange(change: VaultEntryChange) {
    if (change.kind === "created") {
      // Show the new login: clear a search or chip that would hide it.
      if (filters.filtered) filters.clear();
      setSelectedId(change.id);
      revealAfterLoad.current = change.id;
    } else if (change.kind === "deleted") {
      // Split view moves to the next login (or the previous one); expanded rows just close.
      const index = filters.visible.findIndex((entry) => entry.id === change.id);
      const neighbour = filters.visible[index + 1] ?? filters.visible[index - 1] ?? null;
      setSelectedId(layout === "accordion" ? null : (neighbour?.id ?? null));
    }
    void load();
  }

  function onImported(result: VaultImportResult) {
    setNotice(result);
    void load();
  }

  const firstLoadFailed = !loading && entries.length === 0 && message !== null;

  let panel: ReactNode;
  if (loading) {
    panel = (
      <LoadingRegion label="Loading passwords">{full ? <VaultPanelSkeleton /> : <VaultCardsSkeleton />}</LoadingRegion>
    );
  } else if (firstLoadFailed) {
    panel = (
      <div className="rounded-md border border-border bg-card">
        <ErrorState size="page" title="Couldn't load passwords" message={message} onRetry={() => void retry()} busy={retrying} />
      </div>
    );
  } else if (!entries.length) {
    panel = (
      <div className="rounded-md border border-border bg-card">
        <EmptyState
          size="page"
          icon={KeyRound}
          title={full ? "No passwords yet" : "Nothing is shared with you right now"}
          description={
            full
              ? "Use Add password or Import from 1Password above to bring in the class’s shared logins."
              : "When an executive producer shares a login, it shows up here."
          }
        />
      </div>
    );
  } else if (full) {
    panel = (
      <VaultBrowser
        access={access}
        layout={layout}
        filters={filters}
        canShare={canShare}
        selectedId={selectedId}
        onSelect={setSelectedId}
        version={version}
        onShare={setSharing}
        onEdit={openEdit}
        onAnnounce={announce}
      />
    );
  } else {
    panel = <VaultSharedCards filters={filters} version={version} onAnnounce={announce} />;
  }

  return (
    <div className="route-enter space-y-5">
      <PageHeader
        eyebrow={full ? "Producer view" : "Shared with you"}
        title="Passwords"
        description={
          full
            ? "Shared InFocus logins and 2FA codes. Encrypted at rest; every view is logged."
            : "InFocus logins an executive producer shared with you. Every view is logged."
        }
        actions={
          full ? (
            <>
              <Button type="button" variant="outline" onClick={() => setImportOpen(true)} aria-label="Import from 1Password">
                <FileUp aria-hidden />
                <span className="sm:hidden">Import</span>
                <span className="max-sm:hidden">Import from 1Password</span>
              </Button>
              <Button type="button" onClick={openAdd}>
                <Plus aria-hidden />
                Add password
              </Button>
            </>
          ) : undefined
        }
      />

      {message && !firstLoadFailed ? (
        <Alert tone="danger" onDismiss={() => setMessage(null)}>
          {message}
        </Alert>
      ) : null}
      {notice ? <ImportNotice result={notice} onDismiss={() => setNotice(null)} /> : null}

      <div ref={measureRef} className="min-w-0">
        {panel}
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {full ? (
        <>
          <VaultEntryDialog open={dialogOpen} entry={editing} onOpenChange={setDialogOpen} onSaved={onEntryChange} />
          <VaultImportDialog open={importOpen} existing={entries} onOpenChange={setImportOpen} onImported={onImported} />
          <VaultShareDialog entry={sharing} onOpenChange={(open) => !open && setSharing(null)} onSaved={() => void load()} />
        </>
      ) : null}
    </div>
  );
}
