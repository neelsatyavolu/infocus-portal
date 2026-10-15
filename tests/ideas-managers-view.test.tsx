import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { IdeaCard } from "@/app/(app)/ideas/idea-card";
import { ideaCardLayout } from "@/app/(app)/ideas/idea-grid";
import { IdeasSetNav } from "@/app/(app)/ideas/ideas-set-nav";
import { newSetState } from "@/app/(app)/ideas/new-set-tag";
import { ManagerAreaColumns, ManagerAreaRow, orderManagerAreas } from "@/app/(app)/managers/manager-area-row";
import type { IdeaSuggestion } from "@/src/lib/ideas";
import { accessFromAppointments, managerAreas } from "@/src/lib/managers";

const spanAt = (className: string, prefix: string) => {
  const match = className.match(new RegExp(`(?:^| )${prefix}:col-span-(\\d)(?: |$)`));
  return match ? Number(match[1]) : 1;
};

describe("ideaCardLayout", () => {
  it("fills every row exactly at 3 across (6 tracks) and at 2 across", () => {
    for (let count = 1; count <= 12; count += 1) {
      const layouts = Array.from({ length: count }, (_, index) => ideaCardLayout(index, count));
      let rowAtThree = 0;
      for (const layout of layouts) {
        rowAtThree += spanAt(layout.className, "@6xl");
        expect(rowAtThree).toBeLessThanOrEqual(6);
        if (rowAtThree === 6) rowAtThree = 0;
      }
      expect(rowAtThree, `count ${count} at 3 across`).toBe(0);
      const tracksAtTwo = layouts.reduce((sum, layout) => sum + spanAt(layout.className, "@2xl"), 0);
      expect(tracksAtTwo % 2, `count ${count} at 2 across`).toBe(0);
    }
  });

  it("never leaves a single card alone at 3 across unless the section has one idea", () => {
    expect(Array.from({ length: 4 }, (_, index) => spanAt(ideaCardLayout(index, 4).className, "@6xl"))).toEqual([3, 3, 3, 3]);
    expect(Array.from({ length: 7 }, (_, index) => spanAt(ideaCardLayout(index, 7).className, "@6xl"))).toEqual([2, 2, 2, 3, 3, 3, 3]);
    expect(Array.from({ length: 5 }, (_, index) => spanAt(ideaCardLayout(index, 5).className, "@6xl"))).toEqual([2, 2, 2, 3, 3]);
    expect(ideaCardLayout(0, 1)).toEqual({ className: "@2xl:col-span-2 @6xl:col-span-6", wide: "always" });
  });

  it("makes only a lone last card wide", () => {
    expect(ideaCardLayout(2, 3).wide).toBe("two-across");
    expect(ideaCardLayout(1, 3).wide).toBe("never");
    expect(ideaCardLayout(3, 4).wide).toBe("never");
  });
});

describe("newSetState", () => {
  it("records the first visit without calling it new", () => {
    expect(newSetState(null, "2026-10-14")).toEqual({ isNew: false, record: true });
  });

  it("calls a set new when it arrived after the last one seen", () => {
    expect(newSetState("2026-10-12", "2026-10-14")).toEqual({ isNew: true, record: true });
  });

  it("changes nothing for a set already seen", () => {
    expect(newSetState("2026-10-14", "2026-10-14")).toEqual({ isNew: false, record: false });
    expect(newSetState("2026-10-16", "2026-10-14")).toEqual({ isNew: false, record: false });
  });
});

const IDEA: IdeaSuggestion = {
  title: "Library hours",
  pitch: "The city library changes its weekend hours.",
  angle: "Ask students who study there on Sundays.",
  category: "news",
  sources: [{ title: "Library update", outlet: "Example News", url: "https://example.com/story" }]
};

describe("IdeaCard", () => {
  it("opens sources in a new tab and says so to screen readers", () => {
    const markup = renderToStaticMarkup(<IdeaCard idea={IDEA} />);
    expect(markup).toContain('target="_blank"');
    expect(markup).toContain('rel="noopener noreferrer"');
    expect(markup).toContain("(opens in a new tab)");
    expect(markup).not.toContain("@2xl:grid-cols-2");
  });

  it("lays a wide card out in two columns only in its range", () => {
    expect(renderToStaticMarkup(<IdeaCard idea={IDEA} wide="two-across" />)).toContain("@2xl:@max-6xl:grid-cols-2");
    expect(renderToStaticMarkup(<IdeaCard idea={IDEA} wide="always" />)).toContain("@2xl:grid-cols-2");
  });
});

describe("IdeasSetNav", () => {
  const runDates = ["2026-10-14", "2026-10-12", "2026-10-10"];

  it("steps to the older and newer set; the newest set lives at /ideas", () => {
    const markup = renderToStaticMarkup(<IdeasSetNav runDates={runDates} current="2026-10-12" />);
    expect(markup).toContain('href="/ideas?date=2026-10-10"');
    expect(markup).toContain('href="/ideas"');
    expect(markup).toContain('aria-label="Past ideas"');
  });

  it("keeps a disabled arrow at the newest end", () => {
    const markup = renderToStaticMarkup(<IdeasSetNav runDates={runDates} current="2026-10-14" />);
    expect(markup).toMatch(/aria-disabled="true" aria-label="Newer set"/);
    expect(markup).toContain('href="/ideas?date=2026-10-12"');
  });

  it("shows only the menu when the set on screen is not in the list", () => {
    const markup = renderToStaticMarkup(<IdeasSetNav runDates={runDates} current={null} />);
    expect(markup).not.toContain("Older set");
    expect(markup).not.toContain("Newer set");
    expect(markup).toContain("Past ideas");
  });
});

describe("Managers areas", () => {
  it("lists your areas first, then other open tools, then locked ones", () => {
    const roles = ["website" as const];
    const areas = managerAreas(accessFromAppointments(false, roles));
    expect(orderManagerAreas(areas, roles).map((area) => area.id)).toEqual(["website", "livestreams", "equipment", "social-media"]);
  });

  it("keeps the fixed order for a producer", () => {
    const areas = managerAreas(accessFromAppointments(true, []));
    expect(orderManagerAreas(areas, []).map((area) => area.id)).toEqual(["equipment", "livestreams", "website", "social-media"]);
  });

  it("puts the Area label over the area names, not the icons", () => {
    expect(renderToStaticMarkup(<ManagerAreaColumns />)).toContain("<span></span><span>Area</span>");
  });

  it("links an open area and tags a locked one", () => {
    const [equipment, livestreams] = managerAreas(accessFromAppointments(false, []));
    const open = renderToStaticMarkup(<ManagerAreaRow area={livestreams} people={[]} yours={false} />);
    expect(open).toContain('href="/livestreams"');
    expect(open).toContain("No one appointed yet");
    const locked = renderToStaticMarkup(<ManagerAreaRow area={equipment} people={[{ userId: "u1", name: "Abby" }]} yours={false} />);
    expect(locked).toContain("Locked");
    expect(locked).toContain("Ask a producer if you need it.");
    expect(locked).not.toContain("<a ");
    expect(locked).not.toContain("aria-disabled");
  });
});
