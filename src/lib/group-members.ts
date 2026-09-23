const MENTION_PATTERN = /@\[([^\]\n]+)\]\(([A-Za-z0-9_-]+)\)/g;

export type GroupMemberToken =
  | { kind: "user"; userId: string; firstName: string }
  | { kind: "text"; value: string };

export function parseGroupMembers(raw: string): GroupMemberToken[] {
  if (!raw) return [];
  const tokens: GroupMemberToken[] = [];
  let cursor = 0;
  for (const match of raw.matchAll(MENTION_PATTERN)) {
    const start = match.index ?? 0;
    if (start > cursor) {
      tokens.push({ kind: "text", value: raw.slice(cursor, start) });
    }
    tokens.push({ kind: "user", firstName: match[1], userId: match[2] });
    cursor = start + match[0].length;
  }
  if (cursor < raw.length) {
    tokens.push({ kind: "text", value: raw.slice(cursor) });
  }
  return tokens;
}

export function serializeGroupMembers(tokens: GroupMemberToken[]): string {
  return tokens
    .map((token) =>
      token.kind === "user" ? `@[${token.firstName}](${token.userId})` : token.value
    )
    .join("");
}

export function extractMentionUserIds(raw: string): string[] {
  if (!raw) return [];
  const ids: string[] = [];
  for (const match of raw.matchAll(MENTION_PATTERN)) {
    ids.push(match[2]);
  }
  return ids;
}

export function formatGroupMembersForDisplay(raw: string): string {
  if (!raw) return "";
  return raw.replace(MENTION_PATTERN, "$1");
}

export function splitGroupMemberNames(groupMembers: string): string[] {
  return groupMembers
    .split(/[,;/\n]+/)
    .map((member) => member.trim().toLowerCase())
    .filter(Boolean);
}

export function groupMembersIncludeUserName(
  groupMembers: string,
  candidates: Set<string>
): boolean {
  if (!groupMembers.trim() || candidates.size === 0) return false;
  const plain = formatGroupMembersForDisplay(groupMembers);
  const members = splitGroupMemberNames(plain);
  if (members.length === 0) return false;
  for (const member of members) {
    for (const candidate of candidates) {
      if (member === candidate) return true;
      const memberTokens = member.split(/\s+/).filter(Boolean);
      const candidateTokens = candidate.split(/\s+/).filter(Boolean);
      if (memberTokens.length >= 2 && candidateTokens.length >= 2) {
        const memberLast = memberTokens[memberTokens.length - 1];
        const candidateLast = candidateTokens[candidateTokens.length - 1];
        const firstMatches = memberTokens[0] === candidateTokens[0];
        const lastMatches =
          memberLast.startsWith(candidateLast) || candidateLast.startsWith(memberLast);
        if (firstMatches && lastMatches) {
          return true;
        }
      }
      if (
        (memberTokens.length === 1 || candidateTokens.length === 1) &&
        memberTokens[0] &&
        candidateTokens[0] &&
        memberTokens[0] === candidateTokens[0]
      ) {
        return true;
      }
    }
  }
  return false;
}

export function buildUserNameCandidates(
  name: string | null,
  email: string | null,
  nickname?: string | null
): Set<string> {
  const candidates = new Set<string>();
  if (name?.trim()) {
    candidates.add(name.trim().toLowerCase());
  }
  if (nickname?.trim()) {
    candidates.add(nickname.trim().toLowerCase());
  }
  const emailLocal = email?.split("@")[0]?.trim().toLowerCase();
  if (emailLocal) {
    candidates.add(emailLocal);
  }
  return candidates;
}
