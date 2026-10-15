"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { Alert } from "@/components/kit/alert";
import { Field } from "@/components/kit/field";
import { ENTRY_CONTROL, ENTRY_QUIET_CONTROL } from "@/components/public-entry/entry-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/src/lib/utils";

const RESEND_WAIT_MS = 60_000;

export type EmailSignInStep = "email" | "code";

function formatWait(ms: number) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * Email-code sign-in: one form for both steps (Enter sends the code, then Enter verifies).
 * The email input stays mounted through the code step so autofill and the typed address survive.
 * `primary` makes "Sign in with email" the filled button (when Google isn't offered).
 */
export function EmailSignInForm({
  returnTo,
  primary = true,
  onStepChange
}: {
  returnTo: string;
  primary?: boolean;
  onStepChange?: (step: EmailSignInStep) => void;
}) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState<"send" | "verify" | null>(null);
  const [error, setError] = useState("");
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    onStepChange?.(codeSent ? "code" : "email");
  }, [codeSent, onStepChange]);

  // Tick once a second only while the resend wait is running.
  useEffect(() => {
    if (!codeSent) return;
    const timer = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= resendAt) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [codeSent, resendAt]);

  const resendWait = Math.max(0, resendAt - now);

  async function sendCode() {
    setBusy("send");
    setError("");
    try {
      const response = await fetch("/api/auth/email/request", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || "Could not send your code. Please try again.");
      setCodeSent(true);
      setCode("");
      const sentAt = Date.now();
      setNow(sentAt);
      setResendAt(sentAt + RESEND_WAIT_MS);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send your code. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!codeSent) return sendCode();
    setBusy("verify");
    setError("");
    try {
      const response = await fetch("/api/auth/email/verify", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, code, returnTo })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || "Could not sign you in. Please try again.");
      // Busy stays set ("Signing in…") until the browser navigates.
      window.location.assign(payload.data.returnTo);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign you in. Please try again.");
      setBusy(null);
    }
  }

  /** Back to the email step, with focus on the address (the button that was pressed goes away). */
  function changeEmail() {
    flushSync(() => {
      setCodeSent(false);
      setCode("");
      setError("");
    });
    emailRef.current?.focus();
  }

  function resend() {
    if (Date.now() < resendAt) {
      setError("Please wait a minute before requesting another code.");
      return;
    }
    void sendCode();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className={cn(codeSent && "hidden")}>
        <Field label="Email address" htmlFor="sign-in-email">
          <Input ref={emailRef} id="sign-in-email" type="email" autoComplete="email" required maxLength={254} className={ENTRY_CONTROL}
            value={email} disabled={Boolean(busy) || codeSent} onChange={(event) => setEmail(event.target.value)} />
        </Field>
      </div>

      {codeSent ? (
        <>
          <div className="flex min-w-0 items-center justify-between gap-3">
            <p className="min-w-0 truncate text-sm font-medium text-foreground" title={email}>{email}</p>
            <Button type="button" variant="ghost" className={cn(ENTRY_QUIET_CONTROL, "-mr-3 shrink-0")} disabled={Boolean(busy)}
              onClick={changeEmail}>
              Use a different email
            </Button>
          </div>
          <p role="status" className="text-[13px] leading-snug text-muted-foreground">
            If this email has access to InFocus Portal, we’ve sent it a six-digit code. Check your inbox and spam. The code expires in 10 minutes.
          </p>
          <Field label="Sign-in code" htmlFor="sign-in-code">
            <Input id="sign-in-code" type="text" inputMode="numeric" autoComplete="one-time-code"
              pattern="[0-9]{6,32}" maxLength={32} required autoFocus value={code} disabled={Boolean(busy)}
              className={cn(ENTRY_CONTROL, "font-mono-broadcast text-lg tracking-[0.3em] tabular-nums md:text-base")}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} />
          </Field>
        </>
      ) : null}

      {error ? <Alert tone="danger" compact>{error}</Alert> : null}

      <Button type="submit" variant={codeSent || primary ? "default" : "outline"} className={cn(ENTRY_CONTROL, "w-full")}
        disabled={Boolean(busy)}>
        {busy ? (busy === "verify" ? "Signing in…" : "Sending code…") : (codeSent ? "Sign in" : "Sign in with email")}
      </Button>

      {codeSent ? (
        <Button type="button" variant="ghost" className={cn(ENTRY_QUIET_CONTROL, "-ml-3")}
          disabled={Boolean(busy) || resendWait > 0} onClick={resend}>
          {resendWait > 0 ? (
            <>Resend in <span className="font-mono-broadcast tabular-nums">{formatWait(resendWait)}</span></>
          ) : "Resend code"}
        </Button>
      ) : null}
    </form>
  );
}
