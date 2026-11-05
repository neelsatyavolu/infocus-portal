import Link from "next/link";
import { isValidElement, type MouseEvent, type ReactNode } from "react";
import { renderIcon, type KitIcon } from "@/components/kit/icon";
import { Spinner } from "@/components/kit/spinner";
import { cn } from "@/src/lib/utils";

/** A bordered card of rows with hairlines between them (inbox, queue, people, link lists). */
export function List({
  label,
  className,
  children,
  "aria-label": ariaLabel
}: {
  /** Caps label row above the rows, inside the card. */
  label?: ReactNode;
  className?: string;
  children: ReactNode;
  "aria-label"?: string;
}) {
  return (
    <div className={cn("min-w-0 overflow-hidden rounded-md border border-border bg-card", className)}>
      {label ? (
        <div className="border-b border-border px-4 py-2 text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground">
          {label}
        </div>
      ) : null}
      <ul aria-label={ariaLabel} className="divide-y divide-border">
        {children}
      </ul>
    </div>
  );
}

/**
 * The standard tappable row: leading tile, title with inline tags and a right meta on line 1,
 * a muted subtitle on line 2, and a trailing slot (tag, count, chevron, h-8 action). 56px tall
 * (64px with `size="lg"`). Renders a link (`href`), a button (`onClick`) or a plain row.
 * `active` = the selected row in a list/detail (Ink 3 fill and a 3px green bar).
 * Put it inside <List> or any <ul>; it renders its own <li>.
 */
export function ListRow({
  leading,
  title,
  tags,
  meta,
  subtitle,
  trailing,
  href,
  external = false,
  onClick,
  active = false,
  emphasized = false,
  busy = false,
  disabled = false,
  size = "md",
  className
}: {
  /** An Avatar/IconTile element (32px slot), or an icon component (drawn in a 32px Ink 3 tile). */
  leading?: KitIcon | ReactNode;
  title: ReactNode;
  /** StatusTags right after the title. */
  tags?: ReactNode;
  /** Right side of line 1 (a mono time, a count). */
  meta?: ReactNode;
  subtitle?: ReactNode;
  /** Right column, vertically centred. Kept outside the link when it holds controls. */
  trailing?: ReactNode;
  href?: string;
  external?: boolean;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  active?: boolean;
  /** Unread: SemiBold title. */
  emphasized?: boolean;
  busy?: boolean;
  disabled?: boolean;
  size?: "md" | "lg";
  className?: string;
}) {
  const interactive = Boolean((href || onClick) && !disabled);
  const body = (
    <>
      {leading ? (
        isValidElement(leading) ? (
          <span className="flex w-8 shrink-0 justify-center [&>svg]:size-4 [&>svg]:text-muted-foreground">{leading}</span>
        ) : (
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-[var(--ink-3)] text-muted-foreground [&>svg]:size-4">
            {renderIcon(leading, "h-4 w-4")}
          </span>
        )
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className={cn("min-w-0 truncate text-sm text-foreground", emphasized ? "font-semibold" : "font-medium")}>{title}</span>
          {tags ? <span className="flex shrink-0 items-center gap-1.5">{tags}</span> : null}
          {meta ? <span className="ml-auto shrink-0 pl-2 text-xs text-muted-foreground">{meta}</span> : null}
        </span>
        {subtitle ? <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">{subtitle}</span> : null}
      </span>
      {busy ? <Spinner /> : null}
    </>
  );
  const rowClass = cn(
    "flex w-full min-w-0 items-center gap-3 px-4 text-left",
    size === "lg" ? "min-h-16 py-3" : "min-h-14 py-2.5",
    interactive && "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
    disabled && "opacity-50"
  );

  let main: ReactNode;
  if (href && !disabled) {
    main = external ? (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cn(rowClass, "flex-1")}>
        {body}
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    ) : (
      <Link href={href as never} aria-current={active ? "page" : undefined} className={cn(rowClass, "flex-1")}>
        {body}
      </Link>
    );
  } else if (onClick && !disabled) {
    main = (
      <button type="button" onClick={onClick} aria-current={active ? "true" : undefined} aria-busy={busy || undefined} className={cn(rowClass, "flex-1")}>
        {body}
      </button>
    );
  } else {
    main = <div className={cn(rowClass, "flex-1")}>{body}</div>;
  }

  // Hover and the selected fill sit on the <li>, so they run under the trailing slot too.
  return (
    <li
      className={cn(
        "relative flex min-w-0 items-center",
        interactive && "transition-colors hover:bg-[var(--ink-3)]",
        active && "bg-[var(--ink-3)] before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-[var(--brand-green)]",
        className
      )}
    >
      {main}
      {trailing ? <div className="flex shrink-0 items-center gap-2 pr-4">{trailing}</div> : null}
    </li>
  );
}

/** Secondary navigation (Settings/Admin rails, the assets panel, a Groups list). */
export function NavList({ label, className, children }: { label?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <nav aria-label={typeof label === "string" ? label : undefined} className={cn("min-w-0", className)}>
      {label ? (
        <p className="px-2.5 pb-1.5 pt-3 text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground">{label}</p>
      ) : null}
      <ul className="space-y-0.5">{children}</ul>
    </nav>
  );
}

/** One NavList row: icon, label, a trailing count or tag, depth indent, one active style. */
export function NavListItem({
  href,
  onClick,
  icon,
  label,
  active = false,
  trailing,
  depth = 0,
  title
}: {
  href?: string;
  onClick?: (event: MouseEvent<HTMLElement>) => void;
  icon?: KitIcon | ReactNode;
  label: ReactNode;
  active?: boolean;
  /** CountBadge, StatusTag or StatusDot. */
  trailing?: ReactNode;
  /** Indent level for nested folders. */
  depth?: number;
  title?: string;
}) {
  const className = cn(
    "flex h-9 w-full min-w-0 items-center gap-2.5 rounded-md pr-2.5 text-left text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&>svg]:size-4 [&>svg]:shrink-0",
    active ? "bg-[var(--brand-fill)] text-[var(--on-brand)]" : "text-muted-foreground hover:bg-[var(--ink-3)] hover:text-foreground"
  );
  const style = { paddingLeft: `${0.625 + depth * 0.875}rem` };
  const body = (
    <>
      {icon ? renderIcon(icon, "h-4 w-4") : null}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {trailing}
    </>
  );
  return (
    <li>
      {href ? (
        <Link href={href as never} onClick={onClick} aria-current={active ? "page" : undefined} title={title} className={className} style={style}>
          {body}
        </Link>
      ) : (
        <button type="button" onClick={onClick} aria-current={active ? "true" : undefined} title={title} className={className} style={style}>
          {body}
        </button>
      )}
    </li>
  );
}
