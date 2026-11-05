"use client";

import { useMemo, useState, type FormEvent, type KeyboardEvent } from "react";
import { Check, PackageOpen, Pencil, Plus, SearchX } from "lucide-react";
import { Toolbar } from "@/components/kit/action-bar";
import { DataTable, type DataColumn } from "@/components/kit/data-table";
import { EmptyState } from "@/components/kit/empty-state";
import { Panel } from "@/components/kit/panel";
import { SearchField } from "@/components/kit/search-field";
import { StatusTag } from "@/components/kit/status-tag";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { EquipmentItem } from "@/components/equipment/equipment-api";
import { ITEM_STATE, itemStatus } from "@/components/equipment/equipment-status";
import { cn } from "@/src/lib/utils";

type Draft = { name: string; barcode: string };
const ARCHIVE_RULE = "Archive only when the item is in (not out or held).";

/**
 * Inventory: add items, find one fast, edit a name or code in place, archive what is in.
 * One row edits at a time; starting Edit on another row drops the first row's unsaved draft.
 */
export function ManageInventory({
  items,
  loaded,
  busy,
  onAdd,
  onSave,
  onArchive
}: {
  items: EquipmentItem[];
  loaded: boolean;
  busy: boolean;
  /** Each resolves true when the change was saved. */
  onAdd: (draft: Draft) => Promise<boolean>;
  onSave: (id: string, draft: Draft) => Promise<boolean>;
  onArchive: (id: string) => void;
}) {
  const [newItem, setNewItem] = useState<Draft>({ name: "", barcode: "" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>({ name: "", barcode: "" });
  const [filter, setFilter] = useState("");

  const shown = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) return items;
    return items.filter((item) => item.name.toLowerCase().includes(query) || item.barcode.toLowerCase().includes(query));
  }, [items, filter]);

  async function addItem(event: FormEvent) {
    event.preventDefault();
    if (await onAdd({ name: newItem.name.trim(), barcode: newItem.barcode.trim() })) {
      setNewItem({ name: "", barcode: "" });
    }
  }

  async function saveEdit(id: string) {
    if (await onSave(id, { name: editDraft.name.trim(), barcode: editDraft.barcode.trim() })) {
      setEditingId(null);
    }
  }

  function startEdit(item: EquipmentItem) {
    setEditingId(item.id);
    setEditDraft({ name: item.name, barcode: item.barcode });
  }

  function onEditKeyDown(event: KeyboardEvent<HTMLInputElement>, id: string) {
    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (!busy) void saveEdit(id);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setEditingId(null);
    }
  }

  function editInput(field: keyof Draft, id: string, className?: string) {
    return (
      <Input
        aria-label={field === "name" ? "Item name" : "Item code"}
        value={editDraft[field]}
        onChange={(event) => setEditDraft((prev) => ({ ...prev, [field]: event.target.value }))}
        onKeyDown={(event) => onEditKeyDown(event, id)}
        autoFocus={field === "name"}
        className={cn("h-8", field === "barcode" && "font-mono tabular-nums", className)}
      />
    );
  }

  function actions(item: EquipmentItem, phone = false) {
    const size = phone ? "h-10" : undefined;
    if (editingId === item.id) {
      return (
        <>
          <Button type="button" size="sm" variant="outline" className={size} disabled={busy} onClick={() => void saveEdit(item.id)}>
            <Check aria-hidden />
            Save
          </Button>
          <Button type="button" size="sm" variant="ghost" className={size} onClick={() => setEditingId(null)}>
            Cancel
          </Button>
        </>
      );
    }
    const archivable = itemStatus(item) === "in";
    return (
      <>
        <Button type="button" size="sm" variant="outline" className={size} disabled={busy} onClick={() => startEdit(item)}>
          <Pencil aria-hidden />
          Edit
        </Button>
        {/* A disabled button gets no hover, so the reason (also beside the count) sits on a wrapper. */}
        <span title={archivable ? undefined : ARCHIVE_RULE} className="inline-flex">
          <Button
            type="button"
            size="sm"
            variant="destructive-quiet"
            className={cn("h-full", size)}
            disabled={busy || !archivable}
            onClick={() => onArchive(item.id)}
          >
            Archive
          </Button>
        </span>
      </>
    );
  }

  function statusTag(item: EquipmentItem) {
    const style = ITEM_STATE[itemStatus(item)];
    return <StatusTag tone={style.tone}>{style.label}</StatusTag>;
  }

  const columns: Array<DataColumn<EquipmentItem>> = [
    {
      key: "item",
      header: "Item",
      render: (item) =>
        editingId === item.id ? editInput("name", item.id) : <span className="break-words text-sm text-foreground">{item.name}</span>
    },
    {
      key: "code",
      header: "Code",
      render: (item) =>
        editingId === item.id ? (
          editInput("barcode", item.id)
        ) : (
          <span className="break-all font-mono text-xs tabular-nums text-muted-foreground">{item.barcode}</span>
        )
    },
    { key: "status", header: "Status", width: "7rem", render: statusTag }
  ];

  const query = filter.trim();

  return (
    <div className="space-y-5">
      <Panel id="inventory-add" title="Add item" titleAs="h2">
        <form onSubmit={addItem} className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
          <div className="space-y-2">
            <Label htmlFor="new-item-name">Name</Label>
            <Input
              id="new-item-name"
              value={newItem.name}
              onChange={(event) => setNewItem((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="e.g. Canon T8i"
              required
              className="h-10 md:h-9"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-item-code">Code</Label>
            <Input
              id="new-item-code"
              value={newItem.barcode}
              onChange={(event) => setNewItem((prev) => ({ ...prev, barcode: event.target.value }))}
              placeholder="Scan or type the code"
              required
              className="h-10 font-mono tabular-nums placeholder:font-sans md:h-9"
            />
          </div>
          <Button type="submit" disabled={busy} className="h-10 md:h-9">
            <Plus aria-hidden />
            Add item
          </Button>
        </form>
      </Panel>

      <section aria-label="Inventory" className="space-y-4">
        <Toolbar
          aria-label="Find an item"
          size="touch"
          start={
            <SearchField
              value={filter}
              onChange={setFilter}
              placeholder="Filter by name or code"
              ariaLabel="Filter inventory by name or code"
              size="touch"
              className="w-full sm:w-72"
            />
          }
          // The archive rule sits beside the count, in view above the table (a disabled Archive gets no hover).
          meta={
            <span>
              {loaded ? (
                <>
                  {query ? (
                    <>
                      <span className="font-mono tabular-nums">{shown.length}</span> of{" "}
                    </>
                  ) : null}
                  <span className="font-mono tabular-nums">{items.length}</span> {items.length === 1 ? "item" : "items"}
                  <span aria-hidden> · </span>
                </>
              ) : null}
              {ARCHIVE_RULE}
            </span>
          }
        />
        <DataTable
          caption="Inventory"
          columns={columns}
          rows={shown}
          rowKey={(item) => item.id}
          rowActions={(item) => actions(item)}
          loading={!loaded}
          empty={
            query ? (
              <EmptyState
                size="inline"
                icon={SearchX}
                title={`No items match “${query}”.`}
                action={
                  <Button type="button" variant="ghost" size="sm" onClick={() => setFilter("")}>
                    Clear filter
                  </Button>
                }
              />
            ) : (
              <EmptyState icon={PackageOpen} title="No items yet." description="Add your first item above." />
            )
          }
          renderMobileRow={(item) =>
            editingId === item.id ? (
              <div className="space-y-2 px-4 py-3">
                {editInput("name", item.id, "h-10")}
                {editInput("barcode", item.id, "h-10")}
                <div className="flex justify-end gap-2">{actions(item, true)}</div>
              </div>
            ) : (
              <div className="space-y-1.5 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 break-words text-sm font-semibold text-foreground">{item.name}</p>
                  {statusTag(item)}
                </div>
                <p className="break-all font-mono text-xs tabular-nums text-muted-foreground">{item.barcode}</p>
                <div className="flex justify-end gap-2 pt-1">{actions(item, true)}</div>
              </div>
            )
          }
        />
      </section>
    </div>
  );
}
