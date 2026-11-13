/**
 * The InFocus package zips the editing Macs install: the regular look ("InFocus 2026 Package.zip") and one per
 * seasonal theme ("InFocus Christmas 2026 Package.zip"), uploaded by hand to Drive's Graphic Files folder. The Mac
 * compares each zip's size and modified time with what it has and downloads only the ones that changed.
 */
import { driveListing, mintEditorDownload } from "@/src/server/show-editor-drive";

export const PACKAGE_ZIPS_FOLDER = "All Resources/Graphic Files";
const ZIP_NAME = /^InFocus (?:([A-Za-z]+) )?(\d{4}) Package\.zip$/;

export type PackageZip = { theme: string; name: string; size: number; modifiedAt: string; url: string };

type Deps = {
  list: (dir: string) => Promise<{ name: string; path: string; isDir: boolean; size: number; mtime: string }[]>;
  mint: (path: string) => Promise<string>;
};

export async function packageZips(deps: Deps = { list: driveListing, mint: mintEditorDownload }) {
  const newest = new Map<string, { year: number; item: Awaited<ReturnType<Deps["list"]>>[number] }>();
  for (const item of await deps.list(PACKAGE_ZIPS_FOLDER)) {
    const match = item.isDir ? null : ZIP_NAME.exec(item.name);
    if (!match) continue;
    const theme = (match[1] ?? "").toLowerCase();
    const year = Number(match[2]);
    if ((newest.get(theme)?.year ?? -1) < year) newest.set(theme, { year, item });
  }
  const zips: PackageZip[] = await Promise.all(
    [...newest.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(async ([theme, { item }]) => ({
        theme, name: item.name, size: item.size, modifiedAt: item.mtime, url: await deps.mint(item.path)
      }))
  );
  return { zips };
}
