import { redirect } from "next/navigation";
import { requireUserId, syncUserProfile } from "@/src/lib/auth";
import { getPlatformAccess, hasPlatformRole } from "@/src/lib/platform-admin";
import GradeEditorClient from "./grade-editor-client";

export default async function GradeEditorPage() {
  try {
    const userId = await requireUserId();
    const user = await syncUserProfile(userId);
    const access = await getPlatformAccess(user.email);

    if (!hasPlatformRole(access.role, "EXECUTIVE_PRODUCER")) {
      redirect("/access-denied");
    }

    return <GradeEditorClient />;
  } catch (error) {
    if (error instanceof Error && error.message === "FORBIDDEN") {
      redirect("/access-denied");
    }

    throw error;
  }
}
