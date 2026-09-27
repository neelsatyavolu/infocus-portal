import type { CSSProperties } from "react";
import { showApDate, type ShowSlide } from "@/src/lib/show-story";
import { splitPoints } from "@/src/lib/story-maker";
import { Fit, Footer, Header, PackageArtwork, Photo } from "../story-templates";
import type { ShowDraft } from "./use-show-story";

const KICKER = "The Show";

function Points({ items, size }: { items: string[]; size?: number }) {
  const style = size ? ({ "--pt": `calc(${size}px * var(--k))` } as CSSProperties) : undefined;
  return (
    <ul className="sm-points" style={style}>
      {items.map((item, index) => <li key={index}><span>{item}</span></li>)}
    </ul>
  );
}

function RecapSlide({ draft, meta, hasAnnouncements }: { draft: ShowDraft; meta: string; hasAnnouncements: boolean }) {
  const photo = draft.recapPhoto;
  const rundown = [...(hasAnnouncements ? ["Announcements"] : []), ...draft.packages.map((pkg) => pkg.title.trim()).filter(Boolean)];
  const box = photo ? { top: 980, height: 560 } : { top: 440, height: 1110 };
  return (
    <>
      <Header kicker={KICKER} meta={meta} />
      {photo ? <Photo photo={photo} box={{ left: 72, top: 400, width: 936, height: 527 }} /> : null}
      <Fit max={box.height} style={{ ...box, justifyContent: photo ? "flex-start" : "center", gap: "calc(56px * var(--k))" }}>
        <div className={photo ? "sm-headline sm-pre" : "sm-title sm-pre"}>{draft.headline}</div>
        {draft.anchors.trim() ? (
          <div className="sm-show-group">
            <div className="sm-label">Anchored by</div>
            <div className="sm-anchors">{draft.anchors}</div>
          </div>
        ) : null}
        {rundown.length ? (
          <div className="sm-show-group">
            <div className="sm-label">In this show</div>
            <Points items={rundown} size={46} />
          </div>
        ) : null}
      </Fit>
      <Footer />
    </>
  );
}

function AnnouncementsSlide({ draft, meta }: { draft: ShowDraft; meta: string }) {
  return (
    <>
      <Header kicker="Announcements" meta={meta} />
      <Fit max={1110} style={{ top: 440, height: 1110, justifyContent: "center", gap: "calc(72px * var(--k))" }}>
        <div className="sm-title sm-pre">{draft.announcementsTitle}</div>
        <Points items={splitPoints(draft.points)} />
      </Fit>
      <Footer />
    </>
  );
}

/** The artwork for one Show slide (1080 × 1920, inside StoryCanvas). */
export function ShowSlideArt({ slide, draft, date, hasAnnouncements }: { slide: ShowSlide; draft: ShowDraft; date: string; hasAnnouncements: boolean }) {
  const meta = showApDate(date);
  if (slide.kind === "recap") return <RecapSlide draft={draft} meta={meta} hasAnnouncements={hasAnnouncements} />;
  if (slide.kind === "announcements") return <AnnouncementsSlide draft={draft} meta={meta} />;
  const pkg = draft.packages[slide.index];
  if (!pkg) return null;
  return <PackageArtwork photo={pkg.photo} kicker={KICKER} meta={meta} strip={draft.packageStrip} title={pkg.title} byline={pkg.byline} />;
}
