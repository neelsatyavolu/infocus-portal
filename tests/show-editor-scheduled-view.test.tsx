import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EditingShowView } from "@/app/(app)/editing/editing-show-view";
import { sentLine } from "@/app/(app)/editing/show-edit-parts";
import type { ShowEditState, ShowEditView } from "@/src/lib/show-editor";

const SHOW = "2026-10-23";
const PUBLISH_AT = "2026-10-23T15:30:00.000Z";

function job(overrides: Partial<ShowEditView> = {}): ShowEditView {
  return {
    id: "job1", showDate: SHOW, sources: [], status: "PUBLISHED", stage: null, message: null, note: "Use the later open.",
    outputNasPath: "Package Storage/Shows/2026-10-23/edit.mp4",
    decisions: [
      { kind: "structure", detail: "1 recording: r1 program", flagged: false },
      { kind: "card", detail: "Placeholder for the missing package", flagged: true }
    ],
    checks: { chapters: [{ title: "Open", start: 0 }, { title: "Announcements", start: 95 }] },
    needsReview: true, costUsd: 1.34, attempt: 1, error: null, cancelRequested: false, pendingFix: null,
    conversation: [
      { from: "producer", text: "Trim the dead air before the weather.", at: "2026-10-22T20:00:00.000Z" },
      { from: "editor", text: "Trimmed 4 s before the weather.", at: "2026-10-22T20:10:00.000Z", version: 2 }
    ],
    version: 2, debugLogs: [], createdAt: "2026-10-22T19:00:00.000Z", heartbeatAt: null, finishedAt: "2026-10-22T20:10:00.000Z",
    ...overrides
  };
}

function state(overrides: Partial<ShowEditState> = {}): ShowEditState {
  return {
    worker: { online: true, lastSeenAt: null, busy: false, version: null, health: null },
    devices: [], waitingFor: null,
    settings: { autoStart: false } as ShowEditState["settings"],
    commands: [], pairings: [], recordings: [], recordingsError: null, packages: [],
    job: job(),
    publicationStatus: "SCHEDULED",
    preview: { videoUrl: "https://drive.example.org/file?web=1", posterUrl: null },
    published: { status: "SCHEDULED", publishAt: PUBLISH_AT, youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
    approve: null,
    autoStart: null,
    ...overrides
  };
}

const render = (value: ShowEditState) =>
  renderToStaticMarkup(<EditingShowView showDate={SHOW} state={value} busyAction={null} send={async () => true} onReview={() => undefined} />);

describe("sentLine", () => {
  it("says where the show stands on YouTube, with the time in Pacific", () => {
    expect(sentLine({ status: "SCHEDULED", publishAt: PUBLISH_AT, youtubeUrl: null })).toBe(
      "Scheduled on YouTube for Fri, Oct 23, 8:30 AM. Make changes in YouTube Studio."
    );
    expect(sentLine({ status: "LIVE", publishAt: PUBLISH_AT, youtubeUrl: null })).toBe(
      "Public on YouTube since Fri, Oct 23, 8:30 AM. Make changes in YouTube Studio."
    );
    expect(sentLine({ status: "UPLOADING", publishAt: PUBLISH_AT, youtubeUrl: null })).toBe(
      "Sending it to YouTube now. It goes public Fri, Oct 23, 8:30 AM."
    );
    expect(sentLine({ status: "FAILED", publishAt: PUBLISH_AT, youtubeUrl: null })).toMatch(/needs attention/);
    expect(sentLine(null)).toBe("This show was sent to YouTube. Make changes in YouTube Studio.");
  });
});

describe("EditingShowView once scheduled", () => {
  it("keeps the edited show, its chapters, notes, history and cost, with a YouTube link and no review actions", () => {
    const markup = render(state());
    expect(markup).toContain("Scheduled on YouTube for Fri, Oct 23, 8:30 AM.");
    expect(markup).toContain('href="https://www.youtube.com/watch?v=dQw4w9WgXcQ"');
    expect(markup).toContain("The edited show");
    expect(markup).toContain('src="https://drive.example.org/file?web=1"');
    expect(markup).toContain("Announcements");
    expect(markup).toContain("Placeholder for the missing package");
    expect(markup).toContain("Trim the dead air before the weather.");
    expect(markup).toContain("Trimmed 4 s before the weather.");
    expect(markup).toContain("Use the later open.");
    expect(markup).toContain("$1.34");
    expect(markup).toContain("1 recording: r1 program");
    expect(markup).not.toContain("Approve &amp; schedule");
    expect(markup).not.toContain("Send back");
    expect(markup).not.toContain("Change details");
  });

  it("without YouTube's video ID yet there's no link, and without a preview there's no player", () => {
    const markup = render(state({ preview: null, published: { status: "UPLOADING", publishAt: PUBLISH_AT, youtubeUrl: null } }));
    expect(markup).toContain("Sending it to YouTube now.");
    expect(markup).not.toContain("youtube.com/watch");
    expect(markup).not.toContain("<video");
    expect(markup).toContain("The edited show");
  });

  it("at Review the actions are still there", () => {
    const markup = render(state({ job: job({ status: "REVIEW" }), publicationStatus: "DRAFT", published: null }));
    expect(markup).toContain("Approve &amp; schedule");
    expect(markup).toContain("Send back");
  });
});
