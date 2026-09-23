import { describe, expect, it } from "vitest";
import { parseStudentId } from "@/src/lib/equipment-students";

describe("parseStudentId", () => {
  it("parses a PAUSD email into a 950-prefixed student ID", () => {
    expect(parseStudentId("ab12345@pausd.us")).toBe("95012345");
  });

  it("is case insensitive", () => {
    expect(parseStudentId("AB12345@PAUSD.US")).toBe("95012345");
  });

  it("returns null when the local part has no digits", () => {
    expect(parseStudentId("student@pausd.us")).toBeNull();
  });

  it("returns null for a non-pausd.us address", () => {
    expect(parseStudentId("ab12345@gmail.com")).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(parseStudentId("")).toBeNull();
  });
});
