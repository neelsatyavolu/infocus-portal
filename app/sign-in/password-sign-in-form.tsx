"use client";

import { useState, type FormEvent } from "react";
import { Alert } from "@/components/kit/alert";
import { Field } from "@/components/kit/field";
import { ENTRY_CONTROL, ENTRY_QUIET_CONTROL } from "@/components/public-entry/entry-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/src/lib/utils";

/**
 * Super admin only (src/server/password-sign-in.ts). The sign-in page opens it from the quiet
 * "Admin password sign-in" link in the panel footer; `onBack` returns to the other methods.
 */
export function PasswordSignInForm({ returnTo, onBack }: { returnTo: string; onBack?: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/password", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password, returnTo })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || "Could not sign you in. Please try again.");
      // Busy stays set ("Signing in…") until the browser navigates.
      window.location.assign(payload.data.returnTo);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign you in. Please try again.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Username" htmlFor="sign-in-username">
        <Input id="sign-in-username" name="username" type="text" autoComplete="username" autoCapitalize="none" spellCheck={false}
          required maxLength={64} autoFocus value={username} disabled={busy} className={ENTRY_CONTROL}
          onChange={(event) => setUsername(event.target.value)} />
      </Field>
      <Field label="Password" htmlFor="sign-in-password">
        <Input id="sign-in-password" name="password" type="password" autoComplete="current-password"
          required maxLength={128} value={password} disabled={busy} className={ENTRY_CONTROL}
          onChange={(event) => setPassword(event.target.value)} />
      </Field>
      {error ? <Alert tone="danger" compact>{error}</Alert> : null}
      <Button type="submit" className={cn(ENTRY_CONTROL, "w-full")} disabled={busy}>
        {busy ? "Signing in…" : "Sign in with password"}
      </Button>
      {onBack ? (
        <Button type="button" variant="ghost" className={cn(ENTRY_QUIET_CONTROL, "-ml-3")} disabled={busy} onClick={onBack}>
          Back to sign-in options
        </Button>
      ) : null}
    </form>
  );
}
