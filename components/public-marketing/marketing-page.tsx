import type { ReactNode } from "react";
import { MarketingHeader } from "@/components/marketing-header";
import { MarketingFooter } from "@/components/public-marketing/marketing-footer";
import { PUBLIC_CONTAINER, type MarketingActive } from "@/components/public-marketing/shared";
import { cn } from "@/src/lib/utils";

/**
 * The frame for every public page: header, one content column, footer. Pages render no outer
 * max-width of their own, so the wordmark, the page plate, every grid and the footer share one
 * left and one right edge. The footer sits at the bottom of short pages.
 */
export function MarketingPage({ active, children }: { active?: MarketingActive; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <MarketingHeader active={active} />
      <main className={cn(PUBLIC_CONTAINER, "flex-1 pb-10 pt-6 md:pb-12 md:pt-8")}>{children}</main>
      <MarketingFooter active={active} />
    </div>
  );
}
