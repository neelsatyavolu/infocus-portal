/*
 * Run mode's top-bar look, shared by run mode and its loading screen (kept out of
 * teleprompter-run-mode.tsx so the loading screen doesn't pull that chunk in). Always dark /
 * light-grey regardless of theme, so literal hexes.
 */

/**
 * Top-bar buttons, 16px icons: 36px below lg and 28px from lg up (as before the redesign), and
 * 36px on touch screens at any width. Never taller than the 36px bar.
 */
export const BAR_BUTTON_CLASS =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[#0F110F] transition-colors hover:bg-black/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B6E3E] lg:h-7 lg:w-7 lg:pointer-coarse:h-9 lg:pointer-coarse:w-9";

/** Native selects on the bar: one height and style (28px, 32px on touch screens), inside the 36px bar. */
export const BAR_SELECT_CLASS =
  "h-7 min-w-0 rounded-md border border-[#b5beb8] bg-white px-1.5 text-[13px] font-medium text-[#0F110F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B6E3E] disabled:opacity-50 pointer-coarse:h-8";

/** The bar itself: one 36px row on every device, as before the redesign. */
export const BAR_CLASS =
  "relative z-20 flex h-9 shrink-0 items-center gap-2 border-b border-[#c5ccc8] bg-[#DCE2DE] px-2 text-[#0F110F]";

/** The settings panel opens 8px under the 36px bar. */
export const BAR_PANEL_TOP_CLASS = "top-[calc(2.25rem+8px)]";

/** The run-mode surface. */
export const RUN_MODE_ROOT_CLASS =
  "fixed inset-0 z-[130] flex flex-col bg-[#0F110F] font-sans text-soft-white antialiased [color-scheme:dark]";
