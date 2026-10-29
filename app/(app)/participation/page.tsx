import { redirect } from "next/navigation";

/** Participation moved into the Grade Editor; old links and emails land on its tab. */
export default function ParticipationPage() {
  redirect("/grade-editor?view=participation");
}
