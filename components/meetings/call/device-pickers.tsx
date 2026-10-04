"use client";

import { useEffect, useState } from "react";
import { useObservableAsValue } from "partytracks/react";
import type { MediaDevice } from "partytracks/client";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { saveDevicePref } from "@/src/lib/meetings/client/device-prefs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** Select triggers ring on any focus by default; Meetings shows rings for keyboard focus only. */
export const TRIGGER_FOCUS = "focus:ring-0 focus-visible:ring-2 focus-visible:ring-[var(--brand-green)]";

export function DevicePicker({ label, kind, device }: { label: string; kind: "mic" | "camera"; device: MediaDevice }) {
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
          if (!chosen) return;
          device.setPreferredDevice(chosen);
          saveDevicePref(kind, chosen);
        }}
      >
        <SelectTrigger aria-label={label} className={TRIGGER_FOCUS}>
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

export function SpeakerPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
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
  const choose = (id: string) => {
    onChange(id);
    const chosen = outputs.find((d) => d.deviceId === id);
    if (chosen) saveDevicePref("speaker", chosen);
  };
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">Speaker</Label>
      <Select value={value || outputs[0].deviceId} onValueChange={choose}>
        <SelectTrigger aria-label="Speaker" className={TRIGGER_FOCUS}>
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

/** A labelled on/off row: the label and hint on the left, the switch on the right. */
export function SettingSwitch({
  id,
  label,
  hint,
  checked,
  onChange
}: {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <Label htmlFor={id} className="text-sm text-foreground">
          {label}
        </Label>
        {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
