/* eslint-disable @next/next/no-img-element -- artwork is exported to PNG from the DOM; next/image would not embed. */
import type { CSSProperties, ReactNode } from "react";
import { apDate, type StoryPhoto } from "@/src/lib/story-maker";
import type { Party } from "@/src/lib/story-results";
import { SocialIcon, type SocialIconName } from "./social-icons";

/** The building blocks every template shares (docs/SOCIAL-MEDIA-DESIGN.md). */

export const STORY_ICON_SRC = "/live/infocus-icon.png";
const WORDMARK_LIGHT = "/brand/infocus-wordmark-color.png";
const WORDMARK_DARK = "/brand/infocus-wordmark-white.png";

export type { StoryPhoto };
export type StoryValues = Record<string, string | StoryPhoto | null>;

export type TextField = { key: string; type: "text" | "textarea"; label: string; def: string | (() => string); hint?: string; rows?: number };
export type PhotoField = { key: string; type: "photo"; label: string; showIf?: (values: StoryValues) => boolean };
export type SelectField = { key: string; type: "select"; label: string; def: string; options: ReadonlyArray<{ value: string; label: string }> };
export type StoryField = TextField | PhotoField | SelectField;

// ---------- Shared fields ----------

export const kickerField = (def: string): TextField => ({ key: "kicker", type: "text", label: "Section label", def, hint: "One or two words, top left. Caps are automatic." });
export const metaField = (def: string | (() => string) = () => apDate(new Date())): TextField => ({
  key: "meta", type: "text", label: "Date or byline", def, hint: "A mono line under the headline. Leave it empty to hide it."
});
export const sourceField = (def = ""): TextField => ({ key: "source", type: "text", label: "Source", def, hint: "Bottom left. Leave it empty to show infocusnews.tv." });
export const noteField = (def = ""): TextField => ({ key: "note", type: "textarea", label: "Note", def, rows: 2, hint: "One or two sentences of context above the footer. Optional." });

export const text = (values: StoryValues, key: string) => (typeof values[key] === "string" ? (values[key] as string) : "");
export const photoOf = (values: StoryValues, key: string) => {
  const value = values[key];
  return value && typeof value === "object" ? value : null;
};

/** A photo that fills its box (`sm-bleed` fills the whole canvas). Empty boxes say so, but not in the PNG. */
export function Photo({ photo, className = "", style }: { photo: StoryPhoto | null; className?: string; style?: CSSProperties }) {
  if (!photo) {
    return (
      <div className={`sm-photo ${className}`} style={style}>
        <div className="sm-ph-label">Add a photo</div>
      </div>
    );
  }
  const position = `${photo.x}% ${photo.y}%`;
  return (
    <div className={`sm-photo ${className}`} style={style}>
      <img src={photo.src} alt="" style={{ objectPosition: position, transform: `scale(${photo.zoom / 100})`, transformOrigin: position }} />
    </div>
  );
}

/** The color wordmark on Warm White, the white one on Ink. Both are in the DOM; CSS shows one. */
export function Wordmark() {
  return (
    <>
      <img className="sm-wordmark sm-wordmark-light" src={WORDMARK_LIGHT} alt="InFocus" />
      <img className="sm-wordmark sm-wordmark-dark" src={WORDMARK_DARK} alt="" />
    </>
  );
}

/** Kicker on the left, wordmark on the right, a thin rule under both. `meta` adds a mono line under the rule. */
export function Header({ kicker, meta }: { kicker: string; meta?: string }) {
  return (
    <div className="sm-head">
      <div className="sm-head-row">
        <span className="sm-kicker">{kicker}</span>
        <Wordmark />
      </div>
      <div className="sm-rule" />
      {meta ? <div className="sm-head-meta">{meta}</div> : null}
    </div>
  );
}

/** "Source: …" (or the site) on the left, @infocusnews on the right. */
export function Footer({ source }: { source?: string }) {
  const left = source?.trim() ? (/^sources?:/i.test(source.trim()) ? source.trim() : `Source: ${source.trim()}`) : "infocusnews.tv";
  return (
    <div className="sm-foot">
      <span>{left}</span>
      <span className="sm-foot-handle">@infocusnews</span>
    </div>
  );
}

/**
 * The frame every template sits in: header, the body (shrinks its text to fit), an optional note,
 * and the footer. `top` starts the body under the header instead of centering it.
 */
export function Frame({ kicker, source, note, top = false, children }: { kicker: string; source?: string; note?: string; top?: boolean; children: ReactNode }) {
  return (
    <div className="sm-frame">
      <Header kicker={kicker} />
      <div className={top ? "sm-main sm-top" : "sm-main"} data-fit="auto">{children}</div>
      {note?.trim() ? <div className="sm-note sm-pre">{note}</div> : null}
      <Footer source={source} />
    </div>
  );
}

export function Points({ items }: { items: string[] }) {
  return (
    <ul className="sm-points">
      {items.map((item, index) => <li key={index}><span>{item}</span></li>)}
    </ul>
  );
}

export function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="square" aria-hidden>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

/** A status tag: filled (party, Yes or No color) with a check when called, outlined otherwise. */
export function Tag({ label, fill, check = false }: { label: string; fill?: Party | "Y" | "X" | null; check?: boolean }) {
  return (
    <div className={fill ? `sm-tag sm-${fill}` : "sm-tag"}>
      {check ? <CheckIcon /> : null}
      {label}
    </div>
  );
}

const initials = (name: string) =>
  name.split(/\s+/).filter((word) => /^[A-Za-z]/.test(word) && !/^(Jr\.?|Sr\.?)$/i.test(word)).map((word) => word[0].toUpperCase()).slice(0, 2).join("");

/** A round photo with a party tile in its corner, or the person's initials when there's no photo. */
export function Face({ name, party, photo, className }: { name: string; party: Party; photo: StoryPhoto | null; className: string }) {
  return (
    <div className={`${className} sm-${party}`}>
      <div className="sm-face">
        {photo ? (
          <img
            src={photo.src}
            alt=""
            style={{ objectPosition: `${photo.x}% ${photo.y}%`, transform: `scale(${photo.zoom / 100})`, transformOrigin: `${photo.x}% ${photo.y}%` }}
          />
        ) : (
          initials(name)
        )}
      </div>
      {party !== "N" ? <div className={`sm-tile sm-${party}`}>{party}</div> : null}
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

/** Green follow panel with every handle (a Custom piece). */
export function FollowPanel({ heading }: { heading: string }) {
  return (
    <div className="sm-follow">
      <div className="sm-follow-head">{heading}</div>
      {FOLLOW_ROWS.map((row) => <FollowRow key={row.handle} icons={row.icons} handle={row.handle} />)}
    </div>
  );
}

/** A package: its frame, a label, the title and reporters. The New package template and Show slides. */
export function PackageArtwork(p: { photo: StoryPhoto | null; kicker: string; meta: string; strip: string; title: string; byline: string }) {
  return (
    <Frame kicker={p.kicker} top>
      <Photo photo={p.photo} />
      <div className="sm-gap" />
      {p.strip ? <div className="sm-label" style={{ color: "var(--sm-accent)" }}>{p.strip}</div> : null}
      {p.strip ? <div className="sm-gap-s" /> : null}
      <div className="sm-h2 sm-pre">{p.title}</div>
      {p.byline ? <><div className="sm-gap-s" /><div className="sm-sub">{p.byline}</div></> : null}
      {p.meta ? <><div className="sm-gap-s" /><div className="sm-meta">{p.meta}</div></> : null}
    </Frame>
  );
}
