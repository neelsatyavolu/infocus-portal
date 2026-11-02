/**
 * Marks drawn over video (name pills, chips, the watch tile's plates) keep a flat black scrim and
 * Soft White text in both themes: video stays dark in Light mode, so theme tokens would vanish.
 */
export const OVERLAY_CHIP = "rounded-sm bg-black/60 text-[var(--soft-white)]";

/** Flat full-width plate over video (no gradients, DESIGN.md §13). */
export const OVERLAY_PLATE = "bg-black/75 text-[var(--soft-white)]";
