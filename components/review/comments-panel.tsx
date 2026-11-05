"use client";

import { useDeferredValue, useEffect, useRef, type ReactNode } from "react";
import { Download, MessageSquare, Upload } from "lucide-react";
import { EmptyState } from "@/components/kit/empty-state";
import { ActionMenu } from "@/components/kit/menu";
import { SegmentedControl } from "@/components/kit/segmented-control";
import { Spinner } from "@/components/kit/spinner";
import { StatusDot } from "@/components/kit/status-tag";
import { ViewTabs, viewTabIds } from "@/components/kit/view-tabs";
import { Button } from "@/components/ui/button";
import { CommentThreadCard, type ThreadPermissions } from "@/components/review/comment-thread";
import {
  COMMENT_FILTERS,
  filterCounts,
  filterThreads,
  type CommentFilter,
  type CommentThread,
  type CommentsTab
} from "@/components/review/comment-utils";
import type { ReviewCommentsState } from "@/components/review/use-review-comments";
import { cn } from "@/src/lib/utils";

const TABS_ID = "review-comments";
const FILTER_LABELS: Record<CommentFilter, string> = { ALL: "All", OPEN: "Open", RESOLVED: "Resolved" };
const FILTER_EMPTY: Record<Exclude<CommentFilter, "ALL">, string> = {
  OPEN: "No open comments",
  RESOLVED: "No resolved comments"
};

export type CommentsMenu = {
  importDisabledReason: string | null;
  canExport: boolean;
  onImportFile: (file: File) => void;
  onExport: () => void;
};

function ThreadList({
  kind,
  threads,
  numbers,
  newIds,
  filter,
  onShowAll,
  emptyTitle,
  emptyDescription,
  isImageReview,
  state,
  permissions,
  onFocusThread,
  onRequestDelete
}: {
  kind: "timeline" | "general";
  threads: CommentThread[];
  numbers: Map<string, number>;
  newIds: ReadonlySet<string>;
  filter: CommentFilter;
  onShowAll: () => void;
  emptyTitle: string;
  emptyDescription?: string;
  isImageReview: boolean;
  state: ReviewCommentsState;
  permissions: ThreadPermissions;
  onFocusThread: (thread: CommentThread) => void;
  onRequestDelete: (thread: CommentThread) => void;
}) {
  const visible = filterThreads(threads, filter);
  if (threads.length === 0) {
    return <EmptyState icon={MessageSquare} title={emptyTitle} description={emptyDescription} />;
  }
  if (visible.length === 0 && filter !== "ALL") {
    return (
      <EmptyState
        size="inline"
        title={FILTER_EMPTY[filter]}
        className="px-1"
        action={
          <Button type="button" variant="ghost" size="sm" onClick={onShowAll}>
            Show all
          </Button>
        }
      />
    );
  }
  return (
    <div className="space-y-2">
      {visible.map((thread) => (
        <CommentThreadCard
          key={thread.root.id}
          thread={thread}
          number={numbers.get(thread.root.id) ?? 0}
          kind={kind}
          isImageReview={isImageReview}
          isSelected={kind === "timeline" && state.selectedCommentId === thread.root.id}
          isHighlighted={kind === "timeline" && state.highlightedCommentId === thread.root.id}
          isNew={newIds.has(thread.root.id)}
          state={state}
          permissions={permissions}
          onFocus={onFocusThread}
          onRequestDelete={onRequestDelete}
        />
      ))}
    </div>
  );
}

/**
 * The comments panel: Timeline / General / Transcript tabs, a filter (All · Open · Resolved with
 * counts), "N new" since the last visit, the ⋯ CSV menu, the threads, and the docked composer.
 * Every row shares the same 16px inset.
 */
