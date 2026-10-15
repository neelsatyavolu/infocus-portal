"use client";

import { useState } from "react";
import { Wifi } from "lucide-react";
import { cn } from "@/src/lib/utils";

/** "youtube.com" from "https://www.youtube.com/…"; the raw value when it isn't a URL. */
export function hostLabel(url: string) {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function hostname(url: string | null) {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

const WIFI_NAME = /wi-?fi/i;

const SIZE = {
  36: { tile: "h-9 w-9", img: "h-5 w-5", px: 20 },
  40: { tile: "h-10 w-10", img: "h-6 w-6", px: 24 }
} as const;

function SiteIconTile({ name, url, size }: { name: string; url: string | null; size: 36 | 40 }) {
  const host = hostname(url);
  const [failed, setFailed] = useState(false);
  const dims = SIZE[size];
  const tile = cn("grid shrink-0 place-items-center rounded-md border border-border bg-[var(--ink-3)]", dims.tile);

  if (WIFI_NAME.test(name)) {
    return (
      <span className={tile} aria-hidden>
        <Wifi className="h-4 w-4 text-foreground" />
      </span>
    );
  }

  if (!host || failed) {
    return (
      <span className={cn(tile, "text-sm font-semibold text-foreground")} aria-hidden>
        {name.trim().charAt(0).toUpperCase() || "?"}
      </span>
    );
  }

  return (
    <span className={cn(tile, "overflow-hidden bg-foreground/[0.06]")} aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/api/vault/favicon?host=${encodeURIComponent(host)}`}
        alt=""
        width={dims.px}
        height={dims.px}
        loading="lazy"
        onError={() => setFailed(true)}
        className={cn("object-contain", dims.img)}
      />
    </span>
  );
}

/**
 * Wi-Fi icon for Wi-Fi entries, else the site favicon (via /api/vault/favicon), else the first
 * letter. Keyed by url so a failed favicon resets when the website changes.
 */
export function SiteIcon({ name, url, size = 36 }: { name: string; url: string | null; size?: 36 | 40 }) {
  return <SiteIconTile key={url ?? ""} name={name} url={url} size={size} />;
}
