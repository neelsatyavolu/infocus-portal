import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect, unstable_rethrow } from "next/navigation";
import { getCurrentAppUser } from "@/src/lib/current-app-user";
import { hasPlatformRole } from "@/src/lib/platform-admin";
import { DATE_KEY_PATTERN } from "@/src/lib/show-assignment";
import { loadShowOverview } from "@/src/server/show-overview-data";
import { asApiJson } from "@/src/server/as-api-json";
import type { Overview } from "./show-overview";
import { GeneratorSkeleton, ShowSkeleton } from "./show-skeleton";
import TheShowClient from "./the-show-client";

export const metadata: Metadata = { title: "The Show" };

/**
 * Same data as GET /api/show-roles/overview for this address ("" = the next show), so first paint
 * matches the API. A bad ?date= is left to the client, which shows the API's error.
 */
async function loadInitialOverview(date: string | string[] | undefined): Promise<{ key: string; overview: Overview } | null> {
  if (Array.isArray(date) || (date && !DATE_KEY_PATTERN.test(date))) return null;
  try {
    // Display names and a JSON round trip, so the props match the API response exactly.
    const overview = asApiJson(await loadShowOverview(date ?? null));
    return { key: date ?? "", overview };
  } catch (error) {
    unstable_rethrow(error);
    // The client fetches instead and shows the API's error message.
    console.error("The Show first-paint load failed", error);
    return null;
  }
}

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
  const params = await searchParams;
  const generator = params.generator === "1";
  const initial = generator ? null : await loadInitialOverview(params.date);

  return (
    <Suspense fallback={generator ? <GeneratorSkeleton /> : <ShowSkeleton />}>
      <TheShowClient initial={initial} />
    </Suspense>
  );
}
