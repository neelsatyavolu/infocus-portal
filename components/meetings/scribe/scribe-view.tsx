"use client";

import { useEffect, useState } from "react";
import { meetingBrowserSupport } from "@/src/lib/meetings/client/e2ee";
import { ScribeSession, readScribeParams } from "./scribe-session";

/** Status line only. Never renders meeting data (names, chat, media). */
export default function ScribeView() {
  const [status, setStatus] = useState("Starting");

  useEffect(() => {
    const params = readScribeParams(window.location.hash);
    // Drop the key and ticket from the address bar and history right away.
    history.replaceState(null, "", location.pathname);
    if (!params) {
      setStatus("Missing parameters");
      return;
    }
    const support = meetingBrowserSupport();
    if (!support.ok) {
      setStatus("Unsupported browser");
      return;
    }
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
  }, []);

  return (
    <main className="p-4 font-mono text-xs text-muted-foreground" aria-live="polite">
      Scribe: {status}
    </main>
  );
}
