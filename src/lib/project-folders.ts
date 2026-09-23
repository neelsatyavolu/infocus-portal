export const FOLDER_PATH_SEP = "/";

/** Safe single path segment for the NAS filesystem. */
export function sanitizeSegment(name: string, fallback = "Untitled"): string {
  const cleaned = (name || "")
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .slice(0, 120);
  return cleaned || fallback;
}
const CYCLE_STORAGE_PREFIX = "Package Storage/";
const SMASHED_ROLL_FOLDERS: Record<string, string[]> = {
  "A-roll B-roll-A-roll": ["A-roll B-roll", "A-roll"],
  "A-roll B-roll-B-roll": ["A-roll B-roll", "B-roll"]
};

export function folderPathSegments(name: string): string[] {
  return name
    .split(FOLDER_PATH_SEP)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function folderDisplayName(name: string): string {
  const segments = folderPathSegments(name);
  return segments[segments.length - 1] ?? name;
}

export function folderParentPath(name: string): string | null {
  const segments = folderPathSegments(name);
  if (segments.length <= 1) {
    return null;
  }
  return segments.slice(0, -1).join(FOLDER_PATH_SEP);
}

export function isDirectChildFolder(parentName: string | null, folderName: string): boolean {
  const parent = parentName?.trim() || null;
  if (!parent) {
    return folderPathSegments(folderName).length === 1;
  }
  const prefix = `${parent}${FOLDER_PATH_SEP}`;
  if (!folderName.startsWith(prefix)) {
    return false;
  }
  return folderPathSegments(folderName.slice(prefix.length)).length === 1;
}

export function isFolderOrDescendant(parentName: string, folderName: string): boolean {
  return folderName === parentName || folderName.startsWith(`${parentName}${FOLDER_PATH_SEP}`);
}

export function descendantFolderMediaCount(
  folderName: string,
  folders: Array<{ name: string; activeMediaCount: number }>
): number {
  return folders.reduce((sum, folder) => {
    return isFolderOrDescendant(folderName, folder.name) ? sum + folder.activeMediaCount : sum;
  }, 0);
}

export function cycleFolderPath(groupName: string, stageFolder: string): string {
  const group = sanitizeSegment(groupName, "Untitled group");
  const stages = stageFolder
    .split(FOLDER_PATH_SEP)
    .map((part) => sanitizeSegment(part, "Stage"))
    .filter(Boolean);
  return [group, ...stages].join(FOLDER_PATH_SEP);
}

export function cycleFolderAncestorPaths(path: string): string[] {
  const segments = folderPathSegments(path);
  return segments.map((_, index) => segments.slice(0, index + 1).join(FOLDER_PATH_SEP));
}

export function parseCycleProjectNumber(projectName: string): number | null {
  const match = projectName.trim().match(/^Cycle\s+(\d+)$/i);
  if (!match) {
    return null;
  }
  const cycleNumber = Number.parseInt(match[1] ?? "", 10);
  return Number.isFinite(cycleNumber) && cycleNumber > 0 ? cycleNumber : null;
}

export function expandSmashedCycleStageSegment(segment: string): string[] {
  return SMASHED_ROLL_FOLDERS[segment] ?? [segment];
}

/** `Package Storage/Cycle 1/Airport Day/Final Cut/file.mp4` → `Airport Day/Final Cut` */
export function parseCycleNasFolderPath(nasPath: string, cycleNumber: number): string | null {
  const prefix = `${CYCLE_STORAGE_PREFIX}Cycle ${cycleNumber}/`;
  const normalized = nasPath.replace(/\\/g, "/");
  if (!normalized.startsWith(prefix)) {
    return null;
  }
  const parts = normalized.slice(prefix.length).split("/").filter(Boolean);
  if (parts.length < 2) {
    return null;
  }
  parts.pop();
  const expanded = parts.flatMap((part) => expandSmashedCycleStageSegment(part));
  return expanded.join(FOLDER_PATH_SEP) || null;
}

export function isFinalCutFolderName(name: string): boolean {
  return folderDisplayName(name).trim().toLowerCase() === "final cut";
}
