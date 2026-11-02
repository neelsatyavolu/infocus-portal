"use client";

import { Toaster as Sonner } from "sonner";
import { useTheme } from "@/src/lib/use-theme";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/**
 * Toasts in the brand look (Geist, card surface, strong hairline, 12px radius, no shadow). Full-screen tools and the
 * shell can lift them clear of their own bottom bars by setting `--toast-offset-bottom` /
 * `--toast-offset-right` on <html> (e.g. above the phone tab bar or a call's control bar).
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const theme = useTheme();

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      style={
        {
          "--border-radius": "12px",
          "--normal-bg": "hsl(var(--card))",
          "--normal-border": "var(--line-2)",
          "--normal-text": "hsl(var(--foreground))"
        } as React.CSSProperties
      }
      offset={{ bottom: "var(--toast-offset-bottom, 24px)", right: "var(--toast-offset-right, 24px)" }}
      mobileOffset={{ bottom: "var(--toast-offset-bottom, 16px)", left: "16px", right: "16px" }}
      toastOptions={{
        classNames: {
          toast:
            "group toast font-sans shadow-none! group-[.toaster]:bg-card group-[.toaster]:text-foreground group-[.toaster]:border-line-strong",
          title: "font-medium",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:rounded-md group-[.toast]:bg-cta group-[.toast]:font-medium group-[.toast]:text-cta-foreground",
          cancelButton: "group-[.toast]:rounded-md group-[.toast]:bg-secondary group-[.toast]:text-muted-foreground"
        }
      }}
      {...props}
    />
  );
};

export { Toaster };
