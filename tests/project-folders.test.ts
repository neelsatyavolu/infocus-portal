import { describe, expect, it } from "vitest";
import {
  cycleFolderAncestorPaths,
  cycleFolderPath,
  descendantFolderMediaCount,
  folderDisplayName,
  folderParentPath,
  isDirectChildFolder,
  isFinalCutFolderName,
  parseCycleNasFolderPath,
  parseCycleProjectNumber
} from "@/src/lib/project-folders";

describe("project folder paths", () => {
  it("builds cycle folder paths from group + stage", () => {
    expect(cycleFolderPath("Airport Day", "Final Cut")).toBe("Airport Day/Final Cut");
    expect(cycleFolderPath("Lee/Patel", "A-roll B-roll/A-roll")).toBe("Lee-Patel/A-roll B-roll/A-roll");
  });

  it("lists ancestor paths including the leaf", () => {
    expect(cycleFolderAncestorPaths("Airport Day/A-roll B-roll/A-roll")).toEqual([
      "Airport Day",
      "Airport Day/A-roll B-roll",
      "Airport Day/A-roll B-roll/A-roll"
    ]);
  });

  it("parses NAS cycle paths into site folders", () => {
    expect(parseCycleNasFolderPath("Package Storage/Cycle 1/Airport Day/Final Cut/cut.mp4", 1)).toBe(
      "Airport Day/Final Cut"
    );
    expect(parseCycleNasFolderPath("Package Storage/Cycle 1/Lee-Patel/A-roll B-roll-A-roll/open.mp4", 1)).toBe(
      "Lee-Patel/A-roll B-roll/A-roll"
    );
    expect(parseCycleNasFolderPath("Package Cycles/Cycle 1/Final Cut/cut.mp4", 1)).toBeNull();
  });

  it("treats only direct children as the next folder level", () => {
    expect(isDirectChildFolder(null, "Airport Day")).toBe(true);
    expect(isDirectChildFolder(null, "Airport Day/Final Cut")).toBe(false);
    expect(isDirectChildFolder("Airport Day", "Airport Day/Final Cut")).toBe(true);
    expect(isDirectChildFolder("Airport Day", "Airport Day/A-roll B-roll/A-roll")).toBe(false);
  });

  it("counts media in a folder and its descendants", () => {
    expect(
      descendantFolderMediaCount("Airport Day", [
        { name: "Airport Day", activeMediaCount: 0 },
        { name: "Airport Day/Final Cut", activeMediaCount: 2 },
        { name: "Airport Day/Initial Cut", activeMediaCount: 1 },
        { name: "Lee-Patel/Final Cut", activeMediaCount: 4 }
      ])
    ).toBe(3);
  });

  it("reads display names and cycle project numbers", () => {
    expect(folderDisplayName("Airport Day/Final Cut")).toBe("Final Cut");
    expect(folderParentPath("Airport Day/Final Cut")).toBe("Airport Day");
    expect(parseCycleProjectNumber("Cycle 1")).toBe(1);
    expect(parseCycleProjectNumber("Package Cycle 1")).toBeNull();
    expect(isFinalCutFolderName("Airport Day/Final Cut")).toBe(true);
    expect(isFinalCutFolderName("Initial Cut")).toBe(false);
  });
});
