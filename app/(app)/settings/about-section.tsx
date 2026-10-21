import { AboutPortalText } from "@/components/about-portal";
import { SettingsPanel, SettingsPanelBody, SettingsSection } from "@/components/settings-layout";

const LINK = "text-foreground underline decoration-muted-foreground underline-offset-4 hover:decoration-current";

/** Settings → About: who built the Portal, how, and how to contribute. */
export function AboutSection() {
  return (
    <SettingsSection id="about" title="About">
      <SettingsPanel>
        <SettingsPanelBody className="flex flex-col gap-3 text-[13px] leading-relaxed text-[var(--ink-text)]">
          <AboutPortalText linkClassName={LINK} />
        </SettingsPanelBody>
      </SettingsPanel>
    </SettingsSection>
  );
}
