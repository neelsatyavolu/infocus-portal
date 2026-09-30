import { PA_TEMPLATE, SHOW_TEMPLATE } from "@/src/lib/master-calendar-cells";
import { extractAnchorNamesFromCalendarHtml } from "@/src/lib/teleprompter-anchor-names";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function headingPattern(label: string) {
  return new RegExp(`<p>\\s*<strong>\\s*${label}:\\s*</strong>\\s*</p>`, "i");
}

export function formatPairedNames(names: string[]) {
  return names
    .map((name) => name.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(" & ");
}

function nameParagraphs(names: string[]) {
  const line = formatPairedNames(names);
  return line ? `<p>${escapeHtml(line)}</p>` : "<p><br></p>";
}

export function omitCalendarSection(html: string, heading: string, nextHeadings: string[]) {
  const start = headingPattern(heading).exec(html);
  if (!start) {
    return html;
  }

  const after = start.index + start[0].length;
  const rest = html.slice(after);
  let endIndex = rest.length;
  for (const next of nextHeadings) {
    const match = headingPattern(next).exec(rest);
    if (match && match.index < endIndex) {
      endIndex = match.index;
    }
  }
  return `${html.slice(0, start.index)}${rest.slice(endIndex)}`.trim();
}

const SHOW_FOLLOWING_HEADINGS = ["Package", "Show Director", "Show Manager"];

export type CalendarCrewRole = "Filmers" | "Editors";
export const CALENDAR_CREW_ROLES: CalendarCrewRole[] = ["Filmers", "Editors"];

export function omitAssignedNamesFromCalendarHtml(html: string, kind: "SHOW" | "PA" | string) {
  if (kind === "SHOW") {
    const withoutAnchors = omitCalendarSection(html, "Anchors", SHOW_FOLLOWING_HEADINGS);
    return omitCalendarSection(withoutAnchors, "Show Manager", []);
  }
  if (kind === "PA") {
    return omitCalendarSection(html, "PA Announcers", []);
  }
  return html;
}

export function restoreAssignedNamesInCalendarHtml(
  editedHtml: string,
  storedHtml: string,
  kind: "SHOW" | "PA" | string
) {
  if (kind === "SHOW") {
    let next = setCalendarAnchors(editedHtml, extractCalendarAnchors(storedHtml));
    const manager = extractCalendarShowManager(storedHtml);
    if (manager || headingPattern("Show Manager").test(storedHtml)) {
      next = setCalendarShowManager(next, manager ? [manager] : []);
    }
    return restoreCalendarCrew(next, storedHtml);
  }
  if (kind === "PA") {
    return restoreCalendarCrew(
      setCalendarPaAnnouncers(editedHtml, extractCalendarPaAnnouncers(storedHtml)),
      storedHtml
    );
  }
  return editedHtml;
}

export function replaceCalendarSection(
  html: string,
  heading: string,
  nextHeadings: string[],
  innerHtml: string,
  fallback = ""
) {
  const source = html.trim() ? html : fallback;
  const start = headingPattern(heading).exec(source);
  if (!start) {
    const block = `<p><strong>${heading}:</strong></p>${innerHtml}`;
    return source ? `${block}${source}` : block;
  }

  const after = start.index + start[0].length;
  const rest = source.slice(after);
  let endIndex = rest.length;
  for (const next of nextHeadings) {
    const match = headingPattern(next).exec(rest);
    if (match && match.index < endIndex) {
      endIndex = match.index;
    }
  }
  return source.slice(0, after) + innerHtml + rest.slice(endIndex);
}

export function setCalendarAnchors(html: string, names: string[]) {
  return replaceCalendarSection(
    html,
    "Anchors",
    SHOW_FOLLOWING_HEADINGS,
    nameParagraphs(names),
    SHOW_TEMPLATE
  );
}

export function setCalendarShowManager(html: string, names: string[]) {
  const inner = nameParagraphs(names.slice(0, 1));
  const source = html.trim() ? html : SHOW_TEMPLATE;
  if (!headingPattern("Show Manager").test(source)) {
    return `${source}<p><strong>Show Manager:</strong></p>${inner}`;
  }
  return replaceCalendarSection(source, "Show Manager", CALENDAR_CREW_ROLES, inner, SHOW_TEMPLATE);
}

export function setCalendarPaAnnouncers(html: string, names: string[]) {
  return replaceCalendarSection(
    html,
    "PA Announcers",
    CALENDAR_CREW_ROLES,
    nameParagraphs(names),
    PA_TEMPLATE
  );
}

export function extractCalendarAnchors(html: string) {
  return extractAnchorNamesFromCalendarHtml(html);
}

export function wipeCalendarAnchorNames(html: string) {
  if (extractCalendarAnchors(html).length === 0) {
    return html;
  }
  return setCalendarAnchors(html, []);
}

export function extractCalendarPaAnnouncers(html: string) {
  const text = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'");

  const lines = text
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const headingIndex = lines.findIndex((line) => /^pa announcers\s*:/i.test(line));
  if (headingIndex === -1) {
    return [];
  }

  const chunks: string[] = [];
  const sameLine = lines[headingIndex].replace(/^pa announcers\s*:/i, "").trim();
  if (sameLine) {
    chunks.push(sameLine);
  }

  for (let index = headingIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^(anchors|package|show director|sd|show manager|sm|filmers|editors)\s*:/i.test(line)) {
      break;
    }
    chunks.push(line);
  }

  const seen = new Set<string>();
  return chunks
    .flatMap((chunk) => chunk.split(/\s*(?:,|\/|&|\band\b|\+)\s*/i))
    .map((entry) => entry.trim())
    .filter((entry) => {
      const key = entry.toLowerCase();
      if (!key || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, 2);
}

export function extractCalendarShowManager(html: string) {
  const text = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'");

  const lines = text
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const headingIndex = lines.findIndex((line) => /^(show manager|sm)\s*:/i.test(line));
  if (headingIndex === -1) {
    return "";
  }

  const chunks: string[] = [];
  const sameLine = lines[headingIndex].replace(/^(show manager|sm)\s*:/i, "").trim();
  if (sameLine) {
    chunks.push(sameLine);
  }

  for (let index = headingIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^(anchors|package|show director|sd|pa announcers|filmers|editors)\s*:/i.test(line)) {
      break;
    }
    chunks.push(line);
  }

  const name = chunks
    .flatMap((chunk) => chunk.split(/\s*(?:,|\/|&|\band\b|\+)\s*/i))
    .map((entry) => entry.trim())
    .find(Boolean);
  return name ?? "";
}

const CREW_FOLLOWING_HEADINGS = ["Anchors", ...SHOW_FOLLOWING_HEADINGS, "PA Announcers"];

function crewNextHeadings(role: CalendarCrewRole) {
  return [...CREW_FOLLOWING_HEADINGS, ...CALENDAR_CREW_ROLES.filter((other) => other !== role)];
}

function uniqueCrewNames(names: string[]) {
  const seen = new Set<string>();
  return names
    .map((name) => name.trim())
    .filter((name) => {
      const key = name.toLowerCase();
      if (!key || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
}

/** Spirit Week crew: any number of names, one comma-separated line after Filmers: / Editors:. */
export function setCalendarCrew(html: string, role: CalendarCrewRole, names: string[]) {
  const crew = uniqueCrewNames(names);
  const nextHeadings = crewNextHeadings(role);
  if (crew.length === 0) {
    return omitCalendarSection(html, role, nextHeadings);
  }

  const inner = `<p>${escapeHtml(crew.join(", "))}</p>`;
  if (headingPattern(role).test(html)) {
    return replaceCalendarSection(html, role, nextHeadings, inner);
  }
  const block = `<p><strong>${role}:</strong></p>${inner}`;
  const editors = role === "Filmers" ? headingPattern("Editors").exec(html) : null;
  if (editors) {
    return `${html.slice(0, editors.index)}${block}${html.slice(editors.index)}`;
  }
  return `${html}${block}`;
}

export function extractCalendarCrew(html: string, role: CalendarCrewRole) {
  const start = headingPattern(role).exec(html);
  if (!start) {
    return [];
  }
  const rest = html.slice(start.index + start[0].length);
  const nextHeadings = crewNextHeadings(role);
  const endIndex = Math.min(
    rest.length,
    ...nextHeadings.map((next) => headingPattern(next).exec(rest)?.index ?? rest.length)
  );
  const text = rest
    .slice(0, endIndex)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'");
  return uniqueCrewNames(text.split(/\n|,/));
}

function restoreCalendarCrew(editedHtml: string, storedHtml: string) {
  return CALENDAR_CREW_ROLES.reduce(
    (next, role) => setCalendarCrew(next, role, extractCalendarCrew(storedHtml, role)),
    editedHtml
  );
}
