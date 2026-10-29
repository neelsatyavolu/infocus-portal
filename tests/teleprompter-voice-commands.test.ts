import { describe, expect, it } from "vitest";
import { buildScriptWordMap } from "@/src/lib/teleprompter-script-words";
import { parseVoiceCommand, type VoiceContext } from "@/src/lib/teleprompter-voice-commands";
import { templateSections } from "./fixtures/teleprompter-template-sections";

const sections = templateSections();
const map = buildScriptWordMap(sections);
const first = (raw: string) => map.words.findIndex((word) => word.raw === raw);
const context = (cursor = first("Spirit") + 2): VoiceContext => ({ map, sections, cursor });
const say = (text: string, cursor?: number) => parseVoiceCommand(text.split(" "), context(cursor));
const gotoWord = (text: string, cursor?: number) => {
  const result = say(text, cursor);
  return result?.ok && result.action.kind === "goto" ? result.action.word : null;
};

describe("parseVoiceCommand", () => {
  it("goes to the top", () => {
    for (const text of ["Teleprompter, go to the top.", "Hey teleprompter, top of show", "teleprompter go to the beginning", "Teleprompter, top."]) {
      expect(gotoWord(text)).toBe(0);
    }
  });

  it("goes to the top however it's asked", () => {
    for (const text of [
      "Teleprompter, go to the top please.",
      "Teleprompter, back to the top, thank you.",
      "Teleprompter, from the top",
      "Teleprompter, take it from the top",
      "Teleprompter, start over",
      "Teleprompter, restart",
      "Teleprompter, go all the way back up to the top of the script",
      "Teleprompter, go up to the top",
      "Teleprompter, goto top",
      "Teleprompter, take me to the top",
      "Teleprompter, start from the beginning",
      "Promter, go to the top"
    ]) {
      expect(gotoWord(text), text).toBe(0);
    }
    expect(say("Teleprompter, start")).toMatchObject({ ok: true, action: { kind: "resume" } });
    expect(say("Teleprompter, go to the top of the second announcement")).toMatchObject({ ok: false });
  });

  it("drops pleasantries after other commands too", () => {
    expect(gotoWord("Teleprompter, next please")).toBe(first("Robot"));
    expect(say("Teleprompter, pause, thanks")).toMatchObject({ ok: true, action: { kind: "pause" } });
    expect(gotoWord("Teleprompter, go to the closing now")).toBe(first("That"));
  });

  it("waits for the command after the wake word alone", () => {
    expect(say("Teleprompter.")).toMatchObject({ ok: false, waiting: true });
    expect(say("Hey teleprompter, please")).toMatchObject({ ok: false, waiting: true });
    const awake = (text: string) => parseVoiceCommand(text.split(" "), context(), { awake: true });
    expect(awake("Go to the top.")).toMatchObject({ ok: true, action: { kind: "goto", word: 0 } });
    expect(awake("Next.")).toMatchObject({ ok: true, action: { kind: "goto", word: first("Robot") } });
    expect(awake("Teleprompter, go to the top.")).toMatchObject({ ok: true, action: { kind: "goto", word: 0 } });
    expect(awake("Make me a sandwich")).toMatchObject({ ok: false });
    expect(parseVoiceCommand(["Go", "to", "the", "top."], context())).toBeNull();
  });

  it("only counts a cut-off piece of speech from its sentence starts", () => {
    const cut = (text: string) => parseVoiceCommand(text.split(" "), context(), { afterPause: false });
    expect(cut("Teleprompter, go to the top.")).toBeNull();
    expect(cut("great day Vikings. Teleprompter, go to the top.")).toMatchObject({ ok: true, action: { word: 0 } });
  });

  it("goes to an announcement by number", () => {
    const stories = map.blocks.filter((block) => block.sectionId === "s2");
    expect(gotoWord("Teleprompter, go to the first announcement.")).toBe(stories[0].firstWordIndex);
    expect(gotoWord("Teleprompter go to the 2nd announcement")).toBe(stories[1].firstWordIndex);
    expect(gotoWord("Teleprompter, announcement 3")).toBe(stories[2].firstWordIndex);
    expect(gotoWord("Teleprompter, go to the last announcement")).toBe(stories[2].firstWordIndex);
    expect(say("Teleprompter, go to the ninth announcement")).toMatchObject({ ok: false });
  });

  it("goes to a section by label or by name", () => {
    expect(gotoWord("Teleprompter, go to A3")).toBe(first("The"));
    expect(gotoWord("Teleprompter, go to a three")).toBe(first("The"));
    expect(gotoWord("Teleprompter, go to the closing")).toBe(first("That"));
    expect(gotoWord("Teleprompter, go to the announcements")).toBe(first("College"));
    expect(gotoWord("Teleprompter, go to the package")).toBe(first("The"));
    expect(gotoWord("Teleprompter, go to the open")).toBe(0);
  });

  it("goes to a story by what it's about, only with a clear winner", () => {
    expect(gotoWord("Teleprompter, go to spirit week")).toBe(first("Spirit"));
    expect(gotoWord("Teleprompter, go to robotics")).toBe(first("The"));
    expect(say("Teleprompter, go to the cafeteria")).toMatchObject({ ok: false });
  });

  it("moves to the next or previous story", () => {
    expect(gotoWord("Teleprompter, next")).toBe(first("Robot"));
    expect(gotoWord("Teleprompter, next announcement")).toBe(first("Robot"));
    expect(gotoWord("Teleprompter, back")).toBe(first("Spirit"));
    // Already at the start of a story: back goes to the one before.
    expect(gotoWord("Teleprompter, go back", first("Spirit") - 1)).toBe(first("College"));
  });

  it("goes back a line", () => {
    const cursor = first("Ortiz.");
    expect(gotoWord("Teleprompter, line back", cursor)).toBe(first("I'm"));
  });

  it("moves up or down a little", () => {
    const lineStarts = map.words.filter((word, index) => {
      const before = map.words[index - 1];
      return !before || before.sectionIndex !== word.sectionIndex || before.lineIndex !== word.lineIndex;
    });
    const cursor = first("Ortiz.");
    const here = lineStarts.findLastIndex((start) => start.index <= cursor);
    const line = (offset: number) => lineStarts[here + offset].index;
    expect(gotoWord("Teleprompter, go up a little bit", cursor)).toBe(line(-2));
    expect(gotoWord("Teleprompter, back a little", cursor)).toBe(line(-2));
    expect(gotoWord("Teleprompter, a bit higher please", cursor)).toBe(line(-2));
    expect(gotoWord("Teleprompter, go down a little", cursor)).toBe(line(2));
    expect(gotoWord("Teleprompter, down a line", cursor)).toBe(line(1));
    expect(gotoWord("Teleprompter, next line", cursor)).toBe(line(1));
    expect(gotoWord("Teleprompter, up three lines", cursor)).toBe(line(-3));
    expect(gotoWord("Teleprompter, go up a few lines", cursor)).toBe(line(-3));
    expect(gotoWord("Teleprompter, go up", cursor)).toBe(line(-2));
    expect(say("Teleprompter, go up a little bit", cursor)).toMatchObject({ ok: true, label: "Up 2 lines" });
    // Never past the top.
    expect(gotoWord("Teleprompter, up ten lines", 0)).toBe(0);
    // Still the bigger moves.
    expect(gotoWord("Teleprompter, back")).toBe(first("Spirit"));
    expect(gotoWord("Teleprompter, next")).toBe(first("Robot"));
    expect(gotoWord("Teleprompter, go back up to the top", cursor)).toBe(0);
    expect(say("Teleprompter, a little more")).toMatchObject({ ok: false });
  });

  it("pauses, resumes and undoes", () => {
    expect(say("Teleprompter, pause")).toMatchObject({ ok: true, action: { kind: "pause" } });
    expect(say("Teleprompter stop.")).toMatchObject({ ok: true, action: { kind: "pause" } });
    expect(say("Teleprompter, resume")).toMatchObject({ ok: true, action: { kind: "resume" } });
    expect(say("Teleprompter, undo")).toMatchObject({ ok: true, action: { kind: "undo" } });
  });

  it("hears the wake word the way the speech models split and spell it", () => {
    // All heard in testing: macOS voices through Moonshine and Whisper.
    for (const text of ["Tell a Prompture, go to the top", "Telly Promter, go to the top", "Tillypromta, go to the top", "Tullipromter, go to the top", "Terylopromter, go to the top", "Tell a prompter, go to the top"]) {
      expect(gotoWord(text)).toBe(0);
    }
    expect(gotoWord("Prompter, go to the top")).toBe(0);
    expect(gotoWord("Prompture, go to the top")).toBe(0);
    expect(gotoWord("Teleprompter, NEGST")).toBe(first("Robot"));
    expect(say("Teleprompter cause.")).toMatchObject({ ok: true, action: { kind: "pause" } });
    expect(say("Teleprompter, and do.")).toMatchObject({ ok: true, action: { kind: "undo" } });
    expect(gotoWord("Teleprompter, lineback.", first("Ortiz."))).toBe(first("I'm"));
    expect(gotoWord("Teleprompter, go to spirit league.")).toBe(first("Spirit"));
  });

  it("hears the wake word and commands through line-feed static", () => {
    // What Moonshine and Whisper wrote for macOS voices with static and hum mixed in.
    for (const text of [
      "Telecom sure go to the top",
      "Telecompture, go to the top.",
      "Telecom chair, go to the top.",
      "Telekomcha, go to the top.",
      "Telecomster, go to the top.",
      "Telephone sure go to the top",
      "Telefecture, go to the top",
      "Telepromza, go to the top.",
      "Telegramcher go to the top",
      "Hey Teller-Chromter, go to the top.",
      "They tell a computer, go to the top.",
      "Pay teleprompter, go to the top.",
      "Stay teleprompter, go to the top.",
      "Teleprompter, build of the top.",
      "Teleprompter, built at the top.",
      "Prompta, go to the top.",
      "Promper, go to the top."
    ]) {
      expect(gotoWord(text), text).toBe(0);
    }
    for (const text of ["Teleprompter, Max.", "Telecompture next", "Teleprompter, skip this one", "Promter next announcement"]) {
      expect(gotoWord(text), text).toBe(first("Robot"));
    }
    for (const text of ["Telecompture pod", "Teleprompter caused.", "Teleprompter, pause it", "Teleprompter, hold up", "Teleprompter, pausse"]) {
      expect(say(text), text).toMatchObject({ ok: true, action: { kind: "pause" } });
    }
    for (const text of ["Teleprompter review", "Teleprompter. Re-zoom.", "Teleprompter, carry on", "Teleprompter, let's go"]) {
      expect(say(text), text).toMatchObject({ ok: true, action: { kind: "resume" } });
    }
    for (const text of ["Telecomster undie", "Teleprompter, oops", "Teleprompter, not that one"]) {
      expect(say(text), text).toMatchObject({ ok: true, action: { kind: "undo" } });
    }
    expect(gotoWord("Teleprompter, gillback")).toBe(first("Spirit"));
    for (const text of ["Teleprompter, go to a free.", "Teleprompter, door to a3.", "Teleprompter go to a3"]) {
      expect(gotoWord(text), text).toBe(first("The"));
    }
    const stories = map.blocks.filter((block) => block.sectionId === "s2");
    expect(gotoWord("Teleprompter, announcement number two")).toBe(stories[1].firstWordIndex);
    expect(gotoWord("Teleprompter, announcement to")).toBe(stories[1].firstWordIndex);
    expect(gotoWord("Teleprompter, go to the anouncements")).toBe(first("College"));
    const cursor = first("Ortiz.");
    expect(say("Teleprompter, show up a little bit", cursor)).toMatchObject({ ok: true, label: "Up 2 lines" });
  });

  it("hears a command that's said twice over or after a stray word", () => {
    expect(gotoWord("Teleprompter, hey teleprompter, go to the top")).toBe(0);
    expect(gotoWord("You teleprompter go to the top")).toBe(0);
    expect(gotoWord("Uh, okay, teleprompter, next")).toBe(first("Robot"));
  });

  it("hears a command mid-utterance without a full stop, but never a mention", () => {
    expect(gotoWord("have a great day Vikings teleprompter go to the top")).toBe(0);
    expect(gotoWord("thanks for watching telecom sure next")).toBe(first("Robot"));
    expect(say("we have a teleprompter go to the top")).toBeNull();
    expect(say("so the teleprompter go to the top")).toBeNull();
    expect(say("I think our teleprompter go to the top")).toBeNull();
    // Mid-utterance, only a command it understood: not a "didn't understand".
    expect(say("I talked to teleprompter people yesterday")).toBeNull();
    expect(say("great day Vikings teleprompter make me a sandwich")).toBeNull();
  });

  it("waits for the rest of a command cut off by a pause", () => {
    const cut = say("Teleprompter, go to");
    expect(cut).toMatchObject({ ok: false, waiting: true, pending: ["Teleprompter,", "go", "to"] });
    const pending = cut && "waiting" in cut ? cut.pending : [];
    const rest = parseVoiceCommand([...pending, "the", "second", "announcement."], context(), { awake: true });
    const stories = map.blocks.filter((block) => block.sectionId === "s2");
    expect(rest).toMatchObject({ ok: true, action: { kind: "goto", word: stories[1].firstWordIndex } });
    expect(say("Teleprompter.")).toMatchObject({ waiting: true, pending: ["Teleprompter."] });
    // The command after an earlier sentence in the same pending words still wins.
    const late = parseVoiceCommand(["Vikings.", "Teleprompter", "go", "to", "the", "top"], context(), { awake: true });
    expect(late).toMatchObject({ ok: true, action: { word: 0 } });
  });

  it("doesn't take ordinary first words for the wake word", () => {
    for (const text of [
      "Promptly go to the top",
      "Tell a story, go to the top",
      "Telephone go to the top",
      "Telepathy go back",
      "Computer go to the top",
      "Prompt the crew to go back",
      "Temperature go to the top",
      "Telegram go to the top",
      "Telecom go to the top",
      "Telescope go to the top",
      "Telemetry go to the top",
      "Tell the story, go to the top",
      "Telling everyone to go to the top"
    ]) {
      expect(say(text)).toBeNull();
    }
  });

  it("hears a command that starts a new sentence right after the anchor", () => {
    expect(gotoWord("Have a great day Vikings. Teleprompter, go to the top.")).toBe(0);
    expect(gotoWord("Thanks everyone! Teleprompter next")).toBe(first("Robot"));
  });

  it("ignores anything that doesn't start with the wake word", () => {
    expect(say("Go to the top")).toBeNull();
    expect(say("The teleprompter is slow today, go to the top")).toBeNull();
    expect(say("Okay so the teleprompter, go to the top")).toBeNull();
    expect(say("Spirit Week starts Monday with pajama day.")).toBeNull();
  });

  it("says when it heard the wake word but not a command", () => {
    expect(say("Teleprompter, make me a sandwich please")).toEqual({ ok: false, heard: "Teleprompter, make me a sandwich please" });
    expect(say("Teleprompter")).toMatchObject({ ok: false });
  });

  it("ignores the wake word while the script itself mentions prompter", () => {
    const scripted = buildScriptWordMap([
      { id: "a", label: "A1", content: "CAM 1\nWe have a new teleprompter this year.\nTeleprompter, go to the top is how the crew moves it." }
    ]);
    expect(parseVoiceCommand(["Teleprompter,", "go", "to", "the", "top"], { map: scripted, sections: [], cursor: 3 })).toBeNull();
    expect(scripted.words.some((word) => word.mentionsWakeWord)).toBe(true);
  });

  it("ignores a command the anchor is reading from the script", () => {
    const scripted = buildScriptWordMap([
      { id: "a", label: "A1", content: "CAM 1\nIn coding club, students can tell a computer go to the top of a list.\nThat's all." }
    ]);
    const ctx = { map: scripted, sections: [], cursor: 4 };
    expect(parseVoiceCommand("students can tell a computer go to the top of a list".split(" "), ctx)).toBeNull();
    expect(parseVoiceCommand("Tell a computer, go to the top".split(" "), ctx)).toBeNull();
    // Away from that line it's a command again.
    expect(gotoWord("Tell a computer, go to the top")).toBe(0);
  });
});
