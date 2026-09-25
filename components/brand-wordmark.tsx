import Image from "next/image";
import { cn } from "@/src/lib/utils";

type BrandWordmarkProps = {
  className?: string;
  alt?: string;
  width?: number;
  height?: number;
  priority?: boolean;
};

/**
 * Logo wordmark: white letters for the dark theme, ink letters and deep green for the light theme.
 * Both files share one canvas, so the same size works for either. The light file is lazy, so dark
 * pages never download it.
 */
export function BrandWordmark({ className, alt = "InFocus Portal", width = 280, height = 120, priority }: BrandWordmarkProps) {
  return (
    <>
      <Image
        src="/favicon/infocus-wordmark.png"
        alt={alt}
        width={width}
        height={height}
        className={cn(className, "light:hidden")}
        priority={priority}
      />
      <Image
        src="/favicon/infocus-wordmark-light.png"
        alt={alt}
        width={width}
        height={height}
        className={cn(className, "hidden light:block")}
      />
    </>
  );
}
