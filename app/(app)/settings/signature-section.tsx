"use client";

import { PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { SaveStatus, SettingsNotice, SettingsPanel, SettingsPanelBody, SettingsSection } from "@/components/settings-layout";
import { SIGNATURE_MAX_LENGTH } from "@/src/lib/signature-image";

const ENDPOINT = "/api/profile/signature";
/** Certificate ink. The pad is always white because it stands in for the printed paper. */
const INK = "#0F110F";
const PAD_HEIGHT = 180;
const STROKE_WIDTH = 2.5;
/** Saved PNGs are drawn at 2x and trimmed to the strokes, so they print sharp at any screen density. */
const EXPORT_SCALE = 2;
const EXPORT_PADDING = 6;

type Point = { x: number; y: number };
type Stroke = Point[];

export type SignatureState = {
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
  const [visible, setVisible] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(ENDPOINT, { cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json();
        if (cancelled) return;
        setSignature(typeof payload?.data?.signature === "string" ? payload.data.signature : null);
        setVisible(true);
      } catch {
        // Leave the section hidden if it can't load.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(next: string) {
    setBusy(true);
    setError(null);
    try {
      setSignature(await request("PUT", { signature: next }));
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't save your signature.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm("Remove your signature? Certificates will show a blank line for you until you draw a new one.")) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setSignature(await request("DELETE"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't remove your signature.");
    } finally {
      setBusy(false);
    }
  }

  return { visible, signature, busy, error, clearError: () => setError(null), save, remove };
}

function paint(context: CanvasRenderingContext2D, strokes: Stroke[]) {
  context.strokeStyle = INK;
  context.fillStyle = INK;
  context.lineWidth = STROKE_WIDTH;
  context.lineCap = "round";
  context.lineJoin = "round";
  for (const stroke of strokes) {
    const [first, ...rest] = stroke;
    if (!first) continue;
    if (rest.length === 0) {
      context.beginPath();
      context.arc(first.x, first.y, STROKE_WIDTH / 2, 0, Math.PI * 2);
      context.fill();
      continue;
    }
    context.beginPath();
    context.moveTo(first.x, first.y);
    for (const point of rest) context.lineTo(point.x, point.y);
    context.stroke();
  }
}

/** A transparent PNG cropped to the ink, so the certificate can size every signature the same way. */
function exportStrokes(strokes: Stroke[]) {
  const points = strokes.flat();
  if (points.length === 0) return null;
  const minX = Math.min(...points.map((point) => point.x)) - EXPORT_PADDING;
  const minY = Math.min(...points.map((point) => point.y)) - EXPORT_PADDING;
  const maxX = Math.max(...points.map((point) => point.x)) + EXPORT_PADDING;
  const maxY = Math.max(...points.map((point) => point.y)) + EXPORT_PADDING;

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil((maxX - minX) * EXPORT_SCALE);
  canvas.height = Math.ceil((maxY - minY) * EXPORT_SCALE);
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.scale(EXPORT_SCALE, EXPORT_SCALE);
  context.translate(-minX, -minY);
  paint(context, strokes);
  return canvas.toDataURL("image/png");
}

function SignaturePad({
  busy,
  onSave,
  onCancel
}: {
  busy: boolean;
  onSave: (signature: string) => void;
  onCancel?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<Stroke[]>([]);
  /** The one pointer drawing right now; a resting palm or second finger is ignored. */
  const activePointerRef = useRef<number | null>(null);
  const [hasInk, setHasInk] = useState(false);
  const [tooLarge, setTooLarge] = useState(false);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.restore();
    paint(context, strokesRef.current);
  }, []);

  // Size the backing store to the pad (sharp on retina), then repaint; strokes survive a resize.
  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(canvas.clientWidth * ratio);
    canvas.height = Math.round(PAD_HEIGHT * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    paint(context, strokesRef.current);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [resize]);

  // Pointer capture keeps reporting moves past the edge; clamp them so nothing prints that the pad didn't show.
  function pointFrom(event: ReactPointerEvent<HTMLCanvasElement>): Point {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(Math.max(event.clientX - rect.left, 0), rect.width),
      y: Math.min(Math.max(event.clientY - rect.top, 0), rect.height)
    };
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (busy || activePointerRef.current !== null || (event.pointerType === "mouse" && event.button !== 0)) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    activePointerRef.current = event.pointerId;
    strokesRef.current = [...strokesRef.current, [pointFrom(event)]];
    setHasInk(true);
    setTooLarge(false);
    redraw();
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (event.pointerId !== activePointerRef.current) return;
    const strokes = strokesRef.current;
    const current = strokes[strokes.length - 1] ?? [];
    strokesRef.current = [...strokes.slice(0, -1), [...current, pointFrom(event)]];
    redraw();
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (event.pointerId === activePointerRef.current) activePointerRef.current = null;
  }

  function clear() {
    strokesRef.current = [];
    setHasInk(false);
    setTooLarge(false);
    redraw();
  }

  function save() {
    const signature = exportStrokes(strokesRef.current);
    if (!signature) return;
    if (signature.length > SIGNATURE_MAX_LENGTH) {
      setTooLarge(true);
      return;
    }
    onSave(signature);
  }

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-md border border-border bg-white">
        <canvas
          ref={canvasRef}
          aria-label="Signature pad. Draw your signature with a mouse, trackpad, pen, or finger."
          className="block w-full cursor-crosshair touch-none"
          style={{ height: PAD_HEIGHT }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-6 bottom-10 border-b border-dashed border-neutral-300" />
        {!hasInk ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute bottom-3 left-6 text-xs uppercase tracking-[0.14em] text-neutral-400"
          >
            Sign above the line
          </span>
        ) : null}
      </div>
      {tooLarge ? (
        <p className="text-[13px] text-danger">That signature is too detailed to save. Clear it and sign a little simpler.</p>
      ) : null}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        ) : null}
        <Button type="button" variant="outline" onClick={clear} disabled={busy || !hasInk}>
          Clear
        </Button>
        <Button type="button" onClick={save} disabled={busy || !hasInk}>
          {busy ? "Saving…" : "Save signature"}
        </Button>
      </div>
    </div>
  );
}

