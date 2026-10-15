"use client";

import type { MouseEvent, ReactNode } from "react";
import { Check } from "lucide-react";
import type { KitIcon } from "@/components/kit/icon";
import { IconButton } from "@/components/kit/icon-button";
import { cn } from "@/src/lib/utils";

/** 11px caps label, shared by field rows and section labels on this page. */
export const VAULT_LABEL_CLASS = "text-[11px] font-medium uppercase leading-tight tracking-[0.11em] text-muted-foreground";

/**
 * Field rows for one login. A container query picks the layout from the space the list gets:
 * a label column | value | two action slots when there is room, otherwise the label stacks
 * above the value. It fills its column, so the action slots end on the same right edge as the
 * header's Share / Edit (the wide pane caps the column itself and gives the rest to activity).
 */
export function VaultFieldList({ children }: { children: ReactNode }) {
  return (
    <div className="@container min-w-0">
      <div className="divide-y divide-border">{children}</div>
    </div>
  );
}

/**
 * One field. Every row has the same two fixed action slots, [reveal][copy], so all Show buttons
 * share one x position and all Copy buttons another. An empty slot keeps its width.
 */
export function VaultFieldRow({
  label,
  value,
  reveal,
  copy,
  expanded
}: {
  label: string;
  value: ReactNode;
  reveal?: ReactNode;
  copy?: ReactNode;
  /** Full-width block under the row (revealed notes). */
  expanded?: ReactNode;
}) {
  return (
    <div className="grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 py-2 @[28rem]:grid-cols-[7rem_minmax(0,1fr)_auto]">
      <span className={cn(VAULT_LABEL_CLASS, "col-start-1 row-start-1")}>{label}</span>
      <div className="col-start-1 row-start-2 min-w-0 @[28rem]:col-start-2 @[28rem]:row-start-1">{value}</div>
      <div className="col-start-2 row-span-2 row-start-1 grid grid-cols-[repeat(2,2.5rem)] gap-1 lg:pointer-fine:grid-cols-[repeat(2,2rem)] @[28rem]:col-start-3 @[28rem]:row-span-1">
        <span className="flex">{reveal}</span>
        <span className="flex" data-vault-copy-slot>
          {copy}
        </span>
      </div>
      {expanded ? <div className="col-span-full row-start-3 min-w-0 pt-1 @[28rem]:row-start-2">{expanded}</div> : null}
    </div>
  );
}

/**
 * A slot's icon button: 40px on touch and phones, 32px with a mouse from lg, 16px icon, tooltip
 * and aria-label from `label`. `done` swaps in a green check for the copy confirmation.
 */
export function SlotButton({
  label,
  icon,
  onClick,
  busy,
  done
}: {
  label: string;
  icon: KitIcon;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  busy?: boolean;
  done?: boolean;
}) {
  return (
    <IconButton
      label={label}
      icon={done ? <Check className="h-4 w-4 text-[var(--brand-green)]" aria-hidden /> : icon}
      size="sm"
      busy={busy}
      onClick={onClick}
      className="h-10 text-muted-foreground hover:text-foreground active:scale-[0.94] lg:pointer-fine:h-8"
    />
  );
}

/** "Hides after 30 s" under a revealed value. */
export function HidesCaption() {
  return <span className="mt-0.5 block text-[11px] text-muted-foreground">Hides after 30 s</span>;
}
