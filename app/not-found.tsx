import type { Metadata } from "next";
import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { EmptyState } from "@/components/kit/empty-state";
import { Panel } from "@/components/kit/panel";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = { title: "Not found" };

/** Outside the Portal shell (public hosts, unknown top-level paths): same card as the in-shell 404. */
export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-4">
      <Panel padding="none" className="w-full max-w-md">
        <EmptyState
          size="page"
          align="start"
          icon={FileQuestion}
          eyebrow="Error 404"
          title={
            <span role="heading" aria-level={1}>
              Not found
            </span>
          }
          description="The resource could not be located or you may not have access."
          className="md:px-5"
          action={
            <Link href="/dashboard" className={buttonVariants()}>
              Back to dashboard
            </Link>
          }
        />
      </Panel>
    </main>
  );
}
