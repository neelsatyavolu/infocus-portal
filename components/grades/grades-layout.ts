/**
 * Layout grids for the student Grades screen, shared by the real views and their skeletons so
 * nothing jumps when the grades arrive.
 */

/** The grade band's hairline grid: 2×2 from sm, four across only from xl (the sidebar takes 240px at lg). */
export const BAND_GRID_CLASS =
  "-mb-px -mr-px grid *:border-b *:border-r *:border-border *:p-4 sm:grid-cols-2 md:*:p-5 xl:grid-cols-[13rem_repeat(3,minmax(0,1fr))]";

/**
 * Overview below the band, one flat grid of three cards (DOM order Packages, Livestream &
 * portfolio, Participation, so the reading and focus order match what you see at every width):
 * - below xl: one column, every card full width (Livestream & portfolio puts its two parts side
 *   by side from md, so it is a short strip rather than a hollow half-width card);
 * - xl: Packages with Livestream & portfolio under it in the main column, Participation alone in a
 *   22rem rail beside them. Row 2 is 1fr, so a tall rail only ever adds space under the last card
 *   (never between Packages and Livestream & portfolio).
 * From xl every card is its own height (items-start + h-auto, since Panel is h-full), so a short
 * Packages list never stretches into a hollow card.
 */
export const OVERVIEW_GRID_CLASS =
  "grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_22rem] xl:grid-rows-[auto_1fr] xl:items-start";

export const OVERVIEW_PACKAGES_CLASS = "xl:col-start-1 xl:row-start-1 xl:h-auto";

/** The rail card follows the page while the main column scrolls, and scrolls itself if the window is short. */
export const OVERVIEW_PARTICIPATION_CLASS =
  "xl:col-start-2 xl:row-span-2 xl:row-start-1 xl:h-auto xl:sticky xl:top-[calc(var(--app-header-h,0px)+1rem)] xl:max-h-[calc(100dvh-var(--app-header-h,0px)-2rem)] xl:overflow-y-auto";

export const OVERVIEW_OTHER_CLASS = "xl:col-start-1 xl:row-start-2 xl:h-auto";

/** Livestream & portfolio's body: its two parts stacked on phones, side by side from md. */
export const OTHER_BODY_CLASS = "md:grid md:grid-cols-2";
export const OTHER_LIVESTREAM_CLASS = "pb-4 md:pb-0 md:pr-5";
export const OTHER_PORTFOLIO_CLASS = "border-t border-border pt-4 md:border-l md:border-t-0 md:pl-5 md:pt-0";

/** The package row grid. */
export const PACKAGE_ROW_CLASS =
  "grid grid-cols-2 items-start gap-x-4 gap-y-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_5.5rem_5.5rem] md:px-5";
