"use client";

import { useRef, type ReactNode } from "react";
import { ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/src/lib/utils";
import type { StoryPhoto } from "./story-templates";

const labelClass = "text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground";

export function StoryField({ id, label, hint, children }: { id?: string; label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      {id ? <label htmlFor={id} className={labelClass}>{label}</label> : <span className={labelClass}>{label}</span>}
      {children}
      {hint ? <p className="text-xs leading-snug text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function Segmented({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <StoryField label={label}>
      <div role="group" aria-label={label} className="inline-flex w-fit gap-0.5 rounded-md border border-input p-0.5">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              "h-8 rounded-[4px] px-3 text-sm font-medium transition-colors",
              value === option.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </StoryField>
  );
}

function Slider({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return (
    <label className="grid grid-cols-[88px_1fr] items-center gap-3 text-xs text-[var(--ink-text)]">
      {label}
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-8 w-full accent-[var(--brand-green)]"
      />
    </label>
  );
}

export function PhotoInput({
  label,
  photo,
  onFile,
  onChange,
  onRemove
}: {
  label: string;
  photo: StoryPhoto | null;
  onFile: (file: File) => void;
  onChange: (photo: StoryPhoto) => void;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <StoryField label={label}>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
          <ImagePlus />
          {photo ? "Replace photo" : "Choose photo"}
        </Button>
        {photo ? (
          <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
            Remove
          </Button>
        ) : null}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          tabIndex={-1}
          aria-label={label}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onFile(file);
            event.target.value = "";
          }}
        />
      </div>
      {photo ? (
        <div className="mt-1 grid gap-1 rounded-md border border-border bg-[var(--ink-2)] px-3 py-2">
          <Slider label="Left / right" value={photo.x} min={0} max={100} onChange={(x) => onChange({ ...photo, x })} />
          <Slider label="Up / down" value={photo.y} min={0} max={100} onChange={(y) => onChange({ ...photo, y })} />
          <Slider label="Zoom" value={photo.zoom} min={100} max={250} onChange={(zoom) => onChange({ ...photo, zoom })} />
        </div>
      ) : null}
    </StoryField>
  );
}
