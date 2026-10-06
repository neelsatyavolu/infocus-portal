"use client";

import { useEffect } from "react";

/**
 * Last resort when the root layout itself crashes: globals.css and fonts may not be loaded,
 * so this page brings its own <html>, <body> and inline Ink / InFocus Green styles.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Root layout crashed", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          padding: "24px",
          background: "#0F110F",
          color: "#ECEFEA",
          fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif"
        }}
      >
        <main role="alert" style={{ maxWidth: 420, width: "100%" }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: "0 0 8px" }}>InFocus Portal hit an error</h1>
          <p style={{ fontSize: 14, color: "#DCE2DE", margin: "0 0 16px" }}>
            Reload to try again.
            {error.digest ? ` Reference: ${error.digest}` : ""}
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={reset}
              style={{
                height: 36,
                padding: "0 16px",
                border: 0,
                borderRadius: 6,
                background: "#0B6E3E",
                color: "#ECEFEA",
                font: "inherit",
                fontSize: 14,
                fontWeight: 500,
                cursor: "pointer"
              }}
            >
              Try again
            </button>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- global-error replaces the root layout, so a full page load is the reliable way home */}
            <a
              href="/"
              style={{
                height: 36,
                padding: "0 16px",
                display: "inline-flex",
                alignItems: "center",
                border: "1px solid #6B726D",
                borderRadius: 6,
                color: "#ECEFEA",
                fontSize: 14,
                textDecoration: "none"
              }}
            >
              Go home
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
