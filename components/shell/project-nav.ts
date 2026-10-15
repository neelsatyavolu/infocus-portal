import type { ProjectShellFolder } from "@/src/lib/project-shell";

/** Which slice of a project's assets the URL shows (scope, folderId, collection). */
export type ProjectAssetView = {
  scope: "active" | "deleted";
  folderId: string;
  collection: "videos" | null;
};

export function readProjectAssetView(searchParams: URLSearchParams): ProjectAssetView {
  return {
    scope: searchParams.get("scope") === "deleted" ? "deleted" : "active",
    folderId: searchParams.get("folderId") ?? "all",
    collection: searchParams.get("collection") === "videos" ? "videos" : null
  };
}

/** A project URL with some params changed, keeping the rest; scope and folderId always set. */
export function buildProjectHref(projectId: string | null, searchParams: string, updates: Record<string, string | null>) {
  if (!projectId) return "/dashboard";
  const next = new URLSearchParams(searchParams);
  for (const [key, value] of Object.entries(updates)) {
    if (value === null) next.delete(key);
    else next.set(key, value);
  }
  if (!next.has("scope")) next.set("scope", "active");
  if (!next.has("folderId")) next.set("folderId", "all");
  return `/projects/${projectId}?${next.toString()}`;
}

export type ProjectDestination = {
  key: string;
  kind: "all" | "videos" | "folder" | "deleted";
  folder?: ProjectShellFolder;
  href: string;
  active: boolean;
  count: number | null;
};

/** Every place in a project the panel and phone chips link to, in panel order. */
export function projectDestinations(input: {
  projectId: string;
  searchParams: string;
  view: ProjectAssetView;
  folders: ProjectShellFolder[];
  /** Null while the project's data is still loading (no count shows). */
  assetCount: number | null;
}): { all: ProjectDestination; videos: ProjectDestination; folders: ProjectDestination[]; deleted: ProjectDestination } {
  const { projectId, searchParams, view } = input;
  const href = (updates: Record<string, string | null>) => buildProjectHref(projectId, searchParams, updates);
  const sorted = [...input.folders].sort((left, right) => left.name.localeCompare(right.name));
  return {
    all: {
      key: "all",
      kind: "all",
      href: href({ scope: "active", folderId: "all", collection: null }),
      active: view.scope === "active" && view.collection === null && (view.folderId === "all" || view.folderId === "root"),
      count: null
    },
    videos: {
      key: "videos",
      kind: "videos",
      href: href({ collection: "videos", scope: "active", folderId: "all" }),
      active: view.scope === "active" && view.collection === "videos",
      count: input.assetCount
    },
    folders: sorted.map((folder) => ({
      key: folder.id,
      kind: "folder",
      folder,
      href: href({ scope: "active", folderId: folder.id, collection: null }),
      active: view.scope === "active" && view.folderId === folder.id,
      count: folder.activeMediaCount
    })),
    deleted: {
      key: "deleted",
      kind: "deleted",
      href: href({ scope: "deleted", folderId: "all", collection: null }),
      active: view.scope === "deleted",
      count: null
    }
  };
}
