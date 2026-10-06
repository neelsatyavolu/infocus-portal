import { redirect } from "next/navigation";

/** Old browser-only activity feed removed; notification preferences live in Settings. */
export default function ActivityPage() {
  redirect("/settings");
}
