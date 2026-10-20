/** The A4 template line the reporters' thank-you replaces. */
export const THANK_YOU_PLACEHOLDER = "[INSERT THANK YOU NAMES]";

/** "Abby", "Abby and Otto", "Abby, Otto, and Sage". */
function joinNames(names: string[]) {
  if (names.length <= 2) return names.join(" and ");
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

/** The first word of a reporter's nickname, else of their name. */
export function reporterFirstName(person: { name?: string | null; nickname?: string | null }) {
  const display = person.nickname?.trim() || person.name?.trim() || "";
  return display.split(/\s+/)[0] ?? "";
}

/**
 * Fills the A4 thank-you placeholder with the first names of the show's
 * reporters, e.g. "Thank you Abby, Otto, and Sage!". Leaves the section alone
 * when there are no names or a producer already replaced the placeholder.
 */
export function fillThankYouNames(content: string, firstNames: string[]) {
  const names = firstNames.map((name) => name.trim()).filter(Boolean);
  if (names.length === 0 || !content.includes(THANK_YOU_PLACEHOLDER)) return content;
  return content.replace(THANK_YOU_PLACEHOLDER, () => `Thank you ${joinNames(names)}!`);
}
