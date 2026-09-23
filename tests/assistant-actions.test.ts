import { describe, expect, it } from "vitest";
import {
  ASSISTANT_LOOKUP_TOOLS,
  ASSISTANT_MUTATION_TOOLS,
  createAssistantActionPreview,
  isClearGradeRequest,
  matchPeople,
  parseCategoryInput,
  parseOptionalDate,
  parseRoleInput,
  verifyAssistantActionToken
} from "@/src/server/assistant-actions";

const people = [
  { id: "1", name: "Ada Lovelace", nickname: "Ada", email: "ada@pausd.us" },
  { id: "2", name: "Lucas Hale", nickname: "Lo", email: "lo@pausd.us" },
  { id: "3", name: "Alex Kim", nickname: "AK", email: "alexk@pausd.us" },
  { id: "4", name: "Alex Lee", nickname: "AL", email: "alexl@pausd.us" }
];

describe("matchPeople", () => {
  it("matches email, nickname, and unique first name", () => {
    expect(matchPeople(people, "ada@pausd.us")).toHaveLength(1);
    expect(matchPeople(people, "Lo")[0]?.id).toBe("2");
    expect(matchPeople(people, "Ada")[0]?.id).toBe("1");
  });

  it("returns multiples when the first name is shared", () => {
    expect(matchPeople(people, "Alex").map((person) => person.id).sort()).toEqual(["3", "4"]);
  });
});

describe("parseRoleInput", () => {
  it("accepts everyday role names", () => {
    expect(parseRoleInput("associate producer")).toBe("ASSOCIATE_PRODUCER");
    expect(parseRoleInput("EP")).toBe("EXECUTIVE_PRODUCER");
    expect(parseRoleInput("adviser")).toBe("ADVISER");
  });
});

describe("parseCategoryInput", () => {
  it("accepts news/feature/commentary", () => {
    expect(parseCategoryInput("news")).toBe("NEWS");
    expect(parseCategoryInput("Feature")).toBe("FEATURE");
  });
});

describe("parseOptionalDate", () => {
  it("requires YYYY-MM-DD", () => {
    expect(parseOptionalDate("2026-09-08")).toBe("2026-09-08");
    expect(parseOptionalDate(null)).toBeNull();
    expect(() => parseOptionalDate("09/08/2026")).toThrow(/YYYY-MM-DD/);
  });
});

describe("assistant lookup vs mutation tools", () => {
  it("exposes groups and grades as lookups, and grade changes as mutations", () => {
    expect(ASSISTANT_LOOKUP_TOOLS.map((tool) => tool.function.name)).toEqual(
      expect.arrayContaining(["list_groups", "list_my_groups", "get_group", "get_grades", "list_packages"])
    );
    expect(ASSISTANT_MUTATION_TOOLS.map((tool) => tool.function.name)).toEqual(
      expect.arrayContaining(["propose_set_grade", "propose_set_portfolio", "propose_publish_grade"])
    );
    expect(ASSISTANT_LOOKUP_TOOLS.some((tool) => tool.function.name.startsWith("propose_"))).toBe(false);
  });
});

describe("assistant action tokens", () => {
  it("round-trips for the same actor and rejects another", () => {
    process.env.APP_AUTH_SECRET = process.env.APP_AUTH_SECRET || "test-assistant-secret-key";
    const preview = createAssistantActionPreview(
      "user_admin",
      "add_person",
      { name: "Ada", email: "ada@pausd.us", sendInvite: true },
      "Add person",
      [{ label: "Name", value: "Ada" }]
    );
    const verified = verifyAssistantActionToken(preview.token, "user_admin");
    expect(verified.kind).toBe("add_person");
    expect(() => verifyAssistantActionToken(preview.token, "someone-else")).toThrow();
  });

  it("round-trips a grade change", () => {
    process.env.APP_AUTH_SECRET = process.env.APP_AUTH_SECRET || "test-assistant-secret-key";
    const preview = createAssistantActionPreview(
      "user_admin",
      "set_grade",
      { userId: "stu-1", cycleNumber: 1, points: 42, publish: true },
      "Set package grade",
      [{ label: "Quality", value: "42/50" }]
    );
    const verified = verifyAssistantActionToken(preview.token, "user_admin");
    expect(verified.kind).toBe("set_grade");
    expect(verified.payload).toMatchObject({ userId: "stu-1", cycleNumber: 1, points: 42, publish: true });
  });

  it("round-trips clearing a grade to ungraded", () => {
    process.env.APP_AUTH_SECRET = process.env.APP_AUTH_SECRET || "test-assistant-secret-key";
    const preview = createAssistantActionPreview(
      "user_admin",
      "set_grade",
      { userId: "stu-1", cycleNumber: 1, points: null, ungraded: true },
      "Clear package grade",
      [{ label: "Quality", value: "Ungraded (—)" }]
    );
    const verified = verifyAssistantActionToken(preview.token, "user_admin");
    expect(verified.kind).toBe("set_grade");
    expect(verified.payload).toMatchObject({ userId: "stu-1", cycleNumber: 1, ungraded: true });
  });
});

describe("isClearGradeRequest", () => {
  it("treats ungraded/dash as clear and 0 as a real score", () => {
    expect(isClearGradeRequest({ ungraded: true })).toBe(true);
    expect(isClearGradeRequest({ points: "ungraded" })).toBe(true);
    expect(isClearGradeRequest({ points: "—" })).toBe(true);
    expect(isClearGradeRequest({ points: 0 })).toBe(false);
    expect(isClearGradeRequest({ points: 42 })).toBe(false);
  });
});
