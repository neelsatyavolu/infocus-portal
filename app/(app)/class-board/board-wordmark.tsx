import Image from "next/image";
import { cn } from "@/src/lib/utils";

/**
 * The 2026 wordmark the board and its PIN gate share: the cropped /brand masters, Soft White on
 * dark and the color file in light mode. Set the height with `className`.
 */
export function BoardWordmark({ alt = "", className }: { alt?: string; className?: string }) {
  return (
    <>
      <Image
        src="/brand/infocus-wordmark-white.png"
        alt={alt}
        width={1200}
        height={321}
        className={cn("w-auto light:hidden", className)}
        priority
      />
      <Image
        src="/brand/infocus-wordmark-color.png"
        alt={alt}
        width={1200}
        height={321}
        className={cn("hidden w-auto light:block", className)}
        priority
      />
    </>
  );
}
