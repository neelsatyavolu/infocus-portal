"use client";

import { useEffect, useState } from "react";
import { Fingerprint } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser";

async function passkeyRequest<T>(body: Record<string, unknown>): Promise<T> {
  const response = await fetch("/api/equipment/public/passkeys", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message || "Passkey request failed.");
  return result.data as T;
}

function errorMessage(error: unknown) {
  if (error instanceof Error && (error.name === "NotAllowedError" || error.name === "AbortError")) {
    return "Passkey request cancelled or timed out. Try again, or use your usual sign-in.";
  }
  return error instanceof Error ? error.message : "Could not use passkey.";
}

export function EquipmentPasskeyButton({ purpose, onSuccess }: { purpose: "login"; onSuccess?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function authenticate() {
    setBusy(true);
    setError("");
    try {
      const { startAuthentication, browserSupportsWebAuthn } = await import("@simplewebauthn/browser");
      if (!browserSupportsWebAuthn()) throw new Error("This browser does not support passkeys. Use your usual sign-in.");
      const optionsJSON = await passkeyRequest<PublicKeyCredentialRequestOptionsJSON>({ action: "authenticate-options", purpose });
      const response = await startAuthentication({ optionsJSON });
      await passkeyRequest({ action: "authenticate", purpose, response });
      if (onSuccess) onSuccess();
      else window.location.assign("/equipment/manage");
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-2">
      <Button type="button" variant="outline" disabled={busy} onClick={() => void authenticate()}>
        <Fingerprint className="h-4 w-4" />
        {busy ? "Waiting for device…" : "Sign in with Touch ID / passkey"}
      </Button>
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}

type Passkey = { id: string; label: string; createdAt: string };
export function EquipmentPasskeySettings() {
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    passkeyRequest<Passkey[]>({ action: "list" }).then((rows) => {
      if (active) setPasskeys(rows);
    }).catch((error) => { if (active) setMessage(errorMessage(error)); });
    return () => { active = false; };
  }, []);
  async function register() {
    setBusy(true);
    setMessage("");
    try {
      const { startRegistration, browserSupportsWebAuthn } = await import("@simplewebauthn/browser");
      if (!browserSupportsWebAuthn()) throw new Error("This browser does not support passkeys.");
      const optionsJSON = await passkeyRequest<PublicKeyCredentialCreationOptionsJSON>({ action: "register-options" });
      const response = await startRegistration({ optionsJSON });
      await passkeyRequest({ action: "register", response, label: label.trim() || "My passkey" });
      setPasskeys(await passkeyRequest<Passkey[]>({ action: "list" }));
      setLabel("");
      setMessage("Passkey registered. You can now sign in to the manager dashboard with it.");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally { setBusy(false); }
  }
  async function remove(id: string) {
    setBusy(true);
    setMessage("");
    try {
      await passkeyRequest({ action: "remove", id });
      setPasskeys((rows) => rows.filter((row) => row.id !== id));
      setMessage("Passkey removed from your account.");
    } catch (error) { setMessage(errorMessage(error)); }
    finally { setBusy(false); }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Touch ID & passkeys</CardTitle>
        <CardDescription>Register a passkey for your manager account to sign in to the manager dashboard. Checkout uses a separate Google sign-in.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">Your device handles Touch ID, Face ID, or its screen lock. Register on your own device or personal computer account; a shared computer account cannot identify individual managers by fingerprint.</p>
        <div className="max-w-md space-y-2">
          <Label htmlFor="passkey-label">Device name (optional)</Label>
          <Input id="passkey-label" value={label} maxLength={80} onChange={(event) => setLabel(event.target.value)} placeholder="My MacBook" />
        </div>
        <Button type="button" disabled={busy} onClick={() => void register()}><Fingerprint className="h-4 w-4" />{busy ? "Please wait…" : "Register Touch ID / passkey"}</Button>
        {passkeys.map((passkey) => (
          <div key={passkey.id} className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
            <span className="min-w-0 break-words text-sm">{passkey.label}</span>
            <Button type="button" variant="destructive-quiet" size="sm" disabled={busy} onClick={() => void remove(passkey.id)}>Remove</Button>
          </div>
        ))}
        {message ? <p role="status" className="text-sm text-muted-foreground">{message}</p> : null}
      </CardContent>
    </Card>
  );
}
