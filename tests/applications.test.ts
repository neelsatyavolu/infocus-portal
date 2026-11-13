import { describe, expect, it } from "vitest";
import { cleanAnswers, countWords, EMPTY_ANSWERS, formatTimestamp, parseTimestamp, validateForSubmit, type ApplicationAnswers } from "@/src/lib/applications/answers";
import { applicantConfig, DEFAULT_APPLICATION_CONFIG, parseApplicationConfig } from "@/src/lib/applications/config";
import { applicationsHostPath, resolveAppSurface } from "@/src/lib/hosts";
import { normalizePicks, ordinal, picksProblems, tallyPicks, relativeStandings, tallyVotes, windowState } from "@/src/lib/applications/desk";

const config = applicantConfig(DEFAULT_APPLICATION_CONFIG);
const words = (n: number) => Array.from({ length: n }, () => "word").join(" ");

function complete(): ApplicationAnswers {
  return {
    ...EMPTY_ANSWERS,
    grade: "11",
    years: "2",
    currentRole: "Reporter",
    pastRoles: ["Reporter"],
    enrollingNextYear: "yes",
    commitments: "Soccer",
    hours: "5–10",
    skills: ["Camera"],
    answer1: words(100),
    answer2: words(120),
    cutNotes: [1, 2, 3].map((n) => ({ id: `n${n}`, t: n * 10, category: "Audio", text: "Fix the levels" })),
    cutSummary: words(80),
    airDecision: "Air after fixes",
    airReason: "The story works but the audio needs fixing."
  };
}

describe("applicant answers", () => {
  it("counts words in plain text and strips HTML", () => {
    expect(countWords("  one two\nthree  ")).toBe(3);
    expect(countWords("<b>bold</b> move")).toBe(2);
    expect(cleanAnswers({ ...EMPTY_ANSWERS, answer1: "<script>x</script>hi  \r\nthere" }).answer1).toBe("xhi\nthere");
  });

  it("accepts a complete application", () => {
    expect(validateForSubmit(complete(), config, true)).toEqual([]);
  });

  it("enforces word, note and attestation limits on the server rule", () => {
    const problems = validateForSubmit(
      { ...complete(), answer1: words(151), cutNotes: complete().cutNotes.slice(0, 2), airReason: words(41) },
      config,
      false
    );
    const fields = problems.map((problem) => problem.field);
    expect(fields).toEqual(expect.arrayContaining(["answer1", "cutNotes", "airReason", "attested"]));
  });

  it("rejects notes over the character limit and unknown categories", () => {
    const notes = complete().cutNotes.map((note, i) => (i === 0 ? { ...note, text: "x".repeat(301) } : i === 1 ? { ...note, category: "Nope" } : note));
    expect(validateForSubmit({ ...complete(), cutNotes: notes }, config, true)).toHaveLength(2);
  });

  it("formats and parses timestamps", () => {
    expect(formatTimestamp(65.9)).toBe("1:05");
    expect(formatTimestamp(3725)).toBe("1:02:05");
    expect(parseTimestamp("1:05")).toBe(65);
    expect(parseTimestamp("abc")).toBeNull();
  });
});

describe("config", () => {
  it("never gives applicants the answer key or rubric", () => {
    const withKey = { ...DEFAULT_APPLICATION_CONFIG, roughCut: { ...DEFAULT_APPLICATION_CONFIG.roughCut, answerKey: "secret" } };
    const json = JSON.stringify(applicantConfig(withKey));
    expect(json).not.toContain("secret");
    expect(json).not.toContain("rubric");
    expect(json).not.toContain("accepted_ep");
  });

  it("repairs a partial stored config from defaults", () => {
    const parsed = parseApplicationConfig({ roles: ["Executive Producer"], roughCut: { context: "2:40 feature" } });
    expect(parsed.roles).toEqual(["Executive Producer"]);
    expect(parsed.roughCut.context).toBe("2:40 feature");
    expect(parsed.roughCut.minNotes).toBe(3);
    expect(parseApplicationConfig("junk")).toEqual(DEFAULT_APPLICATION_CONFIG);
  });
});

