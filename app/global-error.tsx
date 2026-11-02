"use client";

import { useEffect } from "react";

/**
 * Last resort when the root layout itself crashes: globals.css and fonts may not be loaded,
 * so this page brings its own <html>, <body> and inline black canvas / white primary styles.
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
          background: "#000000",
          color: "#FCFDFF",
          fontFamily: "Geist, system-ui, -apple-system, Segoe UI, sans-serif"
        }}
      >
        <main role="alert" style={{ maxWidth: 420, width: "100%" }}>
          <h1 style={{ fontSize: 22, fontWeight: 500, letterSpacing: "-0.02em", margin: "0 0 8px" }}>InFocus Portal hit an error</h1>
          <p style={{ fontSize: 14, color: "rgba(252,253,255,0.86)", margin: "0 0 16px" }}>
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
                borderRadius: 8,
                background: "#FCFDFF",
                color: "#000000",
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
                border: "1px solid rgba(255,255,255,0.14)",
                borderRadius: 8,
                background: "#111114",
                color: "#FCFDFF",
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
