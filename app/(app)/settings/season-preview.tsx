"use client";

import { createContext, useContext, type ReactNode } from "react";

const SeasonPreviewContext = createContext(false);

/** Whether the signed-in person (not a View as target) may preview seasonal themes. */
export function SeasonPreviewProvider({ canPreview, children }: { canPreview: boolean; children: ReactNode }) {
  return <SeasonPreviewContext.Provider value={canPreview}>{children}</SeasonPreviewContext.Provider>;
}

export function useCanPreviewSeasons(): boolean {
  return useContext(SeasonPreviewContext);
}
