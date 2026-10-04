"use client";

import dynamic from "next/dynamic";

/** Headless Drive Scribe page. Parameters come from location.hash, which never reaches a server. */
const ScribeView = dynamic(() => import("@/components/meetings/scribe/scribe-view"), { ssr: false });

export default function MeetScribePage() {
  return <ScribeView />;
}
