"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { PACKAGE_TRIGGER, type Anchor } from "@/components/master-calendar/calendar-model";

function caretAnchor(editor: HTMLElement): Anchor {
  const selection = window.getSelection();
  if (selection && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0).cloneRange();
    range.collapse(true);
    const rect = range.getClientRects()[0];
    if (rect) return { left: rect.left, top: rect.bottom + 6 };
  }
  const editorRect = editor.getBoundingClientRect();
  return { left: editorRect.left, top: editorRect.bottom + 6 };
}

/**
 * A rich-text notes field (contentEditable). It keeps the browser's own DOM while focused and
 * saves on blur. Typing "[package]" asks for the package picker at the caret; clicking a pill asks
 * to rename it. If it is removed while focused (a day switch without a blur), it still saves.
 */
export function EditableHtmlBlock({
  html,
  className,
  ariaLabel,
  placeholder,
  describedBy,
  onCommit,
  onPackageTrigger,
  onEditorFocus,
  onPillClick
}: {
  html: string;
  className: string;
  ariaLabel: string;
  placeholder?: string;
  describedBy?: string;
  onCommit: (html: string) => void | Promise<void>;
  onPackageTrigger?: (anchor: Anchor) => void;
  onEditorFocus?: (element: HTMLDivElement) => void;
  onPillClick?: (pillElement: HTMLElement, anchor: Anchor) => void;
}) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const latestHtmlRef = useRef(html);
  const committedHtmlRef = useRef(html);
  const isFocusedRef = useRef(false);
  const onCommitRef = useRef(onCommit);

  useEffect(() => {
    onCommitRef.current = onCommit;
  });

  useLayoutEffect(() => {
    latestHtmlRef.current = html;
    committedHtmlRef.current = html;
    if (!isFocusedRef.current && editorRef.current && editorRef.current.innerHTML !== html) {
      editorRef.current.innerHTML = html;
    }
  }, [html]);

  useEffect(() => {
    return () => {
      if (isFocusedRef.current && latestHtmlRef.current !== committedHtmlRef.current) {
        void onCommitRef.current(latestHtmlRef.current);
      }
    };
  }, []);

  return (
    <div
      ref={editorRef}
      role="textbox"
      aria-multiline="true"
      aria-label={ariaLabel}
      aria-describedby={describedBy}
      data-placeholder={placeholder}
      contentEditable
      suppressContentEditableWarning
      onFocus={(event) => {
        isFocusedRef.current = true;
        onEditorFocus?.(event.currentTarget);
      }}
      onClick={(event) => {
        const pill = (event.target as HTMLElement | null)?.closest?.(".package-pill") as HTMLElement | null;
        if (pill && onPillClick) {
          event.preventDefault();
          const rect = pill.getBoundingClientRect();
          onPillClick(pill, { left: rect.left, top: rect.bottom + 6 });
        }
      }}
      onInput={(event) => {
        const editor = event.currentTarget;
        latestHtmlRef.current = editor.innerHTML;
        if (!onPackageTrigger || !(editor.innerText ?? "").includes(PACKAGE_TRIGGER)) return;
        onPackageTrigger(caretAnchor(editor));
      }}
      onBlur={(event) => {
        isFocusedRef.current = false;
        latestHtmlRef.current = event.currentTarget.innerHTML;
        committedHtmlRef.current = latestHtmlRef.current;
        void onCommit(latestHtmlRef.current);
      }}
      className={className}
    />
  );
}
