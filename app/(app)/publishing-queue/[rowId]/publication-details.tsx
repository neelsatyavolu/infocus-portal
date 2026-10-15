import { AlertTriangle, CheckCircle2, Clock, ExternalLink, Film, Upload } from "lucide-react";
import { KeyValueList } from "@/components/kit/key-value";
import { Panel } from "@/components/kit/panel";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/src/lib/utils";
import { youtubeEmbedCode, youtubeWatchUrl } from "@/src/lib/youtube-publication";
import PublicationEmbed from "../publication-embed";
import type { YoutubeStatusKey } from "../queue-view-model";

const STATUS_ICON = {
  published: CheckCircle2,
  uploading: Upload,
  processing: Clock,
  failed: AlertTriangle,
  none: Film
} as const;

/**
 * Not published yet (or no playable video): one compact panel with an icon and the status
 * sentence, instead of an empty video frame.
 */
export function PublicationStatusPanel({ status, sentence }: { status: YoutubeStatusKey; sentence: string }) {
  const Icon = STATUS_ICON[status];
  return (
    <Panel aria-label="YouTube status">
      <div className="flex min-w-0 items-center gap-4">
        <span
          className={cn(
            "grid h-10 w-10 shrink-0 place-items-center rounded-md bg-[var(--ink-3)]",
            status === "failed" ? "text-danger" : "text-muted-foreground"
          )}
        >
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <p role="status" className="min-w-0 text-sm text-foreground">
          {sentence}
        </p>
      </div>
    </Panel>
  );
}

/** Beside the video: when it was published, Watch on YouTube, and the embed code. */
export function PublishedDetails({
  videoId,
  publishedOn,
  sentence
}: {
  videoId: string;
  publishedOn: string | null;
  sentence: string;
}) {
  return (
    <Panel aria-label="Publication details" bodyClassName="space-y-4">
      {/* The eyebrow tag shows the status; this is the one announcement of it. */}
      <p role="status" className="sr-only">
        {sentence}
      </p>
      {publishedOn ? <KeyValueList dense items={[{ label: "Published", value: publishedOn }]} /> : null}
      <a
        href={youtubeWatchUrl(videoId)}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(buttonVariants({ variant: "outline" }), "w-full")}
      >
        <ExternalLink aria-hidden />
        Watch on YouTube
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
      <div className="border-t border-border pt-4">
        <PublicationEmbed code={youtubeEmbedCode(videoId)} />
      </div>
    </Panel>
  );
}
