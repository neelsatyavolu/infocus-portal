import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect, unstable_rethrow } from "next/navigation";
import { getCurrentAppUser } from "@/src/lib/current-app-user";
import { hasPlatformRole } from "@/src/lib/platform-admin";
import { GeneratorSkeleton, ShowSkeleton } from "./show-skeleton";
import TheShowClient from "./the-show-client";

export const metadata: Metadata = { title: "The Show" };

export default async function ShowRolesPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  try {
    const { platformRole } = await getCurrentAppUser();
    if (!hasPlatformRole(platformRole, "ASSOCIATE_PRODUCER")) {
      redirect("/access-denied" as never);
    }
  } catch (error) {
    // Lets the access-denied redirect above through (it throws), instead of turning it into a sign-in.
    unstable_rethrow(error);
    if (error instanceof Error && error.message === "FORBIDDEN") {
      redirect("/access-denied" as never);
    }

    redirect("/sign-in?returnTo=%2Fshow-roles" as never);
  }

  // The fallback shows before the client reads the URL, so pick the shape of the right view here.
  const generator = (await searchParams).generator === "1";

  return (
    <Suspense fallback={generator ? <GeneratorSkeleton /> : <ShowSkeleton />}>
      <TheShowClient />
    </Suspense>
  );
}
