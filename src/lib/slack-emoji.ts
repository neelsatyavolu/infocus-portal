import slackShortcodes from "emojibase-data/en/shortcodes/iamcal.json";

/** Slack's emoji names (iamcal, the set Slack uses) mapped to the emoji itself. Built on first use. */
let emojiByName: Map<string, string> | null = null;

function hexToEmoji(hexcode: string) {
  const points = hexcode.split("-").map((hex) => Number.parseInt(hex, 16));
  // A lone code point like ✅ or ☀ can draw as a plain text glyph; ask for the emoji form.
  if (points.length === 1) points.push(0xfe0f);
  return String.fromCodePoint(...points);
}

function emojiMap() {
  if (emojiByName) return emojiByName;
  const map = new Map<string, string>();
  for (const [hexcode, names] of Object.entries(slackShortcodes as Record<string, string | string[]>)) {
    const emoji = hexToEmoji(hexcode);
    for (const name of Array.isArray(names) ? names : [names]) map.set(name, emoji);
  }
  emojiByName = map;
  return map;
}

const SKIN_TONES: Record<string, string> = {
  "2": "\u{1F3FB}",
  "3": "\u{1F3FC}",
  "4": "\u{1F3FD}",
  "5": "\u{1F3FE}",
  "6": "\u{1F3FF}"
};

const SHORTCODE = /:([a-z0-9_+'-]+):(?::skin-tone-([2-6]):)?/g;

/**
 * Replaces Slack shortcodes (`:white_check_mark:`, `:+1::skin-tone-3:`) with emoji. Names Slack
 * doesn't ship (workspace custom emoji) stay as typed.
 */
export function replaceSlackEmoji(text: string) {
  if (!text.includes(":")) return text;
  const map = emojiMap();
  return text.replace(SHORTCODE, (raw, name: string, tone: string | undefined) => {
    const emoji = map.get(name);
    if (!emoji) return raw;
    if (!tone) return emoji;
    // The tone modifier attaches straight to the base, without the emoji-form selector.
    return emoji.replace(/️$/, "") + SKIN_TONES[tone];
  });
}
