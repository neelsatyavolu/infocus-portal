import { describe, expect, it } from "vitest";
import { ScriptFollower, alignTail } from "@/src/lib/teleprompter-align";
import { buildScriptWordMap } from "@/src/lib/teleprompter-script-words";
import { templateSections } from "./fixtures/teleprompter-template-sections";

const map = buildScriptWordMap(templateSections());

function wordIndexOf(raw: string, from = 0) {
  const index = map.words.findIndex((word, position) => position >= from && word.raw === raw);
  if (index === -1) throw new Error(`no script word "${raw}"`);
  return index;
}

function rawWords(first: number, last: number) {
  return map.words.slice(first, last + 1).map((word) => word.raw);
}

/** Reads script words [first, last] aloud, three at a time, one chunk a second. */
function read(follower: ScriptFollower, first: number, last: number, start: number) {
  let now = start;
  const trace: number[] = [];
  for (let index = first; index <= last; index += 3) {
    follower.hear(rawWords(index, Math.min(last, index + 2)), true, now);
    trace.push(follower.cursor);
    now += 1000;
  }
  return { now, trace };
}

describe("alignTail", () => {
  it("finds where a run of heard words ends in the script", () => {
    const script = ["good", "morning", "paly", "today", "is", "friday"];
    const match = alignTail(["morning", "paly", "today"], script, script.map(() => 1), 0, script.length);
    expect(match).toMatchObject({ end: 3, matches: 3, ratio: 1 });
  });

  it("allows a misheard word in the middle", () => {
    const script = ["the", "robotics", "team", "built", "a", "robot"];
    const match = alignTail(["robotics", "green", "built", "a"], script, script.map(() => 1), 0, script.length);
    expect(match?.end).toBe(4);
    expect(match?.matches).toBe(3);
  });

  it("ignores matches that don't end in the newest words", () => {
    const script = ["good", "morning", "paly"];
    expect(alignTail(["good", "morning", "uh", "so", "anyway", "yeah"], script, [1, 1, 1], 0, 3)).toBeNull();
  });
});

