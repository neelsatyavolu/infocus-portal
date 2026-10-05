"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SettingsRow } from "@/components/settings-layout";

export type AccessPin = {
  pin: string | null;
  /** False until the GET succeeds; the endpoint decides who may see the PIN. */
  visible: boolean;
  busy: boolean;
  error: string | null;
  renew: () => Promise<void>;
};

/** Loads and replaces a kiosk PIN (Class Board, livestream dashboard). */
export function useAccessPin(url: string, replaceConfirm: string): AccessPin {
  const [pin, setPin] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json();
        if (cancelled) return;
        setPin(typeof payload?.data?.pin === "string" ? payload.data.pin : null);
        setVisible(true);
      } catch {
        // Leave the row hidden if it can't load.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  async function renew() {
    if (pin && !window.confirm(replaceConfirm)) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(url, { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? "Couldn't create a PIN.");
      setPin(typeof payload?.data?.pin === "string" ? payload.data.pin : null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't create a PIN.");
    } finally {
      setBusy(false);
    }
  }

  return { pin, visible, busy, error, renew };
}

export function PinRow({ title, description, state }: { title: string; description: string; state: AccessPin }) {
  if (!state.visible) return null;

  return (
    <SettingsRow
      title={title}
      description={
        <>
          {description}
          {state.error ? (
            <span className="mt-1 flex items-center gap-1.5 text-danger">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {state.error}
            </span>
          ) : null}
        </>
      }
    >
      <span
        className={
          state.pin
            ? "font-mono-broadcast text-xl tabular-nums tracking-[0.24em] text-foreground"
            : "text-sm text-muted-foreground"
        }
      >
        {state.pin ? `${state.pin.slice(0, 3)} ${state.pin.slice(3)}` : "Not set"}
      </span>
      <Button type="button" variant="outline" size="sm" onClick={() => void state.renew()} disabled={state.busy}>
        {state.busy ? "Saving…" : state.pin ? "New PIN" : "Create PIN"}
      </Button>
    </SettingsRow>
  );
}
