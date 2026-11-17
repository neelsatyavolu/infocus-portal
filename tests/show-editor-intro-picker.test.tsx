import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { IntroPicker } from "@/app/(app)/editing/show-edit-intros";
import type { ShowEditorDeviceView, ShowEditorSettingsView } from "@/src/lib/show-editor";

const SETTINGS: ShowEditorSettingsView = {
  autoStart: false, autoPublish: false, targetVersion: null, agentOrder: ["claude"], houseRules: null,
  intros: { christmas: "InFocus Intro Christmas 2026 - Collage (new music).mp4", halloween: "Old.mp4" }, updatedAt: null
};

function device(intros: Record<string, string[]>): ShowEditorDeviceView {
  return {
    id: "mac", name: "Team MacBook", kind: "dedicated", active: true, online: true, linkedAt: "2026-11-01T00:00:00.000Z",
    lastSeenAt: null, version: "v0.2.28", busy: false, health: null, backends: [], intros
  };
}

const render = (devices: ShowEditorDeviceView[]) =>
  renderToStaticMarkup(<IntroPicker settings={SETTINGS} devices={devices} busy={false} onSave={async () => true} />);

describe("intro picker", () => {
  it("offers each look's installed intros, selects the pick and warns about one the Mac doesn't have", () => {
    const html = render([device({
      "": ["InFocus Intro 2026.mp4"],
      christmas: ["InFocus Intro Christmas 2026 - Collage (new music).mp4", "InFocus Intro Christmas 2026.mp4"]
    })]);
    expect(html).toContain("Regular");
    expect(html).toContain("Christmas");
    expect(html).toMatch(/<option value="InFocus Intro Christmas 2026 - Collage \(new music\)\.mp4" selected="">/);
    expect(html).toContain("Old.mp4 (not on the Mac)");
    expect(html).toContain("doesn’t have this file, so it uses the usual intro");
  });

  it("says what to do when no Mac has reported its intros", () => {
    expect(renderToStaticMarkup(<IntroPicker settings={{ ...SETTINGS, intros: {} }} devices={[]} busy={false} onSave={async () => true} />))
      .toContain("Link an editing Mac to pick intros.");
  });
});
