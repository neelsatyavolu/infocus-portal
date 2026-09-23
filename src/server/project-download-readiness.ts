import { reconcileProjectMediaStatuses } from "@/src/server/media-reconcile";

export async function refreshProjectDownloadReadiness(projectId: string) {
  try {
    await reconcileProjectMediaStatuses(projectId);
  } catch (error) {
    console.error("Project download status reconciliation failed", error);
  }
}
