"use client";

import {
  forwardRef,
  useCallback,
  useLayoutEffect,
  useRef,
  type FocusEvent,
  type MutableRefObject,
  type Ref,
  type TextareaHTMLAttributes
} from "react";
import { cn } from "@/src/lib/utils";

type AutoGrowTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string };

function assignRef<T>(ref: Ref<T> | undefined, node: T | null) {
  if (typeof ref === "function") ref(node);
  else if (ref) (ref as MutableRefObject<T | null>).current = node;
}

/**
 * A notes field that grows with its text between its CSS min and max height, then scrolls.
 * Uses the field border (`border-input`, 3:1 against the card) and 16px text on phones.
 */
export const AutoGrowTextarea = forwardRef<HTMLTextAreaElement, AutoGrowTextareaProps>(function AutoGrowTextarea(
  { className, value, onFocus, ...props },
  forwardedRef
) {
  const innerRef = useRef<HTMLTextAreaElement | null>(null);

  const fit = useCallback(() => {
    const element = innerRef.current;
    if (!element) return;
    element.style.height = "auto";
    const border = element.offsetHeight - element.clientHeight;
    element.style.height = `${element.scrollHeight + border}px`;
  }, []);

  useLayoutEffect(() => {
    fit();
  }, [value, fit]);

  // Stable, so React doesn't detach and re-attach the ref on every keystroke.
  const setRefs = useCallback(
    (node: HTMLTextAreaElement | null) => {
      innerRef.current = node;
      assignRef(forwardedRef, node);
    },
    [forwardedRef]
  );

  return (
    <textarea
      ref={setRefs}
      value={value}
      onFocus={(event: FocusEvent<HTMLTextAreaElement>) => {
        // A field first drawn while hidden (the phone list view) measures 0; fit it when used.
        fit();
        onFocus?.(event);
      }}
      className={cn(
        "block w-full resize-none overflow-y-auto rounded-md border border-input bg-transparent px-3 py-2 text-base leading-relaxed text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm",
        className
      )}
      {...props}
    />
  );
});
