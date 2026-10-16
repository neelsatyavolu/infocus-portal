import { cn } from "@/src/lib/utils";

/**
 * The underline tab look shared by HubTabs (route tabs from the shell) and ViewTabs (in-page
 * views): a hairline under the row, 40px tabs, a 2px green underline on the active one.
 */
export const TAB_LIST_CLASS =
  "flex min-w-0 gap-6 overflow-x-auto overscroll-x-contain border-b border-border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

/** Tabs in the 56px top bar (hub tabs, or a page's own views): no hairline of their own. */
export const TOP_BAR_TAB_LIST_CLASS = cn(TAB_LIST_CLASS, "h-14 flex-1 gap-5 border-b-0 md:gap-6");

export type TabSize = "md" | "lg" | "bar";

export function tabItemClass(active: boolean, size: TabSize = "md") {
  return cn(
    "-mb-px inline-flex shrink-0 items-center gap-2 border-b-2 px-0.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
    size === "bar" ? "mb-0 h-14" : size === "lg" ? "h-12" : "h-10",
    active
      ? "border-[var(--brand-green)] font-medium text-foreground"
      : "border-transparent text-muted-foreground hover:text-foreground"
  );
}
