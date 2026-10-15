"use client";

import { useEffect, useState } from "react";
import { meetingBrowserSupport } from "@/src/lib/meetings/client/e2ee";
import { ScribeSession, readScribeParams } from "./scribe-session";

/** Status line only. Never renders meeting data (names, chat, media). */
export default function ScribeView() {
  // Client-only (loaded with ssr: false): read the hash on the first render, before it's cleared below.
  const [params] = useState(() => readScribeParams(window.location.hash));
  const [supported] = useState(() => meetingBrowserSupport().ok);
  const [status, setStatus] = useState(!params ? "Missing parameters" : supported ? "Starting" : "Unsupported browser");

  useEffect(() => {
    // Drop the key and ticket from the address bar and history right away.
    history.replaceState(null, "", location.pathname);
    if (!params || !supported) return;
    const session = new ScribeSession(params, setStatus);
    window.__scribe = {
      setKey: (key, epoch) => session.setKey(key, epoch),
      setTicket: (token) => session.setTicket(token),
      leave: () => session.leave()
    };
    session.start().catch(() => setStatus("Couldn't connect"));
    return () => {
      void session.leave();
      delete window.__scribe;
    };
  }, [params, supported]);

  return (
    <main className="p-4 font-mono text-xs text-muted-foreground" aria-live="polite">
      Scribe: {status}
    </main>
  );
}
