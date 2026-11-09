import { Switch } from "@/components/ui/switch";
import { SettingsCell } from "@/components/settings-layout";
import { writeSeasonalGoodiesOn } from "@/src/lib/seasonal-goodies";
import { useHalloweenActive } from "@/src/lib/use-halloween";
import { useSeasonalGoodiesOn } from "@/src/lib/use-seasonal-goodies";
import { useThanksgivingActive } from "@/src/lib/use-thanksgiving";

/**
 * Settings → Appearance while a holiday theme is on: hide that season's extras (visitors, sounds,
 * surprises, welcome) in this browser but keep its colors and logos. One switch for every season.
 */
export function SeasonalGoodiesCell({ onSaved }: { onSaved: () => void }) {
  const halloween = useHalloweenActive();
  const thanksgiving = useThanksgivingActive();
  const on = useSeasonalGoodiesOn();

  if (!halloween && !thanksgiving) return null;

  return (
    <SettingsCell
      inline
      title="Holiday extras"
      description="Visitors, sounds and surprises. Off keeps just the holiday colors."
      htmlFor="pref-seasonal-goodies"
      className="min-h-16"
    >
      <Switch
        id="pref-seasonal-goodies"
        checked={on}
        onCheckedChange={(next) => {
          writeSeasonalGoodiesOn(next);
          onSaved();
        }}
      />
    </SettingsCell>
  );
}
