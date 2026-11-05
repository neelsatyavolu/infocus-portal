import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { StatusDot, StatusTag } from "@/components/kit/status-tag";
import { cn } from "@/src/lib/utils";
import type { DocStatus } from "./teleprompter-model";

/** Every pane header (Scripts, the script toolbar, Rundown) is h-14, so their bottom lines meet. */
export const PANE_HEADER_HEIGHT = "h-14";

/** Sticky panes sit right under the host's sticky top bar (AppShell or TeleprompterShell). */
export const STICKY_TOP = "top-[var(--app-header-h,0px)]";

/** A pane title bar: caps label, optional mono count, right-aligned actions. */
export function PaneHeader({
  label,
  count,
  actions,
  className
}: {
  label: ReactNode;
  count?: number;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex shrink-0 items-center gap-2 border-b border-border px-3", PANE_HEADER_HEIGHT, className)}>
      <p className="flex min-w-0 flex-1 items-baseline gap-2 text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground">
        <span className="truncate">{label}</span>
        {count !== undefined ? (
          <span className="font-mono-broadcast text-xs normal-case tracking-normal tabular-nums text-[var(--ink-text)]">{count}</span>
        ) : null}
      </p>
      {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
    </div>
  );
}

/** A 2px determinate bar pinned to the bottom edge of a header row, so progress never pushes content down. */
export function ProgressEdge({ value, label }: { value: number; label: string }) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      className="pointer-events-none absolute inset-x-0 -bottom-px h-0.5 overflow-hidden"
    >
      <div className="h-full bg-[var(--brand-green)] transition-[width] duration-200" style={{ width: `${clamped}%` }} />
    </div>
  );
}

/** REFORMATTING nn% as a tag (the % in Geist Mono), the same size as the tags beside it. */
export function ReformattingTag({ progress }: { progress: number }) {
  return (
    <StatusTag tone="neutral" size="sm" spinner title="Reformatting">
      Reformatting <span className="font-mono-broadcast tabular-nums">{Math.round(progress)}%</span>
    </StatusTag>
  );
}

export function DocStatusTag({ status, size = "md" }: { status: DocStatus; size?: "sm" | "md" }) {
  return (
    <StatusTag tone={status.tone} size={size} dot={status.kind === "today"}>
      {status.label}
    </StatusTag>
  );
}

/** A compact second status: a warning icon and a count ("2"), with the words for screen readers. */
export function ToFillCount({ count }: { count: number }) {
  if (count < 1) {
    return null;
  }
  const words = `${count} ${count === 1 ? "section" : "sections"} to fill`;
  return (
    <span title={words} className="inline-flex shrink-0 items-center gap-0.5 text-[var(--brand-amber)]">
      <AlertTriangle className="h-3 w-3" aria-hidden />
      <span aria-hidden className="font-mono-broadcast text-[11px] tabular-nums">
        {count}
      </span>
      <span className="sr-only">{words}</span>
    </span>
  );
}

/** "Updated since your last visit": the green new-item dot plus the mono age. */
export function UpdatedMark({ age, className }: { age: string; className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1.5", className)} title="Updated since your last visit">
      <StatusDot tone="new" size={6} />
      <span className="sr-only">Updated since your last visit,</span>
      {age ? <span className="font-mono-broadcast text-[11px] tabular-nums text-[var(--brand-green)]">{age}</span> : null}
    </span>
  );
}
