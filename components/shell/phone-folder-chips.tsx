"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { FileVideo2, Folder, Layers, Plus, Trash2 } from "lucide-react";
import { Skeleton } from "@/components/kit/skeleton";
import { folderPathSegments } from "@/src/lib/project-folders";
import type { ProjectShellData } from "@/src/lib/project-shell";
import { cn } from "@/src/lib/utils";
import { projectDestinations, type ProjectAssetView, type ProjectDestination } from "@/components/shell/project-nav";
import type { ShellLinkClick } from "@/components/shell/use-shell-link";

type Chip = { place: ProjectDestination; label: string; Icon: typeof Folder };

/**
 * Below 1024px the assets panel is hidden; the same destinations render as one row of 40px chips
 * at the top of the column (full folder paths, counts), with the open one scrolled into view.
 * While the project's data loads, placeholder chips hold the folders' place and Videos shows no count.
 */
export function PhoneFolderChips({
  projectId,
  data,
  searchParams,
  view,
  loading,
  onLinkClick,
  onCreateFolder
}: {
  projectId: string;
  data: ProjectShellData | null;
  searchParams: string;
  view: ProjectAssetView;
  loading: boolean;
  onLinkClick: ShellLinkClick;
  onCreateFolder: () => void;
}) {
  const rowRef = useRef<HTMLUListElement>(null);
  const places = projectDestinations({
    projectId,
    searchParams,
    view,
    folders: data?.folders ?? [],
    assetCount: data ? data.assetCount : null
  });
  const leading: Chip[] = [
    { place: places.all, label: data?.projectName ?? "Project", Icon: Layers },
    { place: places.videos, label: "Videos", Icon: FileVideo2 }
  ];
  const folderChips: Chip[] = places.folders.map((place) => ({
    place,
    label: folderPathSegments(place.folder?.name ?? "").join(" / "),
    Icon: Folder
  }));
  const trailing: Chip[] = [{ place: places.deleted, label: "Recently Deleted", Icon: Trash2 }];
  const folderCount = data?.folders.length ?? 0;

  useEffect(() => {
    const row = rowRef.current;
    const active = row?.querySelector<HTMLElement>('[aria-current="page"]');
    if (row && active) {
      row.scrollLeft = Math.max(0, active.offsetLeft - 16);
    }
  }, [view.scope, view.folderId, view.collection, folderCount]);

  function renderChip({ place, label, Icon }: Chip) {
    return (
      <li key={place.key} className="shrink-0">
        <Link
          href={place.href as never}
          onClick={(event) => onLinkClick(event, place.href)}
          aria-current={place.active ? "page" : undefined}
          title={label}
          className={cn(
            "inline-flex h-10 max-w-[220px] items-center gap-2 rounded-md border px-3 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            place.active
              ? "border-[var(--brand-green)]/30 bg-[var(--brand-green)]/10 font-medium text-foreground"
              : "border-border text-muted-foreground hover:bg-[var(--ink-3)] hover:text-foreground"
          )}
        >
          <Icon className={cn("h-4 w-4 shrink-0", place.active && "text-[var(--brand-green)]")} aria-hidden />
          <span className="truncate">{label}</span>
          {place.count === null ? null : (
            <span className="font-mono-broadcast text-[11px] tabular-nums text-muted-foreground">{place.count}</span>
          )}
        </Link>
      </li>
    );
  }

  return (
    <nav aria-label="Folders" className="mb-5 flex min-w-0 items-center gap-2 lg:hidden">
      <ul
        ref={rowRef}
        aria-busy={loading || undefined}
        className="relative flex min-w-0 flex-1 gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {/* The assets panel's order: project, Videos, folders, Recently Deleted. */}
        {leading.map((chip) => renderChip(chip))}
        {loading
          ? ["w-24", "w-28"].map((width) => (
              <li key={width} aria-hidden className="shrink-0">
                <Skeleton className={cn("h-10 rounded-md", width)} />
              </li>
            ))
          : folderChips.map((chip) => renderChip(chip))}
        {trailing.map((chip) => renderChip(chip))}
      </ul>
      <button
        type="button"
        onClick={onCreateFolder}
        className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-input text-muted-foreground transition-colors hover:bg-[var(--ink-3)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        title="Create folder"
        aria-label="Create folder"
      >
        <Plus className="h-4 w-4" aria-hidden />
      </button>
    </nav>
  );
}
