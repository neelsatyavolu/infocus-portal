import { useSyncExternalStore } from "react";
import { Switch } from "@/components/ui/switch";
import { SettingsCell } from "@/components/settings-layout";
import { isHalloweenSeason, readHalloweenPrefs, writeHalloweenPrefs, type HalloweenPrefs } from "@/src/lib/halloween";
import { useHalloweenPrefs } from "@/src/lib/use-halloween";

function subscribeNever() {
  return () => undefined;
}

/**
 * Settings → Appearance during the Halloween season (Oct 15 – Nov 1): turn the Halloween look and
 * visitors off in this browser, or just mute their sounds, the music or the surprise BOOs. Renders
 * nothing the rest of the year.
 */
export function HalloweenCells({ onSaved }: { onSaved: () => void }) {
  const inSeason = useSyncExternalStore(subscribeNever, () => isHalloweenSeason(new Date()), () => false);
  const prefs = useHalloweenPrefs();

  if (!inSeason) return null;

  function update(change: Partial<Omit<HalloweenPrefs, "smashed" | "candy">>) {
    writeHalloweenPrefs({ ...readHalloweenPrefs(), ...change });
    onSaved();
  }

  const smashed = prefs.smashed === 1 ? "1 pumpkin smashed" : `${prefs.smashed} pumpkins smashed`;
  const candy = prefs.candy === 1 ? "1 candy caught" : `${prefs.candy} candies caught`;

  return (
    <>
      <SettingsCell
        inline
        title="Halloween"
        description={`Pumpkin colors and visitors until Nov 1. ${smashed}, ${candy}.`}
        htmlFor="pref-halloween"
        className="min-h-16"
      >
        <Switch id="pref-halloween" checked={!prefs.off} onCheckedChange={(on) => update({ off: !on })} />
      </SettingsCell>
      <SettingsCell inline title="Spooky sounds" htmlFor="pref-halloween-sounds" className="min-h-16">
        <Switch
          id="pref-halloween-sounds"
          checked={!prefs.muted}
          disabled={prefs.off}
          onCheckedChange={(on) => update({ muted: !on })}
        />
      </SettingsCell>
      <SettingsCell
        inline
        title="Spooky music"
        description="Pauses while a video plays."
        htmlFor="pref-halloween-music"
        className="min-h-16"
      >
        <Switch
          id="pref-halloween-music"
          checked={!prefs.musicOff}
          disabled={prefs.off}
          onCheckedChange={(on) => update({ musicOff: !on })}
        />
      </SettingsCell>
      <SettingsCell
        inline
        title="Surprise BOOs"
        description="Something jumps out every 60–90 seconds."
        htmlFor="pref-halloween-scares"
        className="min-h-16"
      >
        <Switch
          id="pref-halloween-scares"
          checked={!prefs.scaresOff}
          disabled={prefs.off}
          onCheckedChange={(on) => update({ scaresOff: !on })}
        />
      </SettingsCell>
    </>
  );
}
