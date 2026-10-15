import type { ReactNode } from "react";
import { OctagonAlert, RotateCw } from "lucide-react";
import { ActionBar } from "@/components/kit/action-bar";
import { renderIcon, type KitIcon } from "@/components/kit/icon";
import { Spinner } from "@/components/kit/spinner";
import { Button } from "@/components/ui/button";
import { cn } from "@/src/lib/utils";

export type EmptyStateSize = "page" | "panel" | "inline";

/**
 * THE empty / error / not-found state (DESIGN.md §10): a monochrome icon, one SemiBold line,
 * one muted line, optional mono meta, and at most one primary action.
 * - `page`: a whole view is empty (48px icon).
 * - `panel`: inside a card or list (32px icon). Default.
 * - `inline`: one compact row for filter-empty results.
 */
export function EmptyState({
  icon,
  eyebrow,
  title,
  description,
  meta,
  action,
  tone = "neutral",
  size = "panel",
  align = "center",
  role,
  className
}: {
  icon?: KitIcon | ReactNode;
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** Small mono detail ("Last checked 10:42"). */
  meta?: ReactNode;
  /** h-9 button(s). Use outline when the page header already holds the primary. */
  action?: ReactNode;
  tone?: "neutral" | "danger";
  size?: EmptyStateSize;
  align?: "center" | "start";
  role?: "status" | "alert";
  className?: string;
}) {
  const iconTone = tone === "danger" ? "text-danger" : "text-muted-foreground";

  if (size === "inline") {
    return (
      <div role={role} className={cn("flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 text-sm", className)}>
        {icon ? <span className={cn("flex shrink-0 [&>svg]:size-4", iconTone)}>{renderIcon(icon, "h-4 w-4")}</span> : null}
        <p className="min-w-0 flex-1">
          <span className="font-medium text-foreground">{title}</span>
          {description ? <span className="text-muted-foreground"> {description}</span> : null}
        </p>
        {action ? <ActionBar size="sm">{action}</ActionBar> : null}
      </div>
    );
  }

  const page = size === "page";
  return (
    <div
      role={role}
      className={cn(
        "flex min-w-0 flex-col gap-3",
        align === "center" ? "items-center text-center" : "items-start text-left",
        page ? "px-4 py-12 md:py-16" : "px-4 py-8",
        className
      )}
    >
      {icon ? (
        <span className={cn("flex", page ? "[&>svg]:size-12" : "[&>svg]:size-8", iconTone)}>
          {renderIcon(icon, page ? "h-12 w-12" : "h-8 w-8")}
        </span>
      ) : null}
      <div className={cn("min-w-0 space-y-1", align === "center" && "max-w-md")}>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <p className={cn("font-semibold text-foreground", page ? "text-lg" : "text-base")}>{title}</p>
        {description ? <div className="text-sm text-[var(--ink-text)]">{description}</div> : null}
        {meta ? <p className="pt-1 font-mono-broadcast text-xs tabular-nums text-muted-foreground">{meta}</p> : null}
      </div>
      {action ? (
        <ActionBar className={cn("pt-1", align === "center" && "justify-center")}>{action}</ActionBar>
      ) : null}
    </div>
  );
}

/** A failed load: Danger icon, what went wrong, and "Try again". */
export function ErrorState({
  title = "Couldn't load this",
  message,
  onRetry,
  retryLabel = "Try again",
  busy = false,
  size = "panel",
  className
}: {
  title?: ReactNode;
  message?: ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
  busy?: boolean;
  size?: EmptyStateSize;
  className?: string;
}) {
  return (
    <EmptyState
      role="alert"
      tone="danger"
      icon={OctagonAlert}
      title={title}
      description={message}
      size={size}
      className={className}
      action={
        onRetry ? (
          <Button type="button" variant="outline" size={size === "inline" ? "sm" : "default"} onClick={onRetry} disabled={busy}>
            {busy ? <Spinner /> : <RotateCw aria-hidden />}
            {retryLabel}
          </Button>
        ) : null
      }
    />
  );
}
