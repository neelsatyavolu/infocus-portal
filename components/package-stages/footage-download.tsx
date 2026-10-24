"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { downloadClips } from "@/components/package-stages/clip-download";
import type { StageMediaCard } from "@/components/package-stages/types";
import { Button } from "@/components/ui/button";

/**
 * The Footage panel's download actions: "Download all" (one clip downloads as itself, more as a
 * zip) and "Select", which turns the tiles into toggles for "Download N clips". Only ready clips
 * count. Returns the panel actions and the ClipGrid `selection` (null when not selecting).
 */
export function useFootageDownload(rowId: string | null, media: StageMediaCard[]) {
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [busy, setBusy] = useState(false);

  const readyIds = media.filter((item) => item.status === "READY").map((item) => item.id);
  // Clips removed since they were ticked drop out of the selection.
  const picked = readyIds.filter((id) => selected.has(id));

  const stop = () => {
    setSelecting(false);
    setSelected(new Set());
  };
  const toggle = (id: string) =>
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const run = async (ids: string[]) => {
    if (!rowId) return;
    setBusy(true);
    const started = await downloadClips(rowId, ids);
    setBusy(false);
    if (started) stop();
  };

  if (!rowId || readyIds.length === 0) {
    return { actions: null, selection: null };
  }

  const actions = selecting ? (
    <>
      <Button type="button" variant="ghost" size="sm" onClick={stop}>
        Cancel
      </Button>
      <Button type="button" size="sm" disabled={picked.length === 0 || busy} onClick={() => void run(picked)}>
        <Download aria-hidden />
        {picked.length > 0 ? `Download ${picked.length} ${picked.length === 1 ? "clip" : "clips"}` : "Download"}
      </Button>
    </>
  ) : (
    <>
      {readyIds.length > 1 ? (
        <Button type="button" variant="outline" size="sm" onClick={() => setSelecting(true)}>
          Select
        </Button>
      ) : null}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy}
        // No ids means every ready clip (a zip); a lone clip downloads as itself.
        onClick={() => void run(readyIds.length === 1 ? readyIds : [])}
      >
        <Download aria-hidden />
        {readyIds.length === 1 ? "Download" : "Download all"}
      </Button>
    </>
  );

  return { actions, selection: selecting ? { selected: new Set(picked), onToggle: toggle } : null };
}