export function CommentsPanel({
  tab,
  onTabChange,
  showTranscriptTab,
  transcribing,
  transcriptReady,
  filter,
  onFilterChange,
  timeline,
  general,
  timelineNumbers,
  generalNumbers,
  newIds,
  newCount,
  onJumpToNew,
  isImageReview,
  versionNumber,
  allowComment,
  state,
  permissions,
  onFocusThread,
  onRequestDelete,
  menu,
  transcript,
  composer,
  id,
  className
}: {
  tab: CommentsTab;
  onTabChange: (tab: CommentsTab) => void;
  showTranscriptTab: boolean;
  transcribing: boolean;
  /** A transcript finished while the viewer was writing: a dot on the tab instead of switching. */
  transcriptReady: boolean;
  filter: CommentFilter;
  onFilterChange: (filter: CommentFilter) => void;
  timeline: CommentThread[];
  general: CommentThread[];
  timelineNumbers: Map<string, number>;
  generalNumbers: Map<string, number>;
  newIds: ReadonlySet<string>;
  newCount: number;
  onJumpToNew: () => void;
  isImageReview: boolean;
  versionNumber: number | undefined;
  allowComment: boolean;
  state: ReviewCommentsState;
  permissions: ThreadPermissions;
  onFocusThread: (thread: CommentThread) => void;
  onRequestDelete: (thread: CommentThread) => void;
  menu: CommentsMenu;
  transcript: ReactNode;
  composer: ReactNode;
  id?: string;
  className?: string;
}) {
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const deferredFilter = useDeferredValue(filter);
  const activeThreads = tab === "GENERAL" ? general : timeline;
  const counts = filterCounts(activeThreads);
  const { pendingScrollId, setPendingScrollId, cardRefs } = state;
  const ids = viewTabIds(TABS_ID, tab);

  // A marker or pin click, a new comment or "N new" scrolls its card into view once the list shows it.
  useEffect(() => {
    if (!pendingScrollId || tab === "TRANSCRIPT") {
      return;
    }
    const card = cardRefs.current[pendingScrollId];
    if (!card && deferredFilter !== filter) {
      // The list is still catching up with a filter change; try again when it has.
      return;
    }
    card?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    setPendingScrollId(null);
  }, [cardRefs, deferredFilter, filter, general, pendingScrollId, setPendingScrollId, tab, timeline]);

  const listProps = {
    newIds,
    filter: deferredFilter,
    onShowAll: () => onFilterChange("ALL"),
    isImageReview,
    state,
    permissions,
    onFocusThread,
    onRequestDelete
  };

  return (
    <aside id={id} aria-label="Comments" className={cn("flex min-w-0 flex-col rounded-md border border-border bg-card", className)}>
      <ViewTabs<CommentsTab>
        ariaLabel="Comment views"
        idPrefix={TABS_ID}
        className="shrink-0 px-4"
        value={tab}
        onChange={onTabChange}
        items={[
          { value: "TIMELINE", label: isImageReview ? "Pins" : "Timeline", count: timeline.length, countLabel: `${timeline.length} threads` },
          { value: "GENERAL", label: "General", count: general.length, countLabel: `${general.length} threads` },
          ...(showTranscriptTab
            ? [
                {
                  value: "TRANSCRIPT" as const,
                  label: (
                    <span className="inline-flex items-center gap-1.5">
                      Transcript
                      {transcribing ? <Spinner size="sm" label="Transcribing" /> : null}
                    </span>
                  ),
                  dot: transcriptReady ? ("new" as const) : undefined,
                  dotLabel: transcriptReady ? "Transcript ready" : undefined
                }
              ]
            : [])
        ]}
      />

      {tab !== "TRANSCRIPT" ? (
        // The ⋯ menu (and "N new") wrap to their own line, right-aligned, when the panel is narrow.
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-4 py-2">
          <SegmentedControl<CommentFilter>
            ariaLabel="Filter comments"
            size="sm"
            className="pointer-coarse:h-10"
            value={filter}
            onChange={onFilterChange}
            options={COMMENT_FILTERS.map((value) => ({ value, label: FILTER_LABELS[value], count: counts[value] }))}
          />
          <div className="ml-auto flex items-center gap-2">
            {newCount > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 px-2 pointer-coarse:h-10"
                onClick={onJumpToNew}
                title="Since your last visit to this version"
              >
                <StatusDot tone="new" size={6} />
                {newCount} new
              </Button>
            ) : null}
            <ActionMenu
              label="More comment actions"
              size="sm"
              className="pointer-coarse:h-10"
              busy={state.importing}
              items={[
                {
                  key: "import",
                  label: state.importing ? "Importing comments..." : "Import comments (CSV)",
                  icon: Upload,
                  hint: menu.importDisabledReason ?? ".csv",
                  disabled: Boolean(menu.importDisabledReason) || state.importing,
                  onSelect: () => importInputRef.current?.click()
                },
                {
                  key: "export",
                  label: "Export comments (CSV)",
                  icon: Download,
                  hint: menu.canExport ? ".csv" : "No comments on this version yet",
                  disabled: !menu.canExport,
                  onSelect: menu.onExport
                }
              ]}
            />
          </div>
          <input
            ref={importInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) {
                menu.onImportFile(file);
              }
            }}
          />
        </div>
      ) : null}

      <div
        role="tabpanel"
        id={ids.panel}
        aria-labelledby={ids.tab}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 max-lg:portrait:overflow-visible"
      >
        {tab === "TRANSCRIPT" ? (
          transcript
        ) : tab === "GENERAL" ? (
          <ThreadList
            kind="general"
            threads={general}
            numbers={generalNumbers}
            emptyTitle="No general comments yet."
            {...listProps}
          />
        ) : (
          <ThreadList
            kind="timeline"
            threads={timeline}
            numbers={timelineNumbers}
            emptyTitle={`No comments on v${versionNumber ?? "—"} yet`}
            emptyDescription={
              allowComment
                ? isImageReview
                  ? "Click the image to place a pin, then write below."
                  : "Pause on a moment and write below."
                : undefined
            }
            {...listProps}
          />
        )}
      </div>

      {tab !== "TRANSCRIPT" ? composer : null}
    </aside>
  );
}
