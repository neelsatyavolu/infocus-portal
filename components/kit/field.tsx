import type { ReactNode } from "react";
import { InlineError } from "@/components/kit/alert";
import { cn } from "@/src/lib/utils";

/**
 * The text-field look as a class (h-9, 8px radius, strong hairline, card fill, 16px text on
 * phones, brand border plus a 3px focus ring) for custom inputs that can't use components/ui/input.
 */
export const fieldClass =
  "flex h-9 w-full min-w-0 rounded-md border border-input bg-card px-3 text-base text-foreground transition-[border-color,box-shadow] duration-150 ease-[var(--ease-ui)] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-danger md:text-sm";

/** Label for a field: 13px sentence case, medium, muted. */
export const fieldLabelClass = "block text-[13px] font-medium leading-tight text-muted-foreground";

/**
 * One form field: muted label above, the control, a muted hint and an error line with an icon.
 * Fields in a row stay bottom-aligned because hint and error sit under the control. Give the
 * control `id={htmlFor}`, and `aria-invalid` / `aria-describedby={`${htmlFor}-hint`}` as needed.
 */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  required = false,
  span,
  className,
  children
}: {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  /** In a 2-column FormSection, `2` makes the field full width. */
  span?: 1 | 2;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", span === 2 && "sm:col-span-2", className)}>
      <label htmlFor={htmlFor} className={fieldLabelClass}>
        {label}
        {required ? (
          <span aria-hidden className="ml-0.5 text-danger">
            *
          </span>
        ) : null}
      </label>
      {children}
      {hint && !error ? (
        <p id={htmlFor ? `${htmlFor}-hint` : undefined} className="text-[13px] leading-snug text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? <InlineError id={htmlFor ? `${htmlFor}-error` : undefined}>{error}</InlineError> : null}
    </div>
  );
}

/**
 * A titled group of fields: 15px ink heading (with an optional aside on the right), then a
 * 1- or 2-column grid of Fields with 16px gaps.
 */
export function FormSection({
  title,
  aside,
  description,
  cols = 1,
  className,
  children
}: {
  title?: ReactNode;
  aside?: ReactNode;
  description?: ReactNode;
  cols?: 1 | 2;
  className?: string;
  children: ReactNode;
}) {
  return (
    <fieldset className={cn("min-w-0", className)}>
      {/* A floated legend sits inside the fieldset's flow, so the aside can share its line. */}
      {title ? (
        <legend className="float-left mb-3 text-[15px] font-medium leading-6 tracking-[-0.01em] text-foreground">{title}</legend>
      ) : null}
      {aside ? <div className="float-right mb-3 text-xs leading-6 text-muted-foreground">{aside}</div> : null}
      {description ? <p className="clear-both mb-3 text-[13px] text-muted-foreground">{description}</p> : null}
      <div className={cn("clear-both grid gap-4", cols === 2 && "sm:grid-cols-2")}>{children}</div>
    </fieldset>
  );
}
