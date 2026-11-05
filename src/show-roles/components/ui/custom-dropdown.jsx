import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

import { cn } from "../../lib/utils";

export function CustomDropdown({
  value,
  options,
  onChange,
  className,
  buttonClassName,
  panelClassName,
  panelSide = "bottom",
  disabled = false,
  placeholder = "Select",
  ariaLabel,
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const panelRef = useRef(null);
  const buttonRef = useRef(null);
  const [panelPosition, setPanelPosition] = useState(null);

  const selected = useMemo(() => options.find((option) => option.value === value) ?? null, [options, value]);

  useEffect(() => {
    function onDocumentClick(event) {
      const target = event.target;
      if (!(target instanceof Node)) return;

      const clickedTrigger = rootRef.current?.contains(target);
      const clickedPanel = panelRef.current?.contains(target);

      if (!clickedTrigger && !clickedPanel) {
        setOpen(false);
      }
    }

    function onEsc(event) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", onDocumentClick);
    document.addEventListener("keydown", onEsc);

    return () => {
      document.removeEventListener("mousedown", onDocumentClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, []);

  useEffect(() => {
    if (!open) return;

    function updatePosition() {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;

      const viewportPadding = 12;
      const offset = 8;
      const estimatedPanelHeight = Math.min(options.length * 40 + 12, 320);
      const spaceBelow = window.innerHeight - rect.bottom - viewportPadding - offset;
      const spaceAbove = rect.top - viewportPadding - offset;
      const shouldOpenTop =
        panelSide === "top" || (panelSide === "bottom" && spaceBelow < estimatedPanelHeight && spaceAbove > spaceBelow);
      const availableHeight = shouldOpenTop ? spaceAbove : spaceBelow;
      const maxHeight = Math.max(160, Math.min(360, availableHeight));

      const nextPosition =
        shouldOpenTop
          ? {
              left: rect.left,
              width: rect.width,
              bottom: window.innerHeight - rect.top + offset,
              maxHeight,
            }
          : {
              left: rect.left,
              width: rect.width,
              top: rect.bottom + offset,
              maxHeight,
            };

      setPanelPosition(nextPosition);
    }

    updatePosition();

    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, options.length, panelSide]);

  return (
    <div ref={rootRef} className={cn("relative", open ? "z-[130]" : "", className)}>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "interactive-surface flex h-10 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-left text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-60",
          buttonClassName,
        )}
      >
        <span className="truncate">{selected?.label ?? placeholder}</span>
        <ChevronDown className={cn("h-4 w-4 text-slate-400 light:text-muted-foreground transition-transform", open ? "rotate-180" : "")} />
      </button>

      {open && panelPosition
        ? createPortal(
            <div
              ref={panelRef}
              className={cn(
                "slide-in fixed z-[500] overflow-y-auto overscroll-contain rounded-xl border border-cyan-300/25 bg-[#0c1224]/98 light:bg-popover p-1.5 shadow-2xl backdrop-blur",
                panelClassName,
              )}
              style={panelPosition}
            >
              {options.map((option) => {
                const active = option.value === value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    className={cn(
                      "interactive-surface flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-sm",
                      active ? "border-cyan-300/30 bg-cyan-400/15 text-cyan-100 light:text-cyan-800" : "text-slate-200 hover:text-foreground light:text-foreground/80 light:hover:text-foreground",
                    )}
                    onClick={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                  >
                    <span className="truncate">
                      {option.label}
                      {option.hint ? <span className="ml-2 text-xs text-slate-400 light:text-muted-foreground">{option.hint}</span> : null}
                    </span>
                    {active ? <Check className="h-3.5 w-3.5 text-cyan-200 light:text-cyan-700" /> : null}
                  </button>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
