"use client";

import { BrandWordmark } from "@/components/brand-wordmark";
import { useEffect, useRef, useState } from "react";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"] as const;

export default function ClassBoardPinGate() {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const pinRef = useRef("");
  const pendingRef = useRef(false);

  function resetPin() {
    pinRef.current = "";
    pendingRef.current = false;
    setPin("");
    setPending(false);
  }

  async function submit(value: string) {
    if (pendingRef.current || value.length !== 6) return;
    pendingRef.current = true;
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
        resetPin();
        setError(payload?.error?.message ?? "That PIN is not right.");
        return;
      }
      window.location.assign("/class-board");
    } catch {
      resetPin();
      setError("Could not check that PIN.");
    }
  }

  function press(key: (typeof KEYS)[number]) {
    if (pendingRef.current) return;
    if (key === "clear") {
      pinRef.current = "";
      setPin("");
      setError(null);
      return;
    }
    if (key === "back") {
      const next = pinRef.current.slice(0, -1);
      pinRef.current = next;
      setPin(next);
      return;
    }
    if (pinRef.current.length >= 6) return;
    const next = `${pinRef.current}${key}`;
    pinRef.current = next;
    setPin(next);
    if (next.length === 6) void submit(next);
  }

  const pressRef = useRef(press);
  pressRef.current = press;

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("input, textarea, select, [contenteditable='true']")) return;
      if (/^\d$/.test(event.key)) {
        event.preventDefault();
        pressRef.current(event.key as (typeof KEYS)[number]);
      } else if (event.key === "Backspace") {
        event.preventDefault();
        pressRef.current("back");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-6 py-10 text-foreground">
      <BrandWordmark className="h-12 w-auto object-contain" priority />
      <h1 className="mt-6 text-4xl font-semibold leading-none tracking-tight">
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
            className="h-16 rounded-md border border-border bg-card text-2xl font-semibold text-foreground transition-transform active:scale-[0.96] disabled:opacity-60"
          >
            {key === "clear" ? "Clear" : key === "back" ? "Delete" : key}
          </button>
        ))}
      </div>
      {error ? <p className="mt-6 text-center text-lg text-danger">{error}</p> : null}
    </main>
  );
}
