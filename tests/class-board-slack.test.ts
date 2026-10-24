import { describe, expect, it } from "vitest";
import {
  buildClassBoardSlackText,
  buildSlackDirectory,
  classBoardSlackTopLanes,
  findSlackId,
  joinWithAnd,
  slackMention,
  slackNameKey
} from "@/src/lib/class-board-slack";

const directory = buildSlackDirectory([
  { id: "U01ABBY", real_name: "Abby Lee", profile: { email: "abby@example.edu", real_name: "Abby Lee" } },
  { id: "U02OTTO", profile: { email: "otto@example.edu", real_name: "Otto Park" } },
  { id: "U03SAGE", profile: { email: "sage.personal@example.com", real_name: "Sage Núñez", display_name: "Sage" } },
  { id: "U04SAM1", profile: { real_name: "Sam Kim" } },
  { id: "U05SAM2", profile: { real_name: "Sam Kim" } },
  { id: "U06GONE", deleted: true, profile: { email: "gone@example.edu", real_name: "Gone Person" } },
  { id: "U07BOT", is_bot: true, profile: { real_name: "Bot Person" } }
]);

const member = (name: string, email: string | null, fullNames: string[] = []) => ({ name, email, fullNames });

describe("joinWithAnd", () => {
  it("joins one, two and three names", () => {
    expect(joinWithAnd([])).toBe("");
    expect(joinWithAnd(["A"])).toBe("A");
    expect(joinWithAnd(["A", "B"])).toBe("A and B");
    expect(joinWithAnd(["A", "B", "C"])).toBe("A, B and C");
  });
});

describe("slackNameKey", () => {
  it("drops accents, case and extra spaces", () => {
    expect(slackNameKey("  Sage   NÚÑEZ ")).toBe("sage nunez");
  });

  it("gives no key for a single word", () => {
    expect(slackNameKey("Sage")).toBe("");
    expect(slackNameKey(null)).toBe("");
  });
});

describe("findSlackId", () => {
  it("matches the Portal email first, ignoring case", () => {
    expect(findSlackId(member("Abby", " Abby@Example.edu ", ["Someone Else"]), directory)).toBe("U01ABBY");
  });

  it("falls back to a full name when the Slack email differs", () => {
    expect(findSlackId(member("Sage", "sage@school.example.edu", ["Sage Nunez"]), directory)).toBe("U03SAGE");
  });

  it("never guesses a name two Slack accounts share, or a one-word name", () => {
    expect(findSlackId(member("Sam", null, ["Sam Kim"]), directory)).toBeNull();
    expect(findSlackId(member("Sage", null, ["Sage"]), directory)).toBeNull();
  });

  it("skips deactivated accounts and bots", () => {
    expect(findSlackId(member("Gone", "gone@example.edu", ["Gone Person"]), directory)).toBeNull();
    expect(findSlackId(member("Bot", null, ["Bot Person"]), directory)).toBeNull();
  });
});

describe("slackMention", () => {
  it("mentions a found member and escapes the name otherwise", () => {
    expect(slackMention(member("Otto", "otto@example.edu"), directory)).toBe("<@U02OTTO>");
    expect(slackMention(member("Milo <M>", "milo@example.edu"), directory)).toBe("Milo &lt;M&gt;");
  });
});

describe("classBoardSlackTopLanes", () => {
  it("keeps every lane placed third or better, ties included", () => {
    const lanes = [{ place: 1 }, { place: 1 }, { place: 3 }, { place: 3 }, { place: 5 }];
    expect(classBoardSlackTopLanes(lanes)).toHaveLength(4);
  });
});

describe("buildClassBoardSlackText", () => {
  it("lists the top three with medals and mentions, no AP or status", () => {
    const text = buildClassBoardSlackText({
      cycleNumber: 2,
      boardUrl: "https://example.edu/class-board",
      directory,
      lanes: [
        { place: 1, topic: "Parking Lot Crunch", members: [member("Abby", "abby@example.edu"), member("Otto", "otto@example.edu")] },
        { place: 2, topic: "Compost & Cafeteria", members: [member("Sage", null, ["Sage Núñez"]), member("Milo", null), member("Iris", null)] },
        { place: 3, topic: "Robotics", members: [] },
        { place: 4, topic: "Left Out", members: [member("June", null)] }
      ]
    });
    expect(text).toBe(
      [
        "*Class Board · Cycle 2 standings*",
        "🥇 *Parking Lot Crunch* (<@U01ABBY> and <@U02OTTO>)",
        "🥈 *Compost &amp; Cafeteria* (<@U03SAGE>, Milo and Iris)",
        "🥉 *Robotics*",
        "<https://example.edu/class-board|See the full board>"
      ].join("\n")
    );
  });
});
