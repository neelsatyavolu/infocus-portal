import { redirect } from "next/navigation";

/** Multi-workspace manager retired — single workspace is InFocus News. */
export default function WorkspacesPage() {
  redirect("/dashboard");
}