describe("ScriptFollower", () => {
  const closingStart = wordIndexOf("That");

  it("follows the anchor through the open, word for word", () => {
    const follower = new ScriptFollower(map, 0, 0);
    const { trace } = read(follower, 0, wordIndexOf("BANTER") - 1, 0);
    expect(trace.at(-1)).toBe(wordIndexOf("BANTER") - 1);
    expect(trace).toEqual([...trace].sort((left, right) => left - right));
  });

  it("keeps up when a few words are misheard", () => {
    const follower = new ScriptFollower(map, closingStart, 0);
    const last = closingStart + 30;
    let now = 0;
    for (let index = closingStart; index <= last; index += 3) {
      const words = rawWords(index, Math.min(last, index + 2));
      if (index % 2 === 0) words[1] = "mumble";
      follower.hear(words, true, now);
      now += 1000;
    }
    expect(follower.cursor).toBeGreaterThanOrEqual(last - 2);
  });

  it("holds still through banter, then searches", () => {
    const follower = new ScriptFollower(map, 0, 0);
    const { now } = read(follower, 0, wordIndexOf("BANTER") - 1, 0);
    const cursor = follower.cursor;
    const target = follower.target;
    follower.hear(["so", "did", "anybody", "watch", "the", "game"], true, now);
    follower.hear(["yeah", "it", "was", "crazy", "last", "night"], true, now + 2000);
    expect(follower.cursor).toBe(cursor);
    expect(follower.target).toBe(target);
    expect(follower.mode(now + 1000)).toBe("follow");
    expect(follower.mode(now + 3000)).toBe("hold");
    expect(follower.mode(now + 7000)).toBe("search");
  });

  it("re-acquires after banter as soon as the anchor reads the next story", () => {
    const follower = new ScriptFollower(map, 0, 0);
    const { now } = read(follower, 0, wordIndexOf("BANTER") - 1, 0);
    const college = wordIndexOf("College");
    follower.hear(rawWords(college, college + 2), true, now + 8000);
    expect(follower.cursor).toBe(college + 2);
    expect(follower.mode(now + 8000)).toBe("follow");
  });

  it("waits out a package: thank-yous in the package can't drag it to the closing", () => {
    const toss = wordIndexOf("The", wordIndexOf("library."));
    const follower = new ScriptFollower(map, toss, 0);
    const { now } = read(follower, toss, wordIndexOf("recycling."), 0);
    expect(follower.mode(now)).toBe("package");
    const held = follower.target;
    follower.hear(["thank", "you", "so", "much", "for", "having", "us"], true, now + 1000);
    follower.hear(["that", "does", "it", "thank", "you"], true, now + 9000);
    expect(follower.mode(now + 9000)).toBe("package");
    expect(follower.target).toBe(held);
    follower.hear(rawWords(closingStart, closingStart + 5), true, now + 30000);
    expect(follower.cursor).toBe(closingStart + 5);
    expect(follower.mode(now + 30000)).toBe("follow");
  });

  it("gets out of package mode when the next story was cut and a later one is read", () => {
    const toss = wordIndexOf("The", wordIndexOf("library."));
    const follower = new ScriptFollower(map, toss, 0);
    const { now } = read(follower, toss, wordIndexOf("recycling."), 0);
    const later = closingStart + 32;
    follower.hear(rawWords(later, later + 7), true, now + 5000);
    expect(follower.mode(now + 5000)).toBe("package");
    follower.hear(rawWords(later + 8, later + 15), true, now + 20000);
    expect(follower.cursor).toBe(later + 15);
    expect(follower.mode(now + 20000)).toBe("follow");
  });

  it("finishes an announcement before moving to the next one", () => {
    const college = wordIndexOf("College");
    const spirit = wordIndexOf("Spirit");
    const follower = new ScriptFollower(map, college, 0);
    // Steady reading builds up a lead, which must stop at the announcement's last word.
    const { now } = read(follower, college, spirit - 3, 0);
    expect(follower.target).toBeLessThanOrEqual(spirit - 1);
    follower.hear(rawWords(spirit - 2, spirit - 1), true, now);
    expect(follower.target).toBe(spirit);
  });

  it("stops at the end of the toss instead of leading into the next story", () => {
    const toss = wordIndexOf("The", wordIndexOf("library."));
    const follower = new ScriptFollower(map, toss, 0);
    read(follower, toss, wordIndexOf("recycling."), 0);
    expect(follower.target).toBe(wordIndexOf("recycling."));
  });

  it("never moves back on a few words from earlier, but does for a re-read line", () => {
    const follower = new ScriptFollower(map, closingStart, 0);
    const { now } = read(follower, closingStart, closingStart + 20, 0);
    const cursor = follower.cursor;
    follower.hear(rawWords(closingStart + 2, closingStart + 4), true, now);
    expect(follower.cursor).toBe(cursor);
    follower.hear(rawWords(closingStart + 10, closingStart + 17), true, now + 1000);
    expect(follower.cursor).toBe(closingStart + 17);
  });

  it("doesn't jump far ahead on a skipped story until it has searched", () => {
    const follower = new ScriptFollower(map, 0, 0);
    const { now } = read(follower, 0, 5, 0);
    const far = map.words.length - 10;
    expect(map.words.slice(6, far).flatMap((word) => word.tokens).length).toBeGreaterThan(60);
    follower.hear(rawWords(far, far + 2), true, now);
    expect(follower.cursor).toBe(5);
    follower.hear(rawWords(far + 3, far + 9), true, now + 7000);
    expect(follower.cursor).toBe(far + 9);
  });

  it("lets unconfirmed words lead the screen a little without moving the cursor", () => {
    const follower = new ScriptFollower(map, closingStart, 0);
    read(follower, closingStart, closingStart + 8, 0);
    const cursor = follower.cursor;
    follower.hear(rawWords(closingStart + 6, closingStart + 20), false, 3500);
    expect(follower.cursor).toBe(cursor);
    expect(follower.target).toBeGreaterThan(cursor + 1);
    expect(follower.target).toBeLessThanOrEqual(cursor + 1 + 6 + 4);
  });

  it("never moves the target back as the lead fades", () => {
    const follower = new ScriptFollower(map, closingStart, 0);
    const { now } = read(follower, closingStart, closingStart + 20, 0);
    const target = follower.target;
    follower.hear(["um"], true, now + 4000);
    follower.hear(["okay"], false, now + 4500);
    expect(follower.target).toBeGreaterThanOrEqual(target);
  });

  it("re-anchors where the operator puts it", () => {
    const follower = new ScriptFollower(map, closingStart + 20, 0);
    follower.anchor(5, 1000);
    expect(follower.cursor).toBe(4);
    expect(follower.target).toBe(5);
    expect(follower.mode(1000)).toBe("follow");
  });

  it("searches ahead of where it was, not back at an earlier copy of the same line", () => {
    const filler = (word: string, length: number) => Array.from({ length }, (_, index) => `${word}${index}`).join(" ");
    const line = "thanks so much for watching everyone and see you tomorrow";
    const repeated = buildScriptWordMap([
      { id: "a", label: "A1", content: `CAM 1\n${line}\n${filler("alpha", 40)}` },
      { id: "b", label: "A2", content: `CAM 1\n${filler("bravo", 80)}\n${line}` }
    ]);
    const second = repeated.words.findIndex((word, index) => index > 50 && word.raw === "thanks");
    expect(second - 45).toBeGreaterThan(60);
    const follower = new ScriptFollower(repeated, 45, 0);
    follower.hear(["so", "anyway", "what", "a", "game"], true, 1000);
    follower.hear(line.split(" "), true, 9000);
    expect(follower.cursor).toBe(second + 9);
  });
});
