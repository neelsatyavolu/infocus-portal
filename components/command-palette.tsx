"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { CornerDownLeft, ExternalLink, Search } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { AssistantAudience } from "@/src/lib/assistant-access";
import { ASSISTANT_PLACES } from "@/src/lib/assistant-places";
import { cn } from "@/src/lib/utils";

type Place = (typeof ASSISTANT_PLACES)[number];

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/** Label matches first, then alias matches, keeping the sidebar order within each group. */
function filterPlaces(places: readonly Place[], query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return [...places];
  }
  const byLabel = places.filter((place) => place.label.toLowerCase().includes(needle));
  const byAlias = places.filter(
    (place) => !byLabel.includes(place) && place.aliases.some((alias) => alias.toLowerCase().includes(needle))
  );
  return [...byLabel, ...byAlias];
}

/** ⌘K / Ctrl+K jump-to-page list built from the same places the assistant can point to. */
export function CommandPalette({
  open,
  onOpenChange,
  audience
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  audience: AssistantAudience;
}) {
  const router = useRouter();
  const listId = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const places = useMemo(() => ASSISTANT_PLACES.filter((place) => place.audiences.includes(audience)), [audience]);
  const results = useMemo(() => filterPlaces(places, query), [places, query]);

  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key.toLowerCase() !== "k" || !(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) {
        return;
      }
      const inPalette = event.target instanceof HTMLElement && event.target.closest("[data-command-palette]");
      if (isEditableTarget(event.target) && !inPalette) {
        return;
      }
      event.preventDefault();
      onOpenChange(!open);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
    }
  }, [open]);

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  function go(place: Place) {
    onOpenChange(false);
    if (place.external && place.newTab) {
      window.open(place.href, "_blank", "noopener,noreferrer");
      return;
    }
    if (place.external) {
      window.location.assign(place.href);
      return;
    }
    router.push(place.href as never);
  }

  function onInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing || results.length === 0) {
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + results.length) % results.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const place = results[Math.min(activeIndex, results.length - 1)];
      if (place) {
        go(place);
      }
    }
  }

  const activeId = results.length > 0 ? `${listId}-${Math.min(activeIndex, results.length - 1)}` : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-command-palette="" className="max-w-lg gap-0 overflow-hidden p-0 sm:p-0">
        <DialogTitle className="sr-only">Go to a page</DialogTitle>
        <DialogDescription className="sr-only">
          Type to filter pages, use the arrow keys to choose one, and press Enter to open it.
        </DialogDescription>
        <div className="flex items-center gap-2 border-b border-border px-4 pr-12">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={onInputKeyDown}
            placeholder="Go to a page…"
            role="combobox"
            aria-expanded
            aria-controls={listId}
            aria-activedescendant={activeId}
            aria-autocomplete="list"
            className="h-12 min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground md:text-sm"
          />
        </div>
        <ul ref={listRef} id={listId} role="listbox" aria-label="Pages" className="max-h-[min(360px,60dvh)] overflow-y-auto p-2">
          {results.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">No pages match “{query.trim()}”.</li>
          ) : (
            results.map((place, index) => {
              const active = index === Math.min(activeIndex, results.length - 1);
              return (
                <li
                  key={place.id}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={active}
                  data-active={active}
                  onMouseMove={() => setActiveIndex(index)}
                  onClick={() => go(place)}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm",
                    active ? "bg-accent text-foreground" : "text-muted-foreground"
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-foreground">{place.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">{place.hint}</span>
                  </span>
                  {place.external ? <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
                  {active ? <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden /> : null}
                </li>
              );
            })
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
