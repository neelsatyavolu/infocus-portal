import Link from "next/link";
import { Folder } from "lucide-react";
import { CardGrid } from "@/components/kit/layout";
import { DeleteEntityButton } from "@/components/delete-entity-button";
import { plural } from "@/components/home/home-format";
import { formatRelativeTime } from "@/src/server/dashboard-data";

export type HomeProject = {
  id: string;
  name: string;
  updatedAt: Date;
  _count: { mediaItems: number };
};

/** The delete dialog says how much goes with the project ("Cycle 3" holds a whole cycle's uploads). */
export function projectDeleteDescription(project: HomeProject) {
  return `This permanently deletes ${project.name} and its ${plural(project._count.mediaItems, "media file")}. This can't be undone.`;
}

/**
 * Grid view: the kit CardGrid (auto-fill, 16rem minimum, the page's 20px rhythm) of equal-height
 * cards. The name is a stretched link over the card; the footer shows the media count and when
 * it was last updated (what the Recent sort orders by); delete sits above the link layer.
 */
export function ProjectGrid({ projects, canDelete }: { projects: HomeProject[]; canDelete: boolean }) {
  return (
    <CardGrid minItemWidth="16rem" gap={5}>
      {projects.map((project) => (
        <article
          key={project.id}
          className="relative flex h-full min-h-28 min-w-0 flex-col rounded-md border border-border bg-card p-4 transition-colors hover:border-[var(--brand-green)]/40 hover:bg-[var(--ink-3)]"
        >
          <h3 className="flex min-w-0 items-start gap-2 text-[15px] font-semibold leading-snug tracking-[-0.01em] text-foreground">
            <Folder className="mt-[3px] h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <Link
              href={`/projects/${project.id}` as never}
              title={project.name}
              className="min-w-0 rounded-sm outline-none after:absolute after:inset-0 after:rounded-md focus-visible:after:ring-2 focus-visible:after:ring-ring"
            >
              <span className="line-clamp-2 break-words">{project.name}</span>
            </Link>
          </h3>
          <div className="mt-auto flex min-h-9 items-center justify-between gap-2 pt-3">
            <p className="min-w-0 text-[13px] leading-snug text-muted-foreground">
              <span className="whitespace-nowrap">
                <span className="font-mono-broadcast tabular-nums text-foreground">{project._count.mediaItems}</span>{" "}
                {project._count.mediaItems === 1 ? "media file" : "media files"}
              </span>{" "}
              ·{" "}
              <span className="whitespace-nowrap">
                Updated{" "}
                <time dateTime={project.updatedAt.toISOString()} className="font-mono-broadcast tabular-nums">
                  {formatRelativeTime(project.updatedAt.toISOString())}
                </time>
              </span>
            </p>
            {canDelete ? (
              <DeleteEntityButton
                endpoint={`/api/projects/${project.id}`}
                label={project.name}
                description={projectDeleteDescription(project)}
                className="z-10 -mr-2"
              />
            ) : null}
          </div>
        </article>
      ))}
    </CardGrid>
  );
}
