"use client";

import { Panel } from "@/components/kit/panel";
import type { ShowEditorDeviceView, ShowEditorSettingsView } from "@/src/lib/show-editor";
import { IntroPicker } from "./show-edit-intros";
import { EditorSettingsForm, HouseRulesForm, type SettingsPatch } from "./show-edit-settings";
import type { EditAction } from "./use-show-edit";

/** The Settings view: how the editor runs, which intros it uses, and the house rules it follows. Forms remount after a save. */
export function EditingSettingsView({ settings, devices, busy, send }: {
  settings: ShowEditorSettingsView;
  devices: ShowEditorDeviceView[];
  busy: boolean;
  send: (body: EditAction, success?: string) => Promise<boolean>;
}) {
  const save = (patch: SettingsPatch) => send({ action: "settings", ...patch }, "Saved.");
  const version = settings.updatedAt ?? "default";
  return (
    <div className="space-y-5">
      <Panel title="Editor settings">
        <EditorSettingsForm key={version} settings={settings} busy={busy} onSave={save} />
      </Panel>
      <Panel title="Intros">
        <IntroPicker settings={settings} devices={devices} busy={busy} onSave={save} />
      </Panel>
      <Panel title="House rules">
        <HouseRulesForm key={version} settings={settings} busy={busy} onSave={save} />
      </Panel>
    </div>
  );
}
