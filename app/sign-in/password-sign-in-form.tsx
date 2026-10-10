"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Super admin only (src/server/password-sign-in.ts), so it stays a quiet link until opened. */
export function PasswordSignInForm({ returnTo }: { returnTo: string }) {
  const [open, setOpen] = useState(false);
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
      window.location.assign(payload.data.returnTo);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign you in. Please try again.");
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="self-start text-sm text-muted-foreground underline underline-offset-4"
        onClick={() => setOpen(true)}>Admin password sign-in</button>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <label htmlFor="sign-in-username" className="block text-sm font-medium">Username</label>
      <Input id="sign-in-username" name="username" type="text" autoComplete="username" autoCapitalize="none" spellCheck={false}
        required maxLength={64} autoFocus value={username} disabled={busy} onChange={(event) => setUsername(event.target.value)} />
      <label htmlFor="sign-in-password" className="block text-sm font-medium">Password</label>
      <Input id="sign-in-password" name="password" type="password" autoComplete="current-password"
        required maxLength={128} value={password} disabled={busy} onChange={(event) => setPassword(event.target.value)} />
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      <Button type="submit" variant="outline" className="h-11 w-full" disabled={busy}>
        {busy ? "Signing in…" : "Sign in with password"}
      </Button>
    </form>
  );
}
