import { describe, expect, it } from "vitest";
import { isBirthdayOn } from "@/src/lib/birthdays";
import {
  BIRTHDAY_BUILD_SECONDS,
  birthdayCardNames,
  birthdayCardState,
  birthdayFirstName,
  birthdayGifFrames,
  birthdaySlackFileName,
  birthdaySlackText
} from "@/src/lib/birthday-slack";

describe("isBirthdayOn", () => {
  it("matches the month and day of the date", () => {
    expect(isBirthdayOn({ month: 11, day: 7 }, "2026-11-07")).toBe(true);
    expect(isBirthdayOn({ month: 11, day: 7 }, "2026-11-06")).toBe(false);
  });

  it("posts a February 29 birthday on February 28 outside leap years", () => {
    expect(isBirthdayOn({ month: 2, day: 29 }, "2027-02-28")).toBe(true);
    expect(isBirthdayOn({ month: 2, day: 29 }, "2028-02-28")).toBe(false);
    expect(isBirthdayOn({ month: 2, day: 29 }, "2028-02-29")).toBe(true);
  });

  it("ignores birthdays that don't exist", () => {
    expect(isBirthdayOn({ month: 4, day: 31 }, "2026-04-30")).toBe(false);
  });
});

describe("birthdayFirstName", () => {
  it("prefers the nickname, then the first word of the name", () => {
    expect(birthdayFirstName({ nickname: " Abs ", name: "Abby Lane", email: "abby@example.edu" })).toBe("Abs");
    expect(birthdayFirstName({ nickname: null, name: "Abby Lane", email: "abby@example.edu" })).toBe("Abby");
  });

  it("falls back to the email's name part", () => {
    expect(birthdayFirstName({ nickname: null, name: null, email: "otto@example.edu" })).toBe("otto");
  });
});

describe("birthdayCardNames", () => {
  it("joins names with an ampersand before the last", () => {
    expect(birthdayCardNames(["Abby"])).toBe("Abby");
    expect(birthdayCardNames(["Abby", "Otto"])).toBe("Abby & Otto");
    expect(birthdayCardNames(["Abby", "Otto", "Sage"])).toBe("Abby, Otto & Sage");
  });
});

describe("birthdaySlackText", () => {
  it("tags people Slack knows and names the rest", () => {
    expect(birthdaySlackText([{ name: "Abby", slackUserId: "U01ABC" }])).toBe(
      "🎂 Happy birthday, <@U01ABC>! Hope it's a great one."
    );
    expect(
      birthdaySlackText([
        { name: "Abby", slackUserId: "U01ABC" },
        { name: "Otto", slackUserId: null },
        { name: "Sage", slackUserId: "U02DEF" }
      ])
    ).toBe("🎂 Happy birthday, <@U01ABC>, Otto and <@U02DEF>! Hope it's a great one.");
  });

  it("escapes Slack control characters in names", () => {
    expect(birthdaySlackText([{ name: "A&B <x>", slackUserId: null }])).toBe(
      "🎂 Happy birthday, A&amp;B &lt;x&gt;! Hope it's a great one."
    );
  });
});

describe("birthdaySlackFileName", () => {
  it("is a lowercase slug of the names", () => {
    expect(birthdaySlackFileName(["Abby", "Otto"])).toBe("happy-birthday-abby-otto.gif");
    expect(birthdaySlackFileName(["José"])).toBe("happy-birthday-jose.gif");
    expect(birthdaySlackFileName(["李"])).toBe("happy-birthday.gif");
  });
});

describe("birthdayGifFrames", () => {
  const frames = birthdayGifFrames();
  const finished = birthdayCardState({ phase: "build", t: BIRTHDAY_BUILD_SECONDS });

  it("opens on the finished card, so a still preview shows the name", () => {
    expect(birthdayCardState(frames[0])).toEqual(finished);
    expect(finished).toMatchObject({ content: 1, icon: 0, title: 1, strip: 1, stripText: 1 });
    expect(frames[0].delayMs).toBeGreaterThanOrEqual(2000);
  });

  it("ends one step before the finished card, so the loop has no jump", () => {
    const last = frames[frames.length - 1];
    expect(last.phase).toBe("build");
    expect(BIRTHDAY_BUILD_SECONDS - last.t).toBeCloseTo(0.05, 5);
  });

  it("holds the standby icon between the exit and the build", () => {
    const icon = frames.find((frame) => frame.phase === "exit" && frame.delayMs > 50);
    expect(icon && birthdayCardState(icon)).toMatchObject({ icon: 1, content: 0, iconTurn: 0 });
  });

  it("keeps the loop around eight seconds and under a hundred frames", () => {
    const total = frames.reduce((sum, frame) => sum + frame.delayMs, 0);
    expect(total).toBeGreaterThan(6000);
    expect(total).toBeLessThan(9000);
    expect(frames.length).toBeLessThan(100);
  });
});
