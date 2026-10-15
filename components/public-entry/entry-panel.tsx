import type { ReactNode, Ref } from "react";
import { CONTROL_HEIGHT } from "@/components/kit/action-bar";
import { PanelFooter, PanelHeader } from "@/components/kit/panel";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/src/lib/utils";

/**
 * The app's one touch scale (kit `CONTROL_HEIGHT.touch`): 40px on phones and on touch screens
 * (iPads included, DESIGN.md §10), 36px from md with a mouse. `pointer-coarse:` is emitted after
 * the breakpoints, so it wins over `md:`. Inputs, selects, full-width and primary buttons.
 */
export const ENTRY_CONTROL = `${CONTROL_HEIGHT.touch} pointer-coarse:h-10`;

/** Quiet controls (Resend code, Use a different email, Back, footer controls): 40px on touch, 32px with a mouse. */
export const ENTRY_QUIET_CONTROL = "h-10 px-3 md:h-8 pointer-coarse:h-10";

/** The one control in an EntryPanel footer (Sign out, Back home, Submit another): outline, quiet height. */
export const ENTRY_FOOTER_CONTROL = cn(buttonVariants({ variant: "outline" }), ENTRY_QUIET_CONTROL);

/**
 * Side padding shared by every row of an entry panel. It matches the PageHeader plate
 * (px-4 md:px-6), so the plate's title and the panel's labels start on the same line. This is
 * the one difference from the kit Panel (md:px-5), and the reason EntryPanel exists.
 */
export const ENTRY_PAD_X = "px-4 md:px-6";

/**
 * A card section for the entry pages: Ink 2, 1px line, 6px radius, hairlines between an optional
 * header (title + status tags), the body and an optional footer (a short note on the left, one
 * ENTRY_FOOTER_CONTROL on the right). `ref` + `tabIndex={-1}` let a page move focus to it.
 */
export function EntryPanel({
  title,
  status,
  footer,
  id,
  ref,
  tabIndex,
  className,
  children
}: {
  title?: ReactNode;
  status?: ReactNode;
  footer?: ReactNode;
  id?: string;
  ref?: Ref<HTMLElement>;
  tabIndex?: number;
  className?: string;
  children?: ReactNode;
}) {
  const titleId = id && title ? `${id}-title` : undefined;
  return (
    <section
      id={id}
      ref={ref}
      tabIndex={tabIndex}
      aria-labelledby={titleId}
      className={cn("min-w-0 divide-y divide-border rounded-md border border-border bg-card text-card-foreground", className)}
    >
      {title || status ? (
        <PanelHeader title={title} titleAs="h2" titleId={titleId} status={status} className={cn(ENTRY_PAD_X, "py-3")} />
      ) : null}
      {children ? <div className={cn("min-w-0 space-y-4 py-4 md:py-5", ENTRY_PAD_X)}>{children}</div> : null}
      {footer ? <PanelFooter className="border-t-0 md:px-6">{footer}</PanelFooter> : null}
    </section>
  );
}
