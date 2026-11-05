import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/src/lib/utils";

export type ValueRow = {
  key: string;
  label: ReactNode;
  value: ReactNode;
  href?: string;
};

/**
 * 40px label / value rows with hairlines: the label on the left, the value in Geist Mono on the
 * right, so Grade and This week read as one column system. A row with `href` is a link.
 */
export function ValueRows({ rows, className, "aria-label": ariaLabel }: { rows: ValueRow[]; className?: string; "aria-label"?: string }) {
  return (
    <ul aria-label={ariaLabel} className={cn("min-w-0", className)}>
      {rows.map((row) => {
        const content = (
          <>
            <span className="min-w-0 truncate text-muted-foreground transition-colors group-hover:text-foreground">{row.label}</span>
            <span
              className={cn(
                "shrink-0 text-right font-mono-broadcast text-[13px] tabular-nums text-foreground",
                row.href && "transition-colors group-hover:text-[var(--brand-green)]"
              )}
            >
              {row.value}
            </span>
          </>
        );
        const rowClass = "flex min-h-10 items-center justify-between gap-3 py-2 text-sm";
        return (
          <li key={row.key} className="min-w-0 border-t border-border">
            {row.href ? (
              <Link
                href={row.href as never}
                className={cn(
                  rowClass,
                  "group rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                )}
              >
                {content}
              </Link>
            ) : (
              <div className={rowClass}>{content}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
