import { z } from "zod";
import { normalizeEmail } from "@/src/lib/platform-admin";

const emailSchema = z.string().email();

export type ParsedAccountInvite = {
  email: string;
  name: string | null;
};

function parseNamedEmailEntry(rawEntry: string, fallbackName?: string | null): ParsedAccountInvite {
  const entry = rawEntry.trim();
  if (!entry) {
    throw new Error("BAD_REQUEST");
  }

  const namedMatch = entry.match(/^(.+?)\s*-\s*\((.+)\)$/);
  const email = normalizeEmail(namedMatch ? namedMatch[1] : entry);
  const nameFromSyntax = namedMatch ? namedMatch[2].trim() : "";
  const name = (nameFromSyntax || fallbackName?.trim() || "").slice(0, 120) || null;

  if (!emailSchema.safeParse(email).success) {
    throw new Error("BAD_REQUEST");
  }

  return { email, name };
}

function splitInviteEntries(rawValue: string) {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return [];
  }

  if (trimmed.includes(",")) {
    return trimmed.split(",").map((part) => part.trim()).filter(Boolean);
  }

  if (/-\s*\(/.test(trimmed)) {
    return [trimmed];
  }

  const tokens = trimmed.split(/\s+/g).filter(Boolean);
  if (tokens.length > 1 && tokens.every((token) => token.includes("@"))) {
    return tokens;
  }

  return [trimmed];
}

/** Parse Admin add-person input. Name is a separate field; `email-(Name)` still works. */
export function parseAccountInviteInput(rawEmail: string, fallbackName?: string | null) {
  const entries = splitInviteEntries(rawEmail);
  if (entries.length === 0) {
    throw new Error("BAD_REQUEST");
  }

  const deduped = new Map<string, ParsedAccountInvite>();
  for (const entry of entries) {
    const parsed = parseNamedEmailEntry(entry, fallbackName);
    deduped.set(parsed.email, parsed);
  }

  return [...deduped.values()];
}
