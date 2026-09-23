import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/src/lib/current-app-user";
import { seesStudentGrades } from "@/src/lib/platform-admin";
import GradesClient from "./grades-client";

export default async function GradesPage() {
  const { platformRole } = await getCurrentAppUser();
  if (!seesStudentGrades(platformRole)) {
    redirect("/dashboard" as never);
  }

  return <GradesClient />;
}
