import type { ReactElement } from "react";
import { splitPoints, type StoryFormat, type StoryTheme } from "@/src/lib/story-maker";
import { RESULT_TEMPLATES } from "./results-templates";
import {
  Frame,
  PackageArtwork,
  Photo,
  Points,
  kickerField,
  metaField,
  noteField,
  photoOf,
  sourceField,
  text,
  type StoryField,
  type StoryValues
} from "./story-parts";

export { Footer, Header, Photo, PackageArtwork, STORY_ICON_SRC } from "./story-parts";
export type { PhotoField, SelectField, StoryField, StoryPhoto, StoryValues, TextField } from "./story-parts";


/** What a template knows about the canvas it draws on. */
export type RenderContext = { format: StoryFormat; theme: StoryTheme };

export type CanvasTemplate = {
  kind: "canvas";
  id: string;
  name: string;
  description: string;
  fields: StoryField[];
  render: (values: StoryValues, ctx: RenderContext) => ReactElement;
};
/** Drawn by the livestream thumbnail renderer (/api/live/thumbnail) so both stay identical. */
export type LivestreamTemplate = { kind: "livestream"; id: "livestream"; name: string; description: string };
/** Freeform: brand pieces placed anywhere (components/story-maker/custom). */
export type CustomTemplate = { kind: "custom"; id: "custom"; name: string; description: string };
/** One show as several slides, loaded from the Portal (components/story-maker/show). */
export type ShowTemplate = { kind: "show"; id: "show"; name: string; description: string };
export type StoryTemplate = CanvasTemplate | LivestreamTemplate | CustomTemplate | ShowTemplate;

export function fieldDefault(field: StoryField): string | null {
  if (field.type === "photo") return null;
  return typeof field.def === "function" ? field.def() : field.def;
}

export function isFieldVisible(field: StoryField, values: StoryValues) {
  return field.type !== "photo" || !field.showIf || field.showIf(values);
}

const Meta = ({ value }: { value: string }) => (value ? <><div className="sm-gap-s" /><div className="sm-meta">{value}</div></> : null);

// ---------- Templates ----------

