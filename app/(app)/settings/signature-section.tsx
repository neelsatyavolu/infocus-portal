"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { StatusTag } from "@/components/kit/status-tag";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SaveStatus, SettingsNotice, SettingsPanel, SettingsPanelBody, SettingsSection } from "@/components/settings-layout";
import { cachedValue, rememberValue } from "@/src/lib/client-cache";
import { PAD_HEIGHT, SIGNATURE_WIDTH_CLASS, SignatureActions, SignaturePad } from "./signature-pad";
import { useSavedFlash } from "./use-saved-flash";

const ENDPOINT = "/api/profile/signature";
/**
 * Last-seen signature (src/lib/client-cache.ts): `{ signature }` while the section is visible,
 * `null` once the endpoint says no (roles can change without the person changing).
 */
const CACHE_KEY = "settings:signature";

type CachedSignature = { signature: string | null } | null;

type SignatureState = {
  /** False until the GET succeeds; the endpoint decides who may draw a signature. */
  visible: boolean;
  signature: string | null;
  busy: boolean;
  error: string | null;
  clearError: () => void;
  save: (signature: string) => Promise<boolean>;
  remove: () => Promise<void>;
};

async function request(method: "PUT" | "DELETE", body?: unknown) {
  const response = await fetch(ENDPOINT, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error?.message ?? "Couldn't update your signature.");
  return typeof payload?.data?.signature === "string" ? (payload.data.signature as string) : null;
}

/** Loads, saves, and removes the signed-in executive producer's drawn signature. */
export function useSignature(): SignatureState {
  const [cached] = useState(() => (typeof window === "undefined" ? undefined : cachedValue<CachedSignature>(CACHE_KEY)));
  const [visible, setVisible] = useState(Boolean(cached));
  const [signature, setSignature] = useState<string | null>(cached?.signature ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Set once a save or remove starts, so an older refresh can't put back the previous image. */
  const changedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(ENDPOINT, { cache: "no-store" });
        if (!response.ok) {
          rememberValue<CachedSignature>(CACHE_KEY, null);
          if (!cancelled) setVisible(false);
          return;
        }
        const payload = await response.json();
        if (cancelled || changedRef.current) return;
        const next = typeof payload?.data?.signature === "string" ? (payload.data.signature as string) : null;
        setSignature(next);
        setVisible(true);
        rememberValue<CachedSignature>(CACHE_KEY, { signature: next });
      } catch {
        // Leave the section as it was (hidden on a first visit) if it can't load.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function store(next: string | null) {
    setSignature(next);
    rememberValue<CachedSignature>(CACHE_KEY, { signature: next });
  }

  async function save(next: string) {
    changedRef.current = true;
    setBusy(true);
    setError(null);
    try {
      store(await request("PUT", { signature: next }));
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't save your signature.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  /** Throws on failure so the confirm dialog stays open for a retry. */
  async function remove() {
    changedRef.current = true;
    setBusy(true);
    setError(null);
    try {
      store(await request("DELETE"));
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Couldn't remove your signature.";
      setError(message);
      toast.error(message);
      throw caught;
    } finally {
      setBusy(false);
    }
  }

  return { visible, signature, busy, error, clearError: () => setError(null), save, remove };
}

/** Settings → Signature, for executive producers and the super admin. */
export function SignatureSection({ state }: { state: SignatureState }) {
  const [redrawing, setRedrawing] = useState(false);
  const [savedLabel, flashSaved] = useSavedFlash();
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  async function save(signature: string) {
    if (!(await state.save(signature))) return;
    setRedrawing(false);
    flashSaved("Saved");
  }

  const drawing = !state.signature || redrawing;

  return (
    <SettingsSection
      id="signature"
      title="Signature"
      description="Prints above your name on Package of the Cycle certificates."
      status={state.signature ? null : <StatusTag tone="warning">Not set</StatusTag>}
      actions={<SaveStatus text={savedLabel} />}
    >
      {state.error ? (
        <SettingsNotice tone="error" onDismiss={state.clearError}>
          {state.error}
        </SettingsNotice>
      ) : null}
      <SettingsPanel>
        <SettingsPanelBody className="grid gap-x-8 gap-y-4 @4xl:grid-cols-[minmax(0,40rem)_minmax(0,1fr)]">
          {drawing ? (
            <SignaturePad
              busy={state.busy}
              onSave={(signature) => void save(signature)}
              onCancel={state.signature ? () => setRedrawing(false) : undefined}
            />
          ) : (
            <div className="space-y-3">
              <div
                className={`${SIGNATURE_WIDTH_CLASS} flex items-center justify-center rounded-md border border-border bg-white p-6`}
                style={{ height: PAD_HEIGHT }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- a data URL from this account, not a remote image. */}
                <img src={state.signature ?? undefined} alt="Your saved signature" className="max-h-full max-w-full object-contain" />
              </div>
              <SignatureActions>
                <Button type="button" variant="destructive-quiet" onClick={() => setConfirmingRemove(true)} disabled={state.busy}>
                  Remove
                </Button>
                <Button type="button" variant="outline" onClick={() => setRedrawing(true)} disabled={state.busy}>
                  Redraw
                </Button>
              </SignatureActions>
            </div>
          )}
          <div className="hidden min-w-0 border-l border-border pl-8 @4xl:block">
            <p className="text-[11px] font-medium uppercase leading-tight tracking-[0.11em] text-muted-foreground">On the certificate</p>
            <p className="mt-2 text-[13px] leading-snug text-muted-foreground">
              It&apos;s cropped to your ink, so the space around it doesn&apos;t matter. Until you draw one, your line stays
              blank.
            </p>
          </div>
        </SettingsPanelBody>
      </SettingsPanel>
      <ConfirmDialog
        open={confirmingRemove}
        onOpenChange={setConfirmingRemove}
        title="Remove your signature?"
        description="Certificates will show a blank line for you until you draw a new one."
        confirmLabel="Remove"
        onConfirm={state.remove}
      />
    </SettingsSection>
  );
}
