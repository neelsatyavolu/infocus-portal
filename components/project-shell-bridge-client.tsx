"use client";

import { useEffect } from "react";
import { PROJECT_SHELL_STATE_EVENT, type ProjectShellData } from "@/src/lib/project-shell";

export function ProjectShellBridgeClient({ data }: { data: ProjectShellData }) {
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent(PROJECT_SHELL_STATE_EVENT, {
        detail: data
      })
    );
  }, [data]);

  return null;
}
