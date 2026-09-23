import { escapeProjectShellJson, PROJECT_SHELL_STATE_SCRIPT_ID, type ProjectShellData } from "@/src/lib/project-shell";
import { ProjectShellBridgeClient } from "@/components/project-shell-bridge-client";

export function ProjectShellBridge({ data }: { data: ProjectShellData }) {
  const json = escapeProjectShellJson(JSON.stringify(data));

  return (
    <>
      <script
        id={PROJECT_SHELL_STATE_SCRIPT_ID}
        type="application/json"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: json }}
      />
      <ProjectShellBridgeClient data={data} />
    </>
  );
}
