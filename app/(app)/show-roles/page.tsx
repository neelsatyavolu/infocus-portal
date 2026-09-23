import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/src/lib/current-app-user";
import { hasPlatformRole } from "@/src/lib/platform-admin";
import TheShowClient from "./the-show-client";

export default async function ShowRolesPage() {
  try {
    const { platformRole } = await getCurrentAppUser();
    if (!hasPlatformRole(platformRole, "ASSOCIATE_PRODUCER")) {
      redirect("/access-denied" as never);
    }
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      redirect("/access-denied" as never);
    }

    redirect("/sign-in?returnTo=%2Fshow-roles" as never);
  }

  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
      <TheShowClient />
    </Suspense>
  );
}
