"use client";

import { Toaster as Sonner } from "sonner";
import { useTheme } from "@/src/lib/use-theme";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/**
 * Toasts in the brand look (Lexend, Ink 2, 1px line, 6px radius). Full-screen tools and the
 * shell can lift them clear of their own bottom bars by setting `--toast-offset-bottom` /
 * `--toast-offset-right` on <html> (e.g. above the phone tab bar or a call's control bar).
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const theme = useTheme();

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      style={{ "--border-radius": "6px" } as React.CSSProperties}
      offset={{ bottom: "var(--toast-offset-bottom, 24px)", right: "var(--toast-offset-right, 24px)" }}
      mobileOffset={{ bottom: "var(--toast-offset-bottom, 16px)", left: "16px", right: "16px" }}
      toastOptions={{
        classNames: {
          toast:
            "group toast font-sans group-[.toaster]:bg-card group-[.toaster]:text-foreground group-[.toaster]:border-border",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground"
        }
      }}
      {...props}
    />
  );
};

export { Toaster };
