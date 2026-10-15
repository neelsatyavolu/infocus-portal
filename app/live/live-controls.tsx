import { memo, useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/src/lib/utils";

/** The caps label for fields and sub-sections inside a card (11px, +11% tracking, muted). Card titles use the Panel title. */
export const CARD_LABEL_CLASS = "text-[11px] font-medium uppercase leading-tight tracking-[0.11em] text-muted-foreground";

export function CardLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn(CARD_LABEL_CLASS, className)}>{children}</span>;
}

/** Score keys, Stop clock: an Ink 3 key, so the one green fill per view stays the primary. */
export const KEY_CLASS =
  "border border-border bg-[var(--ink-3)] text-foreground hover:bg-[var(--ink-4)] hover:text-foreground";

/**
 * A pressed / not-pressed chip with a constant label. Pressed is a tint (green, or amber for the
 * flag), never a fill, so it never competes with the primary button. The state also shows as a
 * tag in the card header.
 */
export function ToggleChip({
  pressed,
  onClick,
  children,
  tone = "green",
  title,
  disabled,
  className
}: {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
  tone?: "green" | "amber";
  title?: string;
  disabled?: boolean;
  className?: string;
}) {
  const on =
    tone === "amber"
      ? "border-[var(--brand-amber)] bg-[var(--brand-amber)]/15 text-[var(--brand-amber)] hover:bg-[var(--brand-amber)]/20"
      : "border-[var(--brand-green)] bg-[var(--brand-green)]/15 text-[var(--brand-green)] hover:bg-[var(--brand-green)]/20";
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={cn(
        "inline-flex h-11 min-w-0 items-center justify-center gap-2 whitespace-nowrap rounded-md border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
        pressed ? on : "border-input text-foreground hover:bg-[var(--ink-3)]",
        className
      )}
    >
      {children}
    </button>
  );
}

/**
 * Phones: the fixed bottom bars (tab bar, action bar) step aside while a text field has focus, so
 * they don't cover it above the keyboard. Needs `group/live` on the page root.
 */
export const HIDE_WHILE_TYPING = "max-md:group-has-[input:focus:not([type=color])]/live:hidden";

/**
 * One group of actions that sits in its card from md up and, on phones, is fixed just above the
 * phone tab bar (one DOM node, nothing written twice). `leading` (a status tag or readout) shows
 * on phones only. It hides on phones while a text field has focus.
 */
export function ActionDock({
  children,
  leading,
  className,
  "aria-label": ariaLabel
}: {
  children: ReactNode;
  leading?: ReactNode;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <div
      role={ariaLabel ? "group" : undefined}
      aria-label={ariaLabel}
      className={cn(
        "flex min-w-0 items-center gap-2",
        "max-md:fixed max-md:inset-x-0 max-md:bottom-[calc(var(--phone-tabbar-h,0px)+env(safe-area-inset-bottom))] max-md:z-30 max-md:border-t max-md:border-border max-md:bg-card max-md:px-4 max-md:py-2",
        HIDE_WHILE_TYPING,
        className
      )}
    >
      {leading ? <div className="flex min-w-0 flex-1 items-center md:hidden">{leading}</div> : null}
      {children}
    </div>
  );
}

/**
 * An OBS Browser Source link: the URL in mono (scrolls sideways), Copy, a hint, and — for
 * producers and livestream managers — Make new OBS links. Memoized: it never re-renders on the
 * scoreboard's 100ms tick.
 */
export const ObsLink = memo(function ObsLink({
  url,
  hint,
  onRotate
}: {
  url: string;
  hint: string;
  onRotate?: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="grid w-full min-w-0 gap-2">
      <CardLabel>OBS Browser Source</CardLabel>
      <div className="flex min-w-0 items-center gap-2">
        <code className="block h-11 min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-md border border-border bg-background px-3 font-mono-broadcast text-xs leading-[2.625rem] text-[var(--ink-text)] [scrollbar-width:none] md:h-9 md:leading-[2.125rem] [&::-webkit-scrollbar]:hidden">
          {url}
        </code>
        <Button type="button" variant="outline" className="h-11 shrink-0 md:h-9" onClick={() => void copy()}>
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <p className="min-w-0 flex-[1_1_14rem] text-[13px] leading-snug text-muted-foreground">
          {hint}
          {onRotate ? " Link shared somewhere it shouldn't be?" : ""}
        </p>
        {onRotate ? (
          <Button type="button" variant="destructive-quiet" className="h-11 shrink-0 md:h-9" onClick={onRotate}>
            Make new OBS links
          </Button>
        ) : null}
      </div>
    </div>
  );
});

/**
 * A value shown large that turns into a text field when tapped. Enter or leaving the field saves;
 * Escape cancels. `parse` returns null for input it can't use, which keeps the field open.
 * Give `className` and `inputClassName` the same height and text size, so the row doesn't move.
 */
export function TapToEdit<T>({
  display,
  initial,
  parse,
  onCommit,
  label,
  className = "",
  inputClassName = "",
  inputMode = "numeric",
  title = "Tap to edit"
}: {
  display: ReactNode;
  initial: string;
  parse: (text: string) => T | null;
  onCommit: (value: T) => void;
  label: string;
  className?: string;
  inputClassName?: string;
  inputMode?: "numeric" | "decimal" | "text";
  title?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(initial);
  const [invalid, setInvalid] = useState(false);

  function start() {
    setText(initial);
    setInvalid(false);
    setEditing(true);
  }

  function commit() {
    const value = parse(text);
    if (value === null) {
      setInvalid(true);
      return;
    }
    onCommit(value);
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        autoFocus
        aria-label={label}
        aria-invalid={invalid}
        inputMode={inputMode}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setInvalid(false);
        }}
        onFocus={(event) => event.currentTarget.select()}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit();
          if (event.key === "Escape") setEditing(false);
        }}
        onBlur={() => (parse(text) === null ? setEditing(false) : commit())}
        className={cn(
          "min-w-0 rounded-md border bg-background px-2 font-mono-broadcast font-medium tabular-nums leading-none text-foreground outline-none focus:ring-2 focus:ring-ring",
          invalid ? "border-danger" : "border-input",
          inputClassName
        )}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={start}
      aria-label={`${label}: edit`}
      title={title}
      className={cn(
        "inline-flex min-w-0 items-center justify-center rounded-md px-2 font-mono-broadcast font-medium tabular-nums leading-none transition-colors hover:bg-[var(--ink-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
    >
      {display}
    </button>
  );
}
