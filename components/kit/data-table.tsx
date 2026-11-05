import Link from "next/link";
import type { CSSProperties, MouseEvent, ReactNode } from "react";
import { ListSkeleton } from "@/components/kit/skeleton";
import { cn } from "@/src/lib/utils";

/** Table chrome as descendant styles, for hand-written <table>s (grids with inputs, grouped headers). */
export const TABLE_CHROME =
  "w-full border-collapse text-sm [&_th]:h-10 [&_th]:whitespace-nowrap [&_th]:border-b [&_th]:border-border [&_th]:px-3 [&_th]:text-left [&_th]:align-middle [&_th]:text-[11px] [&_th]:font-medium [&_th]:uppercase [&_th]:tracking-[0.11em] [&_th]:text-muted-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-3 [&_td]:py-2.5 [&_td]:align-middle [&_tbody:last-of-type_tr:last-child_td]:border-b-0 [&_tbody_tr]:transition-colors [&_tbody_tr:hover]:bg-[var(--ink-3)]";

const HIDE: Record<"sm" | "md" | "lg", string> = {
  sm: "max-sm:hidden",
  md: "max-md:hidden",
  lg: "max-lg:hidden"
};
const SHOW_CARDS_BELOW: Record<"sm" | "md" | "lg", string> = { sm: "sm:hidden", md: "md:hidden", lg: "lg:hidden" };

/**
 * A scroll container + table with the kit's chrome, for tables you write by hand (thead/tbody).
 * Wide tables scroll inside it, never the page. `stickyFirstColumn` pins names while scrolling
 * sideways; `maxHeight` gives it its own vertical scroll (then the header sticks too).
 * `busy` marks the table aria-busy while rows load.
 */
export function TableShell({
  minWidth,
  maxHeight,
  stickyFirstColumn = false,
  dense = false,
  busy = false,
  caption,
  className,
  tableClassName,
  children
}: {
  /** e.g. "48rem": below this the table scrolls sideways. */
  minWidth?: string;
  maxHeight?: string;
  stickyFirstColumn?: boolean;
  dense?: boolean;
  busy?: boolean;
  caption?: string;
  className?: string;
  tableClassName?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn("min-w-0 overflow-auto rounded-md border border-border bg-card", className)}
      style={maxHeight ? { maxHeight } : undefined}
    >
      <table
        aria-busy={busy || undefined}
        style={minWidth ? { minWidth } : undefined}
        className={cn(
          TABLE_CHROME,
          dense && "[&_td]:py-1.5 [&_th]:h-9",
          maxHeight && "[&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10 [&_thead_th]:bg-card",
          stickyFirstColumn &&
            "[&_td:first-child]:sticky [&_td:first-child]:left-0 [&_td:first-child]:z-[1] [&_td:first-child]:bg-card [&_th:first-child]:sticky [&_th:first-child]:left-0 [&_th:first-child]:z-20 [&_th:first-child]:bg-card",
          tableClassName
        )}
      >
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        {children}
      </table>
    </div>
  );
}

export type DataColumn<T> = {
  key: string;
  header: ReactNode;
  align?: "start" | "end" | "center";
  /** Geist Mono tabular cells (numbers, dates, codes). Numbers also go `align: "end"`. */
  mono?: boolean;
  /** CSS width, e.g. "8rem" or "20%". */
  width?: string;
  hideBelow?: "sm" | "md" | "lg";
  render: (row: T, index: number) => ReactNode;
  className?: string;
  headerTitle?: string;
};

type DataGroup<T> = { key: string; header: ReactNode; rows: T[] };

/**
 * A data table: label-style header, 48px rows with hairlines, Ink 3 hover, mono right-aligned
 * numbers, an actions column, loading and empty rows. On phones it either scrolls inside its own
 * box or, with `renderMobileRow`, swaps to a stacked card list (no sideways scrolling).
 * Use `groups` for bucketed rows (one <tbody> per group, with a header row).
 * `onRowClick` is a mouse convenience: keep a keyboard path too (`rowHref`, or a button in a
 * cell). `rowHref` makes the first cell's link cover the row; with `stickyFirstColumn` the link
 * only covers that first cell.
 */
