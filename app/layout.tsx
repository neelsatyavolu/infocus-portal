import type { Metadata, Viewport } from "next";
import { Lexend } from "next/font/google";
import localFont from "next/font/local";
import { Toaster } from "@/components/ui/sonner";
import { HalloweenFavicon } from "@/components/halloween/halloween-favicon";
import { N3elAnalytics } from "@/components/n3el-analytics";
import { PortalDomainLinks } from "@/components/portal-domain-links";
import { HALLOWEEN_INIT_SCRIPT } from "@/src/lib/halloween";
import { THANKSGIVING_INIT_SCRIPT } from "@/src/lib/thanksgiving";
import { THEME_INIT_SCRIPT } from "@/src/lib/theme";
import "./globals.css";

// Variable font: one file covers every weight the app uses (400–700).
const lexend = Lexend({
  subsets: ["latin"],
  variable: "--font-lexend",
  display: "swap"
});

// Same file and settings as `geist/font/mono`, but not preloaded: it is data-only
// (numbers, timecodes), so it shouldn't compete with Lexend on first paint.
const geistMono = localFont({
  src: "../node_modules/geist/dist/fonts/geist-mono/GeistMono-Variable.woff2",
  variable: "--font-geist-mono",
  adjustFontFallback: false,
  fallback: [
    "ui-monospace",
    "SFMono-Regular",
    "Roboto Mono",
    "Menlo",
    "Monaco",
    "Liberation Mono",
    "DejaVu Sans Mono",
    "Courier New",
    "monospace"
  ],
  weight: "100 900",
  preload: false
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0F110F"
};

export const metadata: Metadata = {
  title: { default: "InFocus Portal", template: "%s · InFocus Portal" },
  applicationName: "InFocus Portal",
  appleWebApp: {
    title: "InFocus Portal"
  },
  description: "Frame-inspired collaborative video review platform",
  icons: {
    icon: [
      { url: "/favicon/favicon.ico", sizes: "any" },
      { url: "/favicon/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon/favicon-32x32.png", sizes: "32x32", type: "image/png" }
    ],
    apple: [{ url: "/favicon/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    other: [
      { rel: "manifest", url: "/favicon/site.webmanifest" },
      { rel: "icon", url: "/favicon/android-chrome-192x192.png", sizes: "192x192", type: "image/png" },
      { rel: "icon", url: "/favicon/android-chrome-512x512.png", sizes: "512x512", type: "image/png" }
    ]
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`dark bg-background ${lexend.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: HALLOWEEN_INIT_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: THANKSGIVING_INIT_SCRIPT }} />
      </head>
      <body className="font-sans bg-background text-foreground antialiased">
        {children}
        <Toaster />
        <N3elAnalytics />
        <PortalDomainLinks />
        <HalloweenFavicon />
      </body>
    </html>
  );
}