const GENERAL_TEMPLATES: StoryTemplate[] = [
  {
    kind: "canvas",
    id: "cover",
    name: "Headline",
    description: "A photo, the headline and a date or byline. The first slide of most posts.",
    fields: [
      { key: "photo", type: "photo", label: "Photo" },
      kickerField("News"),
      metaField(),
      { key: "headline", type: "textarea", label: "Headline", def: "Your headline goes here in sentence case, about ten words", hint: "Aim for 12 words or fewer." },
      { key: "credit", type: "text", label: "Photo credit", def: "Photo by First Last", hint: "Under the photo. Leave it empty to hide it." },
      sourceField()
    ],
    render: (v) => (
      <Frame kicker={text(v, "kicker")} source={text(v, "source")} top>
        <Photo photo={photoOf(v, "photo")} />
        {text(v, "credit") ? <div className="sm-credit">{text(v, "credit")}</div> : null}
        <div className="sm-gap" />
        <div className="sm-h2 sm-pre">{text(v, "headline")}</div>
        <Meta value={text(v, "meta")} />
      </Frame>
    )
  },
  {
    kind: "show",
    id: "show",
    name: "Show recap",
    description: "A show as slides: the anchors, its announcements (Gemini can summarize them) and each package."
  },
  {
    kind: "canvas",
    id: "quote",
    name: "Quote",
    description: "A pull quote with the speaker’s name and role, and a photo if you have one.",
    fields: [
      { key: "photo", type: "photo", label: "Photo (optional)" },
      kickerField("News"),
      { key: "quote", type: "textarea", label: "Quote", def: "“The quote goes here, in the speaker’s exact words, with curly quote marks.”", hint: "Include the quote marks. Keep it under about 30 words." },
      { key: "name", type: "text", label: "Speaker’s name", def: "First Last" },
      { key: "role", type: "text", label: "Speaker’s role", def: "Paly senior", hint: "Caps are automatic." },
      sourceField()
    ],
    render: (v) => {
      const photo = photoOf(v, "photo");
      return (
        <Frame kicker={text(v, "kicker")} source={text(v, "source")} top={Boolean(photo)}>
          {photo ? <><Photo photo={photo} /><div className="sm-gap" /></> : null}
          <div className="sm-quote sm-pre">{text(v, "quote")}</div>
          <div className="sm-gap" />
          <div className="sm-name">{text(v, "name")}</div>
          {text(v, "role") ? <div className="sm-role">{text(v, "role")}</div> : null}
        </Frame>
      );
    }
  },
  {
    kind: "canvas",
    id: "gallery",
    name: "Photo gallery",
    description: "Two to four photos with a one-line caption.",
    fields: [
      { key: "layout", type: "select", label: "Layout", def: "3", options: [{ value: "2", label: "Two photos" }, { value: "3", label: "Three photos" }, { value: "4", label: "Four photos" }] },
      { key: "photo1", type: "photo", label: "Photo 1" },
      { key: "photo2", type: "photo", label: "Photo 2" },
      { key: "photo3", type: "photo", label: "Photo 3", showIf: (v) => v.layout !== "2" },
      { key: "photo4", type: "photo", label: "Photo 4", showIf: (v) => v.layout === "4" },
      kickerField("Photos"),
      { key: "caption", type: "textarea", label: "Caption", def: "One short line about what’s happening in these photos", hint: "Two lines at most." },
      metaField("Photos by First Last")
    ],
    render: (v) => {
      const count = Number(text(v, "layout")) || 3;
      const grid = count === 2 ? { gridTemplateRows: "1fr 1fr" } : count === 3 ? { gridTemplateColumns: "1fr 1fr", gridTemplateRows: "3fr 2fr" } : { gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr" };
      return (
        <Frame kicker={text(v, "kicker")} top>
          <div className="sm-photos" style={grid}>
            {Array.from({ length: count }, (_, index) => (
              <Photo key={index} photo={photoOf(v, `photo${index + 1}`)} style={count === 3 && index === 0 ? { gridColumn: "1 / 3" } : undefined} />
            ))}
          </div>
          <div className="sm-gap" />
          <div className="sm-body sm-pre" style={{ color: "var(--sm-text)", fontWeight: 600 }}>{text(v, "caption")}</div>
          <Meta value={text(v, "meta")} />
        </Frame>
      );
    }
  },
  {
    kind: "canvas",
    id: "package",
    name: "New package",
    description: "A frame from a package, its title and reporters.",
    fields: [
      { key: "photo", type: "photo", label: "Frame from the package" },
      kickerField("New package"),
      { key: "strip", type: "text", label: "Label over the title", def: "Now on YouTube", hint: "e.g. “Episode 3” or “Now on YouTube”. Leave it empty to hide it." },
      { key: "title", type: "textarea", label: "Package title", def: "The package title goes here in sentence case", hint: "Three lines at most." },
      { key: "byline", type: "text", label: "Reporters", def: "By First Last and First Last" },
      metaField()
    ],
    render: (v) => (
      <PackageArtwork photo={photoOf(v, "photo")} kicker={text(v, "kicker")} meta={text(v, "meta")} strip={text(v, "strip")} title={text(v, "title")} byline={text(v, "byline")} />
    )
  },
  {
    kind: "livestream",
    id: "livestream",
    name: "Livestream",
    description: "The livestream thumbnail: a matchup or an event with the date and time."
  },
  {
    kind: "canvas",
    id: "brief",
    name: "Announcement",
    description: "A title and up to five short points.",
    fields: [
      kickerField("Announcement"),
      { key: "title", type: "textarea", label: "Title", def: "Club Fair moves to the Quad" },
      metaField(),
      { key: "points", type: "textarea", label: "Points, one per line (up to 5)", rows: 5, def: "Thursday, Oct. 2 at lunch\nOver 80 clubs in one place\nBring your student ID to sign up", hint: "Short phrases, not full sentences." },
      noteField(),
      sourceField()
    ],
    render: (v) => (
      <Frame kicker={text(v, "kicker")} source={text(v, "source")} note={text(v, "note")}>
        <div className="sm-h1 sm-pre">{text(v, "title")}</div>
        <Meta value={text(v, "meta")} />
        <div className="sm-gap-l" />
        <Points items={splitPoints(text(v, "points"))} />
      </Frame>
    )
  },
  {
    kind: "canvas",
    id: "stat",
    name: "Big number",
    description: "One number, what it counts, and a line of context.",
    fields: [
      kickerField("By the numbers"),
      { key: "stat", type: "text", label: "Number", def: "80+", hint: "Keep it short: 80+, 3 of 4, 62%." },
      { key: "label", type: "text", label: "What it counts", def: "Clubs at this year’s Club Fair", hint: "Caps are automatic." },
      { key: "context", type: "textarea", label: "Context", def: "The fair moves to the Quad this year to make room for every club.", hint: "One or two sentences." },
      metaField(),
      sourceField("ASB")
    ],
    render: (v) => (
      <Frame kicker={text(v, "kicker")} source={text(v, "source")}>
        <div className="sm-stat">{text(v, "stat")}</div>
        <div className="sm-gap" />
        <div className="sm-label">{text(v, "label")}</div>
        <div className="sm-gap" />
        <div className="sm-body sm-pre">{text(v, "context")}</div>
        <Meta value={text(v, "meta")} />
      </Frame>
    )
  },
  {
    kind: "canvas",
    id: "text",
    name: "Text",
    description: "A headline and a paragraph or two. For explainers, corrections and statements.",
    fields: [
      kickerField("Explainer"),
      { key: "headline", type: "textarea", label: "Headline", def: "What the new bell schedule changes" },
      metaField(),
      { key: "body", type: "textarea", label: "Text", rows: 6, def: "Classes start 10 minutes later on Mondays, and tutorial moves to the end of the day.\n\nThe schedule takes effect after winter break.", hint: "Two short paragraphs at most. A blank line starts a new one." },
      sourceField()
    ],
    render: (v) => (
      <Frame kicker={text(v, "kicker")} source={text(v, "source")}>
        <div className="sm-h1 sm-pre" style={{ fontSize: "calc(96px * var(--k))" }}>{text(v, "headline")}</div>
        <Meta value={text(v, "meta")} />
        <div className="sm-gap-l" />
        <div className="sm-body sm-pre">{text(v, "body")}</div>
      </Frame>
    )
  },
  {
    kind: "canvas",
    id: "link",
    name: "Read the story",
    description: "Photo, headline and, on a story, a marked spot for Instagram’s link sticker.",
    fields: [
      { key: "photo", type: "photo", label: "Photo" },
      kickerField("New story"),
      { key: "headline", type: "textarea", label: "Headline", def: "Your headline goes here in sentence case", hint: "Three lines at most." },
      metaField("By First Last")
    ],
    render: (v, ctx) => (
      <Frame kicker={text(v, "kicker")} source={ctx.format === "post" ? "Read it at infocusnews.tv" : undefined} top>
        <Photo photo={photoOf(v, "photo")} />
        <div className="sm-gap" />
        <div className="sm-h2 sm-pre">{text(v, "headline")}</div>
        <Meta value={text(v, "meta")} />
        {ctx.format === "story" ? <div className="sm-sticker">Put the link sticker here<br />(this box isn’t in the PNG)</div> : null}
      </Frame>
    )
  },
  {
    kind: "custom",
    id: "custom",
    name: "Custom",
    description: "Freeform: place text, photos, shapes and brand pieces anywhere. Brand checks keep it on style."
  }
];

export const STORY_TEMPLATES: StoryTemplate[] = [...GENERAL_TEMPLATES, ...RESULT_TEMPLATES];
