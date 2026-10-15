"use client";

import { useEffect, useState } from "react";
import { Fingerprint } from "lucide-react";
import { InlineError } from "@/components/kit/alert";
import { Panel, PanelSection } from "@/components/kit/panel";
import { LoadingRegion, Skeleton } from "@/components/kit/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FormStatus } from "@/components/equipment/equipment-api";
import { formatShortDate } from "@/components/equipment/equipment-status";
import { StatusAlert } from "@/components/equipment/status-alert";
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

/**
 * "Sign in with Touch ID / passkey" for the manager dashboard sign-in page. `className` sizes the
 * button to match the page's other sign-in buttons (optional; h-9 outline by default).
 */
export function EquipmentPasskeyButton({
  purpose,
  onSuccess,
  className
}: {
  purpose: "login";
  onSuccess?: () => void;
  className?: string;
}) {
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
      <Button type="button" variant="outline" disabled={busy} onClick={() => void authenticate()} className={className}>
        <Fingerprint className="h-4 w-4" />
        {busy ? "Waiting for device…" : "Sign in with Touch ID / passkey"}
      </Button>
      {error ? <InlineError>{error}</InlineError> : null}
    </div>
  );
}

type Passkey = { id: string; label: string; createdAt: string };

/** Manage → Settings: register and remove the signed-in manager's passkeys. */
export function EquipmentPasskeySettings() {
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [loaded, setLoaded] = useState(false);
  // A failed list shows in place of the list (never as "No passkeys yet."), with Try again.
  const [listError, setListError] = useState<string | null>(null);
  const [listAttempt, setListAttempt] = useState(0);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<FormStatus>(null);
  useEffect(() => {
    let active = true;
    passkeyRequest<Passkey[]>({ action: "list" })
      .then((rows) => {
        if (active) setPasskeys(rows);
      })
      .catch((error) => {
        if (active) setListError(errorMessage(error));
      })
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [listAttempt]);
  function retryList() {
    setLoaded(false);
    setListError(null);
    setListAttempt((value) => value + 1);
  }
  async function register() {
    setBusy(true);
    setMessage(null);
    try {
      const { startRegistration, browserSupportsWebAuthn } = await import("@simplewebauthn/browser");
      if (!browserSupportsWebAuthn()) throw new Error("This browser does not support passkeys.");
      const optionsJSON = await passkeyRequest<PublicKeyCredentialCreationOptionsJSON>({ action: "register-options" });
      const response = await startRegistration({ optionsJSON });
      await passkeyRequest({ action: "register", response, label: label.trim() || "My passkey" });
      setPasskeys(await passkeyRequest<Passkey[]>({ action: "list" }));
      setListError(null);
      setLabel("");
      setMessage({ type: "success", text: "Passkey registered. You can now sign in to the manager dashboard with it." });
    } catch (error) {
      setMessage({ type: "error", text: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: string) {
    setBusy(true);
    setMessage(null);
    try {
      await passkeyRequest({ action: "remove", id });
      setPasskeys((rows) => rows.filter((row) => row.id !== id));
      setMessage({ type: "success", text: "Passkey removed from your account." });
    } catch (error) {
      setMessage({ type: "error", text: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }
  return (
    <Panel
      divided
      title="Touch ID & passkeys"
      titleAs="h2"
      description="Register a passkey to sign in to the manager dashboard. Checkout uses its own one-hour Google sign-in."
    >
      <PanelSection title="Your passkeys">
        {!loaded ? (
          <LoadingRegion label="Loading passkeys">
            <Skeleton className="h-4 w-1/2" />
          </LoadingRegion>
        ) : listError ? (
          <StatusAlert
            status={{ type: "error", text: listError }}
            compact
            action={
              <Button type="button" variant="outline" size="sm" disabled={busy} onClick={retryList}>
                Try again
              </Button>
            }
          />
        ) : passkeys.length === 0 ? (
          <p className="text-sm text-muted-foreground">No passkeys yet.</p>
        ) : (
          <ul aria-label="Your passkeys" className="-my-2 divide-y divide-border">
            {passkeys.map((passkey) => (
              <li key={passkey.id} className="flex min-h-12 items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm text-foreground">{passkey.label}</p>
                  <p className="text-xs text-muted-foreground">Added {formatShortDate(passkey.createdAt)}</p>
                </div>
                <Button
                  type="button"
                  variant="destructive-quiet"
                  size="sm"
                  className="max-md:h-10"
                  aria-label={`Remove ${passkey.label}`}
                  disabled={busy}
                  onClick={() => void remove(passkey.id)}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
      </PanelSection>
      <PanelSection title="Add a passkey" grow>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="passkey-label">Device name (optional)</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="passkey-label"
                value={label}
                maxLength={80}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="My MacBook"
                disabled={busy}
                aria-describedby="passkey-help"
                className="h-10 sm:flex-1 md:h-9"
              />
              <Button type="button" disabled={busy} onClick={() => void register()} className="h-10 md:h-9">
                <Fingerprint className="h-4 w-4" />
                {busy ? "Please wait…" : "Register Touch ID / passkey"}
              </Button>
            </div>
            <p id="passkey-help" className="text-[13px] leading-snug text-muted-foreground">
              Your device handles Touch ID, Face ID, or its screen lock. Register on your own device or personal computer account; a
              shared computer account cannot identify individual managers by fingerprint.
            </p>
          </div>
          <StatusAlert status={message} compact />
        </div>
      </PanelSection>
    </Panel>
  );
}
