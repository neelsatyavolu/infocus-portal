"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  PROJECT_SHELL_STATE_EVENT,
  PROJECT_SHELL_STATE_SCRIPT_ID,
  type ProjectShellData,
  type ProjectShellFolder
} from "@/src/lib/project-shell";

/** How long the shell waits for the page's ProjectShellBridge before fetching project data itself. */
const PROJECT_SHELL_FALLBACK_MS = 1_500;

function readProjectShellStateFromDom(expectedProjectId: string) {
  const element = document.getElementById(PROJECT_SHELL_STATE_SCRIPT_ID);
  if (!(element instanceof HTMLScriptElement) || !element.textContent) {
    return null;
  }
  try {
    const parsed = JSON.parse(element.textContent) as ProjectShellData;
    return parsed.projectId === expectedProjectId ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Names, folders and counts for the project the person is in (breadcrumbs, the assets panel and
 * the phone folder chips). The page delivers them through ProjectShellBridge (a DOM script or an
 * event); if it hasn't within 1.5s the shell fetches them. Cleared when leaving project routes.
 * `loading` is true until they arrive, and false once the fallback fetch has failed, so the
 * panel's placeholders never spin forever.
 */
export function useProjectShell(projectId: string | null, mediaId: string | null) {
  const router = useRouter();
  const [data, setData] = useState<ProjectShellData | null>(null);
  // The project whose fallback fetch failed (the bridge can still deliver its data later).
  const [failedFor, setFailedFor] = useState<string | null>(null);
  const [shellFor, setShellFor] = useState({ projectId, mediaId });
  if (projectId !== shellFor.projectId || mediaId !== shellFor.mediaId) {
    setShellFor({ projectId, mediaId });
    if (!projectId) setData(null);
    else setFailedFor(null);
  }

  useEffect(() => {
    if (!projectId) {
      return;
    }

    function apply(next: ProjectShellData | null | undefined) {
      if (next && next.projectId === projectId) setData(next);
    }
    function onBridge(event: Event) {
      apply((event as CustomEvent<ProjectShellData>).detail);
    }
    window.addEventListener(PROJECT_SHELL_STATE_EVENT, onBridge);

    const domState = readProjectShellStateFromDom(projectId);
    if (domState) {
      apply(domState);
      return () => window.removeEventListener(PROJECT_SHELL_STATE_EVENT, onBridge);
    }

    // The bridge normally delivers the data in a moment; only fetch if it hasn't by then.
    const id = projectId;
    let active = true;
    const fallbackUrl = mediaId ? `/api/projects/${projectId}/shell?mediaId=${mediaId}` : `/api/projects/${projectId}/shell`;
    function cancelOnBridge(event: Event) {
      if ((event as CustomEvent<ProjectShellData>).detail?.projectId === projectId) {
        window.clearTimeout(timer);
        window.removeEventListener(PROJECT_SHELL_STATE_EVENT, cancelOnBridge);
      }
    }
    const timer = window.setTimeout(() => {
      window.removeEventListener(PROJECT_SHELL_STATE_EVENT, cancelOnBridge);
      const lateDomState = readProjectShellStateFromDom(projectId);
      if (lateDomState) {
        apply(lateDomState);
        return;
      }
      void (async () => {
        try {
          const response = await fetch(fallbackUrl);
          if (!active) return;
          if (!response.ok) {
            console.error(`Project shell data failed to load (${response.status})`);
            setFailedFor(id);
            return;
          }
          const payload = (await response.json()) as { data?: ProjectShellData };
          if (!active) return;
          if (payload.data?.projectId === id) setData(payload.data);
          else setFailedFor(id);
        } catch (error) {
          // The shell keeps its placeholder names and stops showing loading rows.
          console.error("Project shell data failed to load", error);
          if (active) setFailedFor(id);
        }
      })();
    }, PROJECT_SHELL_FALLBACK_MS);
    window.addEventListener(PROJECT_SHELL_STATE_EVENT, cancelOnBridge);

    return () => {
      active = false;
      window.clearTimeout(timer);
      window.removeEventListener(PROJECT_SHELL_STATE_EVENT, onBridge);
      window.removeEventListener(PROJECT_SHELL_STATE_EVENT, cancelOnBridge);
    };
  }, [projectId, mediaId]);

  const folders = data?.folders;
  useEffect(() => {
    if (!projectId) return;
    const hrefs = [
      `/projects/${projectId}?scope=active&folderId=all`,
      `/projects/${projectId}?scope=active&folderId=all&collection=videos`,
      ...(folders ?? []).slice(0, 12).map((folder) => `/projects/${projectId}?scope=active&folderId=${folder.id}`)
    ];
    for (const href of hrefs) {
      router.prefetch(href as never);
    }
  }, [projectId, folders, router]);

  /** A folder made from the shell shows at once (a new list, never an in-place push). */
  const appendFolder = useCallback((folder: ProjectShellFolder) => {
    setData((current) => (current ? { ...current, folders: [...current.folders, folder] } : current));
  }, []);

  const current = projectId && data?.projectId === projectId ? data : null;
  return { data: current, loading: Boolean(projectId) && current === null && failedFor !== projectId, appendFolder };
}
