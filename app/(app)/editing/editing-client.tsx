"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { Wand2 } from "lucide-react";
import { toast } from "sonner";
import { ErrorState } from "@/components/kit/empty-state";
import { SegmentedControl } from "@/components/kit/segmented-control";
import { PageHeader } from "@/components/page-header";
import { DATE_KEY_PATTERN, formatShowDateLabel } from "@/src/lib/show-assignment";
import {
  EDITING_VIEW_LABELS, EDITING_VIEWS, editingHref, parseEditingView, type EditingView
} from "@/src/lib/show-editor-views";
import { cn } from "@/src/lib/utils";
import { ShowDateStrip } from "../show-roles/show-date-strip";
import { fallbackTitle, stripItems } from "../show-roles/show-overview";
import type { EditedShow } from "../show-roles/show-upload-dialog";
import { EditingHowToView } from "./editing-howto-view";
import { EditingMachinesView } from "./editing-machines-view";
import { EditingSettingsView } from "./editing-settings-view";
import { EditingShowView } from "./editing-show-view";
import { EditingViewSkeleton } from "./editing-skeleton";
import { EditorStatusTag } from "./show-edit-parts";
import { useEditingOverview, type LoadedOverview } from "./use-editing-overview";
import { useShowEdit } from "./use-show-edit";

// Loaded only when a producer opens Change details; keeps upload code off the page.
const ShowUploadDialog = dynamic(
  () => import("../show-roles/show-upload-dialog").then((mod) => mod.ShowUploadDialog),
  { ssr: false }
);

const EYEBROW = (
  <>
    <Wand2 className="h-3 w-3" aria-hidden />
    Editing
  </>
);

const VIEW_OPTIONS = EDITING_VIEWS.map((value) => ({ value, label: EDITING_VIEW_LABELS[value] }));

/** Swaps the address in place (Next keeps useSearchParams in sync), like the show strip does. */
function replaceAddress(href: string) {
  window.history.replaceState(null, "", href);
}

/**
 * The Editing tab: one show's automatic edit (Show), the editing machines (Machines), the editor's
 * settings (Settings) and the guide (How to: docs/knowledge/automatic-editing.md, which the assistant reads too). The open show (`?date=`, default the next show, as on The Show), the view
 * (`?view=`) and a waiting link approval (`?link=CODE`, which opens Machines) all live in the address.
 */
export default function EditingClient({ initial, howTo }: { initial: LoadedOverview | null; howTo: string }) {
  const params = useSearchParams();
  const requestedDate = params.get("date") ?? undefined;
  const linkCode = params.get("link");
  const view = parseEditingView(params.get("view"), linkCode);
  const overview = useEditingOverview(requestedDate, initial);
  const showDate = requestedDate && DATE_KEY_PATTERN.test(requestedDate) ? requestedDate : overview.overview?.date ?? null;
  const edit = useShowEdit(showDate);
  // Change details: the edited file, scheduled from The Show's upload dialog without leaving Editing.
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editedShow, setEditedShow] = useState<EditedShow | null>(null);

  function selectView(next: EditingView) {
    replaceAddress(editingHref({ date: requestedDate, view: next }));
  }

  function closeLink(message: string | null) {
    if (message) toast(message);
    replaceAddress(editingHref({ date: requestedDate, view: "machines" }));
    void edit.reload();
  }

  const strip = overview.overview ? stripItems(overview.overview, showDate ?? overview.overview.date, new Date()) : [];
  // While another show loads, the old one dims and can't be changed.
  const switching = overview.switching || edit.stale;
  const dimmed = cn("transition-opacity", switching && "opacity-60");
  const state = edit.state;

  function body() {
    // The guide needs no editor state.
    if (view === "howto") return <EditingHowToView markdown={howTo} />;
    if (!state) {
      if (edit.error || (!showDate && overview.error)) {
        return (
          <ErrorState
            title="Couldn't load automatic editing"
            message={edit.error ?? overview.error}
            onRetry={() => void (showDate ? edit.reload() : overview.retry())}
          />
        );
      }
      return <EditingViewSkeleton />;
    }
    if (view === "machines") {
      return (
        <EditingMachinesView
          state={state}
          linkCode={linkCode}
          pairing={edit.pairing}
          busy={edit.busy !== null}
          send={edit.send}
          onLinkDone={closeLink}
        />
      );
    }
    if (view === "settings") return <EditingSettingsView settings={state.settings} busy={edit.busy !== null} send={edit.send} />;
    if (!showDate) return <EditingViewSkeleton />;
    return (
      <EditingShowView
        showDate={showDate}
        state={state}
        busyAction={edit.busy}
        send={edit.send}
        onReview={(edited) => {
          setEditedShow(edited);
          setUploadOpen(true);
        }}
      />
    );
  }

  return (
    <div className="@container route-enter space-y-5">
      <PageHeader
        eyebrow={EYEBROW}
        status={state ? <EditorStatusTag worker={state.worker} devices={state.devices} /> : undefined}
        title="Editing"
        description={view !== "show" ? undefined : showDate ? formatShowDateLabel(showDate) : fallbackTitle(requestedDate)}
      />

      <SegmentedControl ariaLabel="View" value={view} onChange={selectView} options={VIEW_OPTIONS} />

      {/* Machines and settings don't depend on the show date. */}
      {view === "show" && strip.length > 1 ? (
        <ShowDateStrip
          items={strip}
          disabled={edit.busy !== null}
          hrefFor={(date) => editingHref({ date, view })}
        />
      ) : null}

      <div className={dimmed} inert={switching} aria-busy={switching || undefined}>
        {body()}
      </div>

      {uploadOpen && showDate ? (
        <ShowUploadDialog
          open={uploadOpen}
          onOpenChange={setUploadOpen}
          edited={editedShow}
          onScheduled={() => void edit.reload()}
          showDate={showDate}
          showLabel={formatShowDateLabel(showDate)}
        />
      ) : null}
    </div>
  );
}
