"use client";

import { useCallback, useTransition, type MouseEvent } from "react";
import { useRouter } from "next/navigation";

export type ShellLinkClick = (event: MouseEvent<HTMLAnchorElement>, href: string) => void;

/**
 * Breadcrumb, assets-panel and folder-chip links: a plain left click navigates inside a
 * transition (the top bar's progress line shows while it's pending); modifier and middle clicks
 * keep the browser's open-in-new-tab behaviour; clicking the page you're on does nothing.
 */
export function useShellLink(currentHref: string) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const onLinkClick = useCallback<ShellLinkClick>(
    (event, href) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      event.preventDefault();
      if (href === currentHref) return;
      startTransition(() => {
        router.push(href as never);
      });
    },
    [currentHref, router]
  );

  return { pending, onLinkClick };
}
