import { LockKeyhole } from "lucide-react";
import { Panel } from "@/components/kit/panel";
import { SectionLabel } from "@/components/kit/section";
import { StepList } from "@/components/kit/segment-nav";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/src/lib/utils";

const STEPS = [
  "Enter the student's name and email.",
  "Scan or search each code, then Add (Enter works). Up to 50 at once.",
  "Tick “I took an SD card” only when taking one.",
  "Submit once, and Lock when you leave."
].map((title) => ({ key: title, title }));

/** The locked station: why, the one way to unlock it, and how checkout works once it is open. */
export function CheckoutLockedPanel() {
  return (
    <Panel
      padding="none"
      aria-label="Checkout is locked"
      bodyClassName="grid divide-y divide-border lg:grid-cols-[3fr_2fr] lg:divide-x lg:divide-y-0"
    >
      <div className="flex min-w-0 flex-col items-start gap-4 p-4 md:p-5">
        <LockKeyhole aria-hidden className="h-10 w-10 text-muted-foreground" />
        <div className="space-y-1.5">
          <h2 className="text-lg font-semibold tracking-[-0.01em] text-foreground">Checkout is locked</h2>
          <p className="max-w-prose text-sm text-[var(--ink-text)]">
            An equipment manager or producer must sign in with their Portal Google account. Checkout locks automatically one hour
            after sign-in. This session is separate from the main Portal.
          </p>
        </div>
        {/* A full navigation: the Google sign-in starts on the server. */}
        <a href="/api/auth/google/start?equipment=1" className={cn(buttonVariants(), "h-10 max-sm:w-full md:h-9")}>
          Sign in with Google to unlock checkout
        </a>
      </div>
      <div className="min-w-0 space-y-3 p-4 md:p-5">
        <SectionLabel as="h3">How checkout works</SectionLabel>
        <StepList steps={STEPS} />
      </div>
    </Panel>
  );
}
