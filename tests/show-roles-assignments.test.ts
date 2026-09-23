import { describe, expect, it } from "vitest";
import { generateAssignments, getRecencyByMember, getRecentAssigneesByFilmingDate, manualCandidates, repickRole } from "@/src/show-roles/lib/assignments";
import { ROLES } from "@/src/show-roles/lib/constants";

const members = ["Abby", "Otto", "Sage", "Kira", "Iris", "Lena", "Alma", "Toby", "Lucas", "Russ"];
const exempt = ["Lucas", "Russ"];

describe("show roles history recency", () => {
  const show = (date: string, name: string) => ({
    date, assignments: { [ROLES[0]]: name }, anchors: [], confirmed: {}
  });
  const history = { shows: [
    show("2026-09-18", "Iris"),
    show("2026-09-04", "Abby"),
    show("2026-09-11", "Sage"),
    show("2026-09-09", "Otto"),
    show("2026-09-16", "Kira")
  ] };

  it("counts prior saved shows relative to the selected date, ignoring later assignments", () => {
    const recency = getRecencyByMember(history, "2026-09-16", members);
    expect(recency.Abby).toBe(3);
    expect(recency.Otto).toBe(2);
    expect(recency.Sage).toBe(1);
    expect(recency.Kira).toBeGreaterThan(3);
    expect(recency.Iris).toBeGreaterThan(3);
    expect(recency.Lena).toBeGreaterThan(3);
    expect(history.shows[0].date).toBe("2026-09-18");
  });

  it("uses the two shows before the viewed date for cooldown", () => {
    expect([...getRecentAssigneesByFilmingDate(history, "2026-09-16", "2026-09-16")].sort())
      .toEqual(["Otto", "Sage"]);
    expect(getRecentAssigneesByFilmingDate(history, "2026-09-04", "2026-09-04").size).toBe(0);
  });

  it("counts anchors and associate show managers toward recency and cooldown", () => {
    const history = { shows: [
      { ...show("2026-09-04", "Abby"), anchors: ["Otto"] },
      { ...show("2026-09-09", "Sage"), associateShowManager: "Kira" }
    ] };
    const recency = getRecencyByMember(history, "2026-09-11", members);
    expect(recency.Otto).toBe(2);
    expect(recency.Kira).toBe(1);
    expect([...getRecentAssigneesByFilmingDate(history, "2026-09-11")].sort())
      .toEqual(["Abby", "Kira", "Otto", "Sage"]);
  });

  it("does not repick recent anchors or associate show managers", () => {
    const history = { shows: [{ ...show("2026-09-09", "Abby"), anchors: ["Otto"], associateShowManager: "Sage" }] };
    expect(repickRole({ history, dateStr: "2026-09-11", role: ROLES[0], anchors: [],
      assignments: { [ROLES[0]]: "Kira" }, members: ["Kira", "Otto", "Sage"], exempt: [] }))
      .toBeNull();
  });
});

describe("show roles assignment roster", () => {
  it("never auto-assigns EPs or advisers, but still lists them for manual pick", () => {
    const assignments = generateAssignments({
      history: { shows: [] },
      dateStr: "2026-09-09",
      anchors: [],
      members,
      exempt
    });

    const assigned = Object.values(assignments).filter(Boolean);
    expect(assigned.length).toBeGreaterThanOrEqual(ROLES.length);
    expect(assigned).not.toContain("Lucas");
    expect(assigned).not.toContain("Russ");

    const manual = manualCandidates([], "", members);
    expect(manual).toContain("Lucas");
    expect(manual).toContain("Russ");
    expect(manual).toContain("Abby");
  });

  it("does not repick an EP or adviser into a role", () => {
    const assignments = {
      "Show Director": "Abby",
      "Graphics Director": "Otto",
      "Tech Director": "Sage",
      Teleprompter: "Kira",
      "Floor Director": "Iris"
    };
    const replacement = repickRole({
      history: { shows: [] },
      dateStr: "2026-09-09",
      role: "Show Director",
      anchors: [],
      assignments,
      members,
      exempt
    });

    expect(replacement).not.toBe("Lucas");
    expect(replacement).not.toBe("Russ");
    expect(replacement).not.toBe("Abby");
    expect(members).toContain(replacement);
  });
});
