"use client";

import Link from "next/link";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { CONTROL_HEIGHT, type ControlSize } from "@/components/kit/action-bar";
import { renderIcon, type KitIcon } from "@/components/kit/icon";
import { Spinner } from "@/components/kit/spinner";
import { buttonVariants } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/src/lib/utils";

/** sm 32px, md 36px, touch 40px on phones and 36px from md (matches the buttons beside it). */
export type IconButtonSize = ControlSize;

type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  /** Required: the aria-label and the tooltip text. */
  label: string;
  icon: KitIcon | ReactNode;
  size?: IconButtonSize;
  variant?: "ghost" | "outline" | "default";
  /** danger: quiet destructive (Danger icon, tint on hover). */
  tone?: "default" | "danger";
  busy?: boolean;
  /** Visual "on" tint only (e.g. feedback exists). */
  active?: boolean;
  /** A toggle: sets aria-pressed and the "on" tint. */
  pressed?: boolean;
  /** Corner mark, e.g. <CountBadge count={3} /> or <StatusDot />. */
  badge?: ReactNode;
  /** false hides the tooltip; a side picks where it opens. */
  tooltip?: boolean | "top" | "right" | "bottom" | "left";
  /** Renders a link instead of a button. */
  href?: string;
  /** With href: opens in a new tab. */
  external?: boolean;
};

/**
 * Square icon-only button that matches text buttons in the same row (h-8 / h-9, 16px icon),
 * with a required label and a tooltip. Use it for Refresh, ⋯, Close, Undo and similar.
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    label,
    icon,
    size = "md",
    variant = "ghost",
    tone = "default",
    busy = false,
    active = false,
    pressed,
    badge,
    tooltip = true,
    href,
    external = false,
    className,
    disabled,
    type,
    ...props
  },
  ref
) {
  const on = active || pressed === true;
  const classes = cn(
    buttonVariants({ variant, size: "icon" }),
    "relative aspect-square w-auto shrink-0 px-0",
    CONTROL_HEIGHT[size],
    tone === "danger" && "text-danger hover:bg-danger-tint hover:text-danger",
    on && "bg-[rgb(43_179_110/0.12)] text-[var(--brand-green)] hover:bg-[rgb(43_179_110/0.18)] hover:text-[var(--brand-green)]",
    className
  );
  const content = (
    <>
      {busy ? <Spinner /> : renderIcon(icon, "h-4 w-4")}
      {badge ? <span className="pointer-events-none absolute -right-1.5 -top-1.5 flex">{badge}</span> : null}
    </>
  );

  let control: ReactNode;
  if (href && !disabled) {
    control = external ? (
      <a href={href} target="_blank" rel="noopener noreferrer" aria-label={`${label} (opens in a new tab)`} className={classes}>
        {content}
      </a>
    ) : (
      <Link href={href as never} aria-label={label} className={classes}>
        {content}
      </Link>
    );
  } else {
    control = (
      <button
        ref={ref}
        type={type ?? "button"}
        aria-label={label}
        aria-pressed={pressed}
        aria-busy={busy || undefined}
        disabled={disabled || busy}
        className={classes}
        {...props}
      >
        {content}
      </button>
    );
  }

  if (tooltip === false) return control;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{control}</TooltipTrigger>
      <TooltipContent side={tooltip === true ? "top" : tooltip}>{label}</TooltipContent>
    </Tooltip>
  );
});
