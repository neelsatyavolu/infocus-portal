import { useRef, useState, type KeyboardEvent } from "react";
import { Panel } from "@/components/kit/panel";
import { rovingIndex } from "@/components/kit/roving";
import { StatusTag } from "@/components/kit/status-tag";
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
import { cn } from "@/src/lib/utils";
import type { LiveEventSummary } from "@/src/server/live-graphics";
import { ActionDock, CARD_LABEL_CLASS, ObsLink } from "./live-controls";
import { formatPushedAt, queuedDiffersFromAir } from "./live-status";

type Props = {
  event: LiveEventSummary;
  scoreboard: ScoreboardState;
  liveImage: LiveImageState;
  offset: number;
  overlayUrl: string;
  onSave: (liveImage: LiveImageState) => Promise<void>;
  /** Producers and livestream managers (signed in) can make new OBS links. */
  onRotateKey?: () => void;
};

const FULL_FRAME: GraphicId[] = ["starting-soon", "halftime", "brb", "final"];
const NO_DISABLED_TILES = GRAPHICS.map(() => false);
const IMAGE_HINT = "Add as a second Browser Source above the scoreboard, 1920 × 1080.";

/**
 * Live image tab, laid out like a switcher: pick a graphic (one-row strip), prepare it and push it
 * (Queued, with the take bar at the top of the card, right under the strip), and check what
 * viewers see (On air).
 */
