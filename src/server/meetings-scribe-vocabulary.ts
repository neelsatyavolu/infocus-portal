import { prisma } from "@/src/lib/prisma";
import { producerUserIds } from "@/src/server/meetings-people";

/**
 * Names the Scribe's transcriber should expect (sent with every start; the Drive turns them into
 * whisper hotwords). Every Portal user's nickname and full name, producers first: the Drive keeps
 * only about 900 characters, so if the list ever grows past that, class members are cut first.
 */
export const MAX_SCRIBE_VOCABULARY = 300;

export async function scribeVocabulary(): Promise<string[]> {
  const [users, producers] = await Promise.all([
    prisma.user.findMany({ select: { id: true, name: true, nickname: true }, orderBy: [{ name: "asc" }] }),
    producerUserIds()
  ]);
  const producerIds = new Set(producers);
  const ordered = [...users.filter((u) => producerIds.has(u.id)), ...users.filter((u) => !producerIds.has(u.id))];
  const seen = new Set<string>();
  const words: string[] = [];
  for (const user of ordered) {
    for (const raw of [user.nickname, user.name]) {
      const word = (raw ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
      if (word && !seen.has(word.toLowerCase())) {
        seen.add(word.toLowerCase());
        words.push(word);
      }
    }
  }
  return words.slice(0, MAX_SCRIBE_VOCABULARY);
}
