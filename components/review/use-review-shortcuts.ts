"use client";

import { useEffect, useRef, type RefObject } from "react";
import { isTypingTarget } from "@/components/kit/hotkeys";
import { overlayOpen, reviewShortcutForKey, SEEK_STEP_SECONDS, shouldHandleReviewShortcut } from "@/components/review/review-hotkeys";
import type { ReviewPlayback } from "@/components/review/use-review-playback";
import type { ReviewCommentsState } from "@/components/review/use-review-comments";

type ShortcutOptions = {
  /** The review page: keys other than Space only run while focus is in it (or nowhere), not in the app's sidebar. */
  rootRef: RefObject<HTMLElement | null>;
  isImageReview: boolean;
  hasVideo: boolean;
  allowComment: boolean;
  /** The Transcript tab is showing (C switches back to Timeline before focusing the composer). */
  transcriptOpen: boolean;
  onOpenTimeline: () => void;
  composerRef: RefObject<HTMLTextAreaElement | null>;
  comments: Pick<ReviewCommentsState, "editingCommentId" | "replyingTo" | "cancelEdit" | "closeReply">;
  playback: Pick<ReviewPlayback, "togglePlayback" | "seekBy" | "stepFrame">;
};

/** Focus is in the review, or on something that wraps it (the page body, the app's main area). */
function focusInReview(root: HTMLElement | null, target: EventTarget | null) {
  if (!root || !(target instanceof Node)) {
    return true;
  }
  return root.contains(target) || target.contains(root);
}

/**
 * The review page's keys: Space play/pause, ←/→ 5 s, , and . one frame (paused), C to write a
 * comment, Esc to cancel an open reply or edit. Space works wherever focus is but a text field,
 * as it always has; listening in the capture phase means a focused button, link or tab is not
 * pressed as well (its own Space handling is skipped). See review-hotkeys.
 */
export function useReviewShortcuts(options: ShortcutOptions) {
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const { rootRef, isImageReview, hasVideo, allowComment, transcriptOpen, onOpenTimeline, composerRef, comments, playback } =
        latest.current;
      const shortcut = reviewShortcutForKey(event.key, isImageReview);
      if (!shortcut) return;
      if (shortcut === "cancel") {
        if (event.defaultPrevented || isTypingTarget(event.target) || overlayOpen()) return;
        if (comments.editingCommentId) {
          event.preventDefault();
          comments.cancelEdit();
        } else if (comments.replyingTo) {
          event.preventDefault();
          comments.closeReply();
        }
        return;
      }
      if (shortcut !== "toggle-play" && !focusInReview(rootRef.current, event.target)) return;
      if (!shouldHandleReviewShortcut(event, shortcut)) return;
      if (shortcut === "focus-composer") {
        if (!allowComment) return;
        event.preventDefault();
        if (transcriptOpen) {
          onOpenTimeline();
          window.requestAnimationFrame(() => composerRef.current?.focus());
        } else {
          composerRef.current?.focus();
        }
        return;
      }
      if (!hasVideo) return;
      event.preventDefault();
      if (shortcut === "toggle-play") void playback.togglePlayback();
      else if (shortcut === "seek-back") playback.seekBy(-SEEK_STEP_SECONDS);
      else if (shortcut === "seek-forward") playback.seekBy(SEEK_STEP_SECONDS);
      else if (shortcut === "frame-back") playback.stepFrame(-1);
      else if (shortcut === "frame-forward") playback.stepFrame(1);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);
}
