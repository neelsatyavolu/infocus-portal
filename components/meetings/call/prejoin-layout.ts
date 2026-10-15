/**
 * Pre-join geometry, shared by the bar, the page and its loading skeleton so the logo lines up
 * with the preview's left edge and the avatar with the join column's right edge.
 */
export const PREJOIN_CONTAINER =
  "mx-auto w-full max-w-[1080px] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] md:px-6";

/**
 * Phones stack header plate → preview → actions. From 768px: preview on the left (3fr), the
 * header plate and actions on the right (2fr), tops aligned.
 */
export const PREJOIN_GRID =
  "grid gap-4 [grid-template-areas:'head'_'preview'_'actions'] md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] md:grid-rows-[auto_1fr] md:gap-x-8 md:gap-y-5 md:[grid-template-areas:'preview_head'_'preview_actions']";

export const PREJOIN_AREA = {
  head: "[grid-area:head]",
  preview: "[grid-area:preview]",
  actions: "[grid-area:actions]"
} as const;