export function DataTable<T>({
  columns,
  rows,
  groups,
  rowKey,
  rowHref,
  onRowClick,
  rowClassName,
  rowActions,
  actionsHeader = "",
  renderMobileRow,
  stackBelow = "md",
  empty,
  loading = false,
  skeletonRows = 5,
  stickyFirstColumn = false,
  minWidth,
  maxHeight,
  dense = false,
  caption,
  className
}: {
  columns: Array<DataColumn<T>>;
  rows?: T[];
  groups?: Array<DataGroup<T>>;
  rowKey: (row: T, index: number) => string;
  /** The first cell becomes a link that covers the row. Keep other cells free of links. */
  rowHref?: (row: T) => string | null;
  onRowClick?: (row: T, event: MouseEvent<HTMLTableRowElement>) => void;
  rowClassName?: (row: T) => string | undefined;
  /** h-8 buttons or an ActionMenu, in a right-aligned last column. */
  rowActions?: (row: T) => ReactNode;
  actionsHeader?: ReactNode;
  renderMobileRow?: (row: T, index: number) => ReactNode;
  stackBelow?: "sm" | "md" | "lg";
  empty?: ReactNode;
  loading?: boolean;
  skeletonRows?: number;
  stickyFirstColumn?: boolean;
  minWidth?: string;
  maxHeight?: string;
  dense?: boolean;
  caption?: string;
  className?: string;
}) {
  const allGroups: Array<DataGroup<T>> = groups ?? [{ key: "_", header: null, rows: rows ?? [] }];
  const total = allGroups.reduce((sum, group) => sum + group.rows.length, 0);
  const span = columns.length + (rowActions ? 1 : 0);
  const alignClass = (align?: DataColumn<T>["align"]) =>
    align === "end" ? "text-right" : align === "center" ? "text-center" : "text-left";

  const table = (
    <TableShell
      minWidth={minWidth}
      maxHeight={maxHeight}
      stickyFirstColumn={stickyFirstColumn}
      dense={dense}
      busy={loading}
      caption={caption}
      className={renderMobileRow ? HIDE[stackBelow] : undefined}
    >
      <colgroup>
        {columns.map((column) => (
          <col
            key={column.key}
            // Hidden with its cells, so a sized column doesn't leave an empty gap.
            className={column.hideBelow ? HIDE[column.hideBelow] : undefined}
            style={column.width ? ({ width: column.width } as CSSProperties) : undefined}
          />
        ))}
        {rowActions ? <col /> : null}
      </colgroup>
      <thead>
        <tr>
          {columns.map((column) => (
            <th
              key={column.key}
              scope="col"
              title={column.headerTitle}
              className={cn(alignClass(column.align), column.hideBelow && HIDE[column.hideBelow])}
            >
              {column.header}
            </th>
          ))}
          {rowActions ? (
            <th scope="col" className="text-right">
              {actionsHeader || <span className="sr-only">Actions</span>}
            </th>
          ) : null}
        </tr>
      </thead>
      {loading && total === 0 ? (
        <tbody>
          {Array.from({ length: skeletonRows }, (_, index) => (
            <tr key={`skeleton-${index}`} aria-hidden>
              {Array.from({ length: span }, (_, cell) => (
                <td key={cell}>
                  <span className="block h-4 w-3/4 rounded-sm bg-[var(--ink-3)] motion-safe:animate-pulse" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      ) : total === 0 ? (
        <tbody>
          <tr>
            <td colSpan={span} className="p-0!">
              {empty ?? <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nothing here yet.</p>}
            </td>
          </tr>
        </tbody>
      ) : (
        allGroups.map((group) => (
          <tbody key={group.key}>
            {group.header ? (
              <tr className="hover:bg-transparent!">
                <th
                  colSpan={span}
                  scope="rowgroup"
                  className="h-9! bg-[var(--ink-2)] text-[11px]! text-muted-foreground"
                >
                  {group.header}
                </th>
              </tr>
            ) : null}
            {group.rows.map((row, index) => {
              const href = rowHref?.(row) ?? null;
              return (
                <tr
                  key={rowKey(row, index)}
                  onClick={onRowClick ? (event) => onRowClick(row, event) : undefined}
                  className={cn((href || onRowClick) && "relative cursor-pointer", rowClassName?.(row))}
                >
                  {columns.map((column, columnIndex) => {
                    const content = column.render(row, index);
                    return (
                      <td
                        key={column.key}
                        className={cn(
                          dense ? "h-10" : "h-12",
                          alignClass(column.align),
                          column.mono && "font-mono-broadcast text-[13px] tabular-nums",
                          column.hideBelow && HIDE[column.hideBelow],
                          column.className
                        )}
                      >
                        {href && columnIndex === 0 ? (
                          <Link
                            href={href as never}
                            className="outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring"
                          >
                            {content}
                          </Link>
                        ) : (
                          content
                        )}
                      </td>
                    );
                  })}
                  {rowActions ? (
                    <td className="relative z-[2] whitespace-nowrap text-right" onClick={(event) => event.stopPropagation()}>
                      <div className="inline-flex items-center justify-end gap-1 *:h-8">{rowActions(row)}</div>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        ))
      )}
    </TableShell>
  );

  if (!renderMobileRow) return <div className={cn("min-w-0", className)}>{table}</div>;

  return (
    <div className={cn("min-w-0", className)}>
      {table}
      <div className={SHOW_CARDS_BELOW[stackBelow]}>
        {loading && total === 0 ? (
          <ListSkeleton rows={skeletonRows} leading={false} />
        ) : total === 0 ? (
          <div className="rounded-md border border-border bg-card">
            {empty ?? <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nothing here yet.</p>}
          </div>
        ) : (
          allGroups.map((group) => (
            <section key={group.key} className="mb-4 last:mb-0">
              {group.header ? (
                <h3 className="mb-2 text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground">{group.header}</h3>
              ) : null}
              <ul className="divide-y divide-border overflow-hidden rounded-md border border-border bg-card">
                {group.rows.map((row, index) => (
                  <li key={rowKey(row, index)} className="min-w-0">
                    {renderMobileRow(row, index)}
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </div>
  );
}

/**
 * Rows that share one CSS grid template, with a caps header row from md. Below md each row
 * stacks its cells and shows each cell's label. Lighter than a table for lists where a row is
 * one link or holds controls (rosters, queues, settings lists, the Managers areas).
 */
export function GridList({
  columns,
  header,
  className,
  children,
  "aria-label": ariaLabel
}: {
  /** grid-template-columns from md, e.g. "minmax(0,1fr) 10rem 6rem 2.5rem". */
  columns: string;
  /** Header labels, one per column ("" for an unlabeled column). */
  header?: Array<{ label: ReactNode; align?: "start" | "end" }>;
  className?: string;
  children: ReactNode;
  "aria-label"?: string;
}) {
  return (
    <div
      style={{ "--grid-cols": columns } as CSSProperties}
      className={cn("min-w-0 overflow-hidden rounded-md border border-border bg-card", className)}
    >
      {header ? (
        <div
          aria-hidden
          className="hidden h-10 items-center gap-x-4 border-b border-border px-4 text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground md:grid md:grid-cols-[var(--grid-cols)]"
        >
          {header.map((cell, index) => (
            <span key={index} className={cn("min-w-0 truncate", cell.align === "end" && "text-right")}>
              {cell.label}
            </span>
          ))}
        </div>
      ) : null}
      <ul aria-label={ariaLabel} className="divide-y divide-border">
        {children}
      </ul>
    </div>
  );
}

/** One GridList row. `href` makes the whole row a link (then keep controls out of its cells). */
export function GridListRow({
  href,
  onClick,
  active = false,
  sub,
  className,
  children
}: {
  href?: string;
  onClick?: () => void;
  active?: boolean;
  /** A full-width second line under the cells (notes, an expanded editor). */
  sub?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const rowClass = cn(
    "relative flex min-w-0 flex-col gap-1.5 px-4 py-3 md:grid md:min-h-12 md:grid-cols-[var(--grid-cols)] md:items-center md:gap-x-4 md:gap-y-0 md:py-2",
    (href || onClick) && "transition-colors hover:bg-[var(--ink-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
    active && "bg-[var(--ink-3)] before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-[var(--brand-green)]",
    className
  );
  // Same side padding as the cells above, so the second line starts on their left edge.
  const subRow = sub ? <div className="px-4 pb-3 md:pb-2">{sub}</div> : null;
  return (
    <li className="min-w-0">
      {href ? (
        <Link href={href as never} aria-current={active ? "page" : undefined} className={rowClass}>
          {children}
        </Link>
      ) : onClick ? (
        <div
          role="button"
          tabIndex={0}
          onClick={onClick}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            onClick();
          }}
          className={rowClass}
        >
          {children}
        </div>
      ) : (
        <div className={rowClass}>{children}</div>
      )}
      {subRow}
    </li>
  );
}

/** One GridList cell. `label` shows above the value on phones and is read by screen readers. */
export function GridListCell({
  label,
  align = "start",
  mono = false,
  className,
  children
}: {
  label?: string;
  align?: "start" | "end";
  mono?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex min-w-0 items-baseline gap-2 md:block", align === "end" && "md:text-right", className)}>
      {label ? (
        <span className="w-24 shrink-0 text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground md:sr-only">
          {label}
        </span>
      ) : null}
      <span className={cn("min-w-0 text-sm text-foreground", mono && "font-mono-broadcast text-[13px] tabular-nums")}>{children}</span>
    </div>
  );
}
