import {
  ChartBar,
  ChartColumnStacked,
  Clapperboard,
  Hash,
  Images,
  LayoutTemplate,
  Link2,
  ListOrdered,
  Megaphone,
  Newspaper,
  Quote,
  Radio,
  Shapes,
  Text,
  ToggleLeft,
  Trophy,
  Tv,
  type LucideIcon
} from "lucide-react";
import type { StoryTemplate } from "@/components/story-maker/story-templates";

/** How the template picker groups STORY_TEMPLATES. Ids missing here fall into "Templates". */
const GROUPS: ReadonlyArray<{ label: string; ids: readonly string[] }> = [
  { label: "From the Portal", ids: ["show", "livestream"] },
  { label: "Templates", ids: ["cover", "quote", "gallery", "package", "brief", "text", "stat", "link"] },
  { label: "Results and data", ids: ["race", "measure", "seats", "winner", "figures"] },
  { label: "Freeform", ids: ["custom"] }
];
const FALLBACK_GROUP = "Templates";

const ICONS: Record<string, LucideIcon> = {
  show: Tv,
  livestream: Radio,
  cover: Newspaper,
  quote: Quote,
  gallery: Images,
  package: Clapperboard,
  brief: Megaphone,
  stat: Hash,
  link: Link2,
  text: Text,
  race: ChartBar,
  measure: ToggleLeft,
  seats: ChartColumnStacked,
  winner: Trophy,
  figures: ListOrdered,
  custom: Shapes
};

export type TemplateGroup = { label: string; templates: StoryTemplate[] };

export function templateIcon(id: string): LucideIcon {
  return ICONS[id] ?? LayoutTemplate;
}

/** Templates in picker order. Every template appears exactly once, even ones with no group yet. */
export function groupTemplates(templates: readonly StoryTemplate[]): TemplateGroup[] {
  const grouped = new Set(GROUPS.flatMap((group) => group.ids));
  const ungrouped = templates.filter((template) => !grouped.has(template.id));
  return GROUPS.map((group) => ({
    label: group.label,
    templates: [
      ...group.ids.flatMap((id) => templates.filter((template) => template.id === id)),
      ...(group.label === FALLBACK_GROUP ? ungrouped : [])
    ]
  })).filter((group) => group.templates.length > 0);
}
