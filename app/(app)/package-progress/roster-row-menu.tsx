"use client";

import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import { ArrowRightLeft, ArrowUpRight, Trash2 } from "lucide-react";
import { ActionMenu, type MenuEntry } from "@/components/kit/menu";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

/** The row a menu acts on, captured when it opens. */
export type RowMenuTarget = {
  rowKey: string;
  rowId: string | null;
  rowIndex: number;
  topic: string;
  /** The group's pending stage on Groups, or null before the row is saved. */
  groupHref: string | null;
};

/** An open row menu: from its ⋯ button (`point` null) or a right-click at `point`. */
type RowMenuState = RowMenuTarget & { point: { x: number; y: number } | null; openId: number };

/**
 * Which row menu is open: a row's ⋯ menu (anchored to its button, which toggles it) or the
 * right-click menu at the pointer. The right-click one sits at a fixed point, so it closes when
 * the page scrolls or resizes. Both close on an outside press and Escape (the kit ActionMenu).
 */
export function useRowMenus({
  enabled,
  itemsFor
}: {
  /** Editors, while the roster can change. */
  enabled: boolean;
  itemsFor: (target: RowMenuTarget) => MenuEntry[];
}) {
  const [menu, setMenu] = useState<RowMenuState | null>(null);
  const counterRef = useRef(0);
  const pointOpen = Boolean(menu?.point);

  useEffect(() => {
    if (!pointOpen) return;
    const close = () => setMenu(null);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [pointOpen]);

  function open(target: RowMenuTarget, point: RowMenuState["point"]) {
    if (!enabled) return;
    counterRef.current += 1;
    setMenu({ ...target, point, openId: counterRef.current });
  }

  return {
    /** The row a menu is open for (tinted). */
    rowKey: menu?.rowKey ?? null,
    /** The row whose ⋯ menu is open. */
    buttonKey: menu && !menu.point ? menu.rowKey : null,
    close: () => setMenu(null),
    openAt: (target: RowMenuTarget, x: number, y: number) => open(target, { x, y }),
    onButtonOpenChange: (target: RowMenuTarget, next: boolean) => {
      if (next) open(target, null);
      else setMenu((current) => (current?.rowKey === target.rowKey && !current.point ? null : current));
    },
    pointMenu: menu?.point ? (
      <ActionMenu
        key={menu.openId}
        label={rowMenuLabel(menu.topic)}
        items={itemsFor(menu)}
        open
        anchorPoint={menu.point}
        align="start"
        onOpenChange={(next) => {
          if (!next) setMenu(null);
        }}
      />
    ) : null
  };
}

export function rowMenuLabel(topic: string) {
  return `Actions for ${topic.trim() || "untitled package"}`;
}

/** Move to (every other cycle), Open in Groups, then Delete group (which asks first). */
export function rowMenuEntries({
  target,
  moveTargets,
  onMove,
  onDelete
}: {
  target: RowMenuTarget;
  moveTargets: number[];
  onMove: (cycleNumber: number) => void;
  onDelete: () => void;
}): MenuEntry[] {
  const move: MenuEntry[] =
    moveTargets.length > 0
      ? [
          { type: "label", label: "Move to" },
          ...moveTargets.map<MenuEntry>((cycleNumber) => ({
            key: `move-${cycleNumber}`,
            label: `Cycle ${cycleNumber}`,
            icon: ArrowRightLeft,
            onSelect: () => onMove(cycleNumber)
          })),
          "separator"
        ]
      : [];
  return [
    ...move,
    {
      key: "open",
      label: "Open in Groups",
      icon: ArrowUpRight,
      href: target.groupHref ?? undefined,
      hidden: !target.groupHref
    },
    "separator",
    { key: "delete", label: "Delete group", icon: Trash2, tone: "danger", onSelect: onDelete }
  ];
}

// The menu portals out of the row, but React events still bubble to it: keep the row's click
// (switch to edit) and right-click (open the menu at the pointer) out of the trigger and the menu.
function stop(event: SyntheticEvent) {
  event.stopPropagation();
}

/** The row's ⋯ button and its menu (40px in card mode, 32px in table mode). */
export function RowMenu({
  topic,
  open,
  disabled,
  items,
  onOpenChange
}: {
  topic: string;
  open: boolean;
  disabled: boolean;
  items: MenuEntry[];
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <div className="flex justify-end [grid-area:menu]" onClick={stop} onContextMenu={stop}>
      <ActionMenu
        label={rowMenuLabel(topic)}
        items={items}
        open={open}
        onOpenChange={onOpenChange}
        disabled={disabled}
        className="h-10 text-muted-foreground @4xl:h-8"
      />
    </div>
  );
}

export type DeleteTarget = { rowId: string | null; rowIndex: number; topic: string };

/** "Are you sure?" for Delete group. A delete cascades, so the copy says what goes with it. */
export function DeleteGroupConfirm({
  target,
  open,
  cycleNumber,
  onOpenChange,
  onConfirm
}: {
  target: DeleteTarget | null;
  open: boolean;
  cycleNumber: number;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const topic = target?.topic.trim();
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Delete this group?"
      description={`${topic ? `“${topic}”` : "This untitled group"} is removed from Cycle ${cycleNumber} with its members, group chat, feedback, approvals, proof of contact, scores and extension requests. Uploaded files stay in Drive. This can't be undone. To keep its work, use Move to another cycle.`}
      confirmLabel="Delete group"
      cancelLabel="Keep it"
      onConfirm={onConfirm}
    />
  );
}
