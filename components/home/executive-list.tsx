import type { ReactNode } from "react";
import { InlineError } from "@/components/kit/alert";
import { PanelLink } from "@/components/kit/panel";

/** Rows shown in a Home list before the rest move behind a "more" link. */
export const HOME_LIST_LIMIT = 8;

/** The one short line a flush Home panel shows when its list is empty. */
export function EmptyLine({ children }: { children: ReactNode }) {
  return <p className="px-4 py-4 text-sm text-muted-foreground md:px-5">{children}</p>;
}

/** The load error inside a flush Home panel. */
export function PanelError({ children }: { children: ReactNode }) {
  return <InlineError className="px-4 py-4 md:px-5">{children}</InlineError>;
}

/** The footer of a capped list: "3 more" linking to the page that has them all. */
export function MoreLink({ hidden, href }: { hidden: number; href: string }) {
  return hidden > 0 ? <PanelLink href={href}>{`${hidden} more`}</PanelLink> : null;
}
