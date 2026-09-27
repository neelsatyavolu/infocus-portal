import { useState } from "react";
import { LiveGraphic } from "@/components/live/live-graphic";
import { LiveImageLayer } from "@/components/live/live-image-layer";
import { LiveStage, useLiveNow } from "@/components/live/live-stage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  GRAPHICS,
  defaultGraphicFields,
  graphicDefinition,
  type GraphicId,
  type LiveImageState
} from "@/src/lib/live/graphics";
import type { ScoreboardState } from "@/src/lib/live/scoreboard";
import type { LiveEventSummary } from "@/src/server/live-graphics";
import { CopyUrl, FieldLabel, Panel } from "./live-controls";

type Props = {
  event: LiveEventSummary;
  scoreboard: ScoreboardState;
  liveImage: LiveImageState;
  offset: number;
  overlayUrl: string;
  onSave: (liveImage: LiveImageState) => Promise<void>;
};

const FULL_FRAME: GraphicId[] = ["starting-soon", "halftime", "brb", "final"];

export function LiveImagePanel({ event, scoreboard, liveImage, offset, overlayUrl, onSave }: Props) {
  const now = useLiveNow(offset, 250);
  const [queued, setQueued] = useState<GraphicId>("starting-soon");
  const [queueNonce, setQueueNonce] = useState(0);
  const [drafts, setDrafts] = useState<Partial<Record<GraphicId, Record<string, string>>>>({});
  const [busy, setBusy] = useState(false);

  const fields = drafts[queued] ?? defaultGraphicFields(queued, event);
  const definition = graphicDefinition(queued);

  function queue(id: GraphicId) {
    setQueued(id);
    setQueueNonce((value) => value + 1);
  }

  function editField(key: string, value: string) {
    setDrafts((current) => ({ ...current, [queued]: { ...fields, [key]: value } }));
  }

  async function push() {
    setBusy(true);
    await onSave({ graphic: queued, fields, pushedAt: 0 });
    setBusy(false);
  }

  async function clear() {
    setBusy(true);
    await onSave(null);
    setBusy(false);
  }

  const onAir = liveImage ? graphicDefinition(liveImage.graphic).name : null;

  return (
    <div className="grid gap-6">
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Panel title={`Queued · ${definition.name}`}>
          <LiveStage background={FULL_FRAME.includes(queued) ? "ink" : "checker"} className="rounded-md">
            <div key={`${queued}-${queueNonce}`} className="lv-play">
              <LiveGraphic graphic={queued} fields={fields} scoreboard={scoreboard} event={event} now={now} />
            </div>
          </LiveStage>
          <div className="grid gap-3 sm:grid-cols-2">
            {definition.fields.map((field) => (
              <FieldLabel key={field.key} label={field.label}>
                <Input
                  id={`live-field-${queued}-${field.key}`}
                  value={fields[field.key] ?? ""}
                  maxLength={field.max}
                  onChange={(changeEvent) => editField(field.key, changeEvent.target.value)}
                />
              </FieldLabel>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Only you see the queue. Viewers see nothing until you push.</p>
          {/* Phones: push right under the fields instead of scrolling to the on-air panel. */}
          <div className="grid grid-cols-[1fr_auto] gap-2 lg:hidden">
            <Button type="button" className="h-12 text-base font-semibold" onClick={() => void push()} disabled={busy}>
              Push to OBS
            </Button>
            <Button type="button" variant="outline" className="h-12" onClick={() => void clear()} disabled={busy || !liveImage}>
              Clear
            </Button>
          </div>
        </Panel>

        <Panel
          title="Live image · OBS source 2"
          action={
            <div className="hidden gap-2 lg:flex">
              <Button type="button" onClick={() => void push()} disabled={busy}>
                Push to OBS
              </Button>
              <Button type="button" variant="outline" onClick={() => void clear()} disabled={busy || !liveImage}>
                Clear
              </Button>
            </div>
          }
        >
          <LiveStage background="checker" className="rounded-md">
            <LiveImageLayer
              liveImage={liveImage}
              render={(image) => <LiveGraphic graphic={image.graphic} fields={image.fields} scoreboard={scoreboard} event={event} now={now} />}
            />
          </LiveStage>
          <p className="flex items-center gap-2 text-sm">
            {onAir ? (
              <>
                <span className="h-2 w-2 rounded-full bg-[#EE3A2A]" aria-hidden="true" />
                <span>
                  On air: <b className="font-medium">{onAir}</b>
                </span>
              </>
            ) : (
              <span className="text-muted-foreground">Transparent. Viewers see the game.</span>
            )}
          </p>
          <CopyUrl label="OBS Browser Source" url={overlayUrl} hint="Add as a second Browser Source above the scoreboard, 1920 × 1080." />
        </Panel>
      </div>

      <Panel title="Graphics">
        <div className="grid grid-cols-2 gap-2 sm:gap-4 xl:grid-cols-3">
          {GRAPHICS.map((graphic) => (
            <button
              key={graphic.id}
              type="button"
              aria-pressed={queued === graphic.id}
              onClick={() => queue(graphic.id)}
              className="grid gap-2 rounded-md border border-border p-2 text-left transition-colors hover:bg-accent aria-pressed:border-[var(--brand-green)] sm:p-3"
            >
              <LiveStage background={FULL_FRAME.includes(graphic.id) ? "ink" : "checker"} className="pointer-events-none rounded">
                <LiveGraphic
                  graphic={graphic.id}
                  fields={drafts[graphic.id] ?? defaultGraphicFields(graphic.id, event)}
                  scoreboard={scoreboard}
                  event={event}
                  now={now}
                />
              </LiveStage>
              <span className="font-semibold">{graphic.name}</span>
              <span className="hidden text-sm text-muted-foreground sm:block">{graphic.description}</span>
            </button>
          ))}
        </div>
      </Panel>
    </div>
  );
}
