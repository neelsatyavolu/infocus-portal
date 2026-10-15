/**
 * Control heights for the Announcements hub, so every control in one row matches.
 * 40px on phones and on touch screens (iPads included, DESIGN.md §10 touch targets),
 * otherwise 36px in toolbars and 32px in section and card rows.
 * `pointer-coarse:` is emitted after the breakpoints, so it wins over `md:` on touch screens.
 */
export const TOOLBAR_CONTROL = "h-10 md:h-9 pointer-coarse:h-10";
export const ROW_CONTROL = "h-10 md:h-8 pointer-coarse:h-10";

/**
 * The PA editor with its rail beside it. The rail starts at xl, so the editor keeps the width on
 * tablets and small laptops (the full sidebar is open from lg); below xl there is no rail and the
 * page header says who is on the mic.
 */
export const HUB_RAIL_GRID = "grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_17rem]";
/** The PA rail's sticky offset, below the app header. */
export const HUB_RAIL_STICKY = "xl:sticky xl:top-[calc(var(--app-header-h,0px)+1rem)]";

/**
 * The feed with its Days rail. Posts are short, so the rail comes in from lg and fills the width a
 * capped post line leaves; from xl it is as wide as the PA rail, so the hub's right column matches.
 */
export const FEED_RAIL_GRID =
  "grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_15rem] xl:grid-cols-[minmax(0,1fr)_17rem]";
export const FEED_RAIL_STICKY = "lg:sticky lg:top-[calc(var(--app-header-h,0px)+1rem)]";

/**
 * A 44px-tall hit area on touch screens for small text links in a line (card meta, header lines),
 * without changing the line's layout (DESIGN.md §10 touch targets).
 */
export const COARSE_HIT_AREA = "relative pointer-coarse:after:absolute pointer-coarse:after:-inset-x-1 pointer-coarse:after:-inset-y-3";
