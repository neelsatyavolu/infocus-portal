import type { Metadata } from "next";
import { getCurrentAppUser } from "@/src/lib/current-app-user";
import { parseMasterCalendarMonthParam } from "@/src/lib/master-calendar-month";
import { currentCalendarMonthKey, loadMasterCalendarMonth } from "@/src/server/master-calendar-data";
import MasterCalendarClient from "./master-calendar-client";

export const metadata: Metadata = { title: "Master Calendar" };

export default async function MasterCalendarPage({
  searchParams
}: {
  searchParams: Promise<{ month?: string | string[] }>;
}) {
  const [{ platformRole }, { month: monthParam }] = await Promise.all([getCurrentAppUser(), searchParams]);
  const month = parseMasterCalendarMonthParam(monthParam, currentCalendarMonthKey());
  const initialData = await loadMasterCalendarMonth(month, platformRole);
  return <MasterCalendarClient initialData={initialData} />;
}
