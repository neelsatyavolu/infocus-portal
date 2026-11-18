import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { STORY_TEMPLATES, fieldDefault, type CanvasTemplate, type StoryValues } from "@/components/story-maker/story-templates";
import { groupTemplates } from "@/components/social-story/template-meta";
import { CustomElementArt } from "@/components/story-maker/custom/custom-elements";
import { createElement, type ElementPreset } from "@/src/lib/story-custom";
import { STORY_FORMATS, STORY_THEMES } from "@/src/lib/story-maker";

const canvases = STORY_TEMPLATES.filter((t): t is CanvasTemplate => t.kind === "canvas");
const defaults = (template: CanvasTemplate): StoryValues => Object.fromEntries(template.fields.map((f) => [f.key, fieldDefault(f)]));
const render = (template: CanvasTemplate, values: StoryValues, format: (typeof STORY_FORMATS)[number] = "post") =>
  renderToStaticMarkup(template.render(values, { format, theme: "light" }));

describe("Post Maker templates", () => {
  it("every template appears once in the picker", () => {
    const listed = groupTemplates(STORY_TEMPLATES).flatMap((group) => group.templates.map((t) => t.id));
    expect([...listed].sort()).toEqual(STORY_TEMPLATES.map((t) => t.id).sort());
  });

  for (const template of canvases) {
    it(`${template.name} renders its sample in every format and theme, with the header and footer`, () => {
      for (const format of STORY_FORMATS) {
        for (const theme of STORY_THEMES) {
          const html = renderToStaticMarkup(template.render(defaults(template), { format, theme }));
          expect(html).toContain("sm-head");
          expect(html).toContain("@infocusnews");
        }
      }
    });

    it(`${template.name} survives empty fields`, () => {
      const empty = Object.fromEntries(template.fields.map((f) => [f.key, f.type === "photo" ? null : ""]));
      expect(() => render(template, empty)).not.toThrow();
    });
  }
});

describe("results templates", () => {
  const byId = (id: string) => canvases.find((t) => t.id === id) as CanvasTemplate;

  it("shows shares of all votes and a check only when called", () => {
    const race = byId("race");
    const values = { ...defaults(race), candidates: "A One | D | 600\nB Two | R | 400", other: "0", seats: "1", status: "leads" };
    const leading = render(race, values);
    expect(leading).toContain("60.0%");
    expect(leading).toContain("One leads");
    expect(leading).not.toContain("sm-check");
    const called = render(race, { ...values, status: "wins" });
    expect(called).toContain("One wins");
    expect(called).toContain("sm-check");
  });

  it("draws a cut line in multi-seat races", () => {
    const race = byId("race");
    expect(render(race, defaults(race))).toContain("Top 3 win");
  });

  it("measures against the threshold", () => {
    const measure = byId("measure");
    const html = render(measure, { ...defaults(measure), yes: "600", no: "400", threshold: "66.67", status: "leads" });
    expect(html).toContain("Needs 66.7%");
    expect(html).toContain("6.7 points short");
  });

  it("shows the link sticker spot only on stories", () => {
    const link = byId("link");
    expect(render(link, defaults(link), "story")).toContain("sm-sticker");
    expect(render(link, defaults(link), "post")).not.toContain("sm-sticker");
  });
});

describe("Custom pieces", () => {
  const presets: ElementPreset[] = ["text", "number", "photo", "plate", "strip", "rule", "icon", "wordmark", "header", "footer", "follow"];
  it("renders every piece", () => {
    for (const preset of presets) {
      expect(() => renderToStaticMarkup(<CustomElementArt el={createElement(preset, preset)} />)).not.toThrow();
    }
  });
});
