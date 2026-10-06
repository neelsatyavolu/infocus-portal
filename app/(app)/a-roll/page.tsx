import type { Metadata } from "next";
import { StageWorkspace } from "@/components/package-cycle/stage-workspace";

export const metadata: Metadata = { title: "A-roll/B-roll" };

export default function ARollPage() {
  return (
    <div className="route-enter mx-auto w-full max-w-[80rem] space-y-5 pb-24">
      <StageWorkspace slug="a-roll" />
    </div>
  );
}
