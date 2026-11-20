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
 * pages never download it. In the Halloween, Thanksgiving and Christmas seasons their seasonal twins show.
 */
export function BrandWordmark({ className, alt = "InFocus Portal", width = 280, height = 120, priority }: BrandWordmarkProps) {
  return (
    <>
      <Image
        src="/favicon/infocus-wordmark.png"
        alt={alt}
        width={width}
        height={height}
        className={cn(className, "halloween-hide thanksgiving-hide christmas-hide light:hidden")}
        priority={priority}
      />
      <Image
        src="/favicon/infocus-wordmark-light.png"
        alt={alt}
        width={width}
        height={height}
        className={cn(className, "halloween-hide thanksgiving-hide christmas-hide hidden light:block")}
      />
      <Image
        src="/halloween/infocus-wordmark.png"
        alt={alt}
        width={width}
        height={height}
        className={cn(className, "halloween-show light:hidden")}
      />
      <Image
        src="/halloween/infocus-wordmark-light.png"
        alt={alt}
        width={width}
        height={height}
        className={cn(className, "halloween-show hidden light:block")}
      />
      <Image
        src="/thanksgiving/infocus-wordmark.png"
        alt={alt}
        width={width}
        height={height}
        className={cn(className, "thanksgiving-show light:hidden")}
      />
      <Image
        src="/thanksgiving/infocus-wordmark-light.png"
        alt={alt}
        width={width}
        height={height}
        className={cn(className, "thanksgiving-show hidden light:block")}
      />
      <Image
        src="/christmas/infocus-wordmark.png"
        alt={alt}
        width={width}
        height={height}
        className={cn(className, "christmas-show light:hidden")}
      />
      <Image
        src="/christmas/infocus-wordmark-light.png"
        alt={alt}
        width={width}
        height={height}
        className={cn(className, "christmas-show hidden light:block")}
      />
    </>
  );
}
