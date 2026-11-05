"use client";

import { useState, type MouseEvent } from "react";
import type { Route } from "next";
import Link from "next/link";
import {
  Check,
  Download,
  GitMerge,
  Loader2,
  MoreHorizontal,
  Pencil,
  PlayCircle,
  RefreshCw,
  RotateCcw,
  Trash2,
  UploadCloud
} from "lucide-react";
import { IconButton } from "@/components/kit/icon-button";
import { renderIcon } from "@/components/kit/icon";
import { ActionMenu, visibleMenuEntries, type MenuEntry, type MenuItem } from "@/components/kit/menu";
import { useMediaQuery } from "@/components/kit/remembered-state";
import { Sheet } from "@/components/kit/sheet";
import { cn } from "@/src/lib/utils";

export type DropdownOption<TValue extends string = string> = {
  value: TValue;
  label: string;
  hint?: string;
  /** Shown but not choosable (the hint says why). */
  disabled?: boolean;
};

type VideoCardMenuProps = {
  /** Names the menu ("Actions for {title}") and titles the phone sheet. */
  title?: string;
  reviewHref: string;
  versionValue?: string;
  versionOptions?: DropdownOption<string>[];
  onVersionChange?: (versionId: string) => void;
  statusValue?: string;
  statusOptions?: DropdownOption<string>[];
  onStatusChange?: (status: string) => void;
  statusDisabled?: boolean;
  /** Why Status can't be changed right now ("View only", "Restore it first"). */
  statusDisabledReason?: string;
  onUploadNewVersion?: () => void;
  onMoveIntoVersion?: () => void;
  onDownloadOriginal?: () => void;
  onRename?: () => void;
  onSyncTurnedInDate?: () => void;
  syncTurnedInDisabled?: boolean;
  onDelete?: () => void;
  /** Recently deleted: put it back, or delete it for good. */
  onRestore?: () => void;
  onDeletePermanently?: () => void;
  /** A restore or delete is already running. */
  deleteBusy?: boolean;
  className?: string;
};

const TOUCH_TRIGGER = "[@media(hover:none)]:h-10 [@media(hover:none)]:w-10";

function isItem(entry: MenuEntry): entry is MenuItem {
  return typeof entry === "object" && !("type" in entry);
}

function buildEntries({
  reviewHref,
  versionValue,
  versionOptions,
  onVersionChange,
  statusValue,
  statusOptions,
  onStatusChange,
  statusDisabled = false,
  statusDisabledReason,
  onUploadNewVersion,
  onMoveIntoVersion,
  onDownloadOriginal,
  onRename,
  onSyncTurnedInDate,
  syncTurnedInDisabled = false,
  onDelete,
  onRestore,
  onDeletePermanently,
  deleteBusy = false
}: VideoCardMenuProps): MenuEntry[] {
  const entries: MenuEntry[] = [{ key: "open", label: "Open review", icon: PlayCircle, href: reviewHref }];

  if (versionValue && versionOptions?.length && onVersionChange) {
    entries.push("separator", { type: "label", label: "Version" });
    for (const option of versionOptions) {
      entries.push({
        key: `version-${option.value}`,
        label: option.hint ? `${option.label} · ${option.hint}` : option.label,
        checked: option.value === versionValue,
        onSelect: () => onVersionChange(option.value)
      });
    }
  }

  if (statusValue && statusOptions?.length && onStatusChange) {
    entries.push("separator", { type: "label", label: "Status" });
    if (statusDisabled) {
      const current = statusOptions.find((option) => option.value === statusValue);
      entries.push({
        key: "status-locked",
        label: current?.label ?? statusValue,
        checked: true,
        disabled: true,
        hint: statusDisabledReason
      });
    } else {
      for (const option of statusOptions) {
        entries.push({
          key: `status-${option.value}`,
          label: option.label,
          checked: option.value === statusValue,
          disabled: option.disabled,
          hint: option.hint,
          onSelect: () => onStatusChange(option.value)
        });
      }
    }
  }

  entries.push(
    "separator",
    { key: "upload-version", label: "Upload new version", icon: UploadCloud, hidden: !onUploadNewVersion, onSelect: onUploadNewVersion },
    { key: "move-version", label: "Move into version", icon: GitMerge, hidden: !onMoveIntoVersion, onSelect: onMoveIntoVersion },
    {
      key: "sync-turn-in",
      label: "Sync turn-in date",
      icon: syncTurnedInDisabled ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden /> : RefreshCw,
      hidden: !onSyncTurnedInDate,
      disabled: syncTurnedInDisabled,
      onSelect: onSyncTurnedInDate
    },
    { key: "download", label: "Download original", icon: Download, hidden: !onDownloadOriginal, onSelect: onDownloadOriginal },
    { key: "rename", label: "Rename video", icon: Pencil, hidden: !onRename, onSelect: onRename },
    { key: "restore", label: "Restore", icon: RotateCcw, hidden: !onRestore, disabled: deleteBusy, onSelect: onRestore },
    "separator",
    { key: "delete", label: "Delete video", icon: Trash2, tone: "danger", hidden: !onDelete, onSelect: onDelete },
    {
      key: "delete-permanently",
      label: "Delete permanently",
      icon: Trash2,
      tone: "danger",
      hidden: !onDeletePermanently,
      disabled: deleteBusy,
      onSelect: onDeletePermanently
    }
  );

  return visibleMenuEntries(entries);
}

