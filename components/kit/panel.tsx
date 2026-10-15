import Link from "next/link";
import type { ReactNode } from "react";
import { ActionBar } from "@/components/kit/action-bar";
import { IconTile } from "@/components/kit/avatar";
import type { KitIcon } from "@/components/kit/icon";
import { cn } from "@/src/lib/utils";

export type PanelPadding = "none" | "md" | "lg";

/** md: 16px everywhere. lg: 16px on phones, 20px from md (the default card padding). */
const PAD: Record<Exclude<PanelPadding, "none">, string> = {
  md: "p-4",
  lg: "p-4 md:p-5"
};
const PAD_X: Record<PanelPadding, string> = { none: "px-4 md:px-5", md: "px-4", lg: "px-4 md:px-5" };

type HeadingLevel = "h2" | "h3" | "h4";

/**
 * A panel's header row: caps eyebrow, title (16px SemiBold) with a mono count and status tags
 * beside it, one muted line, and h-8 actions on the right. Title and actions share a 32px line so
 * they stay vertically centred whether or not there are actions.
 */
export function PanelHeader({
  title,
  titleAs: Title = "h3",
  titleId,
  eyebrow,
  count,
  status,
  description,
  actions,
  className
}: {
  title?: ReactNode;
  titleAs?: HeadingLevel;
  titleId?: string;
  eyebrow?: ReactNode;
  /** Plain total next to the title, in Geist Mono (use CountBadge for unread counts). */
  count?: number | null;
  /** StatusTags beside the title. */
  status?: ReactNode;
  description?: ReactNode;
  /** h-8 controls or a PanelLink. */
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-2", className)}>
      <div className="min-w-0 flex-1">
        {eyebrow ? (
          <p className="text-[11px] font-medium uppercase leading-tight tracking-[0.11em] text-muted-foreground">{eyebrow}</p>
        ) : null}
        {title || status || count != null ? (
          <div className="flex min-h-8 min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            {title ? (
              <Title id={titleId} className="min-w-0 text-base font-semibold leading-snug tracking-[-0.01em] text-foreground">
                {title}
              </Title>
            ) : null}
            {count != null ? (
              <span className="font-mono-broadcast text-[13px] tabular-nums text-muted-foreground">{count}</span>
            ) : null}
            {status}
          </div>
        ) : null}
        {description ? <div className="text-[13px] leading-snug text-muted-foreground">{description}</div> : null}
      </div>
      {actions ? (
        <ActionBar size="sm" className="shrink-0">
          {actions}
        </ActionBar>
      ) : null}
    </div>
  );
}

/** Footer bar pinned to the bottom of a panel (so footers line up across a grid row). */
export function PanelFooter({
  children,
  justify = "between",
  className
}: {
  children: ReactNode;
  justify?: "between" | "end" | "start";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mt-auto flex min-h-12 flex-wrap items-center gap-2 border-t border-border px-4 py-2.5 text-[13px] text-muted-foreground md:px-5",
        justify === "between" && "justify-between",
        justify === "end" && "justify-end",
        className
      )}
    >
      {children}
    </div>
  );
}

/**
 * THE card section. Bordered Ink 2 card, 6px radius, consistent padding, a header row (title,
 * status tags, h-8 actions), a body, and an optional footer pinned to the bottom. It fills its
 * grid cell (`h-full`), so cards in a row are equal height with aligned footers.
 *
 * - `padding="none"` for flush lists and tables (the header gets its own padding and a rule).
 * - `divided` stacks PanelSections with hairlines between them (one card, several parts).
 */
