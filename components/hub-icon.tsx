import Image from "next/image";
import { cn } from "@/src/lib/utils";

/** The square Ink app icon, with its pumpkin twin in the Halloween season (src/lib/halloween.ts). */
export function HubIcon({ size, className }: { size: number; className?: string }) {
  return (
    <>
      <Image src="/favicon/infocus-hub-icon.png" alt="" width={size} height={size} className={cn(className, "halloween-hide")} />
      <Image src="/halloween/infocus-hub-icon.png" alt="" width={size} height={size} className={cn(className, "halloween-show")} />
    </>
  );
}
