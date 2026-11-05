import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, OctagonAlert, X } from "lucide-react";
import { ActionBar } from "@/components/kit/action-bar";
import { renderIcon, type KitIcon } from "@/components/kit/icon";
import { cn } from "@/src/lib/utils";

export type AlertTone = "info" | "success" | "warning" | "danger" | "neutral";

const TONE: Record<AlertTone, { box: string; icon: string; Icon: KitIcon }> = {
  info: { box: "border-[var(--brand-green)]/30 bg-[var(--brand-green)]/[0.06]", icon: "text-[var(--brand-green)]", Icon: Info },
  success: { box: "border-[var(--brand-green)]/30 bg-[var(--brand-green)]/10", icon: "text-[var(--brand-green)]", Icon: CheckCircle2 },
  warning: { box: "border-[var(--brand-amber)]/40 bg-[var(--brand-amber)]/10", icon: "text-[var(--brand-amber)]", Icon: AlertTriangle },
  danger: { box: "border-danger/40 bg-danger-tint", icon: "text-danger", Icon: OctagonAlert },
  neutral: { box: "border-border bg-card", icon: "text-muted-foreground", Icon: Info }
};

/**
 * THE banner (DESIGN.md §10): tint background, a 1px line in the same hue, an icon, plain words,
 * and at most one h-8 action (Try again, View). Errors, warnings, View-as notices, rule callouts.
 * Uses theme tokens only, so it reads in Light mode (never text-amber-100).
 */
export function Alert({
  tone = "info",
  icon,
  title,
  children,
  action,
  onDismiss,
  dismissLabel = "Dismiss",
  role,
  compact = false,
  className
}: {
  tone?: AlertTone;
  /** Replaces the tone's icon; `false` hides it. */
  icon?: KitIcon | ReactNode | false;
  title?: ReactNode;
  children?: ReactNode;
  /** h-8 button(s); drops under the words on phones. */
  action?: ReactNode;
  onDismiss?: () => void;
  dismissLabel?: string;
  /** Defaults to "alert" for danger, "status" otherwise. */
  role?: "alert" | "status" | "note";
  compact?: boolean;
  className?: string;
}) {
  const style = TONE[tone];
  const shownIcon = icon === false ? null : renderIcon(icon ?? style.Icon, cn("h-4 w-4", style.icon));
  return (
    <div
      role={role ?? (tone === "danger" ? "alert" : "status")}
      className={cn(
        "flex min-w-0 items-start gap-3 rounded-md border text-foreground",
        compact ? "px-3 py-2 text-[13px]" : "px-4 py-3 text-sm",
        style.box,
        className
      )}
    >
      {shownIcon ? <span className={cn("mt-0.5 flex shrink-0 [&>svg]:size-4", style.icon)}>{shownIcon}</span> : null}
      <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="min-w-0 leading-snug">
          {title ? <p className="font-semibold">{title}</p> : null}
          {children ? <div className={cn(title && "mt-0.5 text-[var(--ink-text)]")}>{children}</div> : null}
        </div>
        {action ? (
          <ActionBar size="sm" className="shrink-0">
            {action}
          </ActionBar>
        ) : null}
      </div>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={dismissLabel}
          className={cn(
            "grid shrink-0 place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-[var(--ink-3)] hover:text-foreground",
            compact ? "-my-0.5 -mr-1 h-6 w-6" : "-my-1 -mr-2 h-8 w-8"
          )}
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

/** A quiet one-line caveat: 16px icon and 13px muted words, no box (disclaimers, hints). */
export function InlineNote({
  icon = Info,
  tone = "muted",
  children,
  className
}: {
  icon?: KitIcon | ReactNode;
  tone?: "muted" | "warning";
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "flex items-start gap-2 text-[13px] leading-snug",
        tone === "warning" ? "text-[var(--brand-amber)]" : "text-muted-foreground",
        className
      )}
    >
      <span className="mt-px flex shrink-0 [&>svg]:size-4">{renderIcon(icon, "h-4 w-4")}</span>
      <span className="min-w-0">{children}</span>
    </p>
  );
}

/** The error line under one field or tile: icon + Danger words, announced to screen readers. */
export function InlineError({ id, children, className }: { id?: string; children: ReactNode; className?: string }) {
  return (
    <p id={id} role="alert" className={cn("flex items-start gap-1.5 text-[13px] leading-snug text-danger", className)}>
      <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="min-w-0">{children}</span>
    </p>
  );
}
