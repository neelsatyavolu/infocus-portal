import { createElement, isValidElement, type ComponentType, type ReactNode } from "react";
import { cn } from "@/src/lib/utils";

/** A Lucide icon component, or any component that takes a className. */
export type KitIcon = ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;

/**
 * Renders an icon given either a component (`icon={Check}`) or an element (`icon={<Check />}`).
 * Lucide icons are forwardRef objects, not functions, so this checks for an element first.
 */
export function renderIcon(icon: KitIcon | ReactNode | null | undefined, className?: string): ReactNode {
  if (icon === null || icon === undefined || icon === false) return null;
  if (isValidElement(icon)) return icon;
  if (typeof icon === "string" || typeof icon === "number") return icon;
  return createElement(icon as KitIcon, { className: cn("shrink-0", className), "aria-hidden": true });
}
