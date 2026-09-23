"use client";

import { useEffect, useState } from "react";

export function ClassBoardPinCard() {
  const [pin, setPin] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const response = await fetch("/api/class-board/pin", { cache: "no-store" });
      if (!response.ok) return;
      const payload = await response.json();
      if (cancelled) return;
      setPin(typeof payload?.data?.pin === "string" ? payload.data.pin : null);
      setVisible(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function createPin() {
    if (pin && !window.confirm("Replace the current Class Board PIN? Devices using the old one will need the new PIN.")) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/class-board/pin", { method: "POST" });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error?.message ?? "Could not create a PIN.");
      }
      setPin(typeof payload?.data?.pin === "string" ? payload.data.pin : null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create a PIN.");
    } finally {
      setBusy(false);
    }
  }

  if (!visible) return null;

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <p className="text-sm font-semibold text-foreground">Class Board PIN</p>
      <p className="text-xs text-muted-foreground">
        Opens /class-board only. It does not sign anyone into Portal.
      </p>
      <p className="font-mono-broadcast text-3xl tabular-nums tracking-[0.28em] text-foreground">
        {pin ? `${pin.slice(0, 3)} ${pin.slice(3)}` : "Not set"}
      </p>
      <button
        type="button"
        onClick={() => void createPin()}
        disabled={busy}
        className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
      >
        {busy ? "Saving..." : pin ? "New PIN" : "Create PIN"}
      </button>
      {error ? <p className="text-xs text-amber-300">{error}</p> : null}
    </section>
  );
}
