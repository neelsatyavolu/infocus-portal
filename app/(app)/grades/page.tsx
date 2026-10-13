import type { Metadata } from "next";
import { redirect, unstable_rethrow } from "next/navigation";
import { syncUserProfile } from "@/src/lib/auth";
import { getCurrentAppUser } from "@/src/lib/current-app-user";
import { currentGradebookWeekIndex, gradebookTodayKey, parseGradeTab } from "@/src/lib/grades-view";
import { getPlatformAccess, seesStudentGrades } from "@/src/lib/platform-admin";
import { loadMyGrades } from "@/src/server/grades-me";
import GradesClient, { type GradesMePayload } from "./grades-client";

export const metadata: Metadata = { title: "Grades" };

/** Same user and role resolution as GET /api/grades/me, so first paint matches the API. */
async function loadInitialGrades(userId: string): Promise<GradesMePayload | null> {
  try {
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);
    // JSON round trip so the props match the API response exactly (dates as strings).
    return JSON.parse(JSON.stringify(await loadMyGrades(user.id, access.role))) as GradesMePayload;
  } catch (error) {
    unstable_rethrow(error); // never swallow Next's dynamic-rendering signals
    // The client fetches instead and shows the API's error message.
    console.error("Grades first-paint load failed", error);
    return null;
  }
}

export default async function GradesPage({
  searchParams
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const { userId, platformRole } = await getCurrentAppUser();
  if (!seesStudentGrades(platformRole)) {
    redirect("/dashboard" as never);
  }

  const [initialData, { tab }] = await Promise.all([loadInitialGrades(userId), searchParams]);
  const initialWeekIndex = currentGradebookWeekIndex(
    initialData?.gradebook?.weeks ?? [],
    gradebookTodayKey()
  );

  return <GradesClient initialData={initialData} initialTab={parseGradeTab(tab)} initialWeekIndex={initialWeekIndex} />;
}
