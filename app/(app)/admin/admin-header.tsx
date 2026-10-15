import type { ReactNode } from "react";
import { Shield } from "lucide-react";
import { StatusTag } from "@/components/kit/status-tag";
import { PageHeader } from "@/components/page-header";
import type { ContextItem } from "./admin-status";
import { formatRoleLabel, type PlatformRole } from "./admin-types";

const DEFAULT_CONTEXT = "People, access, producer roles, and how Portal is set up.";

const LINK_CLASS =
  "rounded-sm font-medium text-foreground underline decoration-[var(--ink-4)] underline-offset-4 transition-colors hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function ContextLink({ target, onNavigate, children }: { target: string; onNavigate: (target: string) => void; children: ReactNode }) {
  return (
    <a
      href={`#${target}`}
      onClick={(event) => {
        event.preventDefault();
        onNavigate(target);
      }}
      className={LINK_CLASS}
    >
      {children}
    </a>
  );
}

/**
 * The Admin nameplate. The context line says what needs someone right now (access requests,
 * a paused integration, a failed backup or calendar check), each a link to where it's fixed;
 * otherwise what Admin is for. The role is a tag in the eyebrow row, not a button.
 */
export function AdminHeader({
  role,
  context,
  onNavigate,
  actions
}: {
  role?: PlatformRole | null;
  /** Leave out to show what Admin is for (Overview already shows every status below). */
  context?: { shown: ContextItem[]; more: number };
  onNavigate?: (target: string) => void;
  actions?: ReactNode;
}) {
  let line: ReactNode = DEFAULT_CONTEXT;
  if (context && onNavigate && context.shown.length > 0) {
    line = (
      <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
        {context.shown.map((item, index) => (
          <span key={item.key} className="inline-flex items-center gap-x-1.5">
            {index > 0 ? <span aria-hidden="true">·</span> : null}
            <ContextLink target={item.target} onNavigate={onNavigate}>
              {item.label}
            </ContextLink>
          </span>
        ))}
        {context.more > 0 ? (
          <span className="inline-flex items-center gap-x-1.5">
            <span aria-hidden="true">·</span>
            <ContextLink target="overview" onNavigate={onNavigate}>
              {`+${context.more} more`}
            </ContextLink>
          </span>
        ) : null}
      </span>
    );
  }

  return (
    <PageHeader
      eyebrow={
        <>
          <Shield className="h-3 w-3" aria-hidden="true" />
          Platform
        </>
      }
      status={
        role !== undefined ? (
          <StatusTag size="sm" tone="neutral" srLabel="Your role: ">
            {formatRoleLabel(role)}
          </StatusTag>
        ) : null
      }
      title="Admin Dashboard"
      description={line}
      actions={actions}
    />
  );
}
