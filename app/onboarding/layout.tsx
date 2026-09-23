import { redirect } from "next/navigation";
import { getSessionUser } from "@/src/lib/auth";
import {
  canBypassHubMaintenance,
  HUB_MAINTENANCE_MODE
} from "@/src/lib/maintenance";
import { getPlatformRoleForEmail } from "@/src/lib/platform-admin";

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  if (HUB_MAINTENANCE_MODE) {
    const session = await getSessionUser();
    if (session) {
      const role = await getPlatformRoleForEmail(session.email);
      if (!canBypassHubMaintenance(role, session.email)) {
        redirect("/maintenance" as never);
      }
    }
  }

  return children;
}
