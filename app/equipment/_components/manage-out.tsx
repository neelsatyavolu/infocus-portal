"use client";

import { useMemo } from "react";
import { PackageCheck } from "lucide-react";
import { Toolbar } from "@/components/kit/action-bar";
import { DataTable, type DataColumn } from "@/components/kit/data-table";
import { EmptyState } from "@/components/kit/empty-state";
import { FilterChips } from "@/components/kit/filter-chips";
import { useRememberedState } from "@/components/kit/remembered-state";
import { StatusTag } from "@/components/kit/status-tag";
import { Button } from "@/components/ui/button";
import type { EquipmentItem } from "@/components/equipment/equipment-api";
import {
  ITEM_STATE,
  formatShortDateTime,
  hoursOutLabel,
  isOverdueItem,
  itemStatus,
  sdCardLabel,
  studentLabel
} from "@/components/equipment/equipment-status";
import { EQUIPMENT_OVERDUE_HOURS } from "@/src/lib/equipment-overdue";

type OutFilter = "all" | "out" | "held" | "overdue";

const FILTERS: OutFilter[] = ["all", "out", "held", "overdue"];
const EMPTY_TEXT: Record<OutFilter, string> = {
  all: "Nothing is out or held.",
  out: "Nothing is out.",
  held: "Nothing is held.",
  overdue: "No overdue items."
};

function isOutFilter(value: unknown): value is OutFilter {
  return typeof value === "string" && (FILTERS as string[]).includes(value);
}

type Row = { item: EquipmentItem; state: "out" | "held" | "in"; overdue: boolean };

function stateTag(row: Row) {
  const style = ITEM_STATE[row.overdue ? "overdue" : row.state];
  return <StatusTag tone={style.tone}>{style.label}</StatusTag>;
}

function borrowerOf(row: Row) {
  return row.state === "held" ? row.item.onHoldForStudent : row.item.checkedOutBy;
}

/** Who has what, since when, held vs out — with Overdue as a filter instead of its own tab. */
export function ManageOut({
  items,
  now,
  loaded,
  busy,
  onForceReturn,
  onReleaseHold
}: {
  items: EquipmentItem[];
  now: number;
  loaded: boolean;
  busy: boolean;
  onForceReturn: (itemId: string) => void;
  onReleaseHold: (itemId: string) => void;
}) {
  const [filter, setFilter] = useRememberedState<OutFilter>("equipment:manage:out-filter:v1", "all", isOutFilter);

  const rows = useMemo<Row[]>(
    () => items.map((item) => ({ item, state: itemStatus(item), overdue: isOverdueItem(item, now) })),
    [items, now]
  );
  const counts = useMemo(
    () => ({
      all: rows.length,
      out: rows.filter((row) => row.state === "out").length,
      held: rows.filter((row) => row.state === "held").length,
      overdue: rows.filter((row) => row.overdue).length
    }),
    [rows]
  );
  const shown = useMemo(
    () => rows.filter((row) => filter === "all" || (filter === "overdue" ? row.overdue : row.state === filter)),
    [rows, filter]
  );

  function action(row: Row, phone = false) {
    const size = phone ? "h-10 w-32" : "w-28";
    return row.state === "out" ? (
      <Button type="button" size="sm" variant="destructive-quiet" className={size} disabled={busy} onClick={() => onForceReturn(row.item.id)}>
        Force-return
      </Button>
    ) : (
      <Button type="button" size="sm" variant="outline" className={size} disabled={busy} onClick={() => onReleaseHold(row.item.id)}>
        Release hold
      </Button>
    );
  }

  const columns: Array<DataColumn<Row>> = [
    {
      key: "item",
      header: "Item",
      render: (row) => (
        <div className="min-w-0">
          <p className="break-words text-sm text-foreground">{row.item.name}</p>
          <p className="break-all font-mono text-xs tabular-nums text-muted-foreground">{row.item.barcode}</p>
        </div>
      )
    },
    { key: "status", header: "Status", width: "7rem", render: stateTag },
    {
      key: "borrower",
      header: "Borrower",
      render: (row) => {
        const borrower = borrowerOf(row);
        return (
          <div className="min-w-0">
            <p className="break-words text-sm text-foreground">{studentLabel(borrower)}</p>
            {borrower?.studentId ? (
              <p className="font-mono text-[11px] tabular-nums text-muted-foreground">{borrower.studentId}</p>
            ) : null}
          </div>
        );
      }
    },
    {
      key: "sd",
      header: "SD card (batch)",
      width: "8.5rem",
      className: "text-muted-foreground",
      render: (row) => sdCardLabel(row.item.tookSdCard)
    },
    {
      key: "since",
      header: "Since",
      className: "whitespace-nowrap text-muted-foreground",
      render: (row) => formatShortDateTime(row.item.checkedOutAt)
    },
    {
      key: "outFor",
      header: "Out for",
      align: "end",
      mono: true,
      width: "6rem",
      className: "whitespace-nowrap text-muted-foreground",
      render: (row) => (row.state === "out" ? hoursOutLabel(row.item.checkedOutAt, now) : "—")
    }
  ];

  return (
    <div className="space-y-4">
      <Toolbar
        aria-label="Filter gear"
        size="touch"
        start={
          <FilterChips
            ariaLabel="Show"
            size="touch"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All", count: counts.all },
              { value: "out", label: "Out", count: counts.out },
              { value: "held", label: "Held", count: counts.held },
              { value: "overdue", label: "Overdue", count: counts.overdue, tone: counts.overdue > 0 ? "danger" : undefined }
            ]}
          />
        }
        meta={<span className="text-[13px]">Overdue: out for {EQUIPMENT_OVERDUE_HOURS} hours or more.</span>}
      />
      <DataTable
        caption="Equipment that is out or held"
        stackBelow="lg"
        columns={columns}
        rows={shown}
        rowKey={(row) => row.item.id}
        rowActions={(row) => action(row)}
        loading={!loaded}
        empty={<EmptyState icon={PackageCheck} title={EMPTY_TEXT[filter]} />}
        renderMobileRow={(row) => {
          const borrower = borrowerOf(row);
          // Held items have no checkout yet, so only the parts with a value are listed.
          const facts = [
            row.item.checkedOutAt ? `Since ${formatShortDateTime(row.item.checkedOutAt)}` : null,
            row.state === "out" ? `Out for ${hoursOutLabel(row.item.checkedOutAt, now)}` : null,
            row.item.tookSdCard == null ? null : `SD card ${sdCardLabel(row.item.tookSdCard)}`
          ].filter(Boolean);
          return (
            <div className="space-y-1.5 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 break-words text-sm font-semibold text-foreground">{row.item.name}</p>
                {stateTag(row)}
              </div>
              <p className="text-[13px] text-[var(--ink-text)]">
                <span className="break-all font-mono text-xs tabular-nums">{row.item.barcode}</span>
                {" · "}
                {studentLabel(borrower)}
                {borrower?.studentId ? <span className="font-mono text-xs tabular-nums"> ({borrower.studentId})</span> : null}
              </p>
              {facts.length > 0 ? <p className="text-xs text-muted-foreground">{facts.join(" · ")}</p> : null}
              <div className="flex justify-end pt-1">{action(row, true)}</div>
            </div>
          );
        }}
      />
    </div>
  );
}