/** Settings → Signature, for executive producers and the super admin. */
export function SignatureSection({ state }: { state: SignatureState }) {
  const [redrawing, setRedrawing] = useState(false);
  const [savedLabel, setSavedLabel] = useState("");

  async function save(signature: string) {
    if (!(await state.save(signature))) return;
    setRedrawing(false);
    setSavedLabel("Saved");
    window.setTimeout(() => setSavedLabel(""), 1200);
  }

  const drawing = !state.signature || redrawing;

  return (
    <SettingsSection
      id="signature"
      title="Signature"
      description="Prints above your name on Package of the Cycle certificates."
      actions={<SaveStatus text={savedLabel} />}
    >
      {state.error ? (
        <SettingsNotice tone="error" onDismiss={state.clearError}>
          {state.error}
        </SettingsNotice>
      ) : null}
      <SettingsPanel>
        <SettingsPanelBody>
          {drawing ? (
            <SignaturePad
              busy={state.busy}
              onSave={(signature) => void save(signature)}
              onCancel={state.signature ? () => setRedrawing(false) : undefined}
            />
          ) : (
            <div className="space-y-3">
              <div className="flex h-[180px] items-center justify-center rounded-md border border-border bg-white p-6">
                {/* eslint-disable-next-line @next/next/no-img-element -- a data URL from this account, not a remote image. */}
                <img src={state.signature ?? undefined} alt="Your saved signature" className="max-h-full max-w-full object-contain" />
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button type="button" variant="destructive-quiet" onClick={() => void state.remove()} disabled={state.busy}>
                  Remove
                </Button>
                <Button type="button" variant="outline" onClick={() => setRedrawing(true)} disabled={state.busy}>
                  Redraw
                </Button>
              </div>
            </div>
          )}
        </SettingsPanelBody>
      </SettingsPanel>
    </SettingsSection>
  );
}
