import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect, unstable_rethrow } from "next/navigation";
import { getCurrentAppUser } from "@/src/lib/current-app-user";
import { hasPlatformRole } from "@/src/lib/platform-admin";
import { DATE_KEY_PATTERN } from "@/src/lib/show-assignment";
import { editingHref, parseEditingView } from "@/src/lib/show-editor-views";
import { asApiJson } from "@/src/server/as-api-json";
import { loadShowOverview } from "@/src/server/show-overview-data";
import EditingClient from "./editing-client";
import { EditingSkeleton } from "./editing-skeleton";
import type { LoadedOverview } from "./use-editing-overview";

export const metadata: Metadata = { title: "Editing" };

type SearchParams = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

/**
 * Same data as GET /api/show-roles/overview for this address ("" = the next show), so the header and
 * the show strip paint at once. A bad ?date= is left to the client, which shows the API's error.
 */
async function loadInitialOverview(date: string | undefined): Promise<LoadedOverview | null> {
  if (date && !DATE_KEY_PATTERN.test(date)) return null;
  try {
    return { key: date ?? "", overview: asApiJson(await loadShowOverview(date ?? null)) };
  } catch (error) {
    unstable_rethrow(error);
    // The client fetches instead and shows the API's error message.
    console.error("Editing first-paint load failed", error);
    return null;
  }
}

/** Producers only, like The Show and /api/show-roles/edits. */
export default async function EditingPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const date = single(params.date);
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
    // Keep the link code (and the show) across sign-in: the editor Mac's Open Portal button lands here.
    const link = single(params.link);
    const returnTo = editingHref({ date, view: parseEditingView(single(params.view), link), link });
    redirect(`/sign-in?returnTo=${encodeURIComponent(returnTo)}` as never);
  }

  return (
    <Suspense fallback={<EditingSkeleton />}>
      <EditingClient initial={await loadInitialOverview(date)} />
    </Suspense>
  );
}
