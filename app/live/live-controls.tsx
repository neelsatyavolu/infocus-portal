import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

/** Segmented control: one choice from a few options. */
export function Seg<T extends string>({
  value,
  options,
  onChange,
  label
}: {
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex flex-wrap gap-0.5 rounded-md border border-input p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className="h-8 rounded px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground aria-pressed:bg-primary aria-pressed:text-primary-foreground"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function FieldLabel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1.5 text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground">
      {label}
      {children}
    </label>
  );
}

export function Panel({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="grid gap-4 rounded-md border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** A URL shown as selectable text with a Copy button. */
export function CopyUrl({ label, url, hint }: { label: string; url: string; hint: string }) {
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
    <div className="grid gap-1.5">
      <span className="text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded border border-border bg-background px-2 py-1.5 font-mono-broadcast text-xs text-[var(--ink-text)]">
          {url}
        </code>
        <Button type="button" size="sm" variant="outline" onClick={() => void copy()}>
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <span className="text-xs text-muted-foreground">{hint}</span>
    </div>
  );
}

/** On/off chip: green (or amber for a flag) when on, outlined when off. */
export function Toggle({
  pressed,
  onClick,
  children,
  tone = "green",
  className = ""
}: {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
  tone?: "green" | "amber";
  className?: string;
}) {
  const on = tone === "amber" ? "bg-[#F2A516] text-[#0F110F] border-[#F2A516]" : "bg-primary text-primary-foreground border-primary";
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-md border px-4 text-sm font-medium transition-colors ${
        pressed ? on : "border-input text-foreground hover:bg-accent"
      } ${className}`}
    >
      {children}
    </button>
  );
}

/**
 * A value shown large that turns into a text field when tapped. Enter or leaving the field saves;
 * Escape cancels. `parse` returns null for input it can't use, which keeps the field open.
 */
export function TapToEdit<T>({
  display,
  initial,
  parse,
  onCommit,
  label,
  className = "",
  inputClassName = "",
  inputMode = "numeric"
}: {
  display: ReactNode;
  initial: string;
  parse: (text: string) => T | null;
  onCommit: (value: T) => void;
  label: string;
  className?: string;
  inputClassName?: string;
  inputMode?: "numeric" | "decimal" | "text";
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
        className={`rounded-md border bg-background px-2 text-foreground outline-none focus:ring-2 focus:ring-[var(--brand-green)] ${
          invalid ? "border-[var(--danger)]" : "border-input"
        } ${inputClassName}`}
      />
    );
  }

  return (
    <button type="button" onClick={start} aria-label={`${label}: edit`} title="Tap to edit" className={`rounded-md hover:bg-accent ${className}`}>
      {display}
    </button>
  );
}
