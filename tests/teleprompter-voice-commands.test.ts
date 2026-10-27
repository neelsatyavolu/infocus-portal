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

  it("doesn't take ordinary first words for the wake word", () => {
    for (const text of [
      "Promptly go to the top",
      "Tell a story, go to the top",
      "Telephone go to the top",
      "Telepathy go back",
      "Computer go to the top",
      "Prompt the crew to go back",
      "Temperature go to the top"
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
});
