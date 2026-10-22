"use client";

import { Panel } from "@/components/kit/panel";
import type { ShowEditorSettingsView } from "@/src/lib/show-editor";
import { EditorSettingsForm, HouseRulesForm, type SettingsPatch } from "./show-edit-settings";
import type { EditAction } from "./use-show-edit";

/** The Settings view: how the editor runs, and the house rules it follows. Both remount after a save. */
export function EditingSettingsView({ settings, busy, send }: {
  settings: ShowEditorSettingsView;
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
      <Panel title="House rules">
        <HouseRulesForm key={version} settings={settings} busy={busy} onSave={save} />
      </Panel>
    </div>
  );
}
