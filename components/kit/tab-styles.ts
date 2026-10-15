import { cn } from "@/src/lib/utils";

/**
 * The underline tab look shared by HubTabs (route tabs from the shell) and ViewTabs (in-page
 * views): a hairline under the row, 40px tabs, a 2px green underline on the active one.
 */
export const TAB_LIST_CLASS =
  "flex min-w-0 gap-6 overflow-x-auto overscroll-x-contain border-b border-border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

export function tabItemClass(active: boolean, size: "md" | "lg" = "md") {
  return cn(
    "-mb-px inline-flex shrink-0 items-center gap-2 border-b-2 px-0.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
    size === "lg" ? "h-12" : "h-10",
    active
      ? "border-[var(--brand-green)] font-medium text-foreground"
      : "border-transparent text-muted-foreground hover:text-foreground"
  );
}
