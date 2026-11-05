import { ArrowLeft } from "lucide-react";
import { BrandWordmark } from "@/components/brand-wordmark";
import { buttonVariants } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { mainAppOrigin } from "@/src/lib/hosts";
import { cn } from "@/src/lib/utils";

type TeleprompterShellProps = {
  children: React.ReactNode;
};

/**
 * Minimal chrome for teleprompter.infocuspaly.com: the wordmark, the app's name and one way back
 * to the Portal, no main app sidebar. The header and the page share one gutter (16px, 24px from
 * md), so the wordmark, the page plate and the workspace line up. The header clears the top
 * safe area (home-screen and iPad use), and `--app-header-h` matches its height so the page's
 * sticky rail and toolbar sit right under it. Works with no session (studio kiosk).
 */
export function TeleprompterShell({ children }: TeleprompterShellProps) {
  const dashboardUrl = `${mainAppOrigin().replace(/\/$/, "")}/dashboard`;

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex min-h-screen flex-col bg-background text-foreground [--app-header-h:calc(3rem+env(safe-area-inset-top,0px))]">
        <header className="sticky top-0 z-40 flex h-[var(--app-header-h)] shrink-0 items-center gap-3 border-b border-border bg-[var(--ink)] px-4 pt-[env(safe-area-inset-top,0px)] md:px-6">
          <BrandWordmark className="h-6 w-auto object-contain" width={140} height={48} priority />
          <span aria-hidden className="h-5 w-px shrink-0 bg-border" />
          <span className="min-w-0 truncate text-[13px] font-semibold text-foreground">Teleprompter</span>
          <a
            href={dashboardUrl}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "ml-auto shrink-0 max-sm:size-10 max-sm:px-0")}
          >
            <ArrowLeft aria-hidden />
            <span className="max-sm:hidden">Back to Portal</span>
            <span className="sr-only sm:hidden">Back to InFocus Portal</span>
          </a>
        </header>

        <main className="flex min-h-0 flex-1 flex-col px-4 py-4 md:px-6 md:py-6">{children}</main>
      </div>
    </TooltipProvider>
  );
}
