"use client";

import { PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { InlineError } from "@/components/kit/alert";
import { Button } from "@/components/ui/button";
import { SIGNATURE_MAX_LENGTH } from "@/src/lib/signature-image";

/** Certificate ink. The pad is always white because it stands in for the printed paper. */
const INK = "#0F110F";
export const PAD_HEIGHT = 180;
const STROKE_WIDTH = 2.5;
/** Saved PNGs are drawn at 2x and trimmed to the strokes, so they print sharp at any screen density. */
const EXPORT_SCALE = 2;
const EXPORT_PADDING = 6;

/**
 * The pad and the saved preview never grow past 40rem. At 2x that keeps every export well under
 * the server's 2400px side limit (SIGNATURE_MAX_SIDE), and it matches the certificate's line.
 */
export const SIGNATURE_WIDTH_CLASS = "w-full max-w-[40rem]";

type Point = { x: number; y: number };
type Stroke = Point[];

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

/** The hint (or error) on the left and the buttons on the right, under the pad or the preview. */
export function SignatureActions({ start, children }: { start?: ReactNode; children: ReactNode }) {
  return (
    <div className={`${SIGNATURE_WIDTH_CLASS} flex flex-wrap items-center justify-between gap-x-4 gap-y-2`}>
      <div className="min-w-0 flex-1 basis-56 text-[13px] leading-snug text-muted-foreground">{start}</div>
      <div className="ml-auto flex flex-wrap items-center justify-end gap-2">{children}</div>
    </div>
  );
}

/** Draw a signature: one pointer at a time (a palm or second finger is ignored), clamped to the pad. */
export function SignaturePad({
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
      <div className={`${SIGNATURE_WIDTH_CLASS} relative overflow-hidden rounded-md border border-border bg-white`}>
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
            className="pointer-events-none absolute bottom-3 left-6 text-xs uppercase tracking-[0.14em] text-neutral-500"
          >
            Sign above the line
          </span>
        ) : null}
      </div>
      <SignatureActions
        start={
          tooLarge ? (
            <InlineError>That signature is too detailed to save. Clear it and sign a little simpler.</InlineError>
          ) : (
            "Draw with a mouse, trackpad, pen, or finger."
          )
        }
      >
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
      </SignatureActions>
    </div>
  );
}
