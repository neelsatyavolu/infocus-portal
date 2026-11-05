"use client";

import { forwardRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { MeetingRoomSettings } from "@/src/lib/meetings/protocol";
import { errorMessage, meetingsApi } from "@/src/lib/meetings/client/api";

/** Label and hint on the left, the control on the right, one row per setting. */
function SettingRow({ id, label, hint, control }: { id?: string; label: string; hint?: string; control: ReactNode }) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-4 py-2.5">
      <div className="min-w-0">
        {id ? (
          <Label htmlFor={id} className="text-sm text-foreground">
            {label}
          </Label>
        ) : (
          <p className="text-sm font-medium text-foreground">{label}</p>
        )}
        {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      <div className="flex shrink-0 items-center">{control}</div>
    </div>
  );
}

/**
 * The Meeting dialog's host section: quick access and notes (live room settings, one PATCH each;
 * a pending change disables both switches), and End meeting for everyone (through a confirm).
 */
export const HostSettingsSection = forwardRef<
  HTMLElement,
  { meetingId: string; settings: MeetingRoomSettings; onEnd: () => void }
>(function HostSettingsSection({ meetingId, settings, onEnd }, ref) {
  const [pending, setPending] = useState<keyof MeetingRoomSettings | null>(null);

  async function toggle(key: keyof MeetingRoomSettings, value: boolean) {
    setPending(key);
    try {
      await meetingsApi.patch(meetingId, { [key]: value });
      toast.success(
        key === "quickAccess"
          ? value
            ? "Producers can now join without asking."
            : "Producers now ask to join."
          : value
            ? "Notes are on."
            : "Notes are off."
      );
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setPending(null);
    }
  }

  return (
    <section ref={ref} tabIndex={-1} aria-labelledby="host-settings-title" className="scroll-mt-4 outline-none">
      <h3 id="host-settings-title" className="text-[11px] font-medium uppercase tracking-[0.11em] text-muted-foreground">
        Host settings
      </h3>
      <div className="mt-1 divide-y divide-border border-b border-border">
        <SettingRow
          id="host-quick-access"
          label="Quick access"
          hint="Producers join without asking a host."
          control={
            <Switch
              id="host-quick-access"
              checked={settings.quickAccess}
              disabled={pending !== null}
              onCheckedChange={(value) => void toggle("quickAccess", value)}
            />
          }
        />
        <SettingRow
          id="host-notes"
          label="Notes"
          hint="The Drive transcribes and summarizes this meeting."
          control={
            <Switch
              id="host-notes"
              checked={settings.notesEnabled}
              disabled={pending !== null}
              onCheckedChange={(value) => void toggle("notesEnabled", value)}
            />
          }
        />
        <SettingRow
          label="End meeting"
          hint="Everyone leaves the call now."
          control={
            <Button variant="destructive-quiet" onClick={onEnd}>
              End for everyone
            </Button>
          }
        />
      </div>
    </section>
  );
});
