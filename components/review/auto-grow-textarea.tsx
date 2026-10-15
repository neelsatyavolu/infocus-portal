"use client";

import { forwardRef, useCallback, useLayoutEffect, useRef, type TextareaHTMLAttributes } from "react";
import { Textarea } from "@/components/ui/textarea";

type AutoGrowTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  /** Tallest it grows before scrolling, in px. */
  maxHeightPx: number;
};

/** A Textarea that grows with its text (from its min-height up to `maxHeightPx`), then scrolls. */
export const AutoGrowTextarea = forwardRef<HTMLTextAreaElement, AutoGrowTextareaProps>(function AutoGrowTextarea(
  { maxHeightPx, value, style, ...props },
  forwardedRef
) {
  const innerRef = useRef<HTMLTextAreaElement | null>(null);

  const setRefs = useCallback(
    (node: HTMLTextAreaElement | null) => {
      innerRef.current = node;
      if (typeof forwardedRef === "function") {
        forwardedRef(node);
      } else if (forwardedRef) {
        forwardedRef.current = node;
      }
    },
    [forwardedRef]
  );

  useLayoutEffect(() => {
    const node = innerRef.current;
    if (!node) {
      return;
    }
    node.style.height = "auto";
    const next = Math.min(node.scrollHeight + (node.offsetHeight - node.clientHeight), maxHeightPx);
    node.style.height = `${next}px`;
    node.style.overflowY = node.scrollHeight + (node.offsetHeight - node.clientHeight) > maxHeightPx ? "auto" : "hidden";
  }, [value, maxHeightPx]);

  return <Textarea ref={setRefs} value={value} style={style} {...props} />;
});
