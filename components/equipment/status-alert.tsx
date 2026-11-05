import type { ReactNode } from "react";
import { CircleAlert, CircleCheck, Info } from "lucide-react";
import { Alert } from "@/components/kit/alert";
import type { FormStatus } from "@/components/equipment/equipment-api";
import { cn } from "@/src/lib/utils";

const TONE = {
  error: { tone: "danger", icon: CircleAlert, text: "text-danger" },
  success: { tone: "success", icon: CircleCheck, text: "text-[var(--brand-green)]" },
  info: { tone: "neutral", icon: Info, text: "text-muted-foreground" }
} as const;

/** A form or action message as the kit banner: icon + words, never color alone (DESIGN.md §10). */
export function StatusAlert({
  status,
  onDismiss,
  action,
  compact = false,
  className
}: {
  status: FormStatus;
  onDismiss?: () => void;
  action?: ReactNode;
  compact?: boolean;
  className?: string;
}) {
  if (!status?.text) return null;
  const style = TONE[status.type];
  return (
    <Alert tone={style.tone} icon={style.icon} onDismiss={onDismiss} action={action} compact={compact} className={className}>
      {status.text}
    </Alert>
  );
}

/**
 * The same message as one or two lines for a phone StickyActionBar's status slot, so a result is
 * in view next to the button that caused it. Hidden from screen readers: the StatusAlert in the
 * page already announces it.
 */
export function StatusLine({ status }: { status: FormStatus }) {
  if (!status?.text) return null;
  const style = TONE[status.type];
  const Icon = style.icon;
  return (
    <span aria-hidden className="flex min-w-0 items-start gap-1.5 whitespace-normal">
      <Icon className={cn("mt-px h-4 w-4 shrink-0", style.text)} />
      <span className="line-clamp-2 min-w-0 text-foreground">{status.text}</span>
    </span>
  );
}
