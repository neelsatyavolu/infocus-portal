"use client";

import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Chrome } from "lucide-react";
import { EquipmentPasskeyButton } from "@/components/equipment-passkeys";
import { ENTRY_CONTROL, ENTRY_QUIET_CONTROL, EntryPanel } from "@/components/public-entry/entry-panel";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/src/lib/utils";
import { EmailSignInForm, type EmailSignInStep } from "./email-sign-in-form";
import { PasswordSignInForm } from "./password-sign-in-form";

function OrDivider() {
  return (
    <div className="flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground">
      <span aria-hidden className="h-px flex-1 bg-border" />
      or
      <span aria-hidden className="h-px flex-1 bg-border" />
    </div>
  );
}

/**
 * The sign-in panel, with one filled button per view:
 * - choose: Google (primary when set up) and the equipment passkey, then the email form.
 * - code: the email code step (Sign in is the primary), with Google and the passkey kept below
 *   as outline buttons, so someone whose code never arrives can still switch.
 * - password: the super admin form only (the email form stays mounted, hidden, so a typed
 *   address and a sent code survive a trip there and back).
 */
export function SignInMethods({
  googleHref,
  showPasskey,
  returnTo
}: {
  /** Google start URL, or null when Google OAuth isn't configured. */
  googleHref: string | null;
  showPasskey: boolean;
  returnTo: string;
}) {
  const [emailStep, setEmailStep] = useState<EmailSignInStep>("email");
  const [passwordOpen, setPasswordOpen] = useState(false);
  const adminLinkRef = useRef<HTMLButtonElement>(null);
  const step = passwordOpen ? "password" : emailStep === "code" ? "code" : "choose";
  const hasAlternatives = Boolean(googleHref) || showPasskey;

  function closePassword() {
    // Focus returns to the link that opened the form, instead of dropping to <body>.
    flushSync(() => setPasswordOpen(false));
    adminLinkRef.current?.focus();
  }

  const alternatives = (
    <>
      {googleHref ? (
        <a
          href={googleHref}
          className={cn(buttonVariants({ variant: step === "choose" ? "default" : "outline" }), ENTRY_CONTROL, "w-full")}
        >
          <Chrome aria-hidden className="h-4 w-4" />
          Continue with Google
        </a>
      ) : null}
      {showPasskey ? <EquipmentPasskeyButton purpose="login" className={cn(ENTRY_CONTROL, "w-full")} /> : null}
    </>
  );

  return (
    <EntryPanel
      id="sign-in"
      title={step === "code" ? "Check your email" : step === "password" ? "Admin password sign-in" : undefined}
      footer={
        <>
          <span>Your producer gives you access.</span>
          {step !== "password" ? (
            // Deliberately quieter than the other entry footers (ENTRY_FOOTER_CONTROL): it is for the
            // super admin only, so it reads as a link rather than inviting students to press it.
            <Button
              ref={adminLinkRef}
              type="button"
              variant="ghost"
              className={cn(ENTRY_QUIET_CONTROL, "-mr-3 ml-auto text-[13px] font-normal text-muted-foreground")}
              onClick={() => setPasswordOpen(true)}
            >
              Admin password sign-in
            </Button>
          ) : null}
        </>
      }
    >
      {step === "choose" && hasAlternatives ? (
        <>
          {alternatives}
          <OrDivider />
        </>
      ) : null}
      <div hidden={step === "password"}>
        <EmailSignInForm returnTo={returnTo} primary={!googleHref} onStepChange={setEmailStep} />
      </div>
      {step === "code" && hasAlternatives ? (
        <>
          <OrDivider />
          {alternatives}
        </>
      ) : null}
      {step === "password" ? <PasswordSignInForm returnTo={returnTo} onBack={closePassword} /> : null}
    </EntryPanel>
  );
}
