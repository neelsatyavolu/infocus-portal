"use client";

import type { ComponentType } from "react";
import {
  AlignCenterHorizontal,
  ArrowDown,
  ArrowUp,
  AtSign,
  BringToFront,
  Check,
  CircleCheck,
  Copy,
  ImagePlus,
  PanelTop,
  RectangleHorizontal,
  SendToBack,
  Share2,
  Square,
  Trash2,
  TriangleAlert,
  Type
} from "lucide-react";
import { Disclosure } from "@/components/kit/disclosure";
import { IconButton } from "@/components/kit/icon-button";
import { CountBadge, StatusTag } from "@/components/kit/status-tag";
import { PAIR_GRID, PAIR_ROWS } from "@/components/social-story/canvas-fields";
import { CustomShortcuts, useShortcutTitles } from "@/components/social-story/custom-shortcuts";
import { INSPECTOR_BODY_CLASS, InspectorSection } from "@/components/social-story/inspector-section";
import { scrollToSection } from "@/components/social-story/story-stage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import {
  MAX_ELEMENTS,
  PLATE_FILLS,
  TEXT_COLORS,
  TEXT_STYLES,
  textPx,
  type BrandIssue,
  type CustomElement,
  type ElementPreset,
  type PlateFillId,
  type TextColorId,
  type TextStyleId
} from "@/src/lib/story-custom";
import { cn } from "@/src/lib/utils";
import { PhotoInput, STORY_LABEL_CLASS, Segmented, StoryField, TOUCH_HEIGHT } from "../story-fields";
import { TEXT_INPUT_ID } from "./custom-canvas";
import type { CustomLayoutApi } from "./use-custom-layout";

/** The Brand check block, so the status tag above the preview can jump to it. */
export const BRAND_CHECK_ID = "story-brand-check";
const SELECTED_ID = "story-selected";

const ADD: ReadonlyArray<{ preset: ElementPreset; label: string; icon: ComponentType<{ className?: string }> }> = [
  { preset: "text", label: "Text", icon: Type },
  { preset: "photo", label: "Photo", icon: ImagePlus },
  { preset: "plate", label: "Ink plate", icon: Square },
  { preset: "strip", label: "Green strip", icon: RectangleHorizontal },
  { preset: "header", label: "Header", icon: PanelTop },
  { preset: "icon", label: "Icon tile", icon: Square },
  { preset: "footer", label: "Footer", icon: AtSign },
  { preset: "follow", label: "Follow panel", icon: Share2 }
];

const KIND_LABEL: Record<CustomElement["kind"], string> = {
  text: "Text",
  photo: "Photo",
  plate: "Plate",
  icon: "Icon tile",
  header: "Header",
  footer: "Footer",
  follow: "Follow panel"
};

const COLOR_LABEL: Record<TextColorId, string> = { white: "Soft White", mist: "Mist", green: "Green" };
const FILL_LABEL: Record<PlateFillId, string> = { ink: "Ink", "ink-2": "Raised Ink", green: "InFocus Green" };
/** Every icon button in the Selected block (header and Arrange): 32px from md, 40px on phones. */
const ICON_ACTION = "max-md:h-10";
/** Open/closed for the shortcut list at the end of the fields, remembered per browser (kit prefix `infocus:ui:`). */
const SHORTCUTS_KEY = "story-maker:custom-shortcuts:v1";
/** In a paired row, both fields share label / control / hint rows (see StoryField). */
const PAIRED = PAIR_ROWS.withHint.child;
const PAIR_ROW = cn(PAIR_GRID, PAIR_ROWS.withHint.parent);

function Swatches<T extends string>({ label, value, options, onChange }: {
  label: string;
  value: T;
  options: ReadonlyArray<{ id: T; hex: string; name: string }>;
  onChange: (id: T) => void;
}) {
  return (
    <StoryField label={label}>
      <div role="group" aria-label={label} className="flex flex-wrap gap-2">
        {options.map((option) => {
          const selected = value === option.id;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(option.id)}
              className={cn(
                "flex items-center gap-2 rounded-md border px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                TOUCH_HEIGHT,
                selected
                  ? "border-[var(--brand-green)] bg-[var(--ink-3)] font-medium text-foreground"
                  : "border-input text-muted-foreground hover:bg-[var(--ink-3)] hover:text-foreground"
              )}
            >
              <span className="h-4 w-4 rounded-[4px] border border-border" style={{ background: option.hex }} />
              {option.name}
              {selected ? <Check aria-hidden className="h-4 w-4 text-[var(--brand-green)]" /> : null}
            </button>
          );
        })}
      </div>
    </StoryField>
  );
}

