import { z } from "zod";

/**
 * The editable content of an application round (the fixed 3-section template; see
 * docs/superpowers/specs/2026-11-12-applicant-portal-design.md). Stored as ApplicationRound.config.
 * `roughCut.answerKey`, `rubric` and decision internals are reviewer-only: use applicantConfig()
 * before anything goes to an applicant.
 */

const text = (max: number) => z.string().trim().max(max);
const list = (maxItems: number, maxLen = 80) => z.array(text(maxLen).min(1)).max(maxItems);

export const decisionToneSchema = z.enum(["success", "info", "neutral", "danger"]);

export const applicationConfigSchema = z.object({
  roles: list(12),
  skills: list(20),
  gradeOptions: list(6, 20),
  yearsOptions: list(6, 20),
  hoursOptions: list(8, 20),
  questions: z
    .array(z.object({ prompt: text(500).min(1), maxWords: z.number().int().min(10).max(1000), softMinWords: z.number().int().min(0).max(1000) }))
    .length(2),
  roughCut: z.object({
    instructions: text(1000),
    context: text(1000),
    answerKey: text(4000),
    categories: list(12, 40).min(1),
    minNotes: z.number().int().min(0).max(50),
    maxNotes: z.number().int().min(1).max(50),
    noteMaxChars: z.number().int().min(20).max(2000),
    summaryPrompt: text(500).min(1),
    summaryMaxWords: z.number().int().min(10).max(1000),
    airOptions: list(6, 60).min(1),
    airReasonMaxWords: z.number().int().min(5).max(200)
  }),
  rubric: z.array(z.object({ key: text(40).min(1), label: text(80).min(1), description: text(300) })).min(1).max(10),
  /** Decision desk: each exec picks this many applicants per list (one person per list at most). */
  pickLists: z.array(z.object({ key: text(40).min(1), label: text(80).min(1), count: z.number().int().min(1).max(20) })).min(1).max(4),
  decisions: z
    .array(z.object({ key: text(40).min(1), label: text(80).min(1), message: text(2000), tone: decisionToneSchema }))
    .min(1)
    .max(8),
  attestation: text(300).min(1)
});

export type ApplicationConfig = z.infer<typeof applicationConfigSchema>;
export type DecisionOption = ApplicationConfig["decisions"][number];
export type PickList = ApplicationConfig["pickLists"][number];

export const DEFAULT_APPLICATION_CONFIG: ApplicationConfig = {
  roles: ["Reporter", "Associate Producer", "Executive Producer", "Show & Technical Director", "Livestream Director", "Digital Director"],
  skills: [
    "Premiere / editing",
    "Camera",
    "Audio",
    "Graphics",
    "Livestream / switcher",
    "Writing / scripting",
    "Social media",
    "Web / WordPress",
    "On-air",
    "Management / scheduling"
  ],
  gradeOptions: ["11", "12"],
  yearsOptions: ["1", "2", "3+"],
  hoursOptions: ["0–5", "5–10", "10–15", "15–20", "20+"],
  questions: [
    { prompt: "What's one thing InFocus should change next year, and how would you make it happen?", maxWords: 150, softMinWords: 50 },
    {
      prompt: "Tell us about a time a package, show, or project went wrong. What happened, and what did you do?",
      maxWords: 150,
      softMinWords: 50
    }
  ],
  roughCut: {
    instructions:
      "You're the producer. Watch this rough cut and give the reporter the notes you'd actually give them before it airs. Be specific and prioritize.",
    context: "",
    answerKey: "",
    categories: [
      "Story / Structure",
      "Interviews / Sound bites",
      "Video / B-roll",
      "Audio",
      "Graphics / Lower thirds",
      "Accuracy / Ethics",
      "Other"
    ],
    minNotes: 3,
    maxNotes: 20,
    noteMaxChars: 300,
    summaryPrompt: "If the reporter could only fix three things before air, what should they be and why?",
    summaryMaxWords: 150,
    airOptions: ["Ready to air", "Air after fixes", "Not ready, needs a re-cut"],
    airReasonMaxWords: 40
  },
  rubric: [
    { key: "vision", label: "Vision", description: "Short answer 1: a specific, realistic change with a concrete plan" },
    { key: "ownership", label: "Ownership", description: "Short answer 2: owns the mistake, clear actions, what they learned" },
    { key: "spotting", label: "Spotting problems", description: "Rough cut: catches the real issues, including the important ones, not just nitpicks" },
    { key: "judgment", label: "Prioritization & judgment", description: "Rough cut: the top-3 summary picks the right fixes; the air decision is sound" },
    { key: "communication", label: "Communication", description: "Rough cut: notes are clear, specific, actionable and respectful to the reporter" }
  ],
  pickLists: [
    { key: "ep", label: "Executive Producer", count: 2 },
    { key: "ap", label: "Associate Producer", count: 3 }
  ],
  decisions: [
    {
      key: "accepted_ep",
      label: "Accepted: Executive Producer",
      message: "Congratulations! You've been selected as an Executive Producer for next year. Please keep your result to yourself until the team is announced.",
      tone: "success"
    },
    {
      key: "accepted_ap",
      label: "Accepted: Associate Producer",
      message: "Congratulations! You've been selected as an Associate Producer for next year. Please keep your result to yourself until the team is announced.",
      tone: "info"
    },
    {
      key: "not_selected",
      label: "Not selected",
      message: "Thank you for applying. We weren't able to offer you a producer position this year, and we hope you'll keep growing with InFocus.",
      tone: "neutral"
    }
  ],
  attestation: "I wrote this myself and followed the InFocus AI policy."
};

/** A stored config, repaired against the defaults so older rows keep working after fields are added. */
export function parseApplicationConfig(value: unknown): ApplicationConfig {
  const merged = mergeDefaults(DEFAULT_APPLICATION_CONFIG, value);
  const parsed = applicationConfigSchema.safeParse(merged);
  return parsed.success ? parsed.data : DEFAULT_APPLICATION_CONFIG;
}

function mergeDefaults(defaults: ApplicationConfig, value: unknown): unknown {
  if (!value || typeof value !== "object") return defaults;
  const input = value as Record<string, unknown>;
  const roughCut = input.roughCut && typeof input.roughCut === "object" ? input.roughCut : {};
  return { ...defaults, ...input, roughCut: { ...defaults.roughCut, ...roughCut } };
}

/** What an applicant may see of the config: no answer key, rubric or decision messages. */
export function applicantConfig(config: ApplicationConfig) {
  const cut = config.roughCut;
  const roughCut = {
    instructions: cut.instructions,
    context: cut.context,
    categories: cut.categories,
    minNotes: cut.minNotes,
    maxNotes: cut.maxNotes,
    noteMaxChars: cut.noteMaxChars,
    summaryPrompt: cut.summaryPrompt,
    summaryMaxWords: cut.summaryMaxWords,
    airOptions: cut.airOptions,
    airReasonMaxWords: cut.airReasonMaxWords
  };
  return {
    roles: config.roles,
    skills: config.skills,
    gradeOptions: config.gradeOptions,
    yearsOptions: config.yearsOptions,
    hoursOptions: config.hoursOptions,
    questions: config.questions,
    roughCut,
    attestation: config.attestation
  };
}

export type ApplicantConfig = ReturnType<typeof applicantConfig>;
