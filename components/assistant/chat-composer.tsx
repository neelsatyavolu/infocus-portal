"use client";

import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, type FormEvent, type KeyboardEvent } from "react";
import { Send } from "lucide-react";
import { Spinner } from "@/components/kit/spinner";
import { Button } from "@/components/ui/button";
import { cn } from "@/src/lib/utils";

const MAX_HEIGHT_PX = 128;

/**
 * The one composer for both tabs (Assistant and a Messages thread): a growing textarea and a
 * square Send button of the same height. Enter sends, Shift+Enter adds a line, and Enter that
 * confirms IME composition does nothing. Disabled while sending; focus comes back afterwards
 * on mouse/trackpad devices.
 */
export const ChatComposer = forwardRef<
  HTMLTextAreaElement,
  {
    value: string;
    onChange: (value: string) => void;
    onSubmit: () => void;
    busy: boolean;
    placeholder: string;
    ariaLabel: string;
    /** 44px controls and 16px text (phones and touch tablets). */
    touch: boolean;
    /** False while its tab is hidden; turning true sizes a kept draft again. */
    visible?: boolean;
    /** Pad for the home indicator (phone sheet with the keyboard down). */
    safeAreaBottom: boolean;
  }
>(function ChatComposer(
  { value, onChange, onSubmit, busy, placeholder, ariaLabel, touch, visible = true, safeAreaBottom },
  ref
) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const wasBusyRef = useRef(busy);
  useImperativeHandle(ref, () => textareaRef.current as HTMLTextAreaElement);

  // Grows with its text (and shrinks back when a send clears it).
  useLayoutEffect(() => {
    const el = textareaRef.current;
    // A hidden tab has no layout to measure; it sizes again once it is shown.
    if (!el || !visible || el.getClientRects().length === 0) {
      return;
    }
    el.style.height = "auto";
    // scrollHeight leaves out the border; add it back so one line fits without a scrollbar.
    const border = el.offsetHeight - el.clientHeight;
    el.style.height = `${Math.min(el.scrollHeight + border, MAX_HEIGHT_PX)}px`;
  }, [value, touch, visible]);

  // The disabled textarea drops focus on every send; hand it back unless the reader moved on.
  useEffect(() => {
    const finished = wasBusyRef.current && !busy;
    wasBusyRef.current = busy;
    const el = textareaRef.current;
    if (!finished || !el || el.getClientRects().length === 0 || !window.matchMedia("(pointer: fine)").matches) {
      return;
    }
    const active = document.activeElement;
    if (!active || active === document.body || formRef.current?.contains(active)) {
      el.focus();
    }
  }, [busy]);

  function submit(event: FormEvent) {
    event.preventDefault();
    onSubmit();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      onSubmit();
    }
  }

  return (
    <form
      ref={formRef}
      onSubmit={submit}
      className={cn(
        "shrink-0 border-t border-border px-4 py-3",
        safeAreaBottom && "pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      )}
    >
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder={placeholder}
          aria-label={ariaLabel}
          disabled={busy}
          className={cn(
            "max-h-32 min-w-0 flex-1 resize-none overscroll-contain rounded-md border border-input bg-transparent px-3 text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
            // One line is exactly the Send button's height: 44px (24 + 18 + 2) or 36px (20 + 14 + 2).
            touch ? "min-h-11 py-[9px] text-base leading-6" : "min-h-9 py-[7px] text-sm leading-5"
          )}
        />
        <Button
          type="submit"
          size="icon"
          aria-label="Send"
          disabled={busy || !value.trim()}
          className={cn("shrink-0", touch ? "h-11 w-11" : "h-9 w-9")}
        >
          {busy ? <Spinner /> : <Send aria-hidden />}
        </Button>
      </div>
    </form>
  );
});
