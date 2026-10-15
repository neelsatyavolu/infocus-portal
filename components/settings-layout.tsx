"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Alert } from "@/components/kit/alert";
import { PanelHeader } from "@/components/kit/panel";
import { SegmentedControl as KitSegmentedControl } from "@/components/kit/segmented-control";
import { CountBadge, StatusTag } from "@/components/kit/status-tag";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/src/lib/utils";

/**
 * Shared layout for Settings and Admin: a section nav, titled sections, and bordered panels of rows.
 * The app shell owns the page width, so this fills the content column (no outer max-width).
 */

export type SettingsNavStatus = { label: string; tone: "ok" | "warn" | "danger" | "neutral" };

export type SettingsNavItem = {
  id: string;
  label: string;
  badge?: number | null;
  tone?: "danger";
  /** A tag beside the item (OFF, NOT SET, FAILED). On the phone strip warn/danger show as an icon. */
  status?: SettingsNavStatus | null;
};

/** Below the sticky app header: a section counts as current once its top passes this line. */
const ACTIVE_LINE_PX = 120;
/** After a nav click, ignore scroll updates this long so the clicked item stays highlighted. */
const CLICK_HOLD_MS = 600;

/** True when the page's scroller (not an inner list) is scrolled to the end. */
function pageAtBottom(target: EventTarget | null, firstSection: HTMLElement) {
  const element = target instanceof Element ? target : document.scrollingElement;
  if (!element || !element.contains(firstSection)) return false;
  return element.scrollTop + element.clientHeight >= element.scrollHeight - 2;
}

/** The section whose top last passed the header, or the last section once scrolled to the bottom. */
function useActiveSection(key: string) {
  const [active, setActive] = useState(key.split("|")[0] ?? "");
  const [heldUntil, setHeldUntil] = useState(0);

  useEffect(() => {
    const ids = key.split("|").filter(Boolean);

    function update(event?: Event) {
      if (Date.now() < heldUntil) return;
      const sections = ids
        .map((id) => document.getElementById(id))
        .filter((element): element is HTMLElement => element !== null);
      if (sections.length === 0) return;
      const passed = sections.filter((element) => element.getBoundingClientRect().top <= ACTIVE_LINE_PX);
      const current = pageAtBottom(event?.target ?? null, sections[0])
        ? sections[sections.length - 1]
        : passed[passed.length - 1] ?? sections[0];
      setActive(current.id);
    }

    // Capture catches the Portal's inner scroll container (lg) as well as the window (phones).
    document.addEventListener("scroll", update, { capture: true, passive: true });
    return () => document.removeEventListener("scroll", update, { capture: true });
  }, [key, heldUntil]);

  function select(id: string) {
    setHeldUntil(Date.now() + CLICK_HOLD_MS);
    setActive(id);
  }

  return [active, select] as const;
}

function NavStatus({ status }: { status: SettingsNavStatus }) {
  const alert = status.tone === "warn" || status.tone === "danger";
  return (
    <>
      <span className="hidden lg:inline-flex">
        <StatusTag size="sm" tone={status.tone}>
          {status.label}
        </StatusTag>
      </span>
      {alert ? (
        <AlertTriangle
          aria-hidden
          className={cn("h-3 w-3 shrink-0 lg:hidden", status.tone === "danger" ? "text-danger" : "text-[var(--brand-amber)]")}
        />
      ) : null}
      <span className="sr-only lg:hidden">{status.label}</span>
    </>
  );
}

