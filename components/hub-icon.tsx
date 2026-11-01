import Image from "next/image";
import { cn } from "@/src/lib/utils";

/** The square Ink app icon, with its seasonal twins for Halloween and Thanksgiving (src/lib/halloween.ts, thanksgiving.ts). */
export function HubIcon({ size, className }: { size: number; className?: string }) {
  return (
    <>
      <Image src="/favicon/infocus-hub-icon.png" alt="" width={size} height={size} className={cn(className, "halloween-hide thanksgiving-hide")} />
      <Image src="/halloween/infocus-hub-icon.png" alt="" width={size} height={size} className={cn(className, "halloween-show")} />
      <Image src="/thanksgiving/infocus-hub-icon.png" alt="" width={size} height={size} className={cn(className, "thanksgiving-show")} />
    </>
  );
}
