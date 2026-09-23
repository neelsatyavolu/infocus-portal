"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function EmailSignInForm({ returnTo }: { returnTo: string }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState<"send" | "verify" | null>(null);
  const [error, setError] = useState("");
  const [resendAt, setResendAt] = useState(0);

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
      setResendAt(Date.now() + 60_000);
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
      window.location.assign(payload.data.returnTo);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign you in. Please try again.");
      setBusy(null);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <label htmlFor="sign-in-email" className="block text-sm font-medium">Email address</label>
      <Input id="sign-in-email" type="email" autoComplete="email" required maxLength={254}
        value={email} disabled={Boolean(busy) || codeSent} onChange={(event) => setEmail(event.target.value)} />
      {codeSent ? (
        <>
          <p role="status" className="text-sm text-muted-foreground">
            If this email has access to InFocus Portal, we’ve sent a six-digit code. Check your inbox and spam folder. The code expires in 10 minutes.
          </p>
          <label htmlFor="sign-in-code" className="block text-sm font-medium">Sign-in code</label>
          <Input id="sign-in-code" type="text" inputMode="numeric" autoComplete="one-time-code"
            pattern="[0-9]{6}" maxLength={6} required autoFocus value={code} disabled={Boolean(busy)}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} />
        </>
      ) : null}
      {error ? <p role="alert" className="text-sm text-rose-200">{error}</p> : null}
      <Button type="submit" className="h-11 w-full" disabled={Boolean(busy)}>
        {busy ? (busy === "verify" ? "Signing in…" : "Sending code…") : (codeSent ? "Sign in" : "Sign in with email")}
      </Button>
      {codeSent ? (
        <div className="flex flex-wrap gap-3 text-sm">
          <button type="button" className="text-muted-foreground underline underline-offset-4 disabled:opacity-50" disabled={Boolean(busy)}
            onClick={() => {
              if (Date.now() < resendAt) { setError("Please wait a minute before requesting another code."); return; }
              void sendCode();
            }}>Resend code</button>
          <button type="button" className="text-muted-foreground underline underline-offset-4 disabled:opacity-50" disabled={Boolean(busy)}
            onClick={() => { setCodeSent(false); setCode(""); setError(""); }}>Use a different email</button>
        </div>
      ) : null}
    </form>
  );
}
