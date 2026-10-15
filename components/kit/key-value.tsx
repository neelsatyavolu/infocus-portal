import type { CSSProperties, ReactNode } from "react";
import { toneTextClass, type StatusToneInput } from "@/components/kit/tone";
import { cn } from "@/src/lib/utils";

export type KeyValueItem = {
  key?: string;
  label: ReactNode;
  value: ReactNode;
  /** Geist Mono tabular value (dates, counts, codes). */
  mono?: boolean;
  /** Right column: a StatusTag, a copy button or an h-8 action. */
  trailing?: ReactNode;
  tone?: StatusToneInput;
  hidden?: boolean;
};

type Layout = "columns" | "stacked";

function rowClass(layout: Layout, dense: boolean, divided: boolean) {
  return cn(
    "min-w-0",
    layout === "columns"
      ? "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-0.5 sm:grid-cols-[var(--kv-label)_minmax(0,1fr)_auto]"
      : "flex flex-col gap-0.5",
    dense ? "min-h-8 py-1" : "min-h-10 py-2",
    divided && "border-t border-border first:border-t-0"
  );
}

/** One label / value / trailing row. Use inside KeyValueList, or pass `items` to the list. */
export function KeyValueRow({
  label,
  value,
  mono = false,
  trailing,
  tone,
  layout = "columns",
  dense = false,
  divided = true,
  valueAlign = "start",
  className
}: Omit<KeyValueItem, "key" | "hidden"> & {
  layout?: Layout;
  dense?: boolean;
  divided?: boolean;
  valueAlign?: "start" | "end";
  className?: string;
}) {
  return (
    <div className={cn(rowClass(layout, dense, divided), className)}>
      <dt
        className={cn(
          "min-w-0 text-[11px] font-medium uppercase leading-tight tracking-[0.11em] text-muted-foreground",
          layout === "columns" && "col-span-2 sm:col-span-1"
        )}
      >
        {label}
      </dt>
      <dd
        className={cn(
          "min-w-0 break-words text-sm text-foreground",
          mono && "font-mono-broadcast text-[13px] tabular-nums",
          valueAlign === "end" && "sm:text-right",
          tone && toneTextClass(tone)
        )}
      >
        {value}
      </dd>
      {trailing ? <dd className="flex shrink-0 items-center justify-end gap-2">{trailing}</dd> : null}
    </div>
  );
}

/**
 * Aligned label / value pairs as a <dl>: caps labels in a fixed column, values lined up, an
 * optional trailing column for a tag or action. Labels stack above values on phones.
 * `stacked` always puts the label above (narrow rails, phone cards).
 */
export function KeyValueList({
  items,
  children,
  layout = "columns",
  columns = 1,
  labelWidth = "8rem",
  dense = false,
  divided = true,
  valueAlign = "start",
  className
}: {
  items?: KeyValueItem[];
  /** KeyValueRow elements, when rows need custom content. */
  children?: ReactNode;
  layout?: Layout;
  /** Two pairs per line from sm. */
  columns?: 1 | 2;
  labelWidth?: string;
  dense?: boolean;
  /** Hairlines between rows (default). */
  divided?: boolean;
  /** "end" right-aligns values from sm (mono numbers). */
  valueAlign?: "start" | "end";
  className?: string;
}) {
  return (
    <dl
      style={{ "--kv-label": labelWidth } as CSSProperties}
      className={cn("min-w-0", columns === 2 && "grid gap-x-8 sm:grid-cols-2 sm:[&>*:nth-child(2)]:border-t-0", className)}
    >
      {items
        ?.filter((item) => !item.hidden)
        .map(({ key, ...item }, index) => (
          <KeyValueRow
            key={key ?? (typeof item.label === "string" ? item.label : index)}
            {...item}
            layout={layout}
            dense={dense}
            divided={divided}
            valueAlign={valueAlign}
          />
        ))}
      {children}
    </dl>
  );
}