export function SettingsLayout({
  header,
  nav,
  children
}: {
  header: ReactNode;
  nav: SettingsNavItem[];
  children: ReactNode;
}) {
  const [active, setActive] = useActiveSection(nav.map((item) => item.id).join("|"));

  return (
    <div className="route-enter w-full space-y-6 lg:space-y-8">
      {header}
      <div className="lg:grid lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-8">
        <nav
          aria-label="Sections"
          className="sticky top-[var(--app-header-h,0px)] z-30 mb-6 overflow-x-auto border-b border-border bg-background [scrollbar-width:none] lg:top-24 lg:z-auto lg:mb-0 lg:self-start lg:overflow-visible lg:border-b-0 lg:bg-transparent [&::-webkit-scrollbar]:hidden"
        >
          <ul className="flex lg:flex-col lg:gap-0.5">
            {nav.map((item) => {
              const current = active === item.id;
              return (
                <li key={item.id} className="shrink-0">
                  <a
                    href={`#${item.id}`}
                    onClick={() => setActive(item.id)}
                    aria-current={current ? "location" : undefined}
                    className={cn(
                      "flex h-10 items-center gap-2 whitespace-nowrap border-b-2 px-3 text-sm transition-colors lg:h-9 lg:border-b-0 lg:border-l-2",
                      current
                        ? "border-[var(--brand-green)] font-medium text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground lg:hover:bg-[var(--ink-3)]",
                      item.tone === "danger" && "text-danger hover:text-danger"
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.status ? <NavStatus status={item.status} /> : null}
                    {item.badge ? <CountBadge count={item.badge} tone="neutral" /> : null}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="@container min-w-0 space-y-10">{children}</div>
      </div>
    </div>
  );
}

/**
 * The page nameplate for Settings and Admin: the shared PageHeader. `status` holds tags (role,
 * "3 pending") in the eyebrow row; `actions` holds controls. `meta` is the older name for status
 * and goes to the same place, so tags are never stretched into button-sized blocks.
 */
export function SettingsHeader({
  eyebrow,
  title,
  description,
  status,
  meta,
  actions
}: {
  eyebrow: ReactNode;
  title: string;
  description?: ReactNode;
  status?: ReactNode;
  /** @deprecated Use `status`. */
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  const tags =
    status && meta ? (
      <>
        {status}
        {meta}
      </>
    ) : (
      status ?? meta
    );
  return <PageHeader eyebrow={eyebrow} status={tags} title={title} description={description} actions={actions} />;
}

export function SettingsSection({
  id,
  title,
  description,
  status,
  actions,
  tone,
  children
}: {
  id: string;
  title: string;
  description?: ReactNode;
  /** StatusTags right after the title (OK, WAITING 2, FAILED). Never in `actions`. */
  status?: ReactNode;
  /** h-8 controls or a SaveStatus, on the right. */
  actions?: ReactNode;
  tone?: "danger";
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <div className="flex min-h-8 flex-wrap items-center gap-2">
            <h2
              id={`${id}-title`}
              className={cn("text-lg font-semibold tracking-[-0.01em] text-foreground", tone === "danger" && "text-danger")}
            >
              {title}
            </h2>
            {status}
          </div>
          {description ? <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? <div className="flex min-h-8 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

/** A card whose children are separated by hairlines. */
export function SettingsPanel({
  tone,
  className,
  children
}: {
  tone?: "danger";
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "divide-y divide-border overflow-hidden rounded-md border border-border bg-card",
        tone === "danger" && "border-danger/40",
        className
      )}
    >
      {children}
    </div>
  );
}

/** Free-form content inside a panel, with the same padding as a row. */
export function SettingsPanelBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("px-4 py-4 md:px-5", className)}>{children}</div>;
}

/** A panel's header row (title, status tags, h-8 actions) with the row padding. */
export function SettingsPanelHeader(props: Omit<Parameters<typeof PanelHeader>[0], "className">) {
  return <PanelHeader {...props} className="px-4 py-3 md:px-5" />;
}

/**
 * One setting: label and help text on the left, its control on the right (stacked on phones).
 * `inline` keeps a compact control (switch, segmented) on the right at every width.
 */
export function SettingsRow({
  title,
  description,
  htmlFor,
  inline = false,
  className,
  children
}: {
  title: ReactNode;
  description?: ReactNode;
  htmlFor?: string;
  inline?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const titleClass = "block text-sm font-medium text-foreground";

  return (
    <div
      className={cn(
        "flex px-4 py-4 md:px-5",
        inline
          ? "flex-row items-center justify-between gap-4 sm:gap-6"
          : "flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6",
        className
      )}
    >
      <div className="min-w-0 sm:max-w-md">
        {htmlFor ? (
          <label htmlFor={htmlFor} className={titleClass}>
            {title}
          </label>
        ) : (
          <div className={titleClass}>{title}</div>
        )}
        {description ? <div className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{description}</div> : null}
      </div>
      {children ? (
        <div className={cn("flex min-w-0 flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end", inline && "shrink-0 justify-end")}>
          {children}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Equal-height cells with hairlines in both directions, inside a SettingsPanel (Appearance 2×2,
 * link cells, benefit lists). Columns follow the content column's width (container queries).
 */
export function SettingsGrid({ columns = 2, className, children }: { columns?: 2 | 3; className?: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden">
      <div
        className={cn(
          "-mb-px -mr-px grid *:border-b *:border-r *:border-border",
          columns === 3 ? "@2xl:grid-cols-2 @4xl:grid-cols-3" : "@2xl:grid-cols-2",
          className
        )}
      >
        {children}
      </div>
    </div>
  );
}

/** One SettingsGrid cell: title and help, then the control (or beside it with `inline`). */
export function SettingsCell({
  id,
  title,
  description,
  htmlFor,
  inline = false,
  className,
  children
}: {
  id?: string;
  title: ReactNode;
  description?: ReactNode;
  htmlFor?: string;
  inline?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const titleClass = "block text-sm font-medium text-foreground";
  return (
    <div
      id={id}
      className={cn(
        "flex h-full min-w-0 gap-3 px-4 py-4 md:px-5",
        inline ? "flex-row items-center justify-between" : "flex-col",
        className
      )}
    >
      <div className="min-w-0">
        {htmlFor ? (
          <label htmlFor={htmlFor} className={titleClass}>
            {title}
          </label>
        ) : (
          <div className={titleClass}>{title}</div>
        )}
        {description ? <div className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{description}</div> : null}
      </div>
      {children ? <div className={cn("flex min-w-0 flex-wrap items-center gap-2", inline ? "shrink-0" : "mt-auto")}>{children}</div> : null}
    </div>
  );
}

/**
 * A small set of mutually exclusive options (the kit SegmentedControl with this file's older
 * props). The outer box is exactly h-9 (h-8 with size="sm"), so it lines up with buttons.
 */
export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
  size = "default"
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string; icon?: ReactNode }>;
  onChange: (value: T) => void;
  size?: "default" | "sm";
}) {
  return (
    <KitSegmentedControl
      ariaLabel={label}
      value={value}
      options={options}
      onChange={onChange}
      size={size === "sm" ? "sm" : "md"}
    />
  );
}

/** Banner for a save result: tint, matching line, icon, and words (the kit Alert). */
export function SettingsNotice({
  tone,
  onDismiss,
  children
}: {
  tone: "error" | "success";
  onDismiss?: () => void;
  children: ReactNode;
}) {
  return (
    <Alert tone={tone === "error" ? "danger" : "success"} compact onDismiss={onDismiss}>
      {children}
    </Alert>
  );
}

/** Quiet inline save status for a section's header ("Loading…", "Saved"). `pending` hides the check mark. */
export function SaveStatus({ text, pending = false }: { text: string; pending?: boolean }) {
  return (
    <span aria-live="polite" className="inline-flex min-h-5 items-center gap-1.5 text-xs text-muted-foreground">
      {text && !pending ? <CheckCircle2 className="h-3.5 w-3.5 text-[var(--brand-green)]" aria-hidden="true" /> : null}
      {text}
    </span>
  );
}
