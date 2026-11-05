"use client";

import { FolderInput, GitMerge, RotateCcw, Trash2, UploadCloud, X } from "lucide-react";
import { IconButton } from "@/components/kit/icon-button";
import { ActionMenu, type MenuEntry } from "@/components/kit/menu";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { NativeSelect } from "@/components/ui/native-select";
import type { DropdownOption } from "@/components/video-card-menu";
import { LIST_CHECK_INSET } from "@/components/project-assets/list-layout";
import type { ScopeMode } from "@/components/project-assets/types";
import { cn } from "@/src/lib/utils";

type FolderPickerProps = {
  folderOptions: DropdownOption<string>[];
  commonFolder: string | null;
  moving: boolean;
  onMoveTo: (folderValue: string) => void;
};

function folderOptionElements({ folderOptions, commonFolder }: Pick<FolderPickerProps, "folderOptions" | "commonFolder">) {
  return folderOptions.map((option) => (
    <option key={option.value} value={option.value} disabled={option.value === commonFolder}>
      {option.value === commonFolder ? `${option.label} (current)` : option.label}
    </option>
  ));
}

/**
 * "Move to…": a select from sm; on phones a 40px folder button with the native select laid over
 * it (the phone's own picker opens), so the bar fits beside the ✱ launcher.
 */
function MoveToFolder({ folderOptions, commonFolder, moving, onMoveTo }: FolderPickerProps) {
  const onChange = (value: string) => {
    if (value) onMoveTo(value);
  };
  return (
    <>
      <NativeSelect
        aria-label="Move to folder"
        value=""
        disabled={moving}
        placeholderOption={moving ? "Moving…" : "Move to…"}
        onChange={(event) => onChange(event.target.value)}
        wrapperClassName="w-40 max-sm:hidden"
        className="h-10 md:h-9"
      >
        {folderOptionElements({ folderOptions, commonFolder })}
      </NativeSelect>
      <span
        title="Move to folder"
        className={cn(
          "relative inline-flex w-10 shrink-0 items-center justify-center rounded-md border border-input text-foreground focus-within:ring-2 focus-within:ring-ring sm:hidden",
          moving && "opacity-50"
        )}
      >
        <FolderInput className="h-4 w-4" aria-hidden />
        <select
          aria-label="Move to folder"
          value=""
          disabled={moving}
          onChange={(event) => onChange(event.target.value)}
          className="absolute inset-0 h-full w-full cursor-pointer appearance-none text-base opacity-0 disabled:cursor-not-allowed"
        >
          <option value="">{moving ? "Moving…" : "Move to…"}</option>
          {folderOptionElements({ folderOptions, commonFolder })}
        </select>
      </span>
    </>
  );
}

/**
 * While the phone bar is up, lift the toasts above it. The upload toast and Sonner's toasts are
 * portaled into <body>, outside the shell root that sets --phone-tabbar-h, so they read these on
 * <html> (`!important` beats the shell's inline --toast-offset-bottom; the shell root keeps its
 * own --phone-tabbar-h). The bar's top edge is the tab bar (3.75rem + safe area) plus the bar
 * (at most 4rem + its 1px border: 40px controls below md, 36px from md). Sonner goes 0.5rem above it; the upload toast adds its own
 * max(1.25rem, safe area) + 3.5rem to --phone-tabbar-h, so 4.25rem less lands it at least 0.5rem above.
 */
const LIFT_TOASTS_CSS = `@media (max-width: 1023.98px) {
  :root {
    --pa-selection-top: calc(7.75rem + 1px + env(safe-area-inset-bottom, 0px));
    --toast-offset-bottom: calc(var(--pa-selection-top) + 0.5rem) !important;
    --phone-tabbar-h: calc(var(--pa-selection-top) - 4.25rem) !important;
  }
}`;

/**
 * Bulk actions for the selected assets. From lg it takes the toolbar's place (same row, same
 * height, the select-all box in the same spot) and sticks under the top bar while the grid
 * scrolls. Below lg it is fixed above the phone tab bar, leaving a right gutter for the ✱
 * launcher. Its controls follow the toolbar's touch size (40px below md, 36px from md). Below xl
 * (where the shell's rail and Assets sidebar leave the page too narrow), "Upload new version"
 * and "Move into version" fold into a ⋯ menu. In List view the select-all box moves over the
 * rows' checkbox column, as the toolbar's does.
 * No container queries here: a query container could become the fixed bar's containing block.
 */