function TextProperties({ el, set }: { el: Extract<CustomElement, { kind: "text" }>; set: (patch: Partial<CustomElement>, key?: string) => void }) {
  return (
    <>
      <StoryField id={TEXT_INPUT_ID} label="Text">
        <Textarea id={TEXT_INPUT_ID} rows={3} value={el.text} maxLength={2000} onChange={(event) => set({ text: event.target.value }, `text:${el.id}`)} />
      </StoryField>
      <div className="grid gap-4 @min-[30rem]:grid-cols-2">
        <StoryField id="custom-text-style" label="Style">
          <NativeSelect id="custom-text-style" className={TOUCH_HEIGHT} value={el.style} onChange={(event) => set({ style: event.target.value as TextStyleId })}>
            {(Object.keys(TEXT_STYLES) as TextStyleId[]).map((id) => (
              <option key={id} value={id}>{TEXT_STYLES[id].label}</option>
            ))}
          </NativeSelect>
        </StoryField>
        <StoryField label={`Size · ${textPx(el)}px`}>
          <input
            type="range"
            min={75}
            max={150}
            step={5}
            value={Math.round(el.scale * 100)}
            aria-label="Text size"
            onChange={(event) => set({ scale: Number(event.target.value) / 100 }, `scale:${el.id}`)}
            className={cn("w-full accent-[var(--brand-green)]", TOUCH_HEIGHT)}
          />
        </StoryField>
      </div>
      <Swatches
        label="Color"
        value={el.color}
        options={(Object.keys(TEXT_COLORS) as TextColorId[]).map((id) => ({ id, hex: TEXT_COLORS[id], name: COLOR_LABEL[id] }))}
        onChange={(color) => set({ color })}
      />
      <Segmented
        label="Align"
        value={el.align}
        options={[{ value: "left", label: "Left" }, { value: "center", label: "Center" }, { value: "right", label: "Right" }]}
        onChange={(align) => set({ align: align as "left" | "center" | "right" })}
      />
    </>
  );
}

function Properties({ api, el }: { api: CustomLayoutApi; el: CustomElement }) {
  const set = (patch: Partial<CustomElement>, key?: string) => api.update(el.id, patch, key);
  switch (el.kind) {
    case "text":
      return <TextProperties el={el} set={set} />;
    case "photo":
      return (
        <>
          <PhotoInput
            label="Photo"
            photo={el.photo}
            onFile={(file) => void api.readPhoto(file).then((photo) => photo && set({ photo }))}
            onChange={(photo) => set({ photo }, `crop:${el.id}`)}
            onRemove={() => set({ photo: null })}
          />
          <Button type="button" variant="outline" className={cn(TOUCH_HEIGHT, "w-fit")} onClick={() => api.fillStory(el.id)}>
            Fill the whole story
          </Button>
        </>
      );
    case "plate":
      return (
        <Swatches
          label="Fill"
          value={el.fill}
          options={(Object.keys(PLATE_FILLS) as PlateFillId[]).map((id) => ({ id, hex: PLATE_FILLS[id], name: FILL_LABEL[id] }))}
          onChange={(fill) => set({ fill })}
        />
      );
    case "header":
      return (
        <div className={PAIR_ROW}>
          <StoryField id="custom-kicker" label="Section label" hint="Caps are automatic." className={PAIRED}>
            <Input id="custom-kicker" className={TOUCH_HEIGHT} value={el.kicker} maxLength={40} onChange={(event) => set({ kicker: event.target.value }, `kicker:${el.id}`)} />
          </StoryField>
          <StoryField id="custom-meta" label="Green strip" hint="A date or byline. Leave it empty to hide the strip." className={PAIRED}>
            <Input id="custom-meta" className={TOUCH_HEIGHT} value={el.meta} maxLength={60} onChange={(event) => set({ meta: event.target.value }, `meta:${el.id}`)} />
          </StoryField>
        </div>
      );
    case "follow":
      return (
        <StoryField id="custom-follow" label="Heading">
          <Input id="custom-follow" className={TOUCH_HEIGHT} value={el.heading} maxLength={60} onChange={(event) => set({ heading: event.target.value }, `heading:${el.id}`)} />
        </StoryField>
      );
    case "icon":
      return <p className="text-xs leading-snug text-muted-foreground">The InFocus icon on an Ink tile. Drag the corner to resize; it stays square.</p>;
    case "footer":
      return <p className="text-xs leading-snug text-muted-foreground">The site and Instagram handle over a thin rule. Drag the side handle to change its width.</p>;
  }
}

function Arrange({ api, el }: { api: CustomLayoutApi; el: CustomElement }) {
  const buttons = [
    { label: "Bring to front", icon: BringToFront, run: () => api.layer(el.id, "front") },
    { label: "Bring forward", icon: ArrowUp, run: () => api.layer(el.id, "forward") },
    { label: "Send backward", icon: ArrowDown, run: () => api.layer(el.id, "backward") },
    { label: "Send to back", icon: SendToBack, run: () => api.layer(el.id, "back") },
    { label: "Center horizontally", icon: AlignCenterHorizontal, run: () => api.centre(el.id) }
  ];
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <span className={STORY_LABEL_CLASS}>Arrange</span>
      <div role="group" aria-label="Arrange" className="flex gap-1.5">
        {buttons.map(({ label, icon, run }) => (
          <IconButton key={label} label={label} icon={icon} variant="outline" size="sm" className={ICON_ACTION} onClick={run} />
        ))}
      </div>
    </div>
  );
}

/**
 * The shortcut list at the end of the fields while a piece is selected. Open until someone folds
 * it (the how-to used to be always on screen); while nothing is selected the list shows unfolded
 * in the Selected block instead.
 */
