import { FileVideo2, Trash2, UploadCloud } from "lucide-react";
import { EmptyState } from "@/components/kit/empty-state";
import { Button } from "@/components/ui/button";
import type { FilterValue, ScopeMode } from "@/components/project-assets/types";

/**
 * Page-level buttons: the toolbar's touch size (40px below md, 36px from md). `!` beats the
 * EmptyState action bar's own child height.
 */
const PAGE_TOUCH = "h-10! md:h-9!";
/** The small in-list button: 32px, 40px on touch screens (like the cards' buttons). */
const INLINE_TOUCH = "[@media(hover:none)]:h-10!";

/**
 * The Assets section when folders sit above it and the status filter matches no videos here:
 * one row (the filter never applies to folders), so it's clear the filter is why it's empty.
 */
export function AssetsFilterEmpty({ onShowAll }: { onShowAll: () => void }) {
  return (
    <EmptyState
      size="inline"
      icon={FileVideo2}
      title="No videos here match this filter."
      description="Folders aren't filtered."
      action={
        <Button type="button" variant="ghost" size="sm" onClick={onShowAll} className={INLINE_TOUCH}>
          Show all statuses
        </Button>
      }
    />
  );
}

/**
 * Nothing to show under the toolbar: an empty folder or project (Upload, outline because the
 * header holds the primary), a filter with no matches (Show all statuses), or an empty trash.
 */
export function AssetsEmptyState({
  scope,
  filterValue,
  canUpload,
  uploadDestination,
  onUpload,
  onShowAll
}: {
  scope: ScopeMode;
  filterValue: FilterValue;
  canUpload: boolean;
  /** Where Upload puts files: the open folder's name or the project's. */
  uploadDestination: string;
  onUpload: () => void;
  onShowAll: () => void;
}) {
  if (scope === "deleted") {
    return <EmptyState size="page" icon={Trash2} title="Nothing deleted in the last 7 days" />;
  }

  const filtered = filterValue !== "all";
  return (
    <EmptyState
      size="page"
      icon={FileVideo2}
      title={filtered ? "No videos match this filter" : "Nothing here yet"}
      description={
        filtered
          ? "Show all statuses, or switch folders, to see more."
          : canUpload
            ? `Upload videos or images to ${uploadDestination}.`
            : "Videos and images uploaded here will show up in this view."
      }
      action={
        filtered || canUpload ? (
          <>
            {filtered ? (
              <Button type="button" variant="ghost" onClick={onShowAll} className={PAGE_TOUCH}>
                Show all statuses
              </Button>
            ) : null}
            {canUpload ? (
              <Button type="button" variant="outline" onClick={onUpload} className={PAGE_TOUCH}>
                <UploadCloud aria-hidden />
                Upload
              </Button>
            ) : null}
          </>
        ) : null
      }
    />
  );
}
