import { useSyncExternalStore } from "react";
import { Switch } from "@/components/ui/switch";
import { SettingsCell } from "@/components/settings-layout";
import { isChristmasSeason, readChristmasPrefs, writeChristmasPrefs, type ChristmasPrefs } from "@/src/lib/christmas";
import { applySeasonClasses } from "@/src/lib/thanksgiving";
import { useChristmasPrefs } from "@/src/lib/use-christmas";
import { useSeasonalGoodiesOn } from "@/src/lib/use-seasonal-goodies";
import { useCanPreviewSeasons } from "./season-preview";

function subscribeNever() {
  return () => undefined;
}

/**
 * Settings → Appearance from November 29 (or while a super admin previews it): turn the Christmas look
 * and decorations off in this browser, mute the sleigh bells or stop the snow. Super admins also
 * get a Preview switch all year, which turns it on in their browser only.
 */
export function ChristmasCells({ onSaved }: { onSaved: () => void }) {
  const inSeason = useSyncExternalStore(subscribeNever, () => isChristmasSeason(new Date()), () => false);
  const canPreview = useCanPreviewSeasons();
  const prefs = useChristmasPrefs();
  const goodiesOn = useSeasonalGoodiesOn();

  function update(change: Partial<Omit<ChristmasPrefs, "gifts" | "treats">>) {
    writeChristmasPrefs({ ...readChristmasPrefs(), ...change });
    // Thanksgiving or Halloween come back (or step aside) with Christmas.
    applySeasonClasses();
    onSaved();
  }

  const previewing = canPreview && prefs.preview;
  const gifts = prefs.gifts === 1 ? "1 present caught" : `${prefs.gifts} presents caught`;
  const treats = prefs.treats === 1 ? "1 treat" : `${prefs.treats} treats`;

  return (
    <>
      {canPreview && (!inSeason || prefs.preview) ? (
        <SettingsCell
          inline
          title="Preview Christmas"
          description="Super admins only. Shows the Christmas theme in this browser now; nobody else sees it. Type s-a-n-t-a to call the sleigh."
          htmlFor="pref-christmas-preview"
          className="min-h-16"
        >
          <Switch
            id="pref-christmas-preview"
            checked={prefs.preview}
            onCheckedChange={(on) => update(on ? { preview: true, off: false } : { preview: false })}
          />
        </SettingsCell>
      ) : null}
      {inSeason || previewing ? (
        <>
          <SettingsCell
            inline
            title="Christmas"
            description={`Lights, snow and visitors through Dec 31. ${gifts}, ${treats}.`}
            htmlFor="pref-christmas"
            className="min-h-16"
          >
            <Switch id="pref-christmas" checked={!prefs.off} onCheckedChange={(on) => update({ off: !on })} />
          </SettingsCell>
          <SettingsCell inline title="Sleigh bells" htmlFor="pref-christmas-sounds" className="min-h-16">
            <Switch
              id="pref-christmas-sounds"
              checked={!prefs.muted}
              disabled={prefs.off || !goodiesOn}
              onCheckedChange={(on) => update({ muted: !on })}
            />
          </SettingsCell>
          <SettingsCell inline title="Falling snow" htmlFor="pref-christmas-snow" className="min-h-16">
            <Switch
              id="pref-christmas-snow"
              checked={!prefs.snowOff}
              disabled={prefs.off || !goodiesOn}
              onCheckedChange={(on) => update({ snowOff: !on })}
            />
          </SettingsCell>
        </>
      ) : null}
    </>
  );
}
