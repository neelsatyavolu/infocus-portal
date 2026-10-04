"use client";

import dynamic from "next/dynamic";
import { JoiningScreen } from "./status-screens";

/** partytracks touches navigator/mediaDevices at import time, so the call never renders on the server. */
const MeetCall = dynamic(() => import("./meet-call"), { ssr: false, loading: () => <JoiningScreen /> });

export function MeetCallLoader(props: { meetingId: string; userName: string }) {
  return <MeetCall {...props} />;
}
