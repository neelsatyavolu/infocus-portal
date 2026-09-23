"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type WorkspaceOption = {
  id: string;
  name: string;
};

export function WorkspaceQuickCreate({
  workspaces,
  isAdmin
}: {
  workspaces: WorkspaceOption[];
  isAdmin: boolean;
}) {
  const [workspaceName, setWorkspaceName] = useState("");
  const [projectName, setProjectName] = useState("");
  const [workspaceId, setWorkspaceId] = useState(workspaces[0]?.id ?? "");
  const [message, setMessage] = useState<string | null>(null);

  async function createWorkspace() {
    if (!workspaceName.trim()) return;
    const res = await fetch("/api/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: workspaceName })
    });

    setMessage(res.ok ? "Workspace created. Refreshing..." : "Failed to create workspace.");
    if (res.ok) window.location.reload();
  }

  async function createProject() {
    if (!projectName.trim() || !workspaceId) return;
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId,
        name: projectName
      })
    });

    setMessage(res.ok ? "Project created. Refreshing..." : "Failed to create project.");
    if (res.ok) window.location.reload();
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <Card id="quick-create">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg border border-border bg-accent text-foreground">
            <Plus className="h-4 w-4" />
          </span>
          Quick Create
        </CardTitle>
        <CardDescription>Add a workspace or a project in one step.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2 rounded-xl border border-border bg-muted p-3">
          <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">New workspace</p>
          <Input value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)} placeholder="New workspace name" />
          <Button onClick={createWorkspace} className="w-full">
            Create Workspace
          </Button>
        </div>

        <div className="space-y-2 rounded-xl border border-border bg-muted p-3">
          <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">New project</p>
          <select
            value={workspaceId}
            onChange={(e) => setWorkspaceId(e.target.value)}
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground"
          >
            {workspaces.length === 0 ? <option value="">No workspace available</option> : null}
            {workspaces.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.name}
              </option>
            ))}
          </select>
          <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="New project name" />
          <Button variant="secondary" onClick={createProject} disabled={!workspaceId} className="w-full">
            Create Project
          </Button>
        </div>

        {message ? <p className="text-xs text-muted-foreground md:col-span-2">{message}</p> : null}
      </CardContent>
    </Card>
  );
}
