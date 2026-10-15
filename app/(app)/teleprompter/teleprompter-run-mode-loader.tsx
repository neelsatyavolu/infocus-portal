"use client";

import { useCallback, useEffect, useState, type ComponentType } from "react";
import { X } from "lucide-react";
import type { TeleprompterDoc } from "./teleprompter-model";
import { BAR_BUTTON_CLASS, BAR_CLASS, RUN_MODE_ROOT_CLASS } from "./teleprompter-run-mode-chrome";

export type RunModeProps = {
  doc: TeleprompterDoc;
  docs: TeleprompterDoc[];
  onSelectDoc: (docId: string) => void;
  onClose: () => void;
};

type RunModeComponent = ComponentType<RunModeProps>;

const importRunMode = () => import("./teleprompter-run-mode");

/**
 * Run mode's code loads on demand: preloaded when the browser is idle (so the first Run is
 * instant), or when Run is pressed. A failed load (offline kiosk, a tab opened before a deploy)
 * is reported instead of thrown, so the page never ends up on an error screen.
 */
export function useRunModeModule() {
  const [component, setComponent] = useState<RunModeComponent | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    return importRunMode().then(
      (mod) => setComponent(() => mod.default),
      () => setFailed(true)
    );
  }, []);

  return { component, failed, load };
}

const PANEL_BUTTON_CLASS =
  "inline-flex h-9 items-center rounded-md border border-[#2B302B] px-4 text-sm font-medium text-[#DCE2DE] transition-colors hover:bg-[#252925] hover:text-soft-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2BB36E]";

/**
 * What shows while run mode's code is still loading (or failed to load): the same dark stage and
 * light bar, with Exit and Esc always working.
 */
export function RunModeLoading({ failed, onRetry, onClose }: { failed: boolean; onRetry: () => void; onClose: () => void }) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className={RUN_MODE_ROOT_CLASS}>
      <header className={`${BAR_CLASS} justify-end`}>
        <button type="button" className={BAR_BUTTON_CLASS} onClick={onClose} aria-label="Exit teleprompter">
          <X className="h-4 w-4" />
        </button>
      </header>
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        {failed ? (
          <div role="alert" className="max-w-sm space-y-4 text-center">
            <div className="space-y-1.5">
              <p className="text-base font-semibold">Couldn&apos;t open run mode</p>
              <p className="text-sm text-[#DCE2DE]">Check the connection and try again. If it keeps failing, reload the page.</p>
            </div>
            <div className="flex justify-center gap-2">
              <button type="button" className={PANEL_BUTTON_CLASS} onClick={onRetry}>
                Try again
              </button>
              <button type="button" className={PANEL_BUTTON_CLASS} onClick={onClose}>
                Exit
              </button>
            </div>
          </div>
        ) : (
          <p role="status" className="sr-only">
            Opening run mode…
          </p>
        )}
      </div>
    </div>
  );
}