export function Panel({
  title,
  titleAs,
  eyebrow,
  count,
  status,
  description,
  actions,
  footer,
  padding = "lg",
  divided = false,
  tone = "default",
  as: Tag = "section",
  id,
  className,
  bodyClassName,
  "aria-label": ariaLabel,
  children
}: {
  title?: ReactNode;
  titleAs?: HeadingLevel;
  eyebrow?: ReactNode;
  count?: number | null;
  status?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  padding?: PanelPadding;
  divided?: boolean;
  /** danger: Danger-tinted edge (danger zones). brand: green edge for the one item that needs attention. */
  tone?: "default" | "danger" | "brand";
  as?: "section" | "div" | "article" | "form";
  /** Also names the title `${id}-title` and labels the section with it. */
  id?: string;
  className?: string;
  bodyClassName?: string;
  "aria-label"?: string;
  children?: ReactNode;
}) {
  const titleId = id && title ? `${id}-title` : undefined;
  // A plain <div> has no role, so naming it would be ignored (and flagged); only landmarks and forms take a label.
  const labelable = Tag !== "div";
  const hasHeader = Boolean(title || eyebrow || status || description || actions || count != null);
  const flush = padding === "none" || divided;
  const header = hasHeader ? (
    <PanelHeader
      title={title}
      titleAs={titleAs}
      titleId={titleId}
      eyebrow={eyebrow}
      count={count}
      status={status}
      description={description}
      actions={actions}
      className={flush ? cn("border-b border-border py-3", PAD_X[padding]) : undefined}
    />
  ) : null;

  return (
    <Tag
      id={id}
      aria-labelledby={labelable ? titleId : undefined}
      aria-label={labelable && !titleId ? ariaLabel : undefined}
      className={cn(
        "flex h-full min-w-0 flex-col rounded-md border bg-card text-card-foreground",
        tone === "danger" ? "border-danger/40" : tone === "brand" ? "border-[var(--brand-green)]/50" : "border-border",
        className
      )}
    >
      {flush ? (
        <>
          {header}
          <div className={cn("min-w-0 flex-1", divided && "divide-y divide-border", bodyClassName)}>{children}</div>
        </>
      ) : (
        <div className={cn("flex min-w-0 flex-1 flex-col gap-4", PAD[padding])}>
          {header}
          <div className={cn("min-w-0 flex-1", bodyClassName)}>{children}</div>
        </div>
      )}
      {/* The footer's side padding follows the body's, so its left edge lines up. */}
      {footer ? <PanelFooter className={padding === "md" ? "md:px-4" : undefined}>{footer}</PanelFooter> : null}
    </Tag>
  );
}

/**
 * One part of a `divided` Panel: its own padding, an optional caps label row with a status tag
 * and h-8 actions, then the content.
 */
export function PanelSection({
  title,
  status,
  actions,
  id,
  grow = false,
  className,
  children
}: {
  title?: ReactNode;
  status?: ReactNode;
  actions?: ReactNode;
  id?: string;
  /** Takes the remaining height (the last section of a rail card). */
  grow?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={id && title ? `${id}-title` : undefined} className={cn("min-w-0 px-4 py-4 md:px-5", grow && "flex-1", className)}>
      {title || status || actions ? (
        <div className="mb-3 flex min-h-8 flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            {title ? (
              <h3
                id={id && title ? `${id}-title` : undefined}
                className="text-[11px] font-medium uppercase leading-tight tracking-[0.11em] text-muted-foreground"
              >
                {title}
              </h3>
            ) : null}
            {status}
          </div>
          {actions ? <ActionBar size="sm">{actions}</ActionBar> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** The one "See all →" link style for panel headers. */
export function PanelLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link
      href={href as never}
      className={cn(
        "inline-flex h-8 items-center gap-1 rounded-sm text-sm text-[var(--brand-green)] transition-colors hover:text-foreground",
        className
      )}
    >
      {children}
      <span aria-hidden>→</span>
    </Link>
  );
}

/**
 * A card whose whole surface is one link (the title's stretched hit area), with action buttons
 * kept outside the link (no button inside an anchor). Equal height in grids.
 */
export function EntityCard({
  href,
  title,
  eyebrow,
  icon,
  meta,
  status,
  actions,
  footer,
  className,
  children
}: {
  href: string;
  title: ReactNode;
  eyebrow?: ReactNode;
  /** Leading 40px icon tile. */
  icon?: KitIcon | ReactNode;
  meta?: ReactNode;
  status?: ReactNode;
  /** h-8 buttons; they sit above the link layer. */
  actions?: ReactNode;
  footer?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <article
      className={cn(
        "relative flex h-full min-w-0 flex-col rounded-md border border-border bg-card text-card-foreground transition-colors hover:bg-[var(--ink-3)]",
        className
      )}
    >
      <div className="flex min-w-0 flex-1 gap-3 p-4">
        {icon ? <IconTile icon={icon} tone="brand" /> : null}
        <div className="min-w-0 flex-1">
          {eyebrow ? (
            <p className="text-[11px] font-medium uppercase leading-tight tracking-[0.11em] text-muted-foreground">{eyebrow}</p>
          ) : null}
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h3 className="min-w-0 text-base font-semibold leading-snug tracking-[-0.01em]">
              <Link
                href={href as never}
                className="rounded-sm outline-none after:absolute after:inset-0 after:rounded-md focus-visible:after:ring-2 focus-visible:after:ring-ring"
              >
                {title}
              </Link>
            </h3>
            {status}
          </div>
          {meta ? <div className="mt-0.5 text-[13px] text-muted-foreground">{meta}</div> : null}
          {children ? <div className="mt-3">{children}</div> : null}
        </div>
        {actions ? (
          <ActionBar size="sm" className="relative z-10 shrink-0 self-start">
            {actions}
          </ActionBar>
        ) : null}
      </div>
      {footer ? <PanelFooter className="relative z-10 md:px-4">{footer}</PanelFooter> : null}
    </article>
  );
}
