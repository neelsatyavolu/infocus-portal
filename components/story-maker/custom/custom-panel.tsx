"use client";

import type { ComponentType, ReactNode } from "react";
import {
  AlignCenterHorizontal,
  ArrowDown,
  ArrowUp,
  AtSign,
  BringToFront,
  CircleCheck,
  Copy,
  ImagePlus,
  PanelTop,
  RectangleHorizontal,
  Redo2,
  RotateCcw,
  SendToBack,
  Share2,
  Square,
  Trash2,
  TriangleAlert,
  Type,
  Undo2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  PLATE_FILLS,
  TEXT_COLORS,
  TEXT_STYLES,
  brandChecks,
  textPx,
  type CustomElement,
  type ElementPreset,
  type PlateFillId,
  type TextColorId,
  type TextStyleId
} from "@/src/lib/story-custom";
import { cn } from "@/src/lib/utils";
import { PhotoInput, Segmented, StoryField } from "../story-fields";
import { TEXT_INPUT_ID } from "./custom-canvas";
import type { CustomLayoutApi } from "./use-custom-layout";

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
const selectClass = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground";

function Swatches<T extends string>({ label, value, options, onChange }: {
  label: string;
  value: T;
  options: ReadonlyArray<{ id: T; hex: string; name: string }>;
  onChange: (id: T) => void;
}) {
  return (
    <StoryField label={label}>
      <div role="group" aria-label={label} className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={value === option.id}
            onClick={() => onChange(option.id)}
            className={cn(
              "flex h-9 items-center gap-2 rounded-md border px-2.5 text-xs font-medium transition-colors",
              value === option.id ? "border-[var(--brand-green)] text-foreground" : "border-input text-muted-foreground hover:text-foreground"
            )}
          >
            <span className="h-4 w-4 rounded-[4px] border border-border" style={{ background: option.hex }} />
            {option.name}
          </button>
        ))}
      </div>
    </StoryField>
  );
}

function Group({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid gap-3 border-t border-border pt-4 first:border-t-0 first:pt-0">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function IconButton({ label, icon: Icon, onClick, disabled, danger }: { label: string; icon: ComponentType<{ className?: string }>; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <Button type="button" variant={danger ? "destructive-quiet" : "outline"} size="icon" title={label} aria-label={label} disabled={disabled} onClick={onClick} className="h-9 w-9">
      <Icon className="h-4 w-4" />
    </Button>
  );
}

function Properties({ api, el }: { api: CustomLayoutApi; el: CustomElement }) {
  const set = (patch: Partial<CustomElement>, key?: string) => api.update(el.id, patch, key);
  switch (el.kind) {
    case "text":
      return (
        <>
          <StoryField id={TEXT_INPUT_ID} label="Text">
            <Textarea id={TEXT_INPUT_ID} rows={3} value={el.text} maxLength={2000} onChange={(event) => set({ text: event.target.value }, `text:${el.id}`)} />
          </StoryField>
          <StoryField id="custom-text-style" label="Style">
            <select id="custom-text-style" className={selectClass} value={el.style} onChange={(event) => set({ style: event.target.value as TextStyleId })}>
              {(Object.keys(TEXT_STYLES) as TextStyleId[]).map((id) => (
                <option key={id} value={id}>{TEXT_STYLES[id].label}</option>
              ))}
            </select>
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
              className="h-8 w-full accent-[var(--brand-green)]"
            />
          </StoryField>
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
          <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => api.fillStory(el.id)}>
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
        <>
          <StoryField id="custom-kicker" label="Section label" hint="Caps are automatic.">
            <Input id="custom-kicker" value={el.kicker} maxLength={40} onChange={(event) => set({ kicker: event.target.value }, `kicker:${el.id}`)} />
          </StoryField>
          <StoryField id="custom-meta" label="Green strip" hint="A date or byline. Leave it empty to hide the strip.">
            <Input id="custom-meta" value={el.meta} maxLength={60} onChange={(event) => set({ meta: event.target.value }, `meta:${el.id}`)} />
          </StoryField>
        </>
      );
    case "follow":
      return (
        <StoryField id="custom-follow" label="Heading">
          <Input id="custom-follow" value={el.heading} maxLength={60} onChange={(event) => set({ heading: event.target.value }, `heading:${el.id}`)} />
        </StoryField>
      );
    case "icon":
      return <p className="text-xs text-muted-foreground">The InFocus icon on an Ink tile. Drag the corner to resize; it stays square.</p>;
    case "footer":
      return <p className="text-xs text-muted-foreground">The site and Instagram handle over a thin rule. Drag the side handle to change its width.</p>;
  }
}

