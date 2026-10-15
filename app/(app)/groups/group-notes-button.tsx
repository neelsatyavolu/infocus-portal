"use client";

import { useEffect, useState } from "react";
import { StickyNote } from "lucide-react";
import { Alert } from "@/components/kit/alert";
import { Skeleton } from "@/components/kit/skeleton";
import { StatusDot } from "@/components/kit/status-tag";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { isSubmitShortcut, SubmitShortcutHint } from "@/components/ui/submit-shortcut";
import { Textarea } from "@/components/ui/textarea";
import { PACKAGE_ROSTER_NOTE_MAX } from "@/src/lib/package-roster-notes";

/**
 * Notes for one group, shared with Notes in Package Cycle. The trigger is a 40px icon button on
 * phones and an h-8 "Notes" button from md, above the tile's link layer. A small green dot on
 * the trigger says the group already has notes.
 */
export default function GroupNotesButton({ rowId, topic, hasNotes = false, onSaved }: {
  rowId: string;
  topic: string;
  hasNotes?: boolean;
  onSaved: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const title = topic.trim() || "Untitled package";

  // Each load (opening, Try again) starts over (adjusted during render).
  const loadKey = open ? `${rowId}:${attempt}` : null;
  const [startedKey, setStartedKey] = useState<string | null>(null);
  if (loadKey !== startedKey) {
    setStartedKey(loadKey);
    if (loadKey !== null) {
      setLoading(true);
      setLoaded(false);
      setError(null);
    }
  }

  useEffect(() => {
    if (!open) return;
    let active = true;
    void (async () => {
      try {
        const response = await fetch(`/api/package-progress/${rowId}/notes`, { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? "Failed to load notes.");
        if (active) {
          setDraft(payload.data.possibleIdeas ?? "");
          setLoaded(true);
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Failed to load notes.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [open, rowId, attempt]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/package-progress/${rowId}/notes`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ possibleIdeas: draft })
      });
      const payload = await response.json();
      if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? "Failed to save notes.");
      onSaved(payload.data.possibleIdeas);
      setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to save notes.");
    } finally {
      setSaving(false);
    }
  }

  const loadFailed = Boolean(error) && !loaded && !loading;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        aria-label={`Notes for ${title}${hasNotes ? " (has notes)" : ""}`}
        title={hasNotes ? "Notes (has notes)" : "Notes"}
        className="relative z-10 h-10 w-10 shrink-0 px-0 md:h-8 md:w-auto md:px-3"
        onClick={() => setOpen(true)}
      >
        <StickyNote aria-hidden />
        <span className="max-md:sr-only">Notes</span>
        {hasNotes ? <StatusDot tone="new" size={6} className="absolute right-1 top-1" /> : null}
      </Button>
      <Dialog open={open} onOpenChange={(next) => { if (!saving) setOpen(next); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Notes for {title}</DialogTitle>
            <DialogDescription>Shared with Notes in Package Cycle.</DialogDescription>
          </DialogHeader>
          {loading ? (
            <div role="status" className="space-y-2">
              <span className="sr-only">Loading notes…</span>
              <Skeleton className="h-48 w-full rounded-md" />
            </div>
          ) : loaded ? (
            <div className="space-y-2">
              <Textarea
                aria-label="Package notes"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (!isSubmitShortcut(event)) return;
                  event.preventDefault();
                  if (!saving) void save();
                }}
                maxLength={PACKAGE_ROSTER_NOTE_MAX}
                disabled={saving}
                rows={10}
                placeholder="Notes…"
                className="min-h-[12rem] resize-y leading-6"
              />
              <SubmitShortcutHint action="save" />
            </div>
          ) : null}
          {error ? (
            <Alert
              tone="danger"
              compact
              action={
                loadFailed ? (
                  <Button type="button" variant="outline" size="sm" onClick={() => setAttempt((count) => count + 1)}>
                    Try again
                  </Button>
                ) : undefined
              }
            >
              {error}
            </Alert>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={saving} onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="button" disabled={!loaded || loading || saving} onClick={() => void save()}>{saving ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
