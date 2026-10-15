import { defaultLivestreamFields, type LivestreamFields } from "@/src/lib/story-maker";
import { STORY_TEMPLATES, fieldDefault, type CanvasTemplate, type StoryValues } from "@/components/story-maker/story-templates";

/** Text drafts and the open template, per browser. Photos are never stored (they can be large). */
const STORE_KEY = "infocus-story-maker:v1";

type SavedDrafts = { current?: string; text?: Record<string, Record<string, string>> };
export type EditorState = { current: string; values: Record<string, StoryValues>; livestream: LivestreamFields };

const canvasTemplates = STORY_TEMPLATES.filter((t): t is CanvasTemplate => t.kind === "canvas");

export const templateById = (id: string) => STORY_TEMPLATES.find((t) => t.id === id) ?? STORY_TEMPLATES[0];

export function templateDefaults(template: CanvasTemplate): StoryValues {
  return Object.fromEntries(template.fields.map((field) => [field.key, fieldDefault(field)]));
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Whatever is stored (valid JSON or not, any shape) comes back as a plain object of the right shape. */
function readSaved(): SavedDrafts {
  let parsed: unknown;
  try {
    parsed = JSON.parse(window.localStorage.getItem(STORE_KEY) ?? "{}");
  } catch {
    return {};
  }
  if (!isRecord(parsed)) return {};
  const text = isRecord(parsed.text)
    ? Object.fromEntries(
        Object.entries(parsed.text)
          .filter((entry): entry is [string, Record<string, unknown>] => isRecord(entry[1]))
          .map(([id, fields]) => [id, Object.fromEntries(Object.entries(fields).filter((field): field is [string, string] => typeof field[1] === "string"))])
      )
    : undefined;
  return { current: typeof parsed.current === "string" ? parsed.current : undefined, text };
}

/** Text drafts are remembered in this browser; photos are not (they can be large). */
export function saveDrafts(state: EditorState) {
  const text = Object.fromEntries(
    Object.entries(state.values).map(([id, values]) => [
      id,
      Object.fromEntries(Object.entries(values).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
    ])
  );
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify({ current: state.current, text }));
  } catch {
    // Private windows can block storage; drafts just won't be remembered.
  }
}

/** Saved drafts over each template's sample text. Unknown templates and fields are ignored. Browser only. */
export function initialState(): EditorState {
  const saved = readSaved();
  const values = Object.fromEntries(
    canvasTemplates.map((template) => {
      const savedText = saved.text?.[template.id] ?? {};
      const known = Object.fromEntries(Object.entries(savedText).filter(([key]) => template.fields.some((f) => f.key === key && f.type !== "photo")));
      return [template.id, { ...templateDefaults(template), ...known }];
    })
  );
  const current = saved.current && STORY_TEMPLATES.some((t) => t.id === saved.current) ? saved.current : STORY_TEMPLATES[0].id;
  return { current, values, livestream: defaultLivestreamFields(new Date()) };
}
