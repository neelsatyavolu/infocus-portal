import Image from "next/image";
import { ArrowLeft } from "lucide-react";
import { mainAppOrigin } from "@/src/lib/hosts";

type TeleprompterShellProps = {
  children: React.ReactNode;
};

/**
 * Minimal chrome for teleprompter.infocuspaly.com — full-bleed editor with a
 * single way back to the packages dashboard. No main app sidebar.
 */
export function TeleprompterShell({ children }: TeleprompterShellProps) {
  const dashboardUrl = `${mainAppOrigin().replace(/\/$/, "")}/dashboard`;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="sticky top-0 z-40 flex h-12 shrink-0 items-center gap-3 border-b border-border bg-[var(--ink)] px-3 sm:px-4">
        <a
          href={dashboardUrl}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] font-medium text-muted-foreground transition hover:bg-card hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Dashboard</span>
        </a>

        <div className="h-5 w-px bg-border" />

        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Image
            src="/favicon/infocus-wordmark.png"
            alt="InFocus Portal"
            width={140}
            height={48}
            className="h-6 w-auto object-contain"
            priority
          />
          <span className="hidden truncate text-[13px] font-semibold text-foreground sm:inline">
            Teleprompter
          </span>
        </div>

        <a
          href={dashboardUrl}
          className="rounded-md border border-border bg-secondary px-2.5 py-1 text-xs font-semibold text-foreground transition hover:bg-accent"
        >
          Back to InFocus Portal
        </a>
      </header>

      <main className="flex min-h-0 flex-1 flex-col">{children}</main>
    </div>
  );
}
