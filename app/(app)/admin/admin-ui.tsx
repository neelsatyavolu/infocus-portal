import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Trash2 } from "lucide-react";
import { IconButton } from "@/components/kit/icon-button";
import { Skeleton } from "@/components/kit/skeleton";
import { StatusTag } from "@/components/kit/status-tag";
import { cn } from "@/src/lib/utils";
import type { Health } from "./admin-status";
import { formatWhen, formatWhenFull } from "./admin-types";

/** A timestamp in the one Admin format, mono and tabular, with the full time on hover. */
export function When({ iso, className }: { iso: string; className?: string }) {
  return (
    <time dateTime={iso} title={formatWhenFull(iso)} className={cn("font-mono tabular-nums", className)}>
      {formatWhen(iso)}
    </time>
  );
}

const HEALTH_TAG_TONE = { ok: "success", danger: "danger", neutral: "neutral" } as const;

/** A Health as a status tag: green check when fine, Danger with a warning icon when not. */
export function HealthTag({ health, size, srLabel }: { health: Health; size?: "sm" | "md"; srLabel?: string }) {
  const icon = health.tone === "ok" ? CheckCircle2 : health.tone === "danger" ? AlertTriangle : undefined;
  return (
    <StatusTag
      tone={HEALTH_TAG_TONE[health.tone]}
      icon={icon}
      spinner={health.code === "checking"}
      size={size}
      srLabel={srLabel}
    >
      {health.label}
    </StatusTag>
  );
}

/** One status line with its icon: a green check, a Danger warning, or plain muted text. */
export function HealthLine({ tone, children }: { tone: Health["tone"]; children: ReactNode }) {
  return (
    <p
      className={cn(
        "flex items-start gap-1.5 text-[13px] leading-snug",
        tone === "danger" ? "text-danger" : tone === "ok" ? "text-foreground" : "text-muted-foreground"
      )}
    >
      {tone === "ok" ? (
        <CheckCircle2 className="mt-px h-4 w-4 shrink-0 text-[var(--brand-green)]" aria-hidden="true" />
      ) : tone === "danger" ? (
        <AlertTriangle className="mt-px h-4 w-4 shrink-0" aria-hidden="true" />
      ) : null}
      <span className="min-w-0 break-words">{children}</span>
    </p>
  );
}

/** Caps column labels over a grid list (shown from `sm`, the rows stack below it). */
export const COLUMN_LABEL_CLASS =
  "text-[11px] font-medium uppercase leading-tight tracking-[0.11em] text-muted-foreground";

/**
 * Every size="sm" control on Admin (row actions and section-header actions): 40px touch targets
 * on phones, 32px from sm. Every control in one row uses the same class, so heights never mix.
 */
export const ROW_ACTION_CLASS = "max-sm:h-10";

/** Placeholder lines for a panel body that is still loading (school years, days off, backups). */
export function RowsSkeleton({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div aria-hidden="true" className={cn("space-y-3 px-4 py-4 md:px-5", className)}>
      {Array.from({ length: rows }, (_, row) => (
        <Skeleton key={row} className={cn("h-4", row % 2 ? "w-4/5" : "w-full")} />
      ))}
    </div>
  );
}

/**
 * The one "remove from this list" control on Admin (people, producer roles, school years, days
 * off): a quiet trash icon that turns Danger on hover. 32px in list rows, 36px beside h-9 inputs,
 * 40px on phones.
 */
export function RemoveButton({
  label,
  onClick,
  size = "sm",
  busy = false,
  disabled = false
}: {
  label: string;
  onClick: () => void;
  size?: "sm" | "md";
  busy?: boolean;
  disabled?: boolean;
}) {
  return (
    <IconButton
      label={label}
      icon={Trash2}
      size={size}
      tone="danger"
      busy={busy}
      disabled={disabled}
      onClick={onClick}
      className={cn(ROW_ACTION_CLASS, "text-muted-foreground")}
    />
  );
}
