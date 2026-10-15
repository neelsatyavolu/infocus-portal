"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { InlineError } from "@/components/kit/alert";
import { Skeleton } from "@/components/kit/skeleton";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SettingsGrid, SettingsPanel, SettingsSection } from "@/components/settings-layout";
import { cachedValue, rememberValue } from "@/src/lib/client-cache";

type AccessPin = {
  pin: string | null;
  /** False until the GET succeeds (or a past visit in this tab saw it); the endpoint decides who may see the PIN. */
  visible: boolean;
  /** The PIN itself has loaded. Until then the tile shows placeholders. */
  loaded: boolean;
  busy: boolean;
  error: string | null;
  /** Asked before replacing an existing PIN: "Question? Detail." */
  replaceConfirm: string;
  /** Throws on failure so a confirm dialog can stay open for a retry. */
  renew: () => Promise<void>;
};

/**
 * Only whether the tile is visible is remembered (src/lib/client-cache.ts), never the PIN: someone
 * else can replace it at any time, so the value always comes from a fresh GET.
 */
function visibilityKey(url: string) {
  return `settings:pin-visible:${url}`;
}

/** Loads and replaces a kiosk PIN (Class Board, livestream dashboard). */
export function useAccessPin(url: string, replaceConfirm: string): AccessPin {
  const [pin, setPin] = useState<string | null>(null);
  const [visible, setVisible] = useState(
    () => typeof window !== "undefined" && cachedValue<boolean>(visibilityKey(url)) === true
  );
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) {
          // Roles can change without the person changing: forget the tile.
          rememberValue(visibilityKey(url), false);
          if (!cancelled) setVisible(false);
          return;
        }
        const payload = await response.json();
        if (cancelled) return;
        setPin(typeof payload?.data?.pin === "string" ? payload.data.pin : null);
        setVisible(true);
        setLoaded(true);
        rememberValue(visibilityKey(url), true);
      } catch {
        // Leave the tile hidden if it can't load.
        if (!cancelled) setVisible(false);
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

  return { pin, visible, loaded, busy, error, replaceConfirm, renew };
}

/**
 * One PIN as a panel cell: name and what it opens, then the digits with their button. The cell is
 * its own container, so a wide cell (a lone PIN) puts the digits and button on the right, while a
 * narrow one (phones, or two side by side) stacks them under the words.
 */
function PinCell({ title, description, state }: { title: string; description: string; state: AccessPin }) {
  const [confirmingReplace, setConfirmingReplace] = useState(false);
  if (!state.visible) return null;

  const questionEnd = state.replaceConfirm.indexOf("?") + 1;
  const replaceTitle = questionEnd > 0 ? state.replaceConfirm.slice(0, questionEnd) : state.replaceConfirm;
  const replaceDetail = questionEnd > 0 ? state.replaceConfirm.slice(questionEnd).trim() : "";

  return (
    <div className="@container flex h-full min-w-0 flex-col gap-3 px-4 py-4 md:px-5">
      <div className="flex flex-1 flex-col gap-3 @lg:flex-row @lg:items-center @lg:justify-between @lg:gap-6">
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-foreground">{title}</h3>
          <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{description}</p>
        </div>
        <div className="mt-auto flex min-h-9 shrink-0 items-center gap-4 @lg:mt-0">
          {!state.loaded ? (
            <Skeleton className="h-6 w-28" />
          ) : (
            <span
              className={
                state.pin
                  ? "font-mono-broadcast text-2xl tabular-nums tracking-[0.24em] text-foreground"
                  : "text-sm text-muted-foreground"
              }
            >
              {state.pin ? `${state.pin.slice(0, 3)} ${state.pin.slice(3)}` : "Not set"}
            </span>
          )}
          {!state.loaded ? (
            <Skeleton className="h-9 w-28 rounded-md" />
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={() => (state.pin ? setConfirmingReplace(true) : void state.renew().catch(() => undefined))}
              disabled={state.busy}
            >
              {state.busy ? "Saving…" : state.pin ? "New PIN" : "Create PIN"}
            </Button>
          )}
        </div>
      </div>
      {state.error ? <InlineError>{state.error}</InlineError> : null}
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
    </div>
  );
}

/**
 * Settings → PINs: shown when at least one PIN loaded. One panel like Profile and Appearance: a
 * lone PIN is one full-width cell; two sit side by side from a 42rem column.
 */
export function PinsSection({ classBoard, livestream }: { classBoard: AccessPin; livestream: AccessPin }) {
  const both = classBoard.visible && livestream.visible;
  return (
    <SettingsSection
      id="pins"
      title="PINs"
      description="Unlock one screen without signing in. A PIN never signs anyone into Portal."
    >
      <SettingsPanel>
        <SettingsGrid className={both ? undefined : "@2xl:grid-cols-1"}>
          <PinCell title="Class Board PIN" description="Opens /class-board only." state={classBoard} />
          <PinCell
            title="Livestream dashboard PIN"
            description="Opens the livestream dashboard at /live until midnight."
            state={livestream}
          />
        </SettingsGrid>
      </SettingsPanel>
    </SettingsSection>
  );
}
