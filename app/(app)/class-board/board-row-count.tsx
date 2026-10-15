"use client";

import { useEffect, useState } from "react";

const SPAN = "Next 14 days";

/**
 * A rail list's heading meta. On the TV the Livestreams and Calendar lists show only the whole
 * rows that fit (board-rail.tsx) and the rest fall into zero-height rows past the clipped edge, so
 * this counts the rows actually on screen and says "+N more" for the ones left off. The server
 * markup, and phones and tablets (where every row shows), read "8 · Next 14 days" (with
 * `showTotal`) or "Next 14 days".
 */
export function BoardRowCount({ listId, total, showTotal = false }: { listId: string; total: number; showTotal?: boolean }) {
  const [hidden, setHidden] = useState(0);

  useEffect(() => {
    const list = document.getElementById(listId);
    if (!list) return;
    const measure = () => setHidden(countRowsLeftOff(list));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, [listId, total]);

  if (hidden <= 0) return <>{showTotal ? `${total} · ${SPAN}` : SPAN}</>;
  return (
    <>
      <span className="text-foreground">{`+${hidden} more`}</span>
      {` · ${SPAN}`}
    </>
  );
}

/**
 * A row is on screen when it starts inside the list and ends by its bottom edge (1px of slack for
 * subpixel layout). A row left off starts at the list's bottom edge: its zero-height track still
 * lays it out a pixel or more tall (its top rule and padding), so its height can't tell, its top can.
 */
function countRowsLeftOff(list: HTMLElement) {
  const bottom = list.getBoundingClientRect().bottom;
  const rows = Array.from(list.children);
  const shown = rows.filter((row) => {
    const rect = row.getBoundingClientRect();
    return rect.top < bottom - 1 && rect.bottom <= bottom + 1;
  }).length;
  return rows.length - shown;
}