describe("decision desk", () => {
  it("needs a majority of all voters", () => {
    expect(tallyVotes(["a", "a"], 4).winner).toBeNull();
    expect(tallyVotes(["a", "a", "a"], 4).winner).toBe("a");
    expect(tallyVotes(["a", "a"], 3).winner).toBe("a");
    expect(tallyVotes(["a", "b"], 3).winner).toBeNull();
  });

  it("keeps picks to the pool, one list per person, within each count", () => {
    const lists = [{ key: "ep", label: "EP", count: 2 }, { key: "ap", label: "AP", count: 3 }];
    const ids = ["a", "b", "c", "d", "e", "f"];
    const picks = normalizePicks({ ep: ["a", "gone", "b", "c"], ap: ["a", "d", "d", "e"] }, ids, lists);
    expect(picks).toEqual({ ep: ["a", "b"], ap: ["d", "e"] });
    expect(picksProblems(picks, lists, ids.length)).toEqual(["Pick 3 for AP (you have 2)."]);
    expect(picksProblems({ ep: ["a"], ap: [] }, lists, 1)).toEqual([]);
    expect(tallyPicks([picks, { ep: ["a"], ap: ["b"] }], ["a", "b"], ["ep", "ap"]).get("a")).toEqual({ ep: 2, ap: 0 });
  });

  it("places AI totals relative to the pool, ties sharing a place", () => {
    const standings = relativeStandings(
      [
        { id: "a", scores: { v: { score: 5, reason: "" }, o: { score: 3, reason: "" } } },
        { id: "b", scores: { v: { score: 4, reason: "" }, o: { score: 4, reason: "" } } },
        { id: "c", scores: { v: { score: 2, reason: "" }, o: { score: 2, reason: "" } } }
      ],
      ["v", "o"]
    );
    expect(standings.get("a")).toMatchObject({ total: 8, place: 1, of: 3 });
    expect(standings.get("b")?.place).toBe(1);
    expect(standings.get("c")?.place).toBe(3);
    expect(standings.get("b")?.criteria.v.place).toBe(2);
    expect(ordinal(1)).toBe("1st");
    expect(ordinal(12)).toBe("12th");
    expect(ordinal(23)).toBe("23rd");
  });

  it("closes the window at the deadline unless extended", () => {
    const dueAt = new Date("2027-03-01T07:59:00Z");
    const after = new Date("2027-03-01T08:00:00Z");
    expect(windowState({ status: "PUBLISHED", opensAt: null, dueAt }, after).canEdit).toBe(false);
    expect(windowState({ status: "PUBLISHED", opensAt: null, dueAt, extensionUntil: new Date("2027-03-02T08:00:00Z") }, after).canEdit).toBe(true);
    expect(windowState({ status: "DRAFT", opensAt: null, dueAt }, new Date("2027-01-01")).canEdit).toBe(false);
    expect(windowState({ status: "CLOSED", opensAt: null, dueAt, extensionUntil: new Date("2027-03-02T08:00:00Z") }, after).canEdit).toBe(true);
    expect(windowState({ status: "CLOSED", opensAt: null, dueAt }, new Date("2027-02-01")).canEdit).toBe(false);
    expect(windowState({ status: "PUBLISHED", opensAt: new Date("2027-02-01"), dueAt }, new Date("2027-01-01")).opened).toBe(false);
  });
});

describe("applications host", () => {
  it("resolves the surface and maps pages under /applications", () => {
    expect(resolveAppSurface("applications.infocuspaly.com")).toBe("applications");
    expect(applicationsHostPath("/")).toBe("/applications");
    expect(applicationsHostPath("/manage")).toBe("/applications/manage");
    expect(applicationsHostPath("/applications/abc")).toBe("/applications/abc");
    expect(applicationsHostPath("/api/applications/rounds")).toBeNull();
    expect(applicationsHostPath("/sign-in")).toBeNull();
    expect(applicationsHostPath("/robots.txt")).toBeNull();
  });
});

describe("Pacific date inputs", () => {
  it("round-trips the deadline in winter and summer", async () => {
    const { pacificInputToIso, toPacificInput } = await import("@/src/lib/applications/format");
    expect(pacificInputToIso("2027-02-28T23:59")).toBe("2027-03-01T07:59:00.000Z");
    expect(pacificInputToIso("2027-03-24T20:00")).toBe("2027-03-25T03:00:00.000Z");
    expect(toPacificInput("2027-03-01T07:59:00.000Z")).toBe("2027-02-28T23:59");
  });
});
