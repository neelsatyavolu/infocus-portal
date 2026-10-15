"use client";

import { useEffect, useState } from "react";
import { Check, RefreshCw, Save, Sparkles } from "lucide-react";
import { ROW_CONTROL, TOOLBAR_CONTROL } from "@/components/announcements/sizes";
import { InlineError } from "@/components/kit/alert";
import { IconButton } from "@/components/kit/icon-button";
import { KeyHints, shortcutKeys } from "@/components/kit/kbd";
import { StatusTag } from "@/components/kit/status-tag";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/** A save or regenerate that failed; shown where the editor is, not only at the top of the page. */
export type PaActionError = { action: "save" | "regenerate"; message: string };

type EditorFlags = {
  canEdit: boolean;
  loading: boolean;
  saving: boolean;
  regenerating: boolean;
  dirty: boolean;
  saved: boolean;
  failed: PaActionError | null;
};

/** The script's one status, as a tag in the panel header. */
function ScriptState({ canEdit, loading, saving, regenerating, dirty, saved, failed }: EditorFlags) {
  if (regenerating) return <StatusTag spinner>Regenerating…</StatusTag>;
  if (saving) return <StatusTag spinner>Saving…</StatusTag>;
  // A cached copy is on screen while fresh data loads; the editor stays locked until it lands.
  if (loading) return <StatusTag spinner>Updating…</StatusTag>;
  // Unsaved edits always say so (it is also why Refresh is off); the save bar says what failed.
  if (dirty) return <StatusTag tone="warning">Unsaved changes</StatusTag>;
  if (failed) {
    return <StatusTag tone="danger">{failed.action === "save" ? "Couldn't save" : "Couldn't regenerate"}</StatusTag>;
  }
  if (saved) return <StatusTag tone="success" icon={Check}>Saved</StatusTag>;
  return <StatusTag>{canEdit ? "Shared script" : "Read only"}</StatusTag>;
}

const REFRESH_BLOCKED = "Save or discard your changes before refreshing.";

/**
 * Reloads the date, announcers and script. Off while there are unsaved edits: a disabled button
 * gets no hover, so the reason is on the wrapper (title) and in the button's label.
 */
function RefreshButton({ loading, disabled, dirty, onRefresh }: {
  loading: boolean;
  disabled: boolean;
  dirty: boolean;
  onRefresh: () => void;
}) {
  return (
    <span title={dirty ? REFRESH_BLOCKED : undefined} className="inline-flex">
      <IconButton
        label={loading ? "Refreshing" : dirty ? `Refresh. ${REFRESH_BLOCKED}` : "Refresh"}
        icon={RefreshCw}
        variant="outline"
        size="sm"
        className={ROW_CONTROL}
        busy={loading}
        disabled={disabled}
        onClick={onRefresh}
      />
    </span>
  );
}

function SaveShortcutHint() {
  // The Mac label on the server and first paint, corrected after mount (no hydration mismatch).
  const [isMac, setIsMac] = useState(true);
  useEffect(() => {
    setIsMac(/Mac|iPhone|iPad|iPod/.test(navigator.userAgent));
  }, []);
  // Desktop keyboards only: hidden below lg by KeyHints, and on touch screens (iPads) here.
  return <KeyHints items={[{ keys: shortcutKeys("mod+s", isMac), label: "Save" }]} className="pointer-coarse:hidden" />;
}

/**
 * The PA script: a header row (title, status tag; Regenerate and Refresh at the end), one help
 * line (who can edit), the script filling the card edge to
 * edge (it grows with its text, so the page is the only scroller), and for editors a save bar that
 * stays at the bottom of the screen while the script is in view. A failed save shows in that bar,
 * beside Save. Until the rail takes the right side (xl) the bar leaves room for the ✱ button; on
 * phones it also sits above the tab bar and shortens its labels.
 */
export function PaEditorPanel({
  dateLabel,
  content,
  onContentChange,
  canSave,
  onSave,
  onRequestDiscard,
  onRequestRegenerate,
  onRefresh,
  ...flags
}: EditorFlags & {
  dateLabel: string;
  content: string;
  onContentChange: (value: string) => void;
  canSave: boolean;
  onSave: () => void;
  onRequestDiscard: () => void;
  onRequestRegenerate: () => void;
  onRefresh: () => void;
}) {
  const { canEdit, loading, saving, regenerating, dirty, failed } = flags;
  const busy = saving || loading || regenerating;

  return (
    <section aria-labelledby="pa-script-title" className="flex min-w-0 flex-col rounded-md border border-border bg-card">
      <div className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-4 py-3 md:px-5">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <h2 id="pa-script-title" className="text-base font-semibold leading-snug tracking-[-0.01em] text-foreground">
            Script
          </h2>
          <span role="status" aria-live="polite" className="inline-flex min-h-5 items-center">
            <ScriptState {...flags} />
          </span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {canEdit ? (
            // The status tag beside it says "Regenerating…", so the button keeps its label.
            <Button type="button" variant="outline" size="sm" className={ROW_CONTROL} disabled={busy} onClick={onRequestRegenerate}>
              <Sparkles className="h-4 w-4" />
              Regenerate
            </Button>
          ) : null}
          <RefreshButton loading={loading} disabled={saving || regenerating || dirty} dirty={dirty} onRefresh={onRefresh} />
        </div>
      </div>

      {/* One line, so the script starts high; where announcements come from is beside or below the panel. */}
      <p id="pa-script-help" className="px-4 pt-3 text-[13px] leading-snug text-muted-foreground md:px-5">
        {canEdit
          ? "Edit the shared script, then save your changes before leaving. Changes are shared with your PA team."
          : "Assigned announcers and producers can edit this script."}
      </p>
      <label htmlFor="pa-script" className="sr-only">
        PA script for {dateLabel}
      </label>
      <Textarea
        id="pa-script"
        aria-describedby="pa-script-help"
        aria-busy={saving || undefined}
        value={content}
        // Read-only (not disabled) while saving, so ⌘S keeps the cursor where it was.
        readOnly={!canEdit || saving}
        disabled={loading || regenerating}
        rows={26}
        maxLength={100000}
        onChange={(event) => onContentChange(event.target.value)}
        className="min-h-[60vh] flex-1 resize-y rounded-none border-0 bg-transparent px-4 py-3 text-base leading-7 [field-sizing:content] focus-visible:ring-inset md:px-5 md:text-[15px] lg:min-h-[560px]"
      />

      {canEdit ? (
        <div className="sticky bottom-[calc(var(--phone-tabbar-h,0px)+env(safe-area-inset-bottom))] z-10 flex min-h-14 flex-wrap items-center gap-x-3 gap-y-2 rounded-b-md border-t border-border bg-card py-2.5 pl-4 pr-16 md:pl-5 lg:bottom-0 xl:pr-5">
          {failed ? (
            <InlineError className="min-w-0 flex-[1_1_14rem]">{failed.message}</InlineError>
          ) : (
            <SaveShortcutHint />
          )}
          <div className="ml-auto flex items-center gap-2">
            {dirty ? (
              <Button type="button" variant="ghost" className={TOOLBAR_CONTROL} disabled={busy} onClick={onRequestDiscard}>
                <span>
                  Discard<span className="max-sm:sr-only"> changes</span>
                </span>
              </Button>
            ) : null}
            <Button type="button" className={TOOLBAR_CONTROL} disabled={!canSave} onClick={onSave}>
              <Save className="h-4 w-4" />
              {saving ? (
                "Saving…"
              ) : (
                <span>
                  Save<span className="max-sm:sr-only"> script</span>
                </span>
              )}
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
