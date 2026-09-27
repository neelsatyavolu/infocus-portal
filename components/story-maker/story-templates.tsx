/* eslint-disable @next/next/no-img-element -- story artwork is exported to PNG from the DOM; next/image would not embed. */
import type { CSSProperties, ReactElement, ReactNode } from "react";
import { apDate, splitPoints, type StoryPhoto } from "@/src/lib/story-maker";
import { SocialIcon, type SocialIconName } from "./social-icons";

export const STORY_ICON_SRC = "/live/infocus-icon.png";

export type { StoryPhoto };
export type StoryValues = Record<string, string | StoryPhoto | null>;

type TextField = { key: string; type: "text" | "textarea"; label: string; def: string | (() => string); hint?: string; rows?: number };
type PhotoField = { key: string; type: "photo"; label: string; showIf?: (values: StoryValues) => boolean };
type SelectField = { key: string; type: "select"; label: string; def: string; options: ReadonlyArray<{ value: string; label: string }> };
export type StoryField = TextField | PhotoField | SelectField;

export type CanvasTemplate = {
  kind: "canvas";
  id: string;
  name: string;
  description: string;
  fields: StoryField[];
  render: (values: StoryValues) => ReactElement;
};
/** Drawn by the livestream thumbnail renderer (/api/live/thumbnail) so both stay identical. */
export type LivestreamTemplate = { kind: "livestream"; id: "livestream"; name: string; description: string };
/** Freeform: brand pieces placed anywhere (components/story-maker/custom). */
export type CustomTemplate = { kind: "custom"; id: "custom"; name: string; description: string };
export type StoryTemplate = CanvasTemplate | LivestreamTemplate | CustomTemplate;

const text = (values: StoryValues, key: string) => (typeof values[key] === "string" ? (values[key] as string) : "");
const photoOf = (values: StoryValues, key: string) => {
  const value = values[key];
  return value && typeof value === "object" ? value : null;
};

export function fieldDefault(field: StoryField): string | null {
  if (field.type === "photo") return null;
  return typeof field.def === "function" ? field.def() : field.def;
}

export function isFieldVisible(field: StoryField, values: StoryValues) {
  return field.type !== "photo" || !field.showIf || field.showIf(values);
}

// ---------- Building blocks ----------

export function Photo({ photo, className = "", box }: { photo: StoryPhoto | null; className?: string; box?: CSSProperties }) {
  if (!photo) {
    return (
      <div className={`sm-photo ${className}`} style={box}>
        <div className="sm-ph-label">Add a photo</div>
      </div>
    );
  }
  const position = `${photo.x}% ${photo.y}%`;
  return (
    <div className={`sm-photo ${className}`} style={box}>
      <img src={photo.src} alt="" style={{ objectPosition: position, transform: `scale(${photo.zoom / 100})`, transformOrigin: position }} />
    </div>
  );
}

export function Header({ kicker, meta }: { kicker: string; meta: string }) {
  return (
    <div className={`sm-hd${meta ? "" : " sm-no-meta"}`}>
      <div className="sm-tile"><img src={STORY_ICON_SRC} alt="" /></div>
      <div className="sm-hd-body">
        <div className="sm-hd-plate"><span className="sm-kicker">{kicker}</span></div>
        {meta ? <div className="sm-hd-strip"><span className="sm-meta">{meta}</span></div> : null}
      </div>
    </div>
  );
}

export function Footer() {
  return (
    <div className="sm-ft">
      <span className="sm-url">infocusnews.tv</span>
      <span className="sm-handle">@infocusnews</span>
    </div>
  );
}

function FollowRow({ icons, handle }: { icons: SocialIconName[]; handle: string }) {
  return (
    <div className="sm-follow-row">
      <div className="sm-follow-icons">{icons.map((name) => <SocialIcon key={name} name={name} />)}</div>
      <span className="sm-follow-handle">{handle}</span>
    </div>
  );
}

const FOLLOW_ROWS: ReadonlyArray<{ icons: SocialIconName[]; handle: string }> = [
  { icons: ["youtube", "instagram"], handle: "@infocusnews" },
  { icons: ["tiktok", "x"], handle: "@palyinfocus" },
  { icons: ["web"], handle: "infocusnews.tv" }
];

/** Green watch/follow panel. `all` lists every handle; otherwise YouTube/Instagram and the site. */
export function FollowPanel({ heading, all = false, style }: { heading: string; all?: boolean; style?: CSSProperties }) {
  const rows = all ? FOLLOW_ROWS : [FOLLOW_ROWS[0], FOLLOW_ROWS[2]];
  return (
    <div className="sm-follow" style={style}>
      <div className="sm-follow-head">{heading}</div>
      {rows.map((row) => <FollowRow key={row.handle} icons={row.icons} handle={row.handle} />)}
    </div>
  );
}

function Fit({ max, style, children }: { max: number; style: CSSProperties; children: ReactNode }) {
  return <div className="sm-fit" data-fit={max} style={style}>{children}</div>;
}

// ---------- Shared fields ----------

