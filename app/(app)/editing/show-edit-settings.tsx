"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Loader2, X } from "lucide-react";
import { Alert } from "@/components/kit/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  SHOW_EDIT_BACKEND_LABELS, SHOW_EDIT_BACKENDS, SHOW_EDITOR_HOUSE_RULES_MAX, SHOW_EDITOR_VERSION_PATTERN,
  type ShowEditBackend, type ShowEditorDeviceView, type ShowEditorSettingsView
} from "@/src/lib/show-editor";
import { DEFAULT_SHOW_EDITOR_HOUSE_RULES } from "@/src/lib/show-editor-house-rules";
import { LABEL_CLASS } from "./show-edit-parts";

export type SettingsPatch = Partial<Pick<ShowEditorSettingsView, "autoStart" | "autoPublish" | "targetVersion" | "agentOrder" | "houseRules">>;

function SwitchRow({ id, label, hint, checked, disabled, onChange }: {
  id: string; label: string; hint: string; checked: boolean; disabled: boolean; onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3">
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} className="mt-0.5" />
      <label htmlFor={id} className="text-sm">
        <span className="font-medium">{label}</span>
        <span className="block text-[13px] text-muted-foreground">{hint}</span>
      </label>
    </div>
  );
}

function AgentOrder({ order, disabled, onChange }: { order: ShowEditBackend[]; disabled: boolean; onChange: (next: ShowEditBackend[]) => void }) {
  const missing = SHOW_EDIT_BACKENDS.filter((backend) => !order.includes(backend));
  const move = (index: number, by: number) => {
    const next = [...order];
    [next[index], next[index + by]] = [next[index + by], next[index]];
    onChange(next);
  };
  return (
    <div className="space-y-1.5">
      <div className={LABEL_CLASS}>AI account order</div>
      <p className="text-[13px] text-muted-foreground">The editor uses the first one that&rsquo;s signed in, then the next if it runs out.</p>
      <ol className="space-y-1" aria-label="AI account order">
        {order.map((backend, index) => (
          <li key={backend} className="flex items-center gap-1.5 text-sm">
            <span className="w-5 font-mono text-[12px] text-muted-foreground">{index + 1}</span>
            <span className="w-16">{SHOW_EDIT_BACKEND_LABELS[backend]}</span>
            <Button type="button" size="icon" variant="ghost" className="h-8 w-8" disabled={disabled || index === 0}
              aria-label={`Move ${SHOW_EDIT_BACKEND_LABELS[backend]} up`} onClick={() => move(index, -1)}>
              <ArrowUp aria-hidden />
            </Button>
            <Button type="button" size="icon" variant="ghost" className="h-8 w-8" disabled={disabled || index === order.length - 1}
              aria-label={`Move ${SHOW_EDIT_BACKEND_LABELS[backend]} down`} onClick={() => move(index, 1)}>
              <ArrowDown aria-hidden />
            </Button>
            <Button type="button" size="icon" variant="ghost" className="h-8 w-8" disabled={disabled || order.length === 1}
              aria-label={`Don't use ${SHOW_EDIT_BACKEND_LABELS[backend]}`} onClick={() => onChange(order.filter((item) => item !== backend))}>
              <X aria-hidden />
            </Button>
          </li>
        ))}
      </ol>
      {missing.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {missing.map((backend) => (
            <Button key={backend} type="button" size="sm" variant="outline" disabled={disabled} onClick={() => onChange([...order, backend])}>
              Add {SHOW_EDIT_BACKEND_LABELS[backend]}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Editor settings producers manage from the Editing tab. Remount it (key on `settings.updatedAt`) after a
 * save so the version field picks up what was stored.
 */
export function EditorSettingsForm({ settings, busy, onSave }: {
  settings: ShowEditorSettingsView;
  busy: boolean;
  onSave: (patch: SettingsPatch) => Promise<boolean>;
}) {
  const [version, setVersion] = useState(settings.targetVersion ?? "");
  const versionValid = version.trim() === "" || SHOW_EDITOR_VERSION_PATTERN.test(version.trim());
  return (
    <div className="space-y-4">
      <SwitchRow
        id="show-editor-auto-start" label="Start editing by itself" disabled={busy} checked={settings.autoStart}
        hint="When a new recording reaches the Shows folder on Drive, the edit of the next show starts without anyone pressing Start."
        onChange={(value) => void onSave({ autoStart: value })}
      />
      <SwitchRow
        id="show-editor-auto-publish" label="Schedule clean edits by themselves" disabled={busy} checked={settings.autoPublish}
        hint="An edit with nothing flagged and every check passed goes straight to YouTube with the usual title and time. Flagged edits always wait for review."
        onChange={(value) => void onSave({ autoPublish: value })}
      />
      <form
        className="space-y-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          if (versionValid) void onSave({ targetVersion: version.trim() || null });
        }}
      >
        <label htmlFor="show-editor-version" className={LABEL_CLASS}>Editor version</label>
        <div className="flex flex-wrap items-center gap-2">
          <Input id="show-editor-version" value={version} placeholder="Newest release" className="w-40"
            aria-invalid={!versionValid} onChange={(event) => setVersion(event.target.value)} />
          <Button type="submit" size="sm" variant="outline" disabled={busy || !versionValid}>Save</Button>
        </div>
        <p className="text-[13px] text-muted-foreground">
          {versionValid ? "Leave empty to follow the newest release, or pin one like v0.3.1 (also how to roll back)." : "A version looks like v0.3.1."}
        </p>
      </form>
      <AgentOrder order={settings.agentOrder} disabled={busy} onChange={(agentOrder) => void onSave({ agentOrder })} />
    </div>
  );
}

/** The house rules editor. Remount it (key on `settings.updatedAt`) after a save so the box shows what was stored. */
export function HouseRulesForm({ settings, busy, onSave }: {
  settings: ShowEditorSettingsView;
  busy: boolean;
  onSave: (patch: SettingsPatch) => Promise<boolean>;
}) {
  const [rules, setRules] = useState(settings.houseRules ?? DEFAULT_SHOW_EDITOR_HOUSE_RULES);
  return (
    <form
      className="space-y-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        void onSave({ houseRules: rules.trim() ? rules : null });
      }}
    >
      <label htmlFor="show-editor-house-rules" className="sr-only">House rules</label>
      <p className="text-[13px] text-muted-foreground">
        Decisions the editor follows instead of asking. Remembered fixes are added here.
        {settings.houseRules === null ? " The editor is using its built-in rules (shown below)." : ""}
      </p>
      <Textarea id="show-editor-house-rules" rows={14} value={rules} maxLength={SHOW_EDITOR_HOUSE_RULES_MAX}
        className="font-mono text-[12px]" onChange={(event) => setRules(event.target.value)} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" variant="outline" disabled={busy}>Save rules</Button>
        {settings.houseRules !== null ? (
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void onSave({ houseRules: null })}>
            Go back to the built-in rules
          </Button>
        ) : null}
      </div>
    </form>
  );
}

type PendingLink = { userCode: string; deviceName: string; expiresAt: string };

/** `/editing?link=CODE`: a producer confirms the editing machine that asked to be linked. */
export function LinkConfirm({ code, devices, onDone }: { code: string; devices: ShowEditorDeviceView[]; onDone: (message: string | null) => void }) {
  const [pending, setPending] = useState<PendingLink | null | "loading">("loading");
  const [activate, setActivate] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void fetch(`/api/show-roles/edits?link=${encodeURIComponent(code)}`, { cache: "no-store" })
      .then((response) => response.json().catch(() => ({})))
      .then((body: { data?: { link: PendingLink | null } }) => setPending(body.data?.link ?? null))
      .catch(() => setPending(null));
  }, [code]);

  async function decide(approve: boolean) {
    setBusy(true);
    try {
      const response = await fetch("/api/show-roles/edits", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "link", userCode: code, approve, activate })
      });
      const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "Couldn't link it. Start again on the Mac.");
      onDone(approve ? "Linked. The Mac finishes setting up by itself." : null);
    } catch (error) {
      onDone(error instanceof Error ? error.message : "Couldn't link it.");
    } finally {
      setBusy(false);
    }
  }

  if (pending === "loading") return null;
  if (!pending) {
    return (
      <Alert tone="warning" title="That link code isn't valid any more" action={<Button size="sm" variant="outline" onClick={() => onDone(null)}>Close</Button>}>
        It may have expired or been used. Press Link to Portal on the Mac again.
      </Alert>
    );
  }
  const current = devices.find((device) => device.active);
  return (
    <Alert tone="info" title={`Link the editor Mac '${pending.deviceName}'?`}>
      <div className="space-y-3">
        <p>Only approve this if you just pressed Link to Portal on that Mac (code {pending.userCode}).</p>
        <Checkbox checked={activate} onCheckedChange={setActivate}>Make it the active editor now</Checkbox>
        {current && activate ? (
          <p className="text-[13px]">It replaces {current.name} as the active editor. {current.name} stays linked, and you can switch back any time.</p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" disabled={busy} onClick={() => void decide(true)}>
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
            Approve
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void decide(false)}>Cancel</Button>
        </div>
      </div>
    </Alert>
  );
}
