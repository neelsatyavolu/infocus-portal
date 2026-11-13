import { z } from "zod";
import type { ApplicantConfig } from "@/src/lib/applications/config";

/**
 * An applicant's answers (Application.answers). Drafts save leniently (lengths capped so nothing huge
 * is stored); submitting runs validateForSubmit, on the client for feedback and on the server as the rule.
 */

const str = (max: number) => z.string().max(max).default("");

export const cutNoteSchema = z.object({
  id: z.string().min(1).max(40),
  /** Seconds into the rough cut. */
  t: z.number().min(0).max(24 * 3600),
  category: z.string().max(40).default(""),
  text: z.string().max(2000).default("")
});

export const MAX_CUSTOM_SKILLS = 5;
export const CUSTOM_SKILL_MAX = 50;

export const answersSchema = z.object({
  grade: str(20),
  years: str(20),
  currentRole: str(80),
  pastRoles: z.array(z.string().max(80)).max(12).default([]),
  leadership: z.array(z.object({ org: str(120), role: str(120), years: str(20) })).max(5).default([]),
  commitments: str(400),
  hours: str(20),
  skills: z.array(z.string().max(80)).max(20).default([]),
  /** Skills the applicant typed in themselves (up to MAX_CUSTOM_SKILLS, CUSTOM_SKILL_MAX chars each). */
  customSkills: z.array(z.string().max(CUSTOM_SKILL_MAX)).max(MAX_CUSTOM_SKILLS).default([]),
  /** "yes" only if they know for sure they're taking InFocus next year. */
  enrollingNextYear: z.enum(["", "yes", "no"]).default(""),
  answer1: str(10_000),
  answer2: str(10_000),
  cutNotes: z.array(cutNoteSchema).max(50).default([]),
  cutSummary: str(10_000),
  airDecision: str(60),
  airReason: str(2000)
});

export type ApplicationAnswers = z.infer<typeof answersSchema>;
export type CutNote = z.infer<typeof cutNoteSchema>;

export const EMPTY_ANSWERS: ApplicationAnswers = answersSchema.parse({});

export function parseAnswers(value: unknown): ApplicationAnswers {
  const parsed = answersSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : EMPTY_ANSWERS;
}

/** Plain text only: strip tags, keep line breaks, trim trailing spaces. */
export function plainText(value: string) {
  return value.replace(/<[^>]*>/g, "").replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").trim();
}

export function countWords(value: string) {
  const words = plainText(value).match(/[^\s]+/g);
  return words ? words.length : 0;
}

/** Every free-text answer run through plainText, and notes in time order. */
export function cleanAnswers(answers: ApplicationAnswers): ApplicationAnswers {
  return {
    ...answers,
    commitments: plainText(answers.commitments),
    leadership: answers.leadership.map((row) => ({ org: plainText(row.org), role: plainText(row.role), years: plainText(row.years) })),
    answer1: plainText(answers.answer1),
    answer2: plainText(answers.answer2),
    customSkills: answers.customSkills.map((skill) => plainText(skill)).filter(Boolean),
    cutSummary: plainText(answers.cutSummary),
    airReason: plainText(answers.airReason),
    cutNotes: answers.cutNotes.map((note) => ({ ...note, text: plainText(note.text) }))
  };
}

export type SectionKey = "facts" | "answers" | "cut";
export type SubmitProblem = { section: SectionKey; field: string; message: string };

/** Everything that blocks submitting. Empty list = ready. */
export function validateForSubmit(answers: ApplicationAnswers, config: ApplicantConfig, attested: boolean): SubmitProblem[] {
  const problems: SubmitProblem[] = [];
  const facts = (field: string, message: string) => problems.push({ section: "facts", field, message });

  if (!config.gradeOptions.includes(answers.grade)) facts("grade", "Pick your grade next year.");
  if (!config.yearsOptions.includes(answers.years)) facts("years", "Pick how many years you've been in InFocus.");
  if (!config.roles.includes(answers.currentRole)) facts("currentRole", "Pick your current InFocus role.");
  if (answers.leadership.some((row) => !row.org.trim() || !row.role.trim()))
    facts("leadership", "Fill in the organization and role for each leadership row, or remove it.");
  if (!answers.commitments.trim()) facts("commitments", "List your other major commitments (or write \"None\").");
  if (plainText(answers.commitments).length > 200) facts("commitments", "Keep commitments to 200 characters.");
  if (!config.hoursOptions.includes(answers.hours)) facts("hours", "Pick your weekly hours.");
  if (answers.skills.length === 0 && answers.customSkills.length === 0) facts("skills", "Check or add at least one skill.");
  if (!answers.enrollingNextYear) facts("enrollingNextYear", "Say whether you're enrolling in InFocus next year.");

  config.questions.forEach((question, index) => {
    const field = index === 0 ? "answer1" : "answer2";
    const words = countWords(answers[field]);
    if (words === 0) problems.push({ section: "answers", field, message: `Answer question ${index + 1}.` });
    else if (words > question.maxWords)
      problems.push({ section: "answers", field, message: `Question ${index + 1} is ${words} words; the limit is ${question.maxWords}.` });
  });

  const cut = config.roughCut;
  const cutProblem = (field: string, message: string) => problems.push({ section: "cut", field, message });
  if (answers.cutNotes.length < cut.minNotes) cutProblem("cutNotes", `Add at least ${cut.minNotes} notes.`);
  if (answers.cutNotes.length > cut.maxNotes) cutProblem("cutNotes", `Keep it to ${cut.maxNotes} notes.`);
  answers.cutNotes.forEach((note, index) => {
    if (!plainText(note.text)) cutProblem("cutNotes", `Note ${index + 1} is empty.`);
    else if (plainText(note.text).length > cut.noteMaxChars) cutProblem("cutNotes", `Note ${index + 1} is over ${cut.noteMaxChars} characters.`);
    if (!cut.categories.includes(note.category)) cutProblem("cutNotes", `Pick a category for note ${index + 1}.`);
  });
  const summaryWords = countWords(answers.cutSummary);
  if (summaryWords === 0) cutProblem("cutSummary", "Write the top-three summary.");
  else if (summaryWords > cut.summaryMaxWords) cutProblem("cutSummary", `The summary is ${summaryWords} words; the limit is ${cut.summaryMaxWords}.`);
  if (!cut.airOptions.includes(answers.airDecision)) cutProblem("airDecision", "Pick an air decision.");
  const reasonWords = countWords(answers.airReason);
  if (reasonWords === 0) cutProblem("airReason", "Give one sentence of reasoning for your air decision.");
  else if (reasonWords > cut.airReasonMaxWords)
    cutProblem("airReason", `Your reasoning is ${reasonWords} words; the limit is ${cut.airReasonMaxWords}.`);

  if (!attested) problems.push({ section: "cut", field: "attested", message: "Check the attestation box." });
  return problems;
}

/** "1:05" from 65.4 seconds. */
export function formatTimestamp(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const secs = String(whole % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${secs}` : `${minutes}:${secs}`;
}

/** 65 from "1:05"; null when it isn't a timestamp. */
export function parseTimestamp(value: string): number | null {
  const parts = value.trim().split(":");
  if (parts.length < 1 || parts.length > 3 || parts.some((part) => !/^\d+$/.test(part))) return null;
  return parts.reduce((total, part) => total * 60 + Number(part), 0);
}
