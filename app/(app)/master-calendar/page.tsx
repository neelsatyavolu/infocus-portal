import { getCurrentAppUser } from "@/src/lib/current-app-user";
import { currentCalendarMonthKey, loadMasterCalendarMonth } from "@/src/server/master-calendar-data";
import MasterCalendarClient from "./master-calendar-client";

export default async function MasterCalendarPage() {
  const { platformRole } = await getCurrentAppUser();
  const month = currentCalendarMonthKey();
  const initialData = await loadMasterCalendarMonth(month, platformRole);
  return <MasterCalendarClient initialData={initialData} />;
}