export function SelectionBar({
  scope,
  listView,
  count,
  selectAll,
  onToggleAll,
  onClear,
  canUpload,
  canManageProjectMedia,
  onUploadVersion,
  onMoveIntoVersion,
  folderOptions,
  commonFolder,
  moving,
  onMoveTo,
  deleting,
  onDelete,
  onRestore,
  onDeletePermanently
}: {
  scope: ScopeMode;
  /** List view: line the select-all box up with the rows' checkbox column. */
  listView: boolean;
  count: number;
  selectAll: "none" | "some" | "all";
  onToggleAll: () => void;
  onClear: () => void;
  canUpload: boolean;
  canManageProjectMedia: boolean;
  onUploadVersion: () => void;
  onMoveIntoVersion: () => void;
  folderOptions: DropdownOption<string>[];
  /** The folder every selected item is already in ("root"), or null when they differ. */
  commonFolder: string | null;
  moving: boolean;
  onMoveTo: (folderValue: string) => void;
  deleting: boolean;
  onDelete: () => void;
  onRestore: () => void;
  onDeletePermanently: () => void;
}) {
  const active = scope === "active";
  // A new version goes onto exactly one video.
  const versionHint = count === 1 ? undefined : "Select one video";
  const overflow: MenuEntry[] = [
    {
      key: "upload-version",
      label: "Upload new version",
      icon: UploadCloud,
      hidden: !canUpload,
      disabled: count !== 1,
      hint: versionHint,
      onSelect: onUploadVersion
    },
    { key: "move-version", label: "Move into version", icon: GitMerge, hidden: !canManageProjectMedia, onSelect: onMoveIntoVersion }
  ];
  const hasOverflow = active && (canUpload || canManageProjectMedia);

  return (
    <div
      role="region"
      aria-label="Selected videos"
      className={cn(
        "flex min-w-0 items-center gap-3",
        // Phones: the tab bar is 3.75rem plus its own safe-area padding, so the bar sits on top
        // of both. With no tab bar (--phone-tabbar-h unset) the ×100 terms drop the lift and the
        // bar takes the safe area as bottom padding instead. m-0: the page's space-y margin
        // would otherwise lift the fixed bar off the tab bar.
        "max-lg:fixed max-lg:inset-x-0 max-lg:bottom-[calc(var(--phone-tabbar-h,0px)_+_min(env(safe-area-inset-bottom,0px),var(--phone-tabbar-h,0px)*100))] max-lg:z-30 max-lg:m-0 max-lg:border-t max-lg:border-border max-lg:bg-background max-lg:px-4 max-lg:py-3 max-lg:pb-[max(0.75rem,calc(env(safe-area-inset-bottom,0px)_-_var(--phone-tabbar-h,0px)*100))] max-lg:pr-[calc(max(1.25rem,env(safe-area-inset-right))+3.5rem)]",
        // From lg it stays in reach under the top bar. The 8px padding keeps scrolled cards off
        // its edges; the margins take it back out so it fills the toolbar's 36px slot (the page
        // stacks with space-y-5: 1.25rem = 0.75rem margin + 0.5rem padding on each side).
        "lg:sticky lg:top-[var(--app-header-h,0px)] lg:z-20 lg:-mt-2 lg:mb-3 lg:bg-background lg:py-2"
      )}
    >
      <style>{LIFT_TOASTS_CSS}</style>
      <div className="flex shrink-0 items-center gap-2">
        <span className={cn("hidden h-9 items-center lg:flex", listView && LIST_CHECK_INSET.selectionBar)}>
          <Checkbox
            size="md"
            checked={selectAll === "all" ? true : selectAll === "some" ? "indeterminate" : false}
            onCheckedChange={onToggleAll}
            aria-label={selectAll === "all" ? "Deselect all" : "Select all on this page"}
            className="h-9"
          />
        </span>
        <IconButton label="Clear selection" icon={X} size="touch" tooltip={false} onClick={onClear} className="lg:hidden" />
        <span aria-live="polite" className="whitespace-nowrap text-sm font-medium text-foreground">
          <span className="font-mono-broadcast tabular-nums">{count}</span> selected
        </span>
        <Button type="button" variant="ghost" onClick={onClear} className="max-lg:hidden">
          Clear
        </Button>
      </div>

      <div className="ml-auto flex min-w-0 items-center gap-2 *:h-10 md:*:h-9">
        {active ? (
          <>
            {canUpload ? (
              // The span carries the hint: a disabled button shows no tooltip.
              <span title={versionHint} className="hidden xl:inline-flex">
                <Button type="button" variant="outline" onClick={onUploadVersion} disabled={count !== 1} className="h-full">
                  <UploadCloud aria-hidden />
                  Upload new version
                </Button>
              </span>
            ) : null}
            {canManageProjectMedia ? (
              <Button type="button" variant="outline" onClick={onMoveIntoVersion} className="hidden xl:inline-flex">
                <GitMerge aria-hidden />
                Move into version
              </Button>
            ) : null}
            <MoveToFolder folderOptions={folderOptions} commonFolder={commonFolder} moving={moving} onMoveTo={onMoveTo} />
            <Button
              type="button"
              variant="destructive-quiet"
              onClick={onDelete}
              disabled={deleting}
              aria-label="Delete selected"
              className="max-sm:w-10 max-sm:px-0"
            >
              <Trash2 aria-hidden />
              <span aria-hidden className="max-sm:hidden">
                Delete
              </span>
            </Button>
            {hasOverflow ? (
              <span className="flex xl:hidden">
                <ActionMenu items={overflow} label="More for selected" variant="outline" className="max-md:h-10" />
              </span>
            ) : null}
          </>
        ) : (
          <>
            <Button type="button" variant="outline" onClick={onRestore} disabled={deleting} className="max-sm:px-3">
              <RotateCcw aria-hidden className="max-sm:hidden" />
              Restore
            </Button>
            <Button
              type="button"
              variant="destructive-quiet"
              onClick={onDeletePermanently}
              disabled={deleting}
              aria-label="Delete selected permanently"
              className="max-sm:w-10 max-sm:px-0"
            >
              <Trash2 aria-hidden />
              <span aria-hidden className="max-sm:hidden">
                Delete permanently
              </span>
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
