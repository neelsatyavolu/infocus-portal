"use client";

import { memo, type DragEvent } from "react";
import { ChevronRight, Folder } from "lucide-react";
import { IconTile } from "@/components/kit/avatar";
import { ProgressSegments } from "@/components/kit/progress";
import { StatusTag } from "@/components/kit/status-tag";
import { folderTag, pluralize, type FolderStage } from "@/components/project-assets/format";
import { LIST_COLUMNS, LIST_ROW } from "@/components/project-assets/list-layout";
import type { FolderItem } from "@/components/project-assets/types";
import { folderDisplayName } from "@/src/lib/project-folders";
import { cn } from "@/src/lib/utils";

type FolderTileProps = {
  folder: FolderItem;
  /** A Cycle group's stage folders with their counts (real data), or null. */
  stages: FolderStage[] | null;
  /** An asset is being dragged somewhere on the page. */
  dragActive: boolean;
  /** …and it's over this folder. */
  dragOver: boolean;
  onOpen: (folderId: string) => void;
  onPrefetch: (folderId: string) => void;
  onDragTarget: (folderId: string) => void;
  onDropFolder: (folderId: string) => void;
};

function stagesLabel(stages: FolderStage[]) {
  return stages.map((stage) => `${stage.label} ${stage.count}`).join(", ");
}

/** The tiny stage strip: one segment per stage folder, filled once it has something in it. */
function StageStrip({ stages, className }: { stages: FolderStage[]; className?: string }) {
  const label = stagesLabel(stages);
  return (
    <span title={label} className={cn("inline-flex w-12 shrink-0", className)}>
      <ProgressSegments
        segments={stages.map((stage) => (stage.count > 0 ? "done" : "later"))}
        label={label}
        size="xs"
      />
    </span>
  );
}

/** Every folder icon is neutral; it turns green only while an asset is dragged over it. */
function FolderIcon({ dragOver, className }: { dragOver: boolean; className?: string }) {
  return <IconTile icon={Folder} size={36} tone={dragOver ? "brand" : "neutral"} className={className} />;
}

function FolderTag({ folder, className }: { folder: FolderItem; className?: string }) {
  const tag = folderTag(folder);
  if (!tag) {
    return null;
  }
  return (
    <StatusTag tone={tag.tone} size="sm" className={className}>
      {tag.label}
    </StatusTag>
  );
}

/** Drag-and-drop target handlers shared by the tile and the list row (same data attribute). */
function dropTargetProps({ folder, dragActive, onDragTarget, onDropFolder }: FolderTileProps) {
  return {
    "data-folder-drop-zone": folder.id,
    onDragEnter: () => {
      if (!dragActive) {
        return;
      }
      onDragTarget(folder.id);
    },
    onDragOver: (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      if (dragActive) {
        onDragTarget(folder.id);
      }
    },
    onDrop: (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      onDropFolder(folder.id);
    }
  };
}

function metaText({ folder, dragActive, dragOver }: FolderTileProps) {
  if (dragActive) {
    return dragOver ? "Release to move" : "Drop to move";
  }
  return pluralize(folder.itemCount, "item");
}

/**
 * A folder in the grid: 72px (64px on phones), a neutral icon, the name, its item count
 * (subfolders included), the stage strip for Cycle groups, and an "Empty" tag when it holds
 * nothing (under the name on phones). Click opens it.
 */
export const FolderTile = memo(function FolderTile(props: FolderTileProps) {
  const { folder, stages, dragActive, dragOver, onOpen, onPrefetch } = props;
  const name = folderDisplayName(folder.name);

  return (
    <button
      type="button"
      onClick={() => onOpen(folder.id)}
      onMouseEnter={() => onPrefetch(folder.id)}
      onFocus={() => onPrefetch(folder.id)}
      {...dropTargetProps(props)}
      className={cn(
        "group flex h-16 w-full min-w-0 items-center gap-3 rounded-md border bg-card px-3 text-left transition-colors sm:h-[72px]",
        "hover:bg-[var(--ink-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        dragOver
          ? "border-[var(--brand-green)] bg-[var(--brand-green)]/10"
          : dragActive
            ? "border-dashed border-[var(--brand-green)]/60"
            : "border-border"
      )}
    >
      <FolderIcon dragOver={dragOver} className="max-sm:hidden" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-foreground" title={folder.name}>
          {name}
        </span>
        <span className="mt-0.5 flex min-w-0 items-center gap-2 text-[13px] text-muted-foreground">
          <span className={cn("truncate", dragOver && "text-[var(--brand-green)]")}>{metaText(props)}</span>
          {!dragActive && stages ? <StageStrip stages={stages} /> : null}
          {!dragActive ? <FolderTag folder={folder} className="sm:hidden!" /> : null}
        </span>
      </span>
      {!dragActive ? <FolderTag folder={folder} className="max-sm:hidden!" /> : null}
      <ChevronRight
        aria-hidden
        className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 max-sm:hidden"
      />
    </button>
  );
});

/** The same folder as the first rows of the List view (columns match the asset rows). */
export const FolderRow = memo(function FolderRow(props: FolderTileProps & { showPeople: boolean }) {
  const { folder, stages, dragActive, dragOver, onOpen, onPrefetch } = props;
  const name = folderDisplayName(folder.name);

  return (
    <li className="min-w-0">
      <button
        type="button"
        onClick={() => onOpen(folder.id)}
        onMouseEnter={() => onPrefetch(folder.id)}
        onFocus={() => onPrefetch(folder.id)}
        {...dropTargetProps(props)}
        className={cn(
          LIST_ROW,
          "group w-full text-left transition-colors hover:bg-[var(--ink-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
          dragOver ? "bg-[var(--brand-green)]/10" : dragActive && "outline-dashed outline-1 -outline-offset-2 outline-[var(--brand-green)]/60"
        )}
      >
        <span aria-hidden className={LIST_COLUMNS.check} />
        <span className={cn(LIST_COLUMNS.thumb, "justify-center")}>
          <FolderIcon dragOver={dragOver} />
        </span>
        <span className={LIST_COLUMNS.name}>
          <span className="block truncate text-sm font-semibold text-foreground" title={folder.name}>
            {name}
          </span>
          <span className="mt-0.5 flex min-w-0 items-center gap-2 text-[13px] text-muted-foreground">
            <span className={cn("truncate", dragOver && "text-[var(--brand-green)]")}>{metaText(props)}</span>
            {!dragActive && stages ? <StageStrip stages={stages} /> : null}
            {!dragActive ? <FolderTag folder={folder} className="@min-[36rem]:hidden!" /> : null}
          </span>
        </span>
        <span aria-hidden className={LIST_COLUMNS.version} />
        <span className={LIST_COLUMNS.status}>
          <FolderTag folder={folder} />
        </span>
        {props.showPeople ? <span aria-hidden className={LIST_COLUMNS.people} /> : null}
        <span aria-hidden className={LIST_COLUMNS.comments} />
        <span aria-hidden className={LIST_COLUMNS.uploaded} />
        <span className={cn(LIST_COLUMNS.actions, "w-8 justify-center [@media(hover:none)]:w-10")}>
          <ChevronRight aria-hidden className="h-4 w-4 text-muted-foreground" />
        </span>
      </button>
    </li>
  );
});
