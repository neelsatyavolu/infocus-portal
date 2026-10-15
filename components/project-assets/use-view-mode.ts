"use client";

import { useCallback, useLayoutEffect } from "react";
import type { ReadonlyURLSearchParams } from "next/navigation";
import { readRemembered, writeRemembered } from "@/components/kit/remembered-state";
import type { ViewMode } from "@/components/project-assets/types";

const VIEW_KEY = "projectAssets:view:v1";

function isViewMode(value: unknown): value is ViewMode {
  return value === "grid" || value === "list";
}

function browserStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Grid or List. The choice lives in the URL (`?view=`, so a shared link opens the same view) and
 * is remembered in this browser. Switching only rewrites the URL in place (no history entry): the
 * view doesn't change the server query, so there is no round trip. A visit without `?view=` gets
 * the remembered choice written into the URL before paint.
 */
export function useViewMode(searchParams: ReadonlyURLSearchParams, fallback: ViewMode) {
  const urlView = searchParams.get("view");
  const viewMode: ViewMode = isViewMode(urlView) ? urlView : fallback;

  const changeView = useCallback((next: ViewMode) => {
    writeRemembered(browserStorage(), VIEW_KEY, next);
    const params = new URLSearchParams(window.location.search);
    params.set("view", next);
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
  }, []);

  useLayoutEffect(() => {
    if (searchParams.get("view")) {
      return;
    }
    const remembered = readRemembered<ViewMode | null>(browserStorage(), VIEW_KEY, null, (value): value is ViewMode =>
      isViewMode(value)
    );
    if (remembered === "list") {
      changeView(remembered);
    }
  }, [changeView, searchParams]);

  return [viewMode, changeView] as const;
}