function ShortcutsDisclosure({ className }: { className?: string }) {
  return (
    <Disclosure summary="Shortcuts" storageKey={SHORTCUTS_KEY} defaultOpen className={className} bodyClassName="pb-1">
      <CustomShortcuts />
    </Disclosure>
  );
}

function SelectedSection({ api }: { api: CustomLayoutApi }) {
  const { selected } = api;
  const titles = useShortcutTitles();
  return (
    <InspectorSection
      id={SELECTED_ID}
      title="Selected"
      tag={selected ? <StatusTag tone="neutral" size="sm">{KIND_LABEL[selected.kind]}</StatusTag> : null}
      actions={
        selected ? (
          <>
            <IconButton label={titles.duplicate} icon={Copy} variant="outline" size="sm" className={ICON_ACTION} onClick={() => api.duplicate(selected.id)} />
            <IconButton label="Delete" icon={Trash2} variant="outline" tone="danger" size="sm" className={ICON_ACTION} onClick={() => api.remove(selected.id)} />
          </>
        ) : null
      }
    >
      {selected ? (
        <div key={selected.id} className="grid gap-4">
          <Properties api={api} el={selected} />
          <Arrange api={api} el={selected} />
        </div>
      ) : (
        <div className="grid gap-3">
          <p className="text-sm text-[var(--ink-text)]">
            <span className="pointer-coarse:hidden">Click a piece on the story to edit it.</span>
            <span className="hidden pointer-coarse:inline">Tap a piece on the story to edit it.</span>
          </p>
          <CustomShortcuts />
        </div>
      )}
    </InspectorSection>
  );
}

/**
 * The Custom template's fields: the selected piece's settings (until a piece is picked, how to
 * pick one, with the full shortcut list), Add, Background, the Brand check, and, while a piece
 * is selected, the foldable shortcut list at the end. Undo and Redo sit with Download above the
 * preview. `issues` is brandChecks(layout, measured), worked out once
 * by the editor (the status line above the preview counts the same list).
 */
export function CustomPanel({ api, issues }: { api: CustomLayoutApi; issues: readonly BrandIssue[] }) {
  const { layout } = api;
  const hasRedDot = layout.elements.some((el) => el.kind === "icon" || el.kind === "header");

  return (
    <div className={INSPECTOR_BODY_CLASS}>
      <SelectedSection api={api} />

      <InspectorSection title="Add" count={`${layout.elements.length} / ${MAX_ELEMENTS}`}>
        <div className="grid grid-cols-2 gap-2 @min-[36rem]:grid-cols-4">
          {ADD.map(({ preset, label, icon: Icon }) => {
            const oneRed = (preset === "icon" || preset === "header") && hasRedDot;
            return (
              <Button
                key={preset}
                type="button"
                variant="outline"
                className={cn(TOUCH_HEIGHT, "min-w-0 justify-start px-3")}
                disabled={oneRed}
                title={oneRed ? "One red dot per story: remove the other icon or header first" : undefined}
                onClick={() => api.add(preset)}
              >
                <Icon className="h-4 w-4" />
                <span className="truncate">{label}</span>
              </Button>
            );
          })}
        </div>
      </InspectorSection>

      <InspectorSection title="Background">
        <Segmented
          label="Fill"
          value={layout.background.kind}
          options={[{ value: "ink", label: "Ink" }, { value: "photo", label: "Photo" }]}
          onChange={(kind) => api.setBackground(kind === "photo" ? { kind: "photo", photo: layout.background.kind === "photo" ? layout.background.photo : null } : { kind: "ink" })}
        />
        {layout.background.kind === "photo" ? (
          <PhotoInput
            label="Background photo"
            photo={layout.background.photo}
            onFile={(file) => void api.readPhoto(file).then((photo) => photo && api.setBackground({ kind: "photo", photo }))}
            onChange={(photo) => api.setBackground({ kind: "photo", photo })}
            onRemove={() => api.setBackground({ kind: "photo", photo: null })}
          />
        ) : null}
      </InspectorSection>

      <InspectorSection
        id={BRAND_CHECK_ID}
        title="Brand check"
        tag={<CountBadge count={issues.length} tone="warning" srLabel={`${issues.length} to check`} />}
      >
        {issues.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-[var(--brand-green)]">
            <CircleCheck className="h-4 w-4" />
            On brand
          </p>
        ) : (
          <ul className="grid gap-2">
            {issues.map((issue) => (
              <li key={issue.key}>
                <button
                  type="button"
                  disabled={!issue.elementId}
                  onClick={() => {
                    if (!issue.elementId) return;
                    api.select(issue.elementId);
                    scrollToSection(SELECTED_ID);
                  }}
                  className="flex min-h-10 w-full items-start gap-2 rounded-md border border-brand-amber/40 bg-brand-amber/10 px-3 py-2 text-left text-sm text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring enabled:hover:bg-brand-amber/15"
                >
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-brand-amber" />
                  <span>{issue.message}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </InspectorSection>

      {api.selected ? <ShortcutsDisclosure className="pt-4" /> : null}
    </div>
  );
}
