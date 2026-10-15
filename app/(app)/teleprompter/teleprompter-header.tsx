"use client";

import type { ReactNode } from "react";
import { RotateCcw, ScrollText } from "lucide-react";
import { IconButton } from "@/components/kit/icon-button";
import { Skeleton } from "@/components/kit/skeleton";
import { Spinner } from "@/components/kit/spinner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/**
 * Refresh reloads the scripts (and the server's anchor-name and toss fills). The label never
 * changes while it runs, so the row never shifts; the icon becomes the kit spinner. Icon-only
 * on phones, at the same height as the controls beside it.
 */
export function RefreshControl({
  iconOnly,
  loading,
  disabled,
  onRefresh
}: {
  iconOnly: boolean;
  loading: boolean;
  disabled: boolean;
  onRefresh: () => void;
}) {
  if (iconOnly) {
    return (
      <IconButton
        label="Refresh"
        icon={RotateCcw}
        variant="outline"
        busy={loading}
        onClick={onRefresh}
        disabled={disabled}
      />
    );
  }
  return (
    <Button type="button" variant="outline" onClick={onRefresh} disabled={disabled} aria-busy={loading || undefined}>
      {loading ? <Spinner /> : <RotateCcw aria-hidden />}
      Refresh
    </Button>
  );
}

export function WorkspaceSelect({
  value,
  options,
  disabled,
  onChange
}: {
  value: string;
  options: Array<{ value: string; label: string }>;
  disabled: boolean;
  onChange: (workspaceId: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className="h-9 w-56 max-sm:w-auto max-sm:min-w-0" aria-label="Select workspace">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function syncedLabel(age: string) {
  if (age === "now") return "just now";
  return /^\d+[mhd]$/.test(age) ? `${age} ago` : `on ${age}`;
}

/**
 * The nameplate: eyebrow, title, and one line saying which show it is and when the scripts last
 * synced ("Today's show · Wed, Oct 21 · Synced 2m ago", or "Next show Fri, Oct 23 · …"; see
 * headerShowLine). Actions are outline only; the one
 * filled button on the page is Run. `compact` on phones, so the script starts higher.
 */
export function TeleprompterHeader({
  firstLoad,
  showLine,
  syncedAge,
  actions,
  compact = false
}: {
  firstLoad: boolean;
  showLine: { lead: string; date: string } | null;
  /** formatAge() of the last successful load, or null before one. */
  syncedAge: string | null;
  actions?: ReactNode;
  compact?: boolean;
}) {
  const description: ReactNode = firstLoad ? (
    <Skeleton className="mt-1 h-4 w-72 max-w-full" />
  ) : (
    <p>
      {showLine ? (
        <>
          {showLine.lead} <span className="font-mono-broadcast tabular-nums">{showLine.date}</span>
        </>
      ) : (
        "Edit the rundown, then run it fullscreen."
      )}
      {syncedAge ? (
        <>
          {" · Synced "}
          <span className="font-mono-broadcast tabular-nums">{syncedLabel(syncedAge)}</span>
        </>
      ) : null}
    </p>
  );

  return (
    <PageHeader
      eyebrow={
        <>
          <ScrollText className="h-3 w-3" aria-hidden />
          Show script
        </>
      }
      title="Teleprompter"
      description={description}
      actions={actions}
      size={compact ? "compact" : "default"}
    />
  );
}
