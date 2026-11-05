"use client";

import { useEffect, useState } from "react";
import { Alert, InlineError } from "@/components/kit/alert";
import { Spinner } from "@/components/kit/spinner";
import { BrandWordmark } from "@/components/brand-wordmark";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/src/lib/utils";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"] as const;
const PIN_LENGTH = 6;

/** Short screens (iPhone SE): keys and boxes drop from 56px to 48px so the whole card fits. */
const SHORT_SCREEN = "[@media(max-height:700px)]:h-12";

export default function LivePinGate({ signedIn }: { signedIn: boolean }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(value: string) {
    if (pending || value.length !== PIN_LENGTH) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/live/unlock", {
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
      window.location.assign("/live");
    } catch {
      setPin("");
      setError("Couldn't check that PIN. Check your connection and try again.");
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
    const next = pin.length >= PIN_LENGTH ? pin : `${pin}${key}`;
    setPin(next);
    if (next.length === PIN_LENGTH) void submit(next);
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (/^\d$/.test(event.key)) press(event.key as (typeof KEYS)[number]);
      if (event.key === "Backspace") press("back");
      if (event.key === "Escape") press("clear");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <main className="flex min-h-dvh touch-manipulation items-center justify-center bg-background px-4 py-8 text-foreground [@media(max-height:700px)]:py-4">
      <div className="w-full max-w-sm rounded-md border border-border bg-card p-6 [@media(max-height:700px)]:p-5">
        <BrandWordmark className="h-8 w-auto object-contain" priority />
        <p className="eyebrow mt-5">InFocus Live</p>
        <h1 className="display-sm mt-1">Livestream dashboard</h1>

        {signedIn ? (
          <Alert tone="warning" compact className="mt-4">
            We couldn&apos;t confirm your Portal account. Enter the 6-digit PIN.
          </Alert>
        ) : (
          <>
            <a href="/sign-in?returnTo=%2Flive" className={cn(buttonVariants(), "mt-5 h-11 w-full text-base")}>
              Sign in to the Portal
            </a>
            <p className="mt-4 flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground">
              <span aria-hidden className="h-px flex-1 bg-border" />
              or enter the 6-digit PIN
              <span aria-hidden className="h-px flex-1 bg-border" />
            </p>
          </>
        )}

        <div className="mt-4" aria-live="polite">
          <span className="sr-only">
            {pin.length ? `PIN: ${pin.split("").join(" ")}` : "No digits entered"}, {pin.length} of {PIN_LENGTH}
          </span>
          <div aria-hidden className="grid grid-cols-6 gap-2">
            {Array.from({ length: PIN_LENGTH }, (_, index) => (
              <span
                key={index}
                className={cn(
                  "flex h-14 items-center justify-center rounded-md border bg-background font-mono-broadcast text-2xl font-medium tabular-nums",
                  SHORT_SCREEN,
                  index < pin.length ? "border-input text-foreground" : "border-border text-muted-foreground",
                  index === pin.length && !pending && "border-b-2 border-b-[var(--brand-green)]"
                )}
              >
                {pin[index] ?? ""}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-2 flex min-h-5 items-center">
          {error ? (
            <InlineError>{error}</InlineError>
          ) : pending ? (
            <p role="status" className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
              <Spinner size="sm" />
              Checking…
            </p>
          ) : null}
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          {KEYS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => press(key)}
              disabled={pending}
              className={cn(
                "h-14 rounded-md border border-border bg-[var(--ink-3)] font-semibold text-foreground transition-[transform,background-color] hover:bg-[var(--ink-4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.96] disabled:opacity-60",
                SHORT_SCREEN,
                key === "clear" || key === "back" ? "text-sm" : "text-2xl"
              )}
            >
              {key === "clear" ? "Clear" : key === "back" ? "Delete" : key}
            </button>
          ))}
        </div>

        <p className="mt-5 text-center text-[13px] text-muted-foreground">Producers and livestream managers have the PIN in Settings.</p>
      </div>
    </main>
  );
}
