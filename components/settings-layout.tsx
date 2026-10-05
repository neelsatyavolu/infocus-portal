"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";
import { cn } from "@/src/lib/utils";

/** Shared layout for Settings and Admin: a section nav, titled sections, and bordered panels of rows. */

export type SettingsNavItem = {
  id: string;
  label: string;
  badge?: number | null;
  tone?: "danger";
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
    <div className="route-enter mx-auto w-full max-w-6xl space-y-6 lg:space-y-8">
      {header}
      <div className="lg:grid lg:grid-cols-[188px_minmax(0,1fr)] lg:gap-10">
        <nav
          aria-label="Sections"
          className="-mx-4 mb-8 overflow-x-auto border-b border-border px-4 [scrollbar-width:none] md:-mx-6 md:px-6 lg:sticky lg:top-24 lg:mx-0 lg:mb-0 lg:self-start lg:overflow-visible lg:border-b-0 lg:px-0 [&::-webkit-scrollbar]:hidden"
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
                      "flex h-10 items-center justify-between gap-3 whitespace-nowrap border-b-2 px-3 text-sm transition-colors lg:h-9 lg:border-b-0 lg:border-l-2",
                      current
                        ? "border-[var(--brand-green)] font-medium text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground lg:hover:bg-secondary/60",
                      item.tone === "danger" && "text-danger hover:text-danger"
                    )}
                  >
                    {item.label}
                    {item.badge ? (
                      <span className="rounded-sm bg-secondary px-1.5 py-px font-mono text-[11px] tabular-nums text-foreground">
                        {item.badge}
                      </span>
                    ) : null}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="min-w-0 space-y-12">{children}</div>
      </div>
    </div>
  );
}

/** Square nameplate header (DESIGN.md §10): eyebrow, headline, one line of text, optional meta on the right. */
export function SettingsHeader({
  eyebrow,
  title,
  description,
  meta
}: {
  eyebrow: ReactNode;
  title: string;
  description?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <section className="brand-hero-panel p-5 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="eyebrow flex items-center gap-2">{eyebrow}</div>
          <h1 className="display-md mt-2 text-foreground">{title}</h1>
          {description ? <p className="mt-1 max-w-xl text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {meta ? <div className="flex flex-wrap items-center gap-2">{meta}</div> : null}
      </div>
    </section>
  );
}

export function SettingsSection({
  id,
  title,
  description,
  actions,
  tone,
  children
}: {
  id: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  tone?: "danger";
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2
            id={`${id}-title`}
            className={cn("text-lg font-semibold tracking-[-0.01em] text-foreground", tone === "danger" && "text-danger")}
          >
            {title}
          </h2>
          {description ? <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
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

/** One setting: label and help text on the left, its control on the right (stacked on phones). */
export function SettingsRow({
  title,
  description,
  htmlFor,
  className,
  children
}: {
  title: ReactNode;
  description?: ReactNode;
  htmlFor?: string;
  className?: string;
  children?: ReactNode;
}) {
  const titleClass = "block text-sm font-medium text-foreground";

  return (
    <div
      className={cn(
        "flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 md:px-5",
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
      {children ? <div className="flex min-w-0 flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">{children}</div> : null}
    </div>
  );
}

/** A small set of mutually exclusive options. The active option uses the brand fill (DESIGN.md §10 tabs). */
export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string; icon?: ReactNode }>;
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-md border border-border bg-background p-0.5">
      {options.map((option) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={checked}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-sm px-3 text-sm transition-colors [&_svg]:size-3.5",
              checked ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** Banner for a save result: tint, matching line, icon, and words (DESIGN.md §10 alerts). */
export function SettingsNotice({
  tone,
  onDismiss,
  children
}: {
  tone: "error" | "success";
  onDismiss?: () => void;
  children: ReactNode;
}) {
  const error = tone === "error";
  const Icon = error ? AlertTriangle : CheckCircle2;

  return (
    <div
      role={error ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2 rounded-md border px-3 py-2 text-sm",
        error
          ? "border-danger/40 bg-danger-tint text-danger"
          : "border-[var(--brand-green)]/30 bg-[var(--brand-green)]/10 text-foreground"
      )}
    >
      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", !error && "text-[var(--brand-green)]")} aria-hidden="true" />
      <div className="min-w-0 flex-1">{children}</div>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="-m-1 rounded-sm p-1 opacity-70 transition-opacity hover:opacity-100"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
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
