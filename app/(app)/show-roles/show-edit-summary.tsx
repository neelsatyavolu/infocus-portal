"use client";

import { useEffect, useState } from "react";
import { Panel, PanelLink } from "@/components/kit/panel";
import { StatusTag } from "@/components/kit/status-tag";
import { editingHref, editSummaryStatus, type ShowEditSummary } from "@/src/lib/show-editor-views";

/** Same small hit-area fix as the other panels' header links (show-panels.tsx). */
const PANEL_ACTION_HIT = "relative max-sm:after:absolute max-sm:after:-inset-1";

/**
 * One line on The Show for this date's automatic edit: where it stands, and a link to the Editing tab,
 * where it's started, reviewed and scheduled. Hidden when the route answers 401 or 403.
 */
export function ShowEditSummaryCard({ showDate, refreshKey, className }: { showDate: string; refreshKey: number; className?: string }) {
  const [summary, setSummary] = useState<{ date: string; value: ShowEditSummary } | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let current = true;
    fetch(`/api/show-roles/edits?date=${encodeURIComponent(showDate)}&summary=1`, { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 401 || response.status === 403) {
          if (current) setHidden(true);
          return;
        }
        const body = (await response.json().catch(() => ({}))) as { data?: ShowEditSummary };
        if (current && response.ok && body.data) setSummary({ date: showDate, value: body.data });
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [showDate, refreshKey]);

  if (hidden) return null;
  const value = summary?.date === showDate ? summary.value : null;
  const status = value ? editSummaryStatus(value) : null;
  return (
    <Panel
      title="Automatic editing"
      titleAs="h2"
      status={status ? <StatusTag tone={status.tone}>{status.label}</StatusTag> : undefined}
      actions={
        <PanelLink href={editingHref({ date: showDate })} className={PANEL_ACTION_HIT}>
          Open Editing
        </PanelLink>
      }
      className={className}
      // Header only: no empty body (and no gap for it) under the one line.
      bodyClassName="hidden"
    />
  );
}