export function CustomPanel({ api }: { api: CustomLayoutApi }) {
  const { layout, selected, measured } = api;
  const issues = brandChecks(layout, measured);
  const hasRedDot = layout.elements.some((el) => el.kind === "icon" || el.kind === "header");

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <IconButton label="Undo (⌘Z)" icon={Undo2} onClick={api.undo} disabled={!api.canUndo} />
        <IconButton label="Redo (⇧⌘Z)" icon={Redo2} onClick={api.redo} disabled={!api.canRedo} />
        <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={api.startOver}>
          <RotateCcw className="h-4 w-4" />
          Start over
        </Button>
      </div>

      <Group title="Add">
        <div className="grid grid-cols-2 gap-2">
          {ADD.map(({ preset, label, icon: Icon }) => {
            const oneRed = (preset === "icon" || preset === "header") && hasRedDot;
            return (
              <Button
                key={preset}
                type="button"
                variant="outline"
                size="sm"
                className="justify-start"
                disabled={oneRed}
                title={oneRed ? "One red dot per story: remove the other icon or header first" : undefined}
                onClick={() => api.add(preset)}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Button>
            );
          })}
        </div>
      </Group>

      <Group title="Background">
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
      </Group>

      <Group
        title={selected ? `Selected · ${KIND_LABEL[selected.kind]}` : "Selected"}
        action={selected ? (
          <div className="flex gap-1">
            <IconButton label="Duplicate (⌘D)" icon={Copy} onClick={() => api.duplicate(selected.id)} />
            <IconButton label="Delete" icon={Trash2} danger onClick={() => api.remove(selected.id)} />
          </div>
        ) : null}
      >
        {selected ? (
          <>
            <Properties api={api} el={selected} />
            <div className="flex flex-wrap gap-1">
              <IconButton label="Bring to front" icon={BringToFront} onClick={() => api.layer(selected.id, "front")} />
              <IconButton label="Bring forward" icon={ArrowUp} onClick={() => api.layer(selected.id, "forward")} />
              <IconButton label="Send backward" icon={ArrowDown} onClick={() => api.layer(selected.id, "backward")} />
              <IconButton label="Send to back" icon={SendToBack} onClick={() => api.layer(selected.id, "back")} />
              <IconButton label="Center horizontally" icon={AlignCenterHorizontal} onClick={() => api.centre(selected.id)} />
            </div>
          </>
        ) : (
          <p className="text-xs leading-relaxed text-muted-foreground">
            Click a piece on the story to edit it. Drag to move (it snaps to the margins, centre and safe lines; hold Option/Alt to place freely), drag the green handle to resize, and use the arrow keys to nudge.
          </p>
        )}
      </Group>

      <Group title="Brand check">
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
                  onClick={() => issue.elementId && api.select(issue.elementId)}
                  className="flex w-full items-start gap-2 rounded-md border border-[#F2A516]/50 bg-[#F2A516]/10 px-3 py-2 text-left text-sm enabled:hover:bg-[#F2A516]/15"
                >
                  <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[#F2A516] light:text-[#B45309]" />
                  <span>{issue.message}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Group>
    </div>
  );
}