export function LiveImagePanel({ event, scoreboard, liveImage, offset, overlayUrl, onSave, onRotateKey }: Props) {
  const now = useLiveNow(offset, 250);
  const [queued, setQueued] = useState<GraphicId>("starting-soon");
  const [queueNonce, setQueueNonce] = useState(0);
  const [drafts, setDrafts] = useState<Partial<Record<GraphicId, Record<string, string>>>>({});
  const [busy, setBusy] = useState(false);
  const tileRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const fields = drafts[queued] ?? defaultGraphicFields(queued, event);
  const definition = graphicDefinition(queued);

  function queue(id: GraphicId) {
    setQueued(id);
    setQueueNonce((value) => value + 1);
  }

  /** The tiles are one radio group: arrow keys, Home and End move to a graphic and queue it. */
  function onTileKey(keyEvent: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = rovingIndex(index, keyEvent.key, NO_DISABLED_TILES);
    if (next === null) return;
    keyEvent.preventDefault();
    tileRefs.current[next]?.focus();
    queue(GRAPHICS[next].id);
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
  const onAirSince = liveImage ? formatPushedAt(liveImage.pushedAt) : "";
  const notPushed = queuedDiffersFromAir(queued, fields, liveImage);
  const oddFields = definition.fields.length % 2 === 1;

  return (
    <div className="grid gap-4">
      <section aria-labelledby="live-graphics-title" className="grid gap-2">
        <h3 id="live-graphics-title" className="text-base font-semibold leading-snug tracking-[-0.01em] text-foreground">
          Graphics
        </h3>
        <div role="radiogroup" aria-labelledby="live-graphics-title" className="grid grid-cols-3 gap-3 md:grid-cols-6">
          {GRAPHICS.map((graphic, index) => {
            const isQueued = queued === graphic.id;
            const isOnAir = liveImage?.graphic === graphic.id;
            return (
              <button
                key={graphic.id}
                ref={(node) => {
                  tileRefs.current[index] = node;
                }}
                type="button"
                role="radio"
                aria-checked={isQueued}
                tabIndex={isQueued ? 0 : -1}
                title={graphic.description}
                onClick={() => queue(graphic.id)}
                onKeyDown={(keyEvent) => onTileKey(keyEvent, index)}
                className="flex h-full min-w-0 flex-col gap-2 rounded-md border border-border bg-card p-2 text-left transition-colors hover:bg-[var(--ink-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-checked:border-[var(--brand-green)]"
              >
                <LiveStage background={FULL_FRAME.includes(graphic.id) ? "ink" : "checker"} className="pointer-events-none rounded-sm">
                  <LiveGraphic
                    graphic={graphic.id}
                    fields={drafts[graphic.id] ?? defaultGraphicFields(graphic.id, event)}
                    scoreboard={scoreboard}
                    event={event}
                    now={now}
                  />
                </LiveStage>
                <span className="line-clamp-2 text-xs font-medium leading-snug text-foreground lg:text-sm">{graphic.name}</span>
                <span className="mt-auto flex min-h-[18px] flex-wrap gap-1">
                  {isQueued ? (
                    <StatusTag size="sm" tone="success">
                      Queued
                    </StatusTag>
                  ) : null}
                  {isOnAir ? (
                    <StatusTag size="sm" tone="live">
                      On air
                    </StatusTag>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Preview and program side by side from lg (stacked below, so the take bar has room beside
          the Queued title). Both headers have the same shape (title and tag, one line), so their
          stages line up. */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          padding="md"
          aria-label="Queued"
          title="Queued"
          status={notPushed ? <StatusTag tone="warning">Not pushed</StatusTag> : null}
          description={
            <span className="line-clamp-1">
              <span className="font-medium text-foreground">{definition.name}</span>
              {` · ${definition.description}`}
            </span>
          }
          actions={
            // The take bar. On phones it is fixed above the tab bar (so the header row's 32px
            // doesn't apply) and also says what's on air, since the On air card is usually
            // scrolled away.
            <ActionDock
              aria-label="Live image actions"
              className="max-md:h-auto!"
              leading={
                onAir ? (
                  <StatusTag tone="live" title={`On air: ${onAir}`}>
                    On air · {onAir}
                  </StatusTag>
                ) : (
                  <StatusTag tone="muted">Off air</StatusTag>
                )
              }
            >
              <Button type="button" variant="outline" className="h-11 shrink-0 md:h-8" onClick={() => void clear()} disabled={busy || !liveImage}>
                Clear
              </Button>
              <Button type="button" className="h-11 shrink-0 md:h-8" onClick={() => void push()} disabled={busy}>
                Push to OBS
              </Button>
            </ActionDock>
          }
          footer={<p className="leading-snug">Only you see the queue. Viewers see nothing until you push.</p>}
        >
          <div className="grid gap-4">
            <LiveStage background={FULL_FRAME.includes(queued) ? "ink" : "checker"} className="rounded-sm">
              <div key={`${queued}-${queueNonce}`} className="lv-play">
                <LiveGraphic graphic={queued} fields={fields} scoreboard={scoreboard} event={event} now={now} />
              </div>
            </LiveStage>
            <div className="grid gap-3 sm:grid-cols-2">
              {definition.fields.map((field, index) => (
                <div
                  key={field.key}
                  className={cn("grid min-w-0 gap-1.5", oddFields && index === definition.fields.length - 1 && "sm:col-span-2")}
                >
                  <label htmlFor={`live-field-${queued}-${field.key}`} className={CARD_LABEL_CLASS}>
                    {field.label}
                  </label>
                  <Input
                    id={`live-field-${queued}-${field.key}`}
                    value={fields[field.key] ?? ""}
                    maxLength={field.max}
                    placeholder={field.placeholder}
                    onChange={(changeEvent) => editField(field.key, changeEvent.target.value)}
                    className="h-11 md:h-9"
                  />
                </div>
              ))}
            </div>
          </div>
        </Panel>

        <Panel
          padding="md"
          aria-label="On air"
          title="On air"
          status={<StatusTag>Source 2</StatusTag>}
          description={
            <span className="line-clamp-1">
              {onAir ? (
                <>
                  <span className="font-medium text-foreground">{onAir}</span>
                  {onAirSince ? (
                    <>
                      {" · since "}
                      <span className="font-mono-broadcast tabular-nums">{onAirSince}</span>
                    </>
                  ) : null}
                </>
              ) : (
                "Transparent. Viewers see the game."
              )}
            </span>
          }
          footer={<ObsLink url={overlayUrl} hint={IMAGE_HINT} onRotate={onRotateKey} />}
        >
          <LiveStage background="checker" className="rounded-sm">
            <LiveImageLayer
              liveImage={liveImage}
              render={(image) => <LiveGraphic graphic={image.graphic} fields={image.fields} scoreboard={scoreboard} event={event} now={now} />}
            />
          </LiveStage>
        </Panel>
      </div>
    </div>
  );
}