/** Phone and tablet: the same entries in a bottom sheet with 40px rows and no nested flyouts. */
function MenuSheet({
  open,
  onOpenChange,
  title,
  entries
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  entries: MenuEntry[];
}) {
  const rowClass = (item: MenuItem) =>
    cn(
      "flex min-h-10 w-full items-center gap-3 rounded-sm px-2 py-2 text-left text-sm outline-none transition-colors",
      item.disabled
        ? "cursor-not-allowed opacity-50"
        : item.tone === "danger"
          ? "text-danger hover:bg-danger-tint focus-visible:bg-danger-tint"
          : "text-foreground hover:bg-[var(--ink-3)] focus-visible:bg-[var(--ink-3)]"
    );

  const body = (item: MenuItem) => (
    <>
      <span className="flex h-4 w-4 shrink-0 items-center justify-center [&>svg]:size-4">
        {item.checked ? <Check className="h-4 w-4 text-[var(--brand-green)]" aria-hidden /> : renderIcon(item.icon, "h-4 w-4")}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate">{item.label}</span>
        {item.hint ? <span className="block text-xs text-muted-foreground">{item.hint}</span> : null}
      </span>
    </>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={title} side="bottom" bodyClassName="px-2 py-2">
      <div role="menu" aria-label={title} className="flex flex-col">
        {entries.map((entry, index) => {
          if (entry === "separator") {
            return <div key={`separator-${index}`} role="separator" className="my-1 h-px bg-border" />;
          }
          if (!isItem(entry)) {
            return (
              <div
                key={`label-${index}`}
                role="presentation"
                className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground"
              >
                {entry.label}
              </div>
            );
          }
          const key = entry.key ?? `item-${index}`;
          const role = entry.checked !== undefined ? "menuitemradio" : "menuitem";
          if (entry.href && !entry.disabled) {
            return (
              <Link key={key} href={entry.href as Route} role={role} className={rowClass(entry)} onClick={() => onOpenChange(false)}>
                {body(entry)}
              </Link>
            );
          }
          return (
            <button
              key={key}
              type="button"
              role={role}
              aria-checked={entry.checked}
              aria-disabled={entry.disabled || undefined}
              onClick={() => {
                if (entry.disabled) return;
                onOpenChange(false);
                entry.onSelect?.();
              }}
              className={rowClass(entry)}
            >
              {body(entry)}
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}

/**
 * The ⋯ menu on a video card or row: Open review · Version · Status · upload/move/sync/download/
 * rename · Delete (Restore · Delete permanently in Recently deleted). A popover from lg (flips at the screen edge), a bottom sheet below lg.
 * Clicks inside never reach the card, so they don't open the review.
 */
export function VideoCardMenu(props: VideoCardMenuProps) {
  const desktop = useMediaQuery("(min-width: 1024px)");
  const [sheetOpen, setSheetOpen] = useState(false);
  const label = props.title ? `Actions for ${props.title}` : "Video actions";
  const entries = buildEntries(props);

  // Portaled menus still bubble React events to the card; stop them here.
  function stop(event: MouseEvent) {
    event.stopPropagation();
  }

  return (
    <span className="contents" data-prevent-review-open="true" onClick={stop}>
      {desktop ? (
        <ActionMenu
          items={entries}
          label={label}
          triggerIcon={MoreHorizontal}
          size="sm"
          className={cn(TOUCH_TRIGGER, props.className)}
        />
      ) : (
        <>
          <IconButton
            label={label}
            icon={MoreHorizontal}
            size="sm"
            tooltip={false}
            aria-haspopup="menu"
            className={cn(TOUCH_TRIGGER, props.className)}
            onClick={() => setSheetOpen(true)}
          />
          <MenuSheet open={sheetOpen} onOpenChange={setSheetOpen} title={props.title ?? "Video"} entries={entries} />
        </>
      )}
    </span>
  );
}
