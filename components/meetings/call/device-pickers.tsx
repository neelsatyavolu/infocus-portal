"use client";

import { useEffect, useState } from "react";
import { useObservableAsValue } from "partytracks/react";
import type { MediaDevice } from "partytracks/client";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { LocalMedia } from "./use-local-media";

function DevicePicker({ label, device }: { label: string; device: MediaDevice }) {
  const devices = useObservableAsValue(device.devices$, [] as MediaDeviceInfo[]);
  const active = useObservableAsValue(device.activeDevice$);
  const options = devices.filter((d) => d.deviceId);
  if (options.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select
        value={active?.deviceId ?? ""}
        onValueChange={(id) => {
          const chosen = options.find((d) => d.deviceId === id);
          if (chosen) device.setPreferredDevice(chosen);
        }}
      >
        <SelectTrigger aria-label={label}>
          <SelectValue placeholder="Default" />
        </SelectTrigger>
        <SelectContent>
          {options.map((d, i) => (
            <SelectItem key={d.deviceId} value={d.deviceId}>
              {d.label || `${label} ${i + 1}`}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function SpeakerPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [outputs, setOutputs] = useState<MediaDeviceInfo[]>([]);
  useEffect(() => {
    if (!("setSinkId" in HTMLMediaElement.prototype) || !navigator.mediaDevices?.enumerateDevices) return;
    const load = () =>
      navigator.mediaDevices
        .enumerateDevices()
        .then((all) => setOutputs(all.filter((d) => d.kind === "audiooutput" && d.deviceId)))
        .catch(() => setOutputs([]));
    void load();
    navigator.mediaDevices.addEventListener("devicechange", load);
    return () => navigator.mediaDevices.removeEventListener("devicechange", load);
  }, []);
  if (outputs.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">Speaker</Label>
      <Select value={value || outputs[0].deviceId} onValueChange={onChange}>
        <SelectTrigger aria-label="Speaker">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {outputs.map((d, i) => (
            <SelectItem key={d.deviceId} value={d.deviceId}>
              {d.label || `Speaker ${i + 1}`}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function VoiceIsolationToggle({ media }: { media: LocalMedia }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <Label htmlFor="voice-isolation" className="text-sm text-foreground">
          Voice isolation
        </Label>
        <p className="mt-0.5 text-xs text-muted-foreground">Filters background noise on your device before it&rsquo;s sent.</p>
      </div>
      <Switch id="voice-isolation" checked={media.voiceIsolation} onCheckedChange={media.setVoiceIsolation} />
    </div>
  );
}

export function DevicePickers({ media }: { media: LocalMedia }) {
  return (
    <div className="grid gap-3">
      <VoiceIsolationToggle media={media} />
      <DevicePicker label="Microphone" device={media.mic} />
      <DevicePicker label="Camera" device={media.camera} />
      <SpeakerPicker value={media.speakerId} onChange={media.setSpeakerId} />
    </div>
  );
}
