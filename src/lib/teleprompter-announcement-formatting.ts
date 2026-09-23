import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import type { SubmittedAnnouncement } from "@/src/lib/submitted-announcements";

export const TELEPROMPTER_GEMINI_MODEL = "gemini-3.5-flash-lite";

const formattedAnnouncementsSchema = z.object({
  announcements: z.array(
    z.object({
      id: z.string().min(1),
      formattedText: z.string().min(1)
    })
  )
});

const reformattedScriptSchema = z.object({
  content: z.string().min(1)
});

const responseJsonSchema = {
  type: "object",
  properties: {
    announcements: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: {
            type: "string"
          },
          formattedText: {
            type: "string"
          }
        },
        required: ["id", "formattedText"],
        additionalProperties: false
      }
    }
  },
  required: ["announcements"],
  additionalProperties: false
} as const;

let cachedClient: GoogleGenAI | null | undefined;

function getGeminiClient() {
  if (cachedClient !== undefined) {
    return cachedClient;
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim();
  cachedClient = apiKey ? new GoogleGenAI({ apiKey }) : null;
  return cachedClient;
}

function normalizeAnnouncementText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeScriptText(value: string) {
  return value.replace(/\r\n/g, "\n").trim();
}

function isTeleprompterCueLine(value: string) {
  return (
    /^CAM\s+\d+$/i.test(value) ||
    /^\{[^}]+\}$/.test(value) ||
    /^\[[A-Z][A-Z -]*\]$/.test(value) ||
    /^[A-Z][A-Z -]+$/.test(value)
  );
}

export function collapseTeleprompterSpokenParagraphs(value: string) {
  const lines = normalizeScriptText(value).split("\n");
  const collapsed: string[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) {
      return;
    }

    collapsed.push(paragraph.join(" ").replace(/\s+/g, " ").trim());
    paragraph = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      continue;
    }

    if (isTeleprompterCueLine(line)) {
      flushParagraph();
      collapsed.push(line);
      continue;
    }

    paragraph.push(line);
  }

  flushParagraph();
  return collapsed.join("\n").trim();
}

export const TELEPROMPTER_ANNOUNCEMENT_FORMAT_RULES = [
  "You are writing school-announcement copy for a teleprompter.",
  "Broadcast-anchor style means a news reader reporting facts, not a recruiter, radio promo, or club pitch.",
  "Use short spoken sentences, not a flyer, form, or list.",
  "Keep the original facts. Do not add hype, slogans, jokes, rhetorical questions, or new calls to action.",
  "Do not invent names, dates, times, locations, organizations, URLs, or items.",
  "Keep important dates, times, donation destinations, links, and concrete asks when present.",
  "Unaffiliated means not Paly, not PAUSD, not InFocus, and not a Paly club: community nonprofits, outside school districts, independent student groups, and youth-led orgs.",
  "COMMUNITY_MEMBER and PARENT_GUARDIAN submissions are unaffiliated even if a Paly student could join.",
  "For unaffiliated orgs, write only in third person. Name the organization. Never use I/we/our/us.",
  "Never tell viewers to Join, Come, Want to, or Get involved. Rewrite those as 'The group is looking for students' or 'Students can sign up at'.",
  "Do not open with a question. Do not end with a second slogan or extra CTA.",
  "Wrong: 'Want to help shape the future of our cities? Join the New Urbanism Initiative... Join NUI and help build better cities!'",
  "Wrong: 'Are you looking for a fun teaching opportunity? ... We work with four schools... Ready to get involved?'",
  "For Paly clubs, PAUSD offices, counseling, and the College and Career Center, keep the source voice, including you/your when the source used it.",
  "Never use a colon list, numbered list, or semicolon stack of events.",
  "If the source already names specific events, keep every named event, date, and time, written as natural sentences.",
  "If the source is a long inventory rather than a few named events, summarize in spoken prose using only source items. College visits are an exception: keep every college name grouped by visit day, even in a long list.",
  "College visits should read as a host would, not as a calendar. Do not write 'Upcoming college visits: A on date, B on date, and C on date.'",
  "Example — unaffiliated org. Source: 'Join the New Urbanism Initiative to research housing and transit, advocate for safe streets, and organize campaigns. Sign up at tinyurl.com/NUIsignup.' Write: 'The New Urbanism Initiative is looking for students to research housing and transit, advocate for safe streets, and organize campaigns. Sign-ups are at tinyurl.com/NUIsignup.'",
  "Example — unaffiliated org. Source: 'Are you looking for a fun teaching opportunity? Buddies4Math is a student-run organization that tutors elementary schoolers through math games. We work with four schools in the Mountain View Whisman School District. Visit buddies4math.org.' Write: 'Buddies4Math tutors elementary students with math games at four schools in the Mountain View Whisman School District. More information is at buddies4math.org.'",
  "Example — college visits. Source: 'Upcoming college visits: Columbia University on Sept. 15 at 11:30 am, Columbia Dual Degree programs on Sept. 24 at 2:30 pm, and Arizona State University California campus on Nov. 3 at 10:45 am.' Write: 'College visits are coming up. Columbia University will be here September 15th at 11:30 a.m., Columbia Dual Degree programs on September 24th at 2:30 p.m., and Arizona State University's California campus on November 3rd at 10:45 a.m.'"
];

