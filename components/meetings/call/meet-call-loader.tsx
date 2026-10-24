"use client";

import dynamic from "next/dynamic";
import { PreJoinSkeleton } from "./prejoin-skeleton";

/** partytracks touches navigator/mediaDevices at import time, so the call never renders on the server. */
const MeetCall = dynamic(() => import("./meet-call"), { ssr: false, loading: () => <PreJoinSkeleton /> });

export function MeetCallLoader(props: { meetingId: string; userName: string; embedded: boolean; autoJoin: boolean }) {
  return <MeetCall {...props} />;
}
