"use client";

import type { ReactNode } from "react";
import { Panel } from "@/components/kit/panel";
import type { QueueRow } from "./queue-types";

export const RECENT_PUBLICATIONS_ID = "queue-recent";

/**
 * Website managers come for embed codes, and most published packages sit in Past shows once
 * their air date passes. This puts the newest few at the top; each row opens its package page.
 */
export function RecentPublications({
  rows,
  className,
  renderRow
}: {
  rows: QueueRow[];
  className?: string;
  renderRow: (row: QueueRow) => ReactNode;
}) {
  return (
    <Panel
      id={RECENT_PUBLICATIONS_ID}
      title="Recently on YouTube"
      titleAs="h2"
      padding="md"
      description="Open a package for its video and embed code. Older ones are under Past shows."
      className={className ?? "scroll-mt-24"}
    >
      <div className="grid gap-3 sm:grid-cols-2">{rows.map((row) => renderRow(row))}</div>
    </Panel>
  );
}
