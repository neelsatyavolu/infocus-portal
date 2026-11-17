"use client";

import { NativeSelect } from "@/components/ui/native-select";
import { introLooks, type ShowEditorDeviceView, type ShowEditorSettingsView } from "@/src/lib/show-editor";
import { LABEL_CLASS } from "./show-edit-parts";
import type { SettingsPatch } from "./show-edit-settings";

const USUAL = "";

/** Which intro each look opens with. The choices are the intro files the active Mac has in that look's package. */
export function IntroPicker({ settings, devices, busy, onSave }: {
  settings: ShowEditorSettingsView;
  devices: ShowEditorDeviceView[];
  busy: boolean;
  onSave: (patch: SettingsPatch) => Promise<boolean>;
}) {
  const active = devices.find((device) => device.active);
  const looks = introLooks(active?.intros ?? {}, settings.intros);
  const choose = (look: string, file: string) => {
    const rest = Object.fromEntries(Object.entries(settings.intros).filter(([other]) => other !== look));
    void onSave({ intros: file === USUAL ? rest : { ...rest, [look]: file } });
  };
  if (looks.length === 0) {
    return (
      <p className="text-[13px] text-muted-foreground">
        {active ? `${active.name} hasn't said which intros it has yet. Make sure it's on and updated.` : "Link an editing Mac to pick intros."}
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-[13px] text-muted-foreground">
        The intro each look opens with. The show&rsquo;s date picks the look. The choices are the intro files in that look&rsquo;s package on {active?.name ?? "the editing Mac"}.
        To add a new or revised intro, put it in the look&rsquo;s package zip on Drive. It shows up here after the Mac&rsquo;s daily refresh.
      </p>
      <div className="grid gap-3 sm:grid-cols-[8rem_minmax(0,1fr)] sm:items-center">
        {looks.map(({ look, label, files, pick, missing }) => (
          <div key={look || "regular"} className="contents">
            <label htmlFor={`intro-${look || "regular"}`} className={LABEL_CLASS}>{label}</label>
            <div className="min-w-0 space-y-1">
              <NativeSelect id={`intro-${look || "regular"}`} value={pick ?? USUAL} disabled={busy}
                onChange={(event) => choose(look, event.target.value)}>
                <option value={USUAL}>Usual intro</option>
                {files.map((file) => <option key={file} value={file}>{file}</option>)}
                {missing && pick ? <option value={pick}>{pick} (not on the Mac)</option> : null}
              </NativeSelect>
              {missing ? (
                <p className="text-[13px] text-amber-700 dark:text-amber-400">
                  {active?.name ?? "The editing Mac"} doesn&rsquo;t have this file, so it uses the usual intro.
                </p>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
