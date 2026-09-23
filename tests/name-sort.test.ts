import { describe, expect, it } from "vitest";
import { castDisplayNames, sortNamedPeople } from "@/src/lib/name-sort";

const people = [
  { name: "Ada Lovelace", email: "ada@example.com" },
  { name: "Grace Hopper", email: "grace@example.com" },
  { name: "Alan Turing", email: "alan@example.com" },
  { name: null, email: "zara@example.com" }
];

describe("sortNamedPeople", () => {
  it("sorts by last name", () => {
    expect(sortNamedPeople(people, "lastName").map((person) => person.email)).toEqual([
      "grace@example.com",
      "ada@example.com",
      "alan@example.com",
      "zara@example.com"
    ]);
  });

  it("sorts by first name", () => {
    expect(sortNamedPeople(people, "firstName").map((person) => person.email)).toEqual([
      "ada@example.com",
      "alan@example.com",
      "grace@example.com",
      "zara@example.com"
    ]);
  });

  it("sorts by email", () => {
    expect(sortNamedPeople(people, "email").map((person) => person.email)).toEqual([
      "ada@example.com",
      "alan@example.com",
      "grace@example.com",
      "zara@example.com"
    ]);
  });
});

describe("castDisplayNames", () => {
  it("uses first names when they are unique", () => {
    expect(
      castDisplayNames([
        { name: "Abby Chen", email: "abby@pausd.us" },
        { name: "Otto Lowe", email: "otto@pausd.us" }
      ])
    ).toEqual(["Abby", "Otto"]);
  });

  it("uses the full name when two people share a first name", () => {
    expect(
      castDisplayNames([
        { name: "Emma Park", email: "emily.p@pausd.us" },
        { name: "Emma Stone", email: "emily.s@pausd.us" },
        { name: "Iris Example", email: "iris@pausd.us" }
      ])
    ).toEqual(["Emma Park", "Emma Stone", "Iris"]);
  });

  it("prefers a nickname when building first-name labels", () => {
    expect(
      castDisplayNames([
        { name: "Neel Satyavolu", nickname: "Neel", email: "neel@pausd.us" },
        { name: "Lucas Hale", nickname: "Lo", email: "lucas@pausd.us" }
      ])
    ).toEqual(["Neel", "Lo"]);
  });

  it("skips people with no usable name", () => {
    expect(
      castDisplayNames([
        { name: null, email: "nobody@pausd.us" },
        { name: "   ", email: "blank@pausd.us" },
        { name: "Sage", email: "sage@pausd.us" }
      ])
    ).toEqual(["Sage"]);
  });
});