export function buildAnnouncementFormattingPrompt(announcements: SubmittedAnnouncement[]) {
  return [
    ...TELEPROMPTER_ANNOUNCEMENT_FORMAT_RULES,
    "Return JSON only.",
    "",
    JSON.stringify({
      announcements: announcements.map((announcement) => ({
        id: announcement.id,
        submitterKind: announcement.submitterKind || "",
        text: normalizeAnnouncementText(announcement.announcement)
      }))
    })
  ].join("\n");
}

export async function formatAnnouncementsForTeleprompter(announcements: SubmittedAnnouncement[]) {
  const client = getGeminiClient();
  if (!client || announcements.length === 0) {
    return {
      announcements,
      usedGemini: false
    };
  }

  const response = await client.models.generateContent({
    model: TELEPROMPTER_GEMINI_MODEL,
    contents: buildAnnouncementFormattingPrompt(announcements),
    config: {
      temperature: 0.2,
      maxOutputTokens: 2048,
      responseMimeType: "application/json",
      responseJsonSchema
    }
  });

  const parsed = formattedAnnouncementsSchema.parse(JSON.parse(response.text || "{}"));
  const byId = new Map(parsed.announcements.map((entry) => [entry.id, normalizeAnnouncementText(entry.formattedText)]));

  return {
    usedGemini: true,
    announcements: announcements.map((announcement) => ({
      ...announcement,
      // Sheet visits already have broadcast copy with every college preserved.
      announcement: announcement.id.startsWith("college-visits-")
        ? normalizeAnnouncementText(announcement.announcement)
        : byId.get(announcement.id) || normalizeAnnouncementText(announcement.announcement)
    }))
  };
}

export async function reformatTeleprompterScriptContent(content: string, label?: string) {
  // Introductions and sign-offs are scripted dialogue, not announcements to summarize.
  if (label === "A1" || label === "A5") {
    return collapseTeleprompterSpokenParagraphs(content);
  }
  const client = getGeminiClient();
  if (!client) {
    throw new Error("Gemini reformatting is unavailable because no Gemini API key is configured.");
  }

  const response = await client.models.generateContent({
    model: TELEPROMPTER_GEMINI_MODEL,
    contents: [
      "You are reformatting teleprompter script content for on-camera reading.",
      "Keep standalone section heading lines like OPEN, BULLETIN, PACKAGE, WEATHER, SPORTS, and CLOSING exactly as written.",
      "Keep all camera cues like CAM 1, CAM 2, CAM 3 exactly as written.",
      "Keep all cue tokens like {ANCHOR}, {COANCHOR}, {ROLL INTRO}, and {HOLD} exactly as written.",
      "Keep role labels like [ANCHOR] and [CO-ANCHOR] as standalone cue lines, including the surrounding brackets.",
      "Keep placeholder lines like [INSERT PACKAGE TOSS] and [INSERT THANK YOU NAMES] exactly as written.",
      "After the cue lines for each block, write the spoken copy as exactly one paragraph.",
      "Broadcast-anchor style means a news reader reporting facts, not a recruiter, radio promo, or club pitch.",
      "Keep the original facts. Do not add hype, slogans, rhetorical questions, or new calls to action.",
      "For unaffiliated orgs (not Paly, PAUSD, InFocus, or a Paly club), use third person only. Never use we/our/us, Join, Want to, Are you looking, or Ready to get involved.",
      "Do not open spoken copy with a question. Do not end with a slogan.",
      "Never turn college visits or other events into a colon list. Keep every named event, date, and time in natural sentences.",
      "Cut secondary details first and usually keep each spoken block to about 2 or 3 short sentences.",
      "Keep anchors’ full names in introductions and sign-offs. Never shorten them to first names.",
      "For college visits, keep every college name grouped by visit day, even in a long list.",
      "Only rewrite spoken lines to be more readable aloud, shorter, and cleaner.",
      "Do not add bullet lists, multiple spoken paragraphs, or line-by-line dramatic breaks.",
      "Do not invent facts, names, dates, locations, statistics, or instructions.",
      "Return JSON only.",
      "",
      normalizeScriptText(content)
    ].join("\n"),
    config: {
      temperature: 0.2,
      maxOutputTokens: 4096,
      responseMimeType: "application/json",
      responseJsonSchema: {
        type: "object",
        properties: {
          content: {
            type: "string"
          }
        },
        required: ["content"],
        additionalProperties: false
      }
    }
  });

  const parsed = reformattedScriptSchema.parse(JSON.parse(response.text || "{}"));
  const original = collapseTeleprompterSpokenParagraphs(content);
  const reformatted = collapseTeleprompterSpokenParagraphs(parsed.content);
  const collegePassages = normalizeAnnouncementText(original).match(
    /College visits are happening\b.*?for visit times and to RSVP\./g
  ) ?? [];
  // A prompt alone cannot guarantee the model retains every day and college.
  // Keep the source script if reformatting changes or omits its generated visit passage.
  if (collegePassages.some((passage) => !normalizeAnnouncementText(reformatted).includes(passage))) {
    return original;
  }
  return reformatted;
}
