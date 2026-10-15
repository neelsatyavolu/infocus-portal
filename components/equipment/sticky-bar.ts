/**
 * Puts the kit StickyActionBar on the top edge of Equipment's phone tab bar. That tab bar is
 * 3.75rem plus the safe-area inset, but the kit bar stops at `--phone-tabbar-h` alone and pads its
 * own bottom for the inset, which the tab bar then covers, so on notched phones the buttons sat on
 * the tab bar's border. This clears the whole tab bar and pads evenly (12px above and below).
 * It also makes the bar's buttons 40px touch targets: the kit bar holds its children to 36px
 * (`*:h-9`), and `.cls button` outranks that. Every call site hides the bar from lg.
 */
export const ABOVE_PHONE_TABBAR = "bottom-[calc(var(--phone-tabbar-h,0px)+env(safe-area-inset-bottom))] pb-3 [&_button]:h-10";
