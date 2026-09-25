"use client";

import { BrandWordmark } from "@/components/brand-wordmark";
import { useEffect, useState } from "react";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"] as const;

export default function ClassBoardPinGate() {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(value: string) {
    if (pending || value.length !== 6) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/class-board/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: value })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setPin("");
        setError(payload?.error?.message ?? "That PIN is not right.");
        setPending(false);
        return;
      }
      window.location.assign("/class-board");
    } catch {
      setPin("");
      setError("Could not check that PIN.");
      setPending(false);
    }
  }

  function press(key: (typeof KEYS)[number]) {
    if (pending) return;
    if (key === "clear") {
      setPin("");
      setError(null);
      return;
    }
    if (key === "back") {
      setPin((current) => current.slice(0, -1));
      return;
    }
    const next = pin.length >= 6 ? pin : `${pin}${key}`;
    setPin(next);
    if (next.length === 6) void submit(next);
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (/^\d$/.test(event.key)) press(event.key as (typeof KEYS)[number]);
      if (event.key === "Backspace") press("back");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-6 py-10 text-foreground">
      <BrandWordmark className="h-12 w-auto object-contain" priority />
      <h1 className="mt-6 font-display text-5xl font-extrabold uppercase italic leading-none tracking-tight">
        Class Board
      </h1>
      <p className="mt-3 text-center text-lg text-[var(--ink-text)]">Enter the 6-digit PIN.</p>
      <p className="mt-6 font-mono-broadcast text-4xl tabular-nums tracking-[0.4em] text-foreground" aria-live="polite">
        {pin.padEnd(6, "·")}
      </p>
      <div className="mt-8 grid w-full max-w-sm grid-cols-3 gap-3">
        {KEYS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => press(key)}
            disabled={pending}
            className="h-16 rounded-2xl border border-border bg-card font-display text-2xl font-bold uppercase tracking-wide text-foreground transition-transform active:scale-[0.96] disabled:opacity-60"
          >
            {key === "clear" ? "Clear" : key === "back" ? "Delete" : key}
          </button>
        ))}
      </div>
      {error ? <p className="mt-6 text-center text-lg text-[var(--brand-red)]">{error}</p> : null}
    </main>
  );
}
