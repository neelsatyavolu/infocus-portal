import { ImageResponse } from "next/og";
import { loadMeetingPreview } from "@/src/server/meetings-preview";
import { loadThumbnailAssets, loadThumbnailFonts } from "@/src/server/live-thumbnail";

/** The meeting link preview image: Ink, an InFocus Green band, the title, the time and the open agenda (DESIGN.md colors, Lexend). */

export const runtime = "nodejs";
export const alt = "InFocus meeting";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const INK = "#0F110F";
const GREEN = "#0B6E3E";
const GREEN_ON_DARK = "#2BB36E";
const SOFT_WHITE = "#ECEFEA";
const MIST = "#DCE2DE";

async function wordmark() {
  try {
    return (await loadThumbnailAssets()).wordmark;
  } catch {
    return null;
  }
}

export default async function Image({ params }: { params: Promise<{ id: string }> | { id: string } }) {
  const { id } = await params;
  const [preview, logo, fonts] = await Promise.all([loadMeetingPreview(id), wordmark(), loadThumbnailFonts()]);
  const hasAgenda = preview.agenda.length > 0;
  // With an agenda the title steps down so a two-line title, the time and four agenda lines still fit.
  const titleSize = hasAgenda ? (preview.title.length > 40 ? 52 : 64) : preview.title.length > 40 ? 64 : 84;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: INK, fontFamily: "Lexend" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "56px 72px 0" }}>
          <div style={{ display: "flex", color: GREEN_ON_DARK, fontSize: 30, fontWeight: 500, letterSpacing: "0.18em" }}>MEETING</div>
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element -- next/og renders plain <img>
            <img src={logo} alt="" width={300} height={64} />
          ) : (
            <div style={{ display: "flex", color: SOFT_WHITE, fontSize: 44, fontWeight: 600 }}>InFocus</div>
          )}
        </div>
        <div style={{ display: "flex", flex: 1, flexDirection: "column", justifyContent: "center", padding: "0 72px" }}>
          <div style={{ display: "flex", color: SOFT_WHITE, fontSize: titleSize, fontWeight: 600, lineHeight: 1.1 }}>{preview.title}</div>
          {preview.when ? (
            <div style={{ display: "flex", marginTop: hasAgenda ? 18 : 28, color: MIST, fontSize: hasAgenda ? 34 : 40, fontWeight: 500 }}>
              {preview.when}
            </div>
          ) : null}
          {hasAgenda ? (
            <div style={{ display: "flex", flexDirection: "column", marginTop: 30 }}>
              {preview.agenda.map((line, index) => (
                <div key={index} style={{ display: "flex", alignItems: "center", marginTop: index ? 10 : 0 }}>
                  <div style={{ display: "flex", width: 12, height: 12, marginRight: 22, background: GREEN_ON_DARK, flexShrink: 0 }} />
                  <div style={{ display: "block", color: SOFT_WHITE, fontSize: 30, lineHeight: 1.25, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {line}
                  </div>
                </div>
              ))}
              {preview.agendaMore > 0 ? (
                <div style={{ display: "flex", marginTop: 10, marginLeft: 34, color: MIST, fontSize: 26 }}>+{preview.agendaMore} more</div>
              ) : null}
            </div>
          ) : null}
        </div>
        <div style={{ display: "flex", background: GREEN, color: SOFT_WHITE, padding: "26px 72px", fontSize: 30, fontWeight: 500 }}>
          InFocus Portal
        </div>
      </div>
    ),
    { ...size, fonts: fonts.length ? fonts : undefined }
  );
}
