"use client";

import { useState, type ReactNode } from "react";
import { ExternalLink, Pencil, Users } from "lucide-react";
import { ActionBar } from "@/components/kit/action-bar";
import { Alert } from "@/components/kit/alert";
import { StatusTag } from "@/components/kit/status-tag";
import { RelativeAge } from "@/components/relative-age";
import { Button } from "@/components/ui/button";
import type { VaultAccess, VaultEntrySummary } from "@/src/lib/password-vault";
import { cn } from "@/src/lib/utils";
import { SiteIcon, hostLabel } from "./site-icon";
import { useVaultReveal } from "./use-vault-reveal";
import { VaultActivity } from "./vault-activity";
import { VaultEntryFields } from "./vault-entry-fields";

type VaultDetailVariant = "pane" | "inline" | "card";

function SiteLink({ url }: { url: string | null }) {
  if (!url) return <span className="text-sm text-muted-foreground">No website</span>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-10 max-w-full items-center gap-1.5 rounded-sm text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:pointer-fine:min-h-0"
    >
      <span className="truncate">{hostLabel(url)}</span>
      <ExternalLink className="h-4 w-4 shrink-0" aria-hidden />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

/**
 * Share and Edit for one login (execs share; anyone with full access edits). Same heights as the
 * field rows' copy buttons: 40px on touch, 32px with a mouse from lg.
 */
function EntryActions({
  entry,
  onShare,
  onEdit
}: {
  entry: VaultEntrySummary;
  onShare?: () => void;
  onEdit?: () => void;
}) {
  const share = entry.canShare && onShare;
  const edit = entry.canEdit && onEdit;
  if (!share && !edit) return null;
  return (
    <ActionBar size="sm" className="shrink-0 *:h-10 lg:pointer-fine:*:h-8">
      {share ? (
        <Button type="button" variant="outline" size="sm" onClick={onShare} aria-label={`Share ${entry.name}`}>
          <Users aria-hidden />
          Share
        </Button>
      ) : null}
      {edit ? (
        <Button type="button" variant="outline" size="sm" onClick={onEdit} aria-label={`Edit ${entry.name}`}>
          <Pencil aria-hidden />
          Edit
        </Button>
      ) : null}
    </ActionBar>
  );
}

function SharedTag({ entry }: { entry: VaultEntrySummary }) {
  if (!entry.canShare || entry.sharedWith <= 0) return null;
  return (
    <StatusTag tone="success" icon={Users}>
      Shared with {entry.sharedWith}
    </StatusTag>
  );
}

/**
 * "Last saved 2d ago by Abby" (the age ticks every minute), full date on hover. updatedAt is
 * set when a login is added too, so this doesn't claim it was edited.
 */
function SavedLine({ entry }: { entry: VaultEntrySummary }) {
  const when = new Date(entry.updatedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  return (
    <p className="border-t border-border pt-3 text-xs text-muted-foreground" title={when}>
      Last saved
      <RelativeAge iso={entry.updatedAt} prefix=" " suffix=" ago" />
      {entry.updatedBy ? <> by {entry.updatedBy}</> : null}
    </p>
  );
}

/** The login's name, website and status tags, with Share / Edit on the right (pane only). */
function DetailHeader({ entry, actions, className }: { entry: VaultEntrySummary; actions: ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-w-0 items-start gap-4 border-b border-border p-4 md:p-5", className)}>
      <SiteIcon name={entry.name} url={entry.url} size={40} />
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-lg font-semibold leading-tight text-foreground">{entry.name}</h2>
        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <SiteLink url={entry.url} />
          <SharedTag entry={entry} />
        </div>
      </div>
      {actions}
    </div>
  );
}

/**
 * One login's details: username, password, 2FA code and (full access) notes, each with the
 * same [reveal][copy] slots. The caller keys it by entry id, so every revealed value, timer and
 * inline error resets when the selection changes; saving an edit hides revealed values too.
 * Everything inside shares one right edge: the copy slots end under Share / Edit.
 * - `pane`: the right side of the list/detail panel (header, fields, meta, activity).
 * - `inline`: the body of an expanded row on narrow screens (the row is the header).
 * - `card`: a shared viewer's card (header and fields only).
 */
export function VaultEntryDetail({
  entry,
  access,
  variant,
  activityLayout = "disclosure",
  version,
  onShare,
  onEdit,
  onAnnounce
}: {
  entry: VaultEntrySummary;
  access: VaultAccess;
  variant: VaultDetailVariant;
  activityLayout?: "rail" | "disclosure";
  /** Bumps after every list reload, so activity refetches after a save or share. */
  version: number;
  onShare?: () => void;
  onEdit?: () => void;
  onAnnounce: (message: string) => void;
}) {
  const full = access === "full";
  const [error, setError] = useState<string | null>(null);
  const reveal = useVaultReveal(entry.id, entry.updatedAt, { onError: setError, onAnnounce });
  const showActivity = full && variant !== "card";
  const rail = showActivity && variant === "pane" && activityLayout === "rail";
  const activityKey = String(version);

  const body = (
    <>
      {error ? (
        <Alert tone="danger" compact onDismiss={() => setError(null)} className="mt-3">
          {error}
        </Alert>
      ) : null}
      <VaultEntryFields entry={entry} full={full} reveal={reveal} />
      {full ? <SavedLine entry={entry} /> : null}
      {showActivity && !rail ? (
        <div className="mt-2">
          <VaultActivity entryId={entry.id} layout="disclosure" refreshKey={activityKey} />
        </div>
      ) : null}
    </>
  );

  if (variant === "inline") {
    return (
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 pt-2">
          <SiteLink url={entry.url} />
          <EntryActions entry={entry} onShare={onShare} onEdit={onEdit} />
        </div>
        {body}
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <DetailHeader
        entry={entry}
        actions={variant === "pane" ? <EntryActions entry={entry} onShare={onShare} onEdit={onEdit} /> : null}
        // In the pane it is as tall as the list's search-and-chips header beside it, so the two
        // bottom rules form one line across the card (--vault-toolbar-h, set by the browser).
        className={variant === "pane" ? "min-h-[var(--vault-toolbar-h)] items-center" : undefined}
      />
      <div className={cn("px-4 pb-4 md:px-5 md:pb-5", rail && "grid grid-cols-[minmax(0,40rem)_minmax(16rem,1fr)] gap-6")}>
        <div className="min-w-0">{body}</div>
        {rail ? (
          <div className="min-w-0 border-l border-border pl-6 pt-4">
            <VaultActivity entryId={entry.id} layout="rail" refreshKey={activityKey} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
