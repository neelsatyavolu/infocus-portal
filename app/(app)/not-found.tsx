import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { EmptyState } from "@/components/kit/empty-state";
import { Panel } from "@/components/kit/panel";
import { buttonVariants } from "@/components/ui/button";

/** notFound() inside the Portal renders here, inside the shell, so the sidebar stays. */
export default function PortalNotFound() {
  return (
    <Panel padding="none">
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
  );
}
