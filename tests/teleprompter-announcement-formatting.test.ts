import { describe, expect, it, vi } from "vitest";
import {
  TELEPROMPTER_ANNOUNCEMENT_FORMAT_RULES,
  formatAnnouncementsForTeleprompter,
  reformatTeleprompterScriptContent,
  buildAnnouncementFormattingPrompt
} from "@/src/lib/teleprompter-announcement-formatting";
import type { SubmittedAnnouncement } from "@/src/lib/submitted-announcements";

const generateContent = vi.hoisted(() => vi.fn());

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent };
  }
}));

function makeAnnouncement(overrides: Partial<SubmittedAnnouncement>): SubmittedAnnouncement {
  return {
    id: "row-1",
    rowNumber: 1,
    timestamp: "",
    timestampIso: null,
    name: "",
    email: "",
    category: "",
    submitterKind: "",
    runOn: "",
    announcement: "Announcement",
    startDate: "",
    startDateIso: null,
    endDate: "",
    endDateIso: null,
    mediaLink: "",
    moreInfo: "",
    source: "google-sheets",
    ...overrides
  };
}

describe("teleprompter announcement formatting prompt", () => {
  it("asks for broadcast-anchor copy, third person for unaffiliated orgs, and spoken college visits", () => {
    const rules = TELEPROMPTER_ANNOUNCEMENT_FORMAT_RULES.join("\n");
    expect(rules).toContain("news reader reporting facts, not a recruiter");
    expect(rules).toContain("third person");
    expect(rules).toContain("Never tell viewers to Join");
    expect(rules).toContain("Do not open with a question");
    expect(rules).toContain("Want to help shape the future of our cities?");
    expect(rules).toContain("We work with four schools");
    expect(rules).toContain("Buddies4Math tutors elementary students");
    expect(rules).toContain("Never use a colon list");
    expect(rules).toContain("College visits are coming up");
  });

  it("includes submitter kind with the source text", () => {
    const prompt = buildAnnouncementFormattingPrompt([
      makeAnnouncement({
        id: "nui",
        submitterKind: "COMMUNITY_MEMBER",
        announcement: "Join the New Urbanism Initiative."
      })
    ]);

    expect(prompt).toContain('"submitterKind":"COMMUNITY_MEMBER"');
    expect(prompt).toContain("Join the New Urbanism Initiative.");
  });
});

it("keeps the generated college copy even if Gemini summarizes away the names", async () => {
  vi.stubEnv("GEMINI_API_KEY", "test-key");
  generateContent.mockResolvedValue({ text: JSON.stringify({ announcements: [
    { id: "college-visits-2026-09-09", formattedText: "College representatives are visiting today." }
  ] }) });
  const visits = makeAnnouncement({ id: "college-visits-2026-09-09", announcement: "Today’s visitors are NYU, Purdue, Lawrence, and Oregon State." });
  try {
    const result = await formatAnnouncementsForTeleprompter([visits]);
    expect(result.announcements[0].announcement).toBe(visits.announcement);
  } finally {
    vi.unstubAllEnvs();
  }
});


it.each(["missing tomorrow", "missing entire passage"])("preserves both visit days during script reformatting: %s", async (scenario) => {
  vi.stubEnv("GEMINI_API_KEY", "test-key");
  const passage = "College visits are happening today and tomorrow in the College and Career Center. Today’s visitors are NYU Abu Dhabi, Case Western Reserve, Lawrence, Ottawa, Purdue, and Oregon State. Tomorrow’s visitors are Temple University, Japan Campus, Sarah Lawrence College, York University, and Minerva University. Check MaiaLearning through ClassLink under Events for visit times and to RSVP.";
  const content = `BULLETIN\nCAM 3\n[ANCHOR]\n${passage}\nCAM 1\n[CO-ANCHOR]\nThe club meets Friday.`;
  const damaged = scenario === "missing tomorrow"
    ? content.replace(/Tomorrow’s visitors are .*?University\. /, "")
    : content.replace(passage, "College representatives are visiting today.");
  generateContent.mockResolvedValue({ text: JSON.stringify({ content: damaged }) });
  try {
    const result = await reformatTeleprompterScriptContent(content);
    expect(result).toContain(passage);
    expect(result).toContain("CAM 1\n[CO-ANCHOR]\nThe club meets Friday.");
  } finally {
    vi.unstubAllEnvs();
  }
});

it.each(["A1", "A5"])("keeps %s speaker cues and full names out of AI rewriting", async (label) => {
  const content = "CAM 2\n{ANCHOR}\nI'm Alma Example.\n{COANCHOR}\nAnd I'm Colin Example.";
  generateContent.mockClear();
  const result = await reformatTeleprompterScriptContent(content, label);
  expect(result).toBe(content);
  expect(generateContent).not.toHaveBeenCalled();
});
