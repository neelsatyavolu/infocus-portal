"use client";

import { useEffect, useState } from "react";
import { StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PACKAGE_ROSTER_NOTE_MAX } from "@/src/lib/package-roster-notes";

export default function GroupNotesButton({ rowId, topic, onSaved }: {
  rowId: string;
  topic: string;
  onSaved: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setLoaded(false);
    setError(null);
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
  }, [open, rowId]);

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

  return (
    <>
      <Button type="button" variant="outline" size="sm" className="relative z-10 h-7 gap-1.5 px-2 text-xs" onClick={() => setOpen(true)}>
        <StickyNote className="h-3 w-3" />Notes
      </Button>
      <Dialog open={open} onOpenChange={(next) => { if (!saving) setOpen(next); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Notes — {topic.trim() || "Untitled package"}</DialogTitle>
            <DialogDescription>Shared with Notes in Package Cycle.</DialogDescription>
          </DialogHeader>
          {loading ? <p className="text-sm text-muted-foreground">Loading notes…</p> : loaded ? (
            <textarea
              aria-label="Package notes"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={PACKAGE_ROSTER_NOTE_MAX}
              disabled={saving}
              rows={10}
              placeholder="Notes…"
              className="min-h-[12rem] w-full resize-y rounded-md border border-border bg-black/40 light:bg-muted px-3 py-2 text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground focus:border-[var(--brand-green)]/50"
            />
          ) : null}
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={saving} onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="button" disabled={!loaded || loading || saving} onClick={() => void save()}>{saving ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
