import { classifyRunScriptLine } from "@/src/lib/teleprompter-run-script";

type WorkspaceMemberName = {
  name: string | null;
  nickname?: string | null;
};

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'");
}

function htmlToPlainText(value: string) {
  return decodeHtmlEntities(
    value
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>\s*<p[^>]*>/gi, "\n")
      .replace(/<\/div>\s*<div[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, "")
  );
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeName(value: string) {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "");
}

function splitCandidateNames(value: string) {
  return value
    .split(/\n|,|\/|&|\band\b|\+/gi)
    .map((entry) => normalizeWhitespace(entry))
    .filter(Boolean);
}

function isSectionHeading(value: string) {
  return /^(package|show director|sd|show manager|sm|pa announcers)\s*:/i.test(value);
}

export function extractAnchorNamesFromCalendarHtml(content: string) {
  const lines = htmlToPlainText(content)
    .split("\n")
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);

  const anchorIndex = lines.findIndex((line) => /^anchors\s*:/i.test(line));
  if (anchorIndex === -1) {
    return [];
  }

  const anchorChunks: string[] = [];
  const firstLine = lines[anchorIndex].replace(/^anchors\s*:/i, "").trim();
  if (firstLine) {
    anchorChunks.push(firstLine);
  }

  for (let index = anchorIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (isSectionHeading(line)) {
      break;
    }
    anchorChunks.push(line);
  }

  const seen = new Set<string>();
  return anchorChunks
    .flatMap(splitCandidateNames)
    .filter((entry) => {
      const normalized = normalizeName(entry);
      if (!normalized || seen.has(normalized)) {
        return false;
      }
      seen.add(normalized);
      return true;
    })
    .slice(0, 2);
}

export function anchorScriptName(member: WorkspaceMemberName, fallback = "") {
  const full = member.name?.trim() || "";
  if (full.split(/\s+/).filter(Boolean).length >= 2) {
    return full;
  }

  return full || member.nickname?.trim() || fallback;
}

function findUniqueMember(
  members: WorkspaceMemberName[],
  matcher: (member: WorkspaceMemberName) => boolean
) {
  const matches = members.filter(matcher);
  return matches.length === 1 ? matches[0] : null;
}

export function resolveAnchorDisplayNames(rawNames: string[], members: WorkspaceMemberName[]) {
  return rawNames.slice(0, 2).map((rawName) => {
    const normalizedRaw = normalizeName(rawName);
    if (!normalizedRaw) {
      return rawName;
    }

    const exact = findUniqueMember(
      members,
      (member) => normalizeName(member.name ?? "") === normalizedRaw
    );
    if (exact) {
      return anchorScriptName(exact, rawName);
    }

    const byNickname = findUniqueMember(
      members,
      (member) => normalizeName(member.nickname ?? "") === normalizedRaw
    );
    if (byNickname) {
      return anchorScriptName(byNickname, rawName);
    }

    const byContainment = findUniqueMember(members, (member) => {
      const normalizedMember = normalizeName(member.name ?? "");
      return Boolean(normalizedMember) && (normalizedMember.includes(normalizedRaw) || normalizedRaw.includes(normalizedMember));
    });
    if (byContainment) {
      return anchorScriptName(byContainment, rawName);
    }

    const firstToken = normalizedRaw.split(" ")[0];
    if (firstToken) {
      const byFirstName = findUniqueMember(members, (member) => {
        const nameFirst = normalizeName(member.name ?? "").split(" ")[0];
        const nickFirst = normalizeName(member.nickname ?? "").split(" ")[0];
        return nameFirst === firstToken || nickFirst === firstToken;
      });
      if (byFirstName) {
        return anchorScriptName(byFirstName, rawName);
      }
    }

    return rawName;
  });
}

/** Refresh only the template's introductions/sign-offs, preserving producer edits elsewhere. */
export function refreshAnchorScriptNames(label: string, content: string, names: string[]) {
  if (label !== "A1" && label !== "A5") {
    return content;
  }

  if (label === "A1") {
    // Repair older AI output that merged both identities into one speaker's paragraph.
    content = content.replace(
      /\bI(?:['’]m| am)\s+[^,\n]+?,\s+and I(?:['’]m| am)\s+[^.\n]+\./i,
      () => `\n{ANCHOR}\nI'm ${names[0] || "{ANCHOR NAME}"}.\n{COANCHOR}\nAnd I'm ${names[1] || "{COANCHOR NAME}"}.`
    ).replace(/([.!?]) +(?=Today is\b)/, "$1\n{COANCHOR}\n");
  }

  let role: string | null = null;
  return content.split("\n").map((line) => {
    const classified = classifyRunScriptLine(line);
    if (classified.kind === "cue" || classified.kind === "camera") {
      role = classified.text === "ANCHOR" || classified.text === "COANCHOR" ? classified.text : null;
      return line;
    }
    if (!role) return line;
    const name = role === "ANCHOR" ? names[0] || "{ANCHOR NAME}" : names[1] || "{COANCHOR NAME}";
    if (label === "A1") {
      return line.replace(/^((?:And )?I(?:['’]m| am) )[^\n]+?(\.(?:\s|$))/, (_match, prefix, suffix) => `${prefix}${name}${suffix}`);
    }
    return line
      .replace(/^(Until next time, )[^\n]+/, (_match, prefix) => `${prefix}I'm ${name}.`)
      .replace(/^(I(?:['’]m| am) ).+?( and this has been InFocus News\.)/, (_match, prefix, suffix) => `${prefix}${name}${suffix}`);
  }).join("\n");
}
