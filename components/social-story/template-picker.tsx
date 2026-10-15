"use client";

import type { KeyboardEvent, ReactNode } from "react";
import { Skeleton } from "@/components/kit/skeleton";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { STORY_LABEL_CLASS, TOUCH_HEIGHT } from "@/components/story-maker/story-fields";
import type { StoryTemplate } from "@/components/story-maker/story-templates";
import { cn } from "@/src/lib/utils";
import { groupTemplates, templateIcon } from "./template-meta";

type PickerProps = {
  templates: readonly StoryTemplate[];
  /** null before the saved drafts load: nothing is highlighted yet, so nothing jumps. */
  currentId: string | null;
  onSelect: (id: string) => void;
  /** While a PNG is being made. */
  disabled?: boolean;
};

/**
 * Keys the closed Select uses (arrows open it) or that would act on the Custom canvas from here
 * (Esc deselects, Delete/Backspace remove the selected piece). They stay with the Select instead
 * of reaching the Custom template's window shortcuts. ⌘Z and the rest still pass through.
 */
const TRIGGER_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Escape", "Backspace", "Delete"]);

function keepTriggerKeys(event: KeyboardEvent) {
  if (TRIGGER_KEYS.has(event.key)) event.stopPropagation();
}

/** While the list is open, every key belongs to it (arrows browse, Esc closes, letters search). */
function keepListKeys(event: KeyboardEvent) {
  event.stopPropagation();
}

/**
 * Templates as a sticky vertical list (in a 74rem editor and wider; see story-maker.tsx). Plain
 * buttons with Tab navigation: no arrow keys, because the Custom template uses the arrow keys to
 * nudge the selected piece.
 */
export function TemplateRail({ templates, currentId, onSelect, disabled = false, className }: PickerProps & { className?: string }) {
  return (
    <nav aria-label="Story templates" className={cn("grid content-start gap-4", className)}>
      {groupTemplates(templates).map((group) => (
        <div key={group.label} className="grid gap-1">
          <p className={cn(STORY_LABEL_CLASS, "px-3")}>{group.label}</p>
          <ul className="grid gap-0.5">
            {group.templates.map((template) => {
              const Icon = templateIcon(template.id);
              const active = template.id === currentId;
              return (
                <li key={template.id}>
                  <button
                    type="button"
                    aria-pressed={active}
                    title={template.description}
                    disabled={disabled}
                    onClick={() => onSelect(template.id)}
                    className={cn(
                      "flex h-9 w-full items-center gap-2.5 rounded-md px-3 text-left text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60",
                      active
                        ? "bg-[var(--brand-fill)] text-[var(--on-brand)]"
                        : "text-muted-foreground enabled:hover:bg-[var(--ink-3)] enabled:hover:text-foreground"
                    )}
                  >
                    <Icon aria-hidden className="h-4 w-4 shrink-0" />
                    <span className="truncate">{template.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/**
 * The same choice as one Select (where there's no rail), grouped, with each template's
 * description. Its keys never reach the Custom template's canvas shortcuts (see TRIGGER_KEYS).
 */
function TemplateSelect({ templates, currentId, onSelect, disabled = false, className }: PickerProps & { className?: string }) {
  const current = templates.find((template) => template.id === currentId);
  const CurrentIcon = templateIcon(current?.id ?? "");
  const groups = groupTemplates(templates);
  return (
    <Select value={currentId ?? undefined} onValueChange={onSelect} disabled={disabled}>
      <SelectTrigger aria-label="Template" className={cn(TOUCH_HEIGHT, "text-base md:text-sm", className)} onKeyDown={keepTriggerKeys}>
        <SelectValue placeholder="Pick a template">
          {current ? (
            <span className="flex min-w-0 items-center gap-2">
              <CurrentIcon aria-hidden className="h-4 w-4 shrink-0 text-[var(--brand-green)]" />
              <span className="truncate font-medium">{current.name}</span>
            </span>
          ) : null}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="max-h-[min(70dvh,var(--radix-select-content-available-height))]" onKeyDown={keepListKeys}>
        {groups.map((group, index) => (
          <SelectGroup key={group.label}>
            {index > 0 ? <SelectSeparator /> : null}
            <SelectLabel className={cn(STORY_LABEL_CLASS, "px-2 pb-1 pt-2")}>{group.label}</SelectLabel>
            {group.templates.map((template) => {
              const Icon = templateIcon(template.id);
              return (
                <SelectItem key={template.id} value={template.id} textValue={template.name} className="items-start py-2">
                  <span className="flex min-w-0 items-start gap-2.5">
                    <Icon aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="grid min-w-0 gap-0.5">
                      <span className="font-medium">{template.name}</span>
                      <span className="whitespace-normal text-xs leading-snug text-muted-foreground">{template.description}</span>
                    </span>
                  </span>
                </SelectItem>
              );
            })}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * The heading row of the fields column: the template Select (where the rail shows, from a 74rem
 * `story` container, this is the template's icon and name instead), one quiet "start again"
 * action at the same height, and the template's description on the line below. From md its rows
 * pair with the preview column's (36px actions, 12px gap, 24px status line), so the fields card
 * and the preview frame start on one line: the description is one 24px line there (full text on
 * hover, and in the Select's list).
 */
export function TemplateBar({
  templates,
  template,
  onSelect,
  disabled = false,
  action,
  className
}: {
  templates: readonly StoryTemplate[];
  template: StoryTemplate | null;
  onSelect: (id: string) => void;
  disabled?: boolean;
  action?: ReactNode;
  className?: string;
}) {
  if (!template) {
    return (
      <div aria-hidden className={cn("grid gap-2 md:gap-3", className)}>
        <Skeleton className="h-10 w-full rounded-md md:h-9" />
        <div className="flex items-center md:h-6">
          <Skeleton className="h-3.5 w-3/4" />
        </div>
      </div>
    );
  }
  const Icon = templateIcon(template.id);
  return (
    <div className={cn("grid min-w-0 content-start gap-1.5 md:gap-3", className)}>
      <div className="flex min-h-10 min-w-0 items-center gap-2 md:min-h-9">
        <TemplateSelect templates={templates} currentId={template.id} onSelect={onSelect} disabled={disabled} className="min-w-0 flex-1 @min-[74rem]/story:hidden" />
        <h2 className="sr-only @min-[74rem]/story:not-sr-only @min-[74rem]/story:flex @min-[74rem]/story:min-w-0 @min-[74rem]/story:flex-1 @min-[74rem]/story:items-center @min-[74rem]/story:gap-2 @min-[74rem]/story:text-base @min-[74rem]/story:font-semibold @min-[74rem]/story:text-foreground">
          <Icon aria-hidden className="h-4 w-4 shrink-0 text-[var(--brand-green)]" />
          <span className="truncate">{template.name}</span>
        </h2>
        {action}
      </div>
      <p title={template.description} className="text-[13px] leading-snug text-muted-foreground md:h-6 md:truncate md:leading-6">
        {template.description}
      </p>
    </div>
  );
}
