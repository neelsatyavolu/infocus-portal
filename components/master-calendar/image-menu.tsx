"use client";

import { Image as ImageIcon, ImageOff } from "lucide-react";
import { ActionMenu } from "@/components/kit/menu";

export type ImageMenuState = { dateKey: string; x: number; y: number };

/**
 * Right-click (or long-press) menu on a class day: Delete image / Restore image. The kit menu
 * opens at the pointer and keeps itself on screen. The Day panel has the same switch as a button.
 */
export function ImageMenu({
  state,
  imageHidden,
  onToggle,
  onClose
}: {
  state: ImageMenuState;
  imageHidden: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  return (
    <ActionMenu
      label="Scenic image"
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      anchorPoint={{ x: state.x, y: state.y }}
      align="start"
      items={[
        {
          label: imageHidden ? "Restore image" : "Delete image",
          icon: imageHidden ? ImageIcon : ImageOff,
          onSelect: onToggle
        }
      ]}
    />
  );
}
