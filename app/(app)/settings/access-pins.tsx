"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SettingsRow } from "@/components/settings-layout";

export type AccessPin = {
  pin: string | null;
  /** False until the GET succeeds; the endpoint decides who may see the PIN. */
  visible: boolean;
  busy: boolean;
  error: string | null;
  /** Asked before replacing an existing PIN: "Question? Detail." */
  replaceConfirm: string;
  /** Throws on failure so a confirm dialog can stay open for a retry. */
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
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(url, { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error?.message ?? "Couldn't create a PIN.");
      setPin(typeof payload?.data?.pin === "string" ? payload.data.pin : null);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Couldn't create a PIN.";
      setError(message);
      toast.error(message);
      throw caught;
    } finally {
      setBusy(false);
    }
  }

  return { pin, visible, busy, error, replaceConfirm, renew };
}

export function PinRow({ title, description, state }: { title: string; description: string; state: AccessPin }) {
  const [confirmingReplace, setConfirmingReplace] = useState(false);
  if (!state.visible) return null;

  const questionEnd = state.replaceConfirm.indexOf("?") + 1;
  const replaceTitle = questionEnd > 0 ? state.replaceConfirm.slice(0, questionEnd) : state.replaceConfirm;
  const replaceDetail = questionEnd > 0 ? state.replaceConfirm.slice(questionEnd).trim() : "";

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
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => (state.pin ? setConfirmingReplace(true) : void state.renew().catch(() => undefined))}
        disabled={state.busy}
      >
        {state.busy ? "Saving…" : state.pin ? "New PIN" : "Create PIN"}
      </Button>
      <ConfirmDialog
        open={confirmingReplace}
        onOpenChange={setConfirmingReplace}
        title={replaceTitle}
        description={replaceDetail}
        confirmLabel="Replace PIN"
        cancelLabel="Cancel"
        tone="default"
        onConfirm={state.renew}
      />
    </SettingsRow>
  );
}
