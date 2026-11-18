import { showApDate, type ShowSlide } from "@/src/lib/show-story";
import { splitPoints } from "@/src/lib/story-maker";
import { Frame, PackageArtwork, Photo, Points } from "../story-parts";
import type { ShowDraft } from "./use-show-story";

const KICKER = "The Show";

function RecapSlide({ draft, meta, hasAnnouncements }: { draft: ShowDraft; meta: string; hasAnnouncements: boolean }) {
  const photo = draft.recapPhoto;
  const rundown = [...(hasAnnouncements ? ["Announcements"] : []), ...draft.packages.map((pkg) => pkg.title.trim()).filter(Boolean)];
  return (
    <Frame kicker={KICKER} top={Boolean(photo)}>
      {photo ? <><Photo photo={photo} /><div className="sm-gap" /></> : null}
      <div className={photo ? "sm-h2 sm-pre" : "sm-h1 sm-pre"}>{draft.headline}</div>
      <div className="sm-gap-s" />
      <div className="sm-meta">{meta}</div>
      {draft.anchors.trim() ? (
        <>
          <div className="sm-gap-l" />
          <div className="sm-show-group">
            <div className="sm-label">Anchored by</div>
            <div className="sm-anchors">{draft.anchors}</div>
          </div>
        </>
      ) : null}
      {rundown.length ? (
        <>
          <div className="sm-gap-l" />
          <div className="sm-show-group">
            <div className="sm-label">In this show</div>
            <Points items={rundown} />
          </div>
        </>
      ) : null}
    </Frame>
  );
}

function AnnouncementsSlide({ draft, meta }: { draft: ShowDraft; meta: string }) {
  return (
    <Frame kicker="Announcements">
      <div className="sm-h1 sm-pre">{draft.announcementsTitle}</div>
      <div className="sm-gap-s" />
      <div className="sm-meta">{meta}</div>
      <div className="sm-gap-l" />
      <Points items={splitPoints(draft.points)} />
    </Frame>
  );
}

/** The artwork for one Show slide (inside StoryCanvas, as a post or a story). */
export function ShowSlideArt({ slide, draft, date, hasAnnouncements }: { slide: ShowSlide; draft: ShowDraft; date: string; hasAnnouncements: boolean }) {
  const meta = showApDate(date);
  if (slide.kind === "recap") return <RecapSlide draft={draft} meta={meta} hasAnnouncements={hasAnnouncements} />;
  if (slide.kind === "announcements") return <AnnouncementsSlide draft={draft} meta={meta} />;
  const pkg = draft.packages[slide.index];
  if (!pkg) return null;
  return <PackageArtwork photo={pkg.photo} kicker={KICKER} meta={meta} strip={draft.packageStrip} title={pkg.title} byline={pkg.byline} />;
}
