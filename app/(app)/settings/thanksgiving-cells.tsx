import { useSyncExternalStore } from "react";
import { Switch } from "@/components/ui/switch";
import { SettingsCell } from "@/components/settings-layout";
import {
  isThanksgivingSeason,
  readThanksgivingPrefs,
  writeThanksgivingPrefs,
  type ThanksgivingPrefs
} from "@/src/lib/thanksgiving";
import { useThanksgivingPrefs } from "@/src/lib/use-thanksgiving";
import { useCanPreviewSeasons } from "./season-preview";

function subscribeNever() {
  return () => undefined;
}

/**
 * Settings → Appearance in November (or while a super admin previews it): turn the Thanksgiving
 * look and visitors off in this browser, mute their sounds or send the giant turkey away. Super
 * admins also get a Preview switch all year, which turns it on in their browser only.
 */
export function ThanksgivingCells({ onSaved }: { onSaved: () => void }) {
  const inSeason = useSyncExternalStore(subscribeNever, () => isThanksgivingSeason(new Date()), () => false);
  const canPreview = useCanPreviewSeasons();
  const prefs = useThanksgivingPrefs();

  function update(change: Partial<Omit<ThanksgivingPrefs, "leaves" | "pies">>) {
    writeThanksgivingPrefs({ ...readThanksgivingPrefs(), ...change });
    onSaved();
  }

  const previewing = canPreview && prefs.preview;
  const leaves = prefs.leaves === 1 ? "1 leaf caught" : `${prefs.leaves} leaves caught`;
  const pies = prefs.pies === 1 ? "1 pie eaten" : `${prefs.pies} pies eaten`;

  return (
    <>
      {canPreview && (!inSeason || prefs.preview) ? (
        <SettingsCell
          inline
          title="Preview Thanksgiving"
          description="Super admins only. Shows the November theme in this browser now; nobody else sees it. Type g-o-b-b-l-e to call the giant turkey."
          htmlFor="pref-thanksgiving-preview"
          className="min-h-16"
        >
          <Switch
            id="pref-thanksgiving-preview"
            checked={prefs.preview}
            onCheckedChange={(on) => update(on ? { preview: true, off: false } : { preview: false })}
          />
        </SettingsCell>
      ) : null}
      {inSeason || previewing ? (
        <>
          <SettingsCell
            inline
            title="Thanksgiving"
            description={`Harvest colors and visitors through Nov 30. ${leaves}, ${pies}.`}
            htmlFor="pref-thanksgiving"
            className="min-h-16"
          >
            <Switch id="pref-thanksgiving" checked={!prefs.off} onCheckedChange={(on) => update({ off: !on })} />
          </SettingsCell>
          <SettingsCell inline title="Harvest sounds" htmlFor="pref-thanksgiving-sounds" className="min-h-16">
            <Switch
              id="pref-thanksgiving-sounds"
              checked={!prefs.muted}
              disabled={prefs.off}
              onCheckedChange={(on) => update({ muted: !on })}
            />
          </SettingsCell>
          <SettingsCell
            inline
            title="Giant turkey"
            description="Every few minutes it walks in and tries to eat you."
            htmlFor="pref-thanksgiving-turkey"
            className="min-h-16"
          >
            <Switch
              id="pref-thanksgiving-turkey"
              checked={!prefs.turkeyOff}
              disabled={prefs.off}
              onCheckedChange={(on) => update({ turkeyOff: !on })}
            />
          </SettingsCell>
        </>
      ) : null}
    </>
  );
}
