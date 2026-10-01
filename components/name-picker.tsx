"use client";

import { useId, useState, type KeyboardEvent, type ReactElement } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Check, ChevronDown, Search } from "lucide-react";
import { filterNames } from "@/src/lib/name-search";
import { cn } from "@/src/lib/utils";

const TRIGGER_CLASS =
  "flex h-9 w-full items-center justify-between gap-2 whitespace-nowrap rounded-md border border-border bg-background px-2 text-left text-sm text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

type Choice = { name: string; label: string; disabled: boolean };

function buildChoices(
  value: string,
  options: string[],
  disabledOptions: string[],
  placeholder: string,
  query: string
): Choice[] {
  const blocked = new Set(disabledOptions);
  const names = value && !options.includes(value) ? [value, ...options] : options;
  const matches = filterNames(names, query).map((name) => ({
    name,
    label: name,
    disabled: blocked.has(name) && name !== value
  }));
  // The placeholder row clears a filled slot; hide it while searching or when there is nothing to clear.
  return query.trim() || !value ? matches : [{ name: "", label: placeholder, disabled: false }, ...matches];
}

function nextEnabled(choices: Choice[], from: number, step: 1 | -1) {
  for (let index = from; index >= 0 && index < choices.length; index += step) {
    if (!choices[index].disabled) return index;
  }
  return -1;
}

// Scrolls only the list (scrollIntoView can also scroll the page behind the popover).
function keepInListView(node: HTMLDivElement | null) {
  const list = node?.parentElement;
  if (!node || !list) return;
  const bottom = node.offsetTop + node.offsetHeight;
  if (node.offsetTop < list.scrollTop) {
    list.scrollTop = node.offsetTop;
  } else if (bottom > list.scrollTop + list.clientHeight) {
    list.scrollTop = bottom - list.clientHeight;
  }
}

/**
 * Name dropdown with a search box. Picking the placeholder row clears the value ("").
 * `trigger` replaces the full-width button (it must be a single button element).
 */
export function NamePicker({
  value,
  options,
  disabledOptions = [],
  disabled,
  placeholder,
  onChange,
  trigger
}: {
  value: string;
  options: string[];
  disabledOptions?: string[];
  disabled?: boolean;
  placeholder: string;
  onChange: (value: string) => void;
  trigger?: ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const listId = useId();
  const choices = buildChoices(value, options, disabledOptions, placeholder, query);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) return;
    const initial = buildChoices(value, options, disabledOptions, placeholder, "");
    const current = initial.findIndex((choice) => choice.name === value);
    setQuery("");
    setActiveIndex(current >= 0 ? current : nextEnabled(initial, 0, 1));
  }

  function handleQueryChange(nextQuery: string) {
    setQuery(nextQuery);
    setActiveIndex(nextEnabled(buildChoices(value, options, disabledOptions, placeholder, nextQuery), 0, 1));
  }

  function pick(choice: Choice) {
    if (choice.disabled) return;
    setOpen(false);
    if (choice.name !== value) onChange(choice.name);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      const next = nextEnabled(choices, activeIndex + step, step);
      if (next >= 0) setActiveIndex(next);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const choice = choices[activeIndex];
      if (choice) pick(choice);
    }
  }

  return (
    <Popover.Root open={open} onOpenChange={handleOpenChange}>
      <Popover.Trigger asChild disabled={disabled}>
        {trigger ?? (
          <button type="button" className={TRIGGER_CLASS}>
            <span className={cn("truncate", !value && "text-muted-foreground")}>{value || placeholder}</span>
            <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
          </button>
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          className="z-50 w-[var(--radix-popover-trigger-width)] min-w-[12rem] rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
        >
          <div className="flex items-center gap-2 border-b border-border px-2 pb-1">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              type="text"
              role="combobox"
              aria-label="Search names"
              aria-expanded
              aria-controls={listId}
              aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
              placeholder="Search names"
              value={query}
              onChange={(event) => handleQueryChange(event.target.value)}
              onKeyDown={handleKeyDown}
              className="h-7 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div id={listId} role="listbox" className="relative mt-1 max-h-64 overflow-y-auto">
            {choices.length === 0 ? (
              <p className="px-2 py-1.5 text-sm text-muted-foreground">No matches</p>
            ) : (
              choices.map((choice, index) => (
                <div
                  key={choice.name ? `name-${choice.name}` : "none"}
                  id={`${listId}-${index}`}
                  ref={index === activeIndex ? keepInListView : undefined}
                  role="option"
                  aria-selected={choice.name === value}
                  aria-disabled={choice.disabled || undefined}
                  onMouseMove={() => {
                    if (!choice.disabled && index !== activeIndex) setActiveIndex(index);
                  }}
                  onClick={() => pick(choice)}
                  className={cn(
                    "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-sm",
                    index === activeIndex && "bg-accent text-accent-foreground",
                    choice.disabled && "pointer-events-none opacity-50"
                  )}
                >
                  <span className="truncate">{choice.label}</span>
                  {choice.name === value ? <Check className="absolute right-2 h-4 w-4" /> : null}
                </div>
              ))
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
