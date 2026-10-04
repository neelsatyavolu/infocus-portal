"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Info, Video } from "lucide-react";
import { NEVER } from "rxjs";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { BackgroundMode, ReceiveQuality, SendQuality } from "@/src/lib/meetings/client/meet-settings";
import { estimateGbPerHour } from "@/src/lib/meetings/client/quality";
import { DevicePicker, SettingSwitch, SpeakerPicker } from "./device-pickers";
import { LevelMeter } from "./level-meter";
import { VideoView, useObservableTrack } from "./media-elements";
import { Segmented } from "./segmented";
import type { LocalMedia } from "./use-local-media";

const BACKGROUNDS = [
  { value: "off", label: "Off" },
  { value: "slight", label: "Slight blur" },
  { value: "blur", label: "Blur" }
] as const satisfies ReadonlyArray<{ value: BackgroundMode; label: string }>;

const SEND = [
  { value: "auto", label: "Auto (up to 1080p)" },
  { value: "720p", label: "720p" },
  { value: "360p", label: "360p (data saver)" }
] as const satisfies ReadonlyArray<{ value: SendQuality; label: string }>;

const RECEIVE = [
  { value: "auto", label: "Auto" },
  { value: "saver", label: "Data saver" }
] as const satisfies ReadonlyArray<{ value: ReceiveQuality; label: string }>;

export function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="grid gap-3">
      <h3 className="text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

export function AudioSettings({ media, showMeter = true }: { media: LocalMedia; showMeter?: boolean }) {
  // The meter reads the processed (voice-isolated) mic, so the effect is visible.
  const mic$ = useMemo(() => (media.audioOn && showMeter ? media.mic.localMonitorTrack$ : NEVER), [media.audioOn, media.mic, showMeter]);
  const micTrack = useObservableTrack(mic$);
  return (
    <SettingsSection title="Audio">
      <SettingSwitch
        id="voice-isolation"
        label="Voice isolation"
        hint="Filters background noise on your device before it's sent."
        checked={media.voiceIsolation}
        onChange={media.setVoiceIsolation}
      />
      <DevicePicker label="Microphone" kind="mic" device={media.mic} />
      <SpeakerPicker value={media.speakerId} onChange={media.setSpeakerId} />
      {showMeter ? (
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <LevelMeter track={micTrack} />
          <span>{media.audioOn ? "Speak to test your microphone" : "Your microphone is off"}</span>
        </div>
      ) : null}
      <SettingSwitch
        id="meet-chimes"
        label="Join and leave sounds"
        checked={media.settings.chimes}
        onChange={(chimes) => media.updateSettings({ chimes })}
      />
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Info className="h-3.5 w-3.5 shrink-0" aria-hidden /> High quality audio (Opus, 64 kbps).
      </p>
    </SettingsSection>
  );
}

/**
 * Local camera preview. With the camera off, "Preview camera" turns on the camera SOURCE for this
 * preview only (localMonitorTrack$; nothing is broadcast); it stops when this unmounts.
 * The monitor track runs through the camera transforms, so blur shows here.
 */
function CameraPreview({ media }: { media: LocalMedia }) {
  const [previewing, setPreviewing] = useState(false);
  const show = media.videoOn || previewing;
  const camera$ = useMemo(() => (show ? media.camera.localMonitorTrack$ : NEVER), [show, media.camera]);
  const track = useObservableTrack(camera$);
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-md bg-[var(--ink-3)]">
      {show && track ? (
        <VideoView track={track} mirror={media.settings.mirror} />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
          {show ? "Starting camera…" : "Camera is off"}
          {!show ? (
            <Button size="sm" variant="outline" onClick={() => setPreviewing(true)}>
              <Video aria-hidden /> Preview camera
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}

export function VideoSettings({
  media,
  showPreview = true,
  showQuality = true,
  peopleCount
}: {
  media: LocalMedia;
  showPreview?: boolean;
  showQuality?: boolean;
  peopleCount: number;
}) {
  const { settings, updateSettings } = media;
  const people = peopleCount >= 2 ? peopleCount : 6;
  return (
    <SettingsSection title="Video">
      <DevicePicker label="Camera" kind="camera" device={media.camera} />
      {showPreview ? <CameraPreview media={media} /> : null}
      <Field label="Background">
        <Segmented label="Background" value={settings.background} options={BACKGROUNDS} onChange={(background) => updateSettings({ background })} />
      </Field>
      <SettingSwitch id="meet-mirror" label="Mirror my video" hint="Only your own view. Others see you normally." checked={settings.mirror} onChange={(mirror) => updateSettings({ mirror })} />
      {showQuality ? (
        <>
          <Field label="Send quality">
            <Segmented label="Send quality" value={settings.sendQuality} options={SEND} onChange={(sendQuality) => updateSettings({ sendQuality })} />
          </Field>
          <Field label="Receive quality">
            <Segmented label="Receive quality" value={settings.receiveQuality} options={RECEIVE} onChange={(receiveQuality) => updateSettings({ receiveQuality })} />
          </Field>
          <p className="text-xs text-muted-foreground">
            Estimate: about {estimateGbPerHour(people, settings.receiveQuality)} GB per hour in a {people}-person call.
          </p>
        </>
      ) : null}
    </SettingsSection>
  );
}
