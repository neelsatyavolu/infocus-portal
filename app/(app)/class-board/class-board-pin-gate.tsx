"use client";

import { AlertCircle, Delete } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Spinner } from "@/components/kit/spinner";
import { Button } from "@/components/ui/button";
import { cn } from "@/src/lib/utils";
import { BoardWordmark } from "./board-wordmark";

const PIN_LENGTH = 6;
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"] as const;
type PinKey = (typeof KEYS)[number];
/** checking: waiting on the server. opening: unlocked, the page is reloading into the board. */
type Phase = "idle" | "checking" | "opening";

/**
 * Signed-out classroom screens unlock the board with the six-digit Class Board PIN. Each typed
 * digit shows in its box, so a typo can be caught before the sixth digit submits the PIN.
 */
export default function ClassBoardPinGate() {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const pending = phase !== "idle";

  async function submit(value: string) {
    if (pending || value.length !== PIN_LENGTH) return;
    setPhase("checking");
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
        setPhase("idle");
        return;
      }
      setPhase("opening");
      window.location.assign("/class-board");
    } catch {
      setPin("");
      setError("Could not check that PIN.");
      setPhase("idle");
    }
  }

  function press(key: PinKey) {
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
    if (pin.length >= PIN_LENGTH) return;
    const next = `${pin}${key}`;
    setError(null);
    setPin(next);
    if (next.length === PIN_LENGTH) void submit(next);
  }

  // One listener for the page's life; it always calls the latest press().
  const pressRef = useRef(press);
  useEffect(() => {
    pressRef.current = press;
  });
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      // Cmd/Ctrl/Alt + digit belongs to the browser (tab switching), not the PIN.
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (/^\d$/.test(event.key)) pressRef.current(event.key as PinKey);
      else if (event.key === "Backspace") pressRef.current("back");
      else if (event.key === "Escape") pressRef.current("clear");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Short screens (landscape phones, iPad split view) get the max-height:640px sizes so the pad fits.
  return (
    <main className="h-dvh touch-manipulation overflow-y-auto overscroll-contain bg-background text-foreground">
      <div className="mx-auto flex min-h-full w-full max-w-sm flex-col justify-center gap-6 px-4 py-10 [@media(max-height:640px)]:gap-4 [@media(max-height:640px)]:py-4">
        <div className="flex flex-col items-center text-center">
          <BoardWordmark alt="InFocus" className="h-10 [@media(max-height:640px)]:h-7" />
          <p className="eyebrow mt-6 [@media(max-height:640px)]:mt-3">Class Board</p>
          <h1 className="display-md mt-1.5">Enter the 6-digit PIN</h1>
          <p className="mt-2 text-sm text-[var(--ink-text)]">Opens this board on this browser for 30 days.</p>
        </div>

        <div>
          <div aria-hidden="true" className="flex justify-center gap-2">
            {Array.from({ length: PIN_LENGTH }, (_, index) => (
              <span
                key={index}
                className={cn(
                  "grid size-12 place-items-center rounded-md border border-input bg-card font-mono-broadcast text-2xl font-medium tabular-nums text-foreground [@media(max-height:640px)]:size-10 [@media(max-height:640px)]:text-xl",
                  index === pin.length && !pending && "border-transparent ring-2 ring-[var(--brand-green)]"
                )}
              >
                {pin[index] ?? null}
              </span>
            ))}
          </div>
          <p className="sr-only" aria-live="polite">
            {pin ? `${pin.split("").join(" ")}. ` : ""}
            {pin.length} of {PIN_LENGTH} digits entered
          </p>
          <p aria-live="polite" className="mt-3 flex min-h-6 items-center justify-center gap-2 text-center text-sm">
            {phase === "checking" ? (
              <>
                <Spinner />
                Checking…
              </>
            ) : phase === "opening" ? (
              <>
                <Spinner />
                Opening the board…
              </>
            ) : error ? (
              <span className="flex items-center gap-2 text-danger">
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                {error}
              </span>
            ) : null}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3 [@media(max-height:640px)]:gap-2">
          {KEYS.map((key) => {
            const digit = key !== "clear" && key !== "back";
            return (
              <Button
                key={key}
                type="button"
                variant={digit ? "outline" : "ghost"}
                onClick={() => press(key)}
                disabled={pending}
                className={cn(
                  "h-16 w-full transition-transform active:scale-[0.96] [@media(max-height:640px)]:h-12",
                  digit ? "text-2xl font-semibold tabular-nums" : "text-base"
                )}
              >
                {key === "clear" ? "Clear" : key === "back" ? (
                  <>
                    <Delete aria-hidden="true" />
                    Delete
                  </>
                ) : (
                  key
                )}
              </Button>
            );
          })}
        </div>
      </div>
    </main>
  );
}
