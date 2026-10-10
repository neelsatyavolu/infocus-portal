import { z } from "zod";

/** Graphics the operator can push to the Live image OBS source. */
export const GRAPHIC_IDS = ["starting-soon", "commentators", "spotlight", "halftime", "brb", "final"] as const;
export type GraphicId = (typeof GRAPHIC_IDS)[number];

export type GraphicField = { key: string; label: string; max: number; placeholder?: string };

export type GraphicDefinition = {
  id: GraphicId;
  name: string;
  description: string;
  fields: GraphicField[];
};

export const GRAPHICS: GraphicDefinition[] = [
  {
    id: "starting-soon",
    name: "Starting soon",
    description: "Countdown to the event's start time, moved by the start offset.",
    fields: [
      { key: "title", label: "Title", max: 40 },
      { key: "subtitle", label: "Subtitle", max: 60 },
      { key: "offset", label: "Start offset (minutes)", max: 6, placeholder: "0 · 60 is an hour later, -10 is earlier" }
    ]
  },
  {
    id: "commentators",
    name: "Commentators",
    description: "Two lower thirds, one on each side.",
    fields: [
      { key: "leftName", label: "Left name", max: 28 },
      { key: "leftRole", label: "Left role", max: 28 },
      { key: "rightName", label: "Right name", max: 28 },
      { key: "rightRole", label: "Right role", max: 28 }
    ]
  },
  {
    id: "spotlight",
    name: "Player spotlight",
    description: "Number and name, then tonight's line.",
    fields: [
      { key: "player", label: "Player", max: 28 },
      { key: "stats", label: "Stat line", max: 40 }
    ]
  },
  {
    id: "halftime",
    name: "Halftime",
    description: "Score and period totals from the scoreboard.",
    fields: [
      { key: "heading", label: "Heading", max: 20 },
      { key: "footer", label: "Bottom line", max: 48 }
    ]
  },
  {
    id: "brb",
    name: "Be right back",
    description: "Timeouts, tech problems, JV to varsity.",
    fields: [
      { key: "headline", label: "Headline", max: 32 },
      { key: "line", label: "Second line", max: 48 }
    ]
  },
  {
    id: "final",
    name: "Final score",
    description: "Final score, then the Follow InFocus handles.",
    fields: [
      { key: "heading", label: "Heading", max: 20 },
      { key: "signoff", label: "Sign-off", max: 32 }
    ]
  }
];

export function graphicDefinition(id: GraphicId) {
  return GRAPHICS.find((graphic) => graphic.id === id) ?? GRAPHICS[0];
}

export function defaultGraphicFields(
  id: GraphicId,
  event: { title: string; location: string }
): Record<string, string> {
  switch (id) {
    case "starting-soon":
      return { title: event.title.slice(0, 40), subtitle: event.location.slice(0, 60), offset: "" };
    case "commentators":
      return { leftName: "", leftRole: "Play-by-play", rightName: "", rightRole: "Color commentary" };
    case "spotlight":
      return { player: "", stats: "" };
    case "halftime":
      return { heading: "Halftime", footer: "Second half coming up" };
    case "brb":
      return { headline: "We'll be right back", line: "" };
    case "final":
      return { heading: "Final", signoff: "Thanks for watching" };
    default:
      return {};
  }
}

/** The Starting soon offset field (minutes, negative is earlier) in milliseconds; blank or not a number is 0. */
export function startOffsetMs(value: string | undefined) {
  const minutes = Number(value ?? "");
  return Number.isFinite(minutes) ? Math.round(minutes * 60_000) : 0;
}

export const liveImageSchema = z
  .object({
    graphic: z.enum(GRAPHIC_IDS),
    fields: z.record(z.string(), z.string().max(80)),
    /** Server time it was pushed; the overlay replays the build-in when this changes. */
    pushedAt: z.number()
  })
  .nullable();

export type LiveImageState = z.infer<typeof liveImageSchema>;

export function parseLiveImage(value: unknown): LiveImageState {
  const parsed = liveImageSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Keeps only the fields the graphic defines, trimmed to each field's limit. */
export function sanitizeGraphicFields(id: GraphicId, fields: Record<string, string>) {
  const definition = graphicDefinition(id);
  return Object.fromEntries(
    definition.fields.map((field) => [field.key, (fields[field.key] ?? "").slice(0, field.max)])
  );
}