const kickerField = (def: string): TextField => ({ key: "kicker", type: "text", label: "Section label", def, hint: "One or two words, e.g. News, Sports, Feature. Caps are automatic." });
const metaField = (def: string | (() => string) = () => apDate(new Date())): TextField => ({
  key: "meta", type: "text", label: "Green strip under the label", def, hint: "A date or a byline. Leave it empty to hide the strip."
});

// ---------- Templates ----------

export const STORY_TEMPLATES: StoryTemplate[] = [
  {
    kind: "canvas",
    id: "cover",
    name: "Headline cover",
    description: "Full photo with the headline on an Ink plate. The first slide of a story.",
    fields: [
      { key: "photo", type: "photo", label: "Photo" },
      kickerField("News"),
      metaField(),
      { key: "headline", type: "textarea", label: "Headline", def: "Your headline goes here in sentence case, about ten words", hint: "Aim for 12 words or fewer." },
      { key: "strip", type: "text", label: "Green strip under the headline", def: "Photos by First Last", hint: "A photo credit or “Read more at infocusnews.tv”. Leave it empty to hide it." }
    ],
    render: (v) => (
      <>
        <Photo photo={photoOf(v, "photo")} className="sm-bleed" />
        <Header kicker={text(v, "kicker")} meta={text(v, "meta")} />
        <div className="sm-stack" data-fit={760}>
          <div className="sm-plate"><div className="sm-headline sm-pre">{text(v, "headline")}</div></div>
          {text(v, "strip") ? <div className="sm-strip"><div className="sm-strip-text">{text(v, "strip")}</div></div> : null}
        </div>
      </>
    )
  },
  {
    kind: "canvas",
    id: "quote",
    name: "Quote",
    description: "A pull quote over a photo, with the speaker’s name and role.",
    fields: [
      { key: "photo", type: "photo", label: "Photo" },
      kickerField("News"),
      metaField(),
      { key: "quote", type: "textarea", label: "Quote", def: "“The quote goes here, in the speaker’s exact words, with curly quote marks.”", hint: "Include the quote marks. Keep it under about 30 words." },
      { key: "name", type: "text", label: "Speaker’s name", def: "First Last" },
      { key: "role", type: "text", label: "Speaker’s role", def: "Paly senior", hint: "Caps are automatic." }
    ],
    render: (v) => (
      <>
        <Photo photo={photoOf(v, "photo")} className="sm-bleed" />
        <Header kicker={text(v, "kicker")} meta={text(v, "meta")} />
        <div className="sm-stack" data-fit={820}>
          <div className="sm-plate"><div className="sm-quote sm-pre">{text(v, "quote")}</div></div>
          <div className="sm-strip">
            <div className="sm-name">{text(v, "name")}</div>
            {text(v, "role") ? <div className="sm-role">{text(v, "role")}</div> : null}
          </div>
        </div>
      </>
    )
  },
  {
    kind: "canvas",
    id: "gallery",
    name: "Photo gallery",
    description: "Two or three photos on Ink with a one-line caption.",
    fields: [
      { key: "layout", type: "select", label: "Layout", def: "3", options: [{ value: "3", label: "Three photos" }, { value: "2", label: "Two photos" }] },
      { key: "photo1", type: "photo", label: "Photo 1" },
      { key: "photo2", type: "photo", label: "Photo 2" },
      { key: "photo3", type: "photo", label: "Photo 3", showIf: (v) => v.layout !== "2" },
      kickerField("Photos"),
      metaField("Photos by First Last"),
      { key: "caption", type: "textarea", label: "Caption", def: "One short line about what’s happening in these photos", hint: "Two lines at most." }
    ],
    render: (v) => (
      <>
        <Header kicker={text(v, "kicker")} meta={text(v, "meta")} />
        {v.layout === "2" ? (
          <>
            <Photo photo={photoOf(v, "photo1")} box={{ left: 72, top: 400, width: 936, height: 552 }} />
            <Photo photo={photoOf(v, "photo2")} box={{ left: 72, top: 968, width: 936, height: 552 }} />
          </>
        ) : (
          <>
            <Photo photo={photoOf(v, "photo1")} box={{ left: 72, top: 400, width: 936, height: 640 }} />
            <Photo photo={photoOf(v, "photo2")} box={{ left: 72, top: 1056, width: 460, height: 464 }} />
            <Photo photo={photoOf(v, "photo3")} box={{ left: 548, top: 1056, width: 460, height: 464 }} />
          </>
        )}
        <Fit max={130} style={{ top: 1548, height: 122 }}><div className="sm-caption sm-pre">{text(v, "caption")}</div></Fit>
      </>
    )
  },
  {
    kind: "canvas",
    id: "package",
    name: "New package",
    description: "A frame from a package, its title and reporters, and where to watch it.",
    fields: [
      { key: "photo", type: "photo", label: "Frame from the package" },
      kickerField("New package"),
      metaField(),
      { key: "strip", type: "text", label: "Green strip under the frame", def: "Now on YouTube", hint: "e.g. “Episode 3” or “Now on YouTube”. Leave it empty to hide it." },
      { key: "title", type: "textarea", label: "Package title", def: "The package title goes here in sentence case", hint: "Three lines at most." },
      { key: "byline", type: "text", label: "Reporters", def: "By First Last and First Last" }
    ],
    render: (v) => (
      <>
        <Header kicker={text(v, "kicker")} meta={text(v, "meta")} />
        <Photo photo={photoOf(v, "photo")} box={{ left: 72, top: 400, width: 936, height: 527 }} />
        {text(v, "strip") ? (
          <div className="sm-strip" style={{ position: "absolute", left: 72, top: 927, width: 936 }}>
            <div className="sm-strip-text">{text(v, "strip")}</div>
          </div>
        ) : null}
        <Fit max={380} style={{ top: 1030, height: 380, gap: "calc(24px * var(--k))" }}>
          <div className="sm-headline sm-pre">{text(v, "title")}</div>
          {text(v, "byline") ? <div className="sm-body" style={{ fontSize: "calc(40px * var(--k))" }}>{text(v, "byline")}</div> : null}
        </Fit>
        <FollowPanel heading="Watch the full package" />
      </>
    )
  },
  {
    kind: "livestream",
    id: "livestream",
    name: "Livestream",
    description: "The livestream thumbnail as a story: a matchup or an event with the date and time."
  },
  {
    kind: "canvas",
    id: "brief",
    name: "Announcement",
    description: "A title and up to five short points, like the on-air announcement card.",
    fields: [
      kickerField("Announcement"),
      metaField(),
      { key: "title", type: "textarea", label: "Title", def: "Club Fair moves to the Quad" },
      { key: "points", type: "textarea", label: "Points, one per line (up to 5)", rows: 5, def: "Thursday, Oct. 2 at lunch\nOver 80 clubs in one place\nBring your student ID to sign up", hint: "Short phrases, not full sentences." }
    ],
    render: (v) => (
      <>
        <Header kicker={text(v, "kicker")} meta={text(v, "meta")} />
        <Fit max={1110} style={{ top: 440, height: 1110, justifyContent: "center", gap: "calc(72px * var(--k))" }}>
          <div className="sm-title sm-pre">{text(v, "title")}</div>
          <ul className="sm-points">
            {splitPoints(text(v, "points")).map((point, index) => <li key={index}><span>{point}</span></li>)}
          </ul>
        </Fit>
        <Footer />
      </>
    )
  },
  {
    kind: "canvas",
    id: "stat",
    name: "Big number",
    description: "One number, what it counts, and a line of context.",
    fields: [
      kickerField("By the numbers"),
      metaField(),
      { key: "stat", type: "text", label: "Number", def: "80+", hint: "Keep it short: 80+, 3 of 4, 62%." },
      { key: "label", type: "text", label: "What it counts", def: "Clubs at this year’s Club Fair", hint: "Caps are automatic." },
      { key: "context", type: "textarea", label: "Context", def: "The fair moves to the Quad this year to make room for every club.", hint: "One or two sentences." },
      { key: "source", type: "text", label: "Source (optional)", def: "Source: ASB" }
    ],
    render: (v) => (
      <>
        <Header kicker={text(v, "kicker")} meta={text(v, "meta")} />
        <Fit max={1110} style={{ top: 440, height: 1110, justifyContent: "center", gap: "calc(40px * var(--k))" }}>
          <div className="sm-stat">{text(v, "stat")}</div>
          <div className="sm-label">{text(v, "label")}</div>
          <div className="sm-body sm-pre" style={{ marginTop: "calc(24px * var(--k))" }}>{text(v, "context")}</div>
          {text(v, "source") ? <div className="sm-source" style={{ marginTop: "calc(16px * var(--k))" }}>{text(v, "source")}</div> : null}
        </Fit>
        <Footer />
      </>
    )
  },
  {
    kind: "canvas",
    id: "link",
    name: "Read the story",
    description: "Photo, headline and a marked spot for Instagram’s link sticker.",
    fields: [
      { key: "photo", type: "photo", label: "Photo" },
      kickerField("New story"),
      metaField("By First Last"),
      { key: "headline", type: "textarea", label: "Headline", def: "Your headline goes here in sentence case", hint: "Three lines at most." }
    ],
    render: (v) => (
      <>
        <Header kicker={text(v, "kicker")} meta={text(v, "meta")} />
        <Photo photo={photoOf(v, "photo")} box={{ left: 72, top: 400, width: 936, height: 702 }} />
        <Fit max={260} style={{ top: 1142, height: 260 }}>
          <div className="sm-headline sm-pre" style={{ fontSize: "calc(68px * var(--k))" }}>{text(v, "headline")}</div>
        </Fit>
        <div className="sm-sticker" style={{ top: 1430, height: 150 }}>Put the link sticker here<br />(this box isn’t in the PNG)</div>
        <Footer />
      </>
    )
  },
  {
    kind: "custom",
    id: "custom",
    name: "Custom",
    description: "Freeform: drag brand pieces anywhere. Brand checks keep it on style."
  }
];
