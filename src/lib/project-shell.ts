export const PROJECT_SHELL_STATE_SCRIPT_ID = "infocus-project-shell-state";
export const PROJECT_SHELL_STATE_EVENT = "infocus:project-shell-state";

export type ProjectShellAsset = {
  id: string;
  title: string;
  folderId: string | null;
  folderName: string | null;
};

export type ProjectShellFolder = {
  id: string;
  name: string;
  activeMediaCount: number;
};

export type ProjectShellData = {
  projectId: string;
  projectName: string;
  workspace: {
    id: string;
    name: string;
  };
  folders: ProjectShellFolder[];
  assetCount: number;
  currentAsset: ProjectShellAsset | null;
  canViewShareLinks: boolean;
};

export function escapeProjectShellJson(json: string) {
  return json.replace(/</g, "\\u003c");
}
