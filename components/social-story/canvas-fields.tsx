"use client";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PhotoInput, Segmented, StoryField, TOUCH_HEIGHT } from "@/components/story-maker/story-fields";
import {
  isFieldVisible,
  type CanvasTemplate,
  type StoryField as StoryFieldDef,
  type StoryPhoto,
  type StoryValues
} from "@/components/story-maker/story-templates";
import { cn } from "@/src/lib/utils";
import { INSPECTOR_BODY_CLASS, InspectorSection } from "./inspector-section";

type TextDef = Extract<StoryFieldDef, { type: "text" | "textarea" }>;
type PhotoDef = Extract<StoryFieldDef, { type: "photo" }>;
type SelectDef = Extract<StoryFieldDef, { type: "select" }>;

/** The story's header nameplate: Section label and the green strip under it. */
const HEADER_KEYS = new Set(["kicker", "meta"]);

/**
 * In a pair, both fields share the parent's rows (label, control, hint), so the inputs start on
 * one line even when one label wraps. Two rows when neither field has a hint.
 */
export const PAIR_ROWS = {
  withHint: { parent: "@min-[30rem]:grid-rows-[auto_auto_auto]", child: "@min-[30rem]:row-span-3 @min-[30rem]:grid-rows-subgrid" },
  noHint: { parent: "@min-[30rem]:grid-rows-[auto_auto]", child: "@min-[30rem]:row-span-2 @min-[30rem]:grid-rows-subgrid" }
} as const;

/** Two fields side by side once the card is 30rem wide (stacked below). Add a PAIR_ROWS parent. */
export const PAIR_GRID = "grid gap-4 @min-[30rem]:grid-cols-2 @min-[30rem]:gap-x-4 @min-[30rem]:gap-y-1.5";

/** Two short inputs in a row share it; textareas and lone inputs take the full width. */
function pairShortFields(fields: TextDef[]): TextDef[][] {
  return fields.reduce<TextDef[][]>((rows, field) => {
    const last = rows[rows.length - 1];
    if (field.type === "text" && last?.length === 1 && last[0].type === "text") {
      return [...rows.slice(0, -1), [last[0], field]];
    }
    return [...rows, [field]];
  }, []);
}

type FieldProps = {
  template: CanvasTemplate;
  values: StoryValues;
  setValue: (key: string, value: string | StoryPhoto | null) => void;
};

function TextField({ template, values, setValue, field, className }: FieldProps & { field: TextDef; className?: string }) {
  const id = `story-${template.id}-${field.key}`;
  const value = values[field.key];
  const text = typeof value === "string" ? value : "";
  return (
    <StoryField id={id} label={field.label} hint={field.hint} className={className}>
      {field.type === "textarea" ? (
        <Textarea id={id} rows={field.rows ?? 3} value={text} onChange={(event) => setValue(field.key, event.target.value)} />
      ) : (
        <Input id={id} className={TOUCH_HEIGHT} value={text} onChange={(event) => setValue(field.key, event.target.value)} />
      )}
    </StoryField>
  );
}

function FieldRow({ fields, ...props }: FieldProps & { fields: TextDef[] }) {
  if (fields.length === 1) return <TextField {...props} field={fields[0]} />;
  const rows = fields.some((field) => field.hint) ? PAIR_ROWS.withHint : PAIR_ROWS.noHint;
  return (
    <div className={cn(PAIR_GRID, rows.parent)}>
      {fields.map((field) => (
        <TextField key={field.key} {...props} field={field} className={rows.child} />
      ))}
    </div>
  );
}

/**
 * A canvas template's fields in two blocks: the layout choice (labelled, first), photos and text
 * that carry the story, then the header nameplate. Same field ids as before
 * (`story-<template>-<key>`), and photo slots still follow their `showIf`.
 */
export function CanvasFields({
  template,
  values,
  setValue,
  addPhoto
}: FieldProps & { addPhoto: (key: string, file: File) => void }) {
  const visible = template.fields.filter((field) => isFieldVisible(field, values));
  const selects = visible.filter((field): field is SelectDef => field.type === "select");
  const photos = visible.filter((field): field is PhotoDef => field.type === "photo");
  const texts = visible.filter((field): field is TextDef => field.type === "text" || field.type === "textarea");
  const header = texts.filter((field) => HEADER_KEYS.has(field.key));
  const body = texts.filter((field) => !HEADER_KEYS.has(field.key));
  const props = { template, values, setValue };
  const mainTitle = photos.length > 1 ? "Photos and text" : photos.length === 1 ? "Photo and text" : "Text";

  return (
    <div className={INSPECTOR_BODY_CLASS}>
      <InspectorSection title={mainTitle}>
        {selects.map((field) => (
          <Segmented
            key={field.key}
            label={field.label}
            value={String(values[field.key] ?? field.def)}
            options={field.options}
            onChange={(next) => setValue(field.key, next)}
          />
        ))}
        {photos.map((field) => {
          const value = values[field.key];
          return (
            <PhotoInput
              key={field.key}
              label={field.label}
              photo={value && typeof value === "object" ? value : null}
              onFile={(file) => addPhoto(field.key, file)}
              onChange={(photo) => setValue(field.key, photo)}
              onRemove={() => setValue(field.key, null)}
            />
          );
        })}
        {pairShortFields(body).map((row) => (
          <FieldRow key={row.map((field) => field.key).join("+")} {...props} fields={row} />
        ))}
      </InspectorSection>
      {header.length ? (
        <InspectorSection title="Header">
          {pairShortFields(header).map((row) => (
            <FieldRow key={row.map((field) => field.key).join("+")} {...props} fields={row} />
          ))}
        </InspectorSection>
      ) : null}
    </div>
  );
}
