"use client";

import { useId, useRef, type ReactNode } from "react";
import { ImagePlus } from "lucide-react";
import { fieldLabelClass } from "@/components/kit/field";
import { Button } from "@/components/ui/button";
import { cn } from "@/src/lib/utils";
import type { StoryPhoto } from "./story-templates";

/** 11px caps field label (DESIGN.md §10): the kit's field label. */
export const STORY_LABEL_CLASS = fieldLabelClass;
/** Control heights: 40px touch targets on phones, 36px (default) or 32px (small) from md. */
export const TOUCH_HEIGHT = "h-10 md:h-9";
export const TOUCH_HEIGHT_SM = "h-10 md:h-8";

/**
 * Label, control and hint. `trailing` sits at the right end of the label row (a counter or tag).
 * In a paired row, give it `className="@min-[30rem]:row-span-3 @min-[30rem]:grid-rows-subgrid"`
 * so both labels share one row and the inputs line up even when one label wraps.
 */
export function StoryField({
  id,
  label,
  hint,
  trailing,
  className,
  children
}: {
  id?: string;
  label: string;
  hint?: string;
  trailing?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const labelNode = id ? (
    <label htmlFor={id} className={STORY_LABEL_CLASS}>{label}</label>
  ) : (
    <span className={STORY_LABEL_CLASS}>{label}</span>
  );
  return (
    <div className={cn("grid min-w-0 content-start gap-1.5", className)}>
      {trailing ? (
        <div className="flex min-h-4 items-end justify-between gap-2">
          {labelNode}
          {trailing}
        </div>
      ) : (
        labelNode
      )}
      {children}
      {hint ? <p className="text-xs leading-snug text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/**
 * One-of-N choice made of plain toggle buttons (Tab moves between them; no arrow keys, so the
 * Custom template's arrow-key nudge never fires twice). The outer box is exactly the row height:
 * 36px (`default`) or 32px (`sm`) from md, 40px on phones. In a narrow column the options shrink
 * and end in "…" (full label on hover) rather than scrolling out of sight.
 */
export function Segmented({
  label,
  value,
  options,
  onChange,
  size = "default",
  hideLabel = false,
  fullWidth = false
}: {
  label: string;
  value: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  onChange: (value: string) => void;
  size?: "default" | "sm";
  /** The label is still the group's accessible name. */
  hideLabel?: boolean;
  fullWidth?: boolean;
}) {
  const group = (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "flex min-w-0 max-w-full gap-0.5 rounded-md border border-input p-0.5",
        fullWidth ? "w-full" : "w-fit",
        size === "sm" ? TOUCH_HEIGHT_SM : TOUCH_HEIGHT
      )}
    >
      {options.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            title={option.label}
            onClick={() => onChange(option.value)}
            className={cn(
              "h-full min-w-0 truncate whitespace-nowrap rounded-[4px] px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
              fullWidth && "flex-1",
              active
                ? "bg-[var(--brand-fill)] font-medium text-[var(--on-brand)]"
                : "text-muted-foreground hover:bg-[var(--ink-3)] hover:text-foreground"
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
  return hideLabel ? group : <StoryField label={label}>{group}</StoryField>;
}

function Slider({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return (
    <label className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-3 text-xs text-[var(--ink-text)]">
      {label}
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-10 w-full accent-[var(--brand-green)] md:h-8"
      />
    </label>
  );
}

/** The photo's current crop, drawn like the story's own Photo (cover, position, zoom). */
function CropThumb({ photo }: { photo: StoryPhoto }) {
  const position = `${photo.x}% ${photo.y}%`;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- an in-memory data URL; next/image can't optimise it.
    <img
      src={photo.src}
      alt=""
      className="h-full w-full object-cover"
      style={{ objectPosition: position, transform: `scale(${photo.zoom / 100})`, transformOrigin: position }}
    />
  );
}

/**
 * One aligned row: a 48px crop thumbnail, the label and its state, then Choose / Replace and
 * Remove (named for the slot, so three "Remove" buttons can be told apart). With a photo, the crop
 * sliders sit right under the row. Photos are read in the browser by `onFile` and never uploaded.
 */
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
  const labelId = useId();

  return (
    <div role="group" aria-labelledby={labelId} className="grid min-w-0 gap-2">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
        <span
          aria-hidden
          className={cn(
            "grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-sm border text-muted-foreground",
            photo ? "border-border bg-[var(--ink-3)]" : "border-dashed border-input"
          )}
        >
          {photo ? <CropThumb photo={photo} /> : <ImagePlus className="h-4 w-4" />}
        </span>
        <div className="min-w-[8rem] flex-1">
          <p id={labelId} className={cn(STORY_LABEL_CLASS, "truncate")} title={label}>{label}</p>
          <p className="mt-1 truncate text-[13px] leading-snug text-muted-foreground">
            {photo ? "Drag the sliders to crop" : "No photo yet"}
          </p>
        </div>
        <div className="flex basis-full gap-2 @min-[26rem]:basis-auto">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={TOUCH_HEIGHT_SM}
            aria-label={`${photo ? "Replace photo" : "Choose photo"}: ${label}`}
            onClick={() => inputRef.current?.click()}
          >
            <ImagePlus />
            {photo ? "Replace photo" : "Choose photo"}
          </Button>
          {photo ? (
            <Button type="button" variant="ghost" size="sm" className={TOUCH_HEIGHT_SM} aria-label={`Remove ${label}`} onClick={onRemove}>
              Remove
            </Button>
          ) : null}
        </div>
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
        <div role="group" aria-label={`Crop ${label}`} className="grid gap-1 rounded-md border border-border bg-[var(--ink-2)] px-3 py-2">
          <Slider label="Left / right" value={photo.x} min={0} max={100} onChange={(x) => onChange({ ...photo, x })} />
          <Slider label="Up / down" value={photo.y} min={0} max={100} onChange={(y) => onChange({ ...photo, y })} />
          <Slider label="Zoom" value={photo.zoom} min={100} max={250} onChange={(zoom) => onChange({ ...photo, zoom })} />
        </div>
      ) : null}
    </div>
  );
}
