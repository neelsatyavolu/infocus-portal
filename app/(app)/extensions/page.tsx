import { redirect } from "next/navigation";

/** Legacy extension pool removed — use request-based flow. */
export default function ExtensionsPage() {
  redirect("/extension-requests");
}
