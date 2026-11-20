import Image from "next/image";
import { cn } from "@/src/lib/utils";

/** The square Ink app icon, with its seasonal twins for Halloween, Thanksgiving and Christmas (src/lib/halloween.ts, thanksgiving.ts, christmas.ts). */
export function HubIcon({ size, className }: { size: number; className?: string }) {
  return (
    <>
      <Image src="/favicon/infocus-hub-icon.png" alt="" width={size} height={size} className={cn(className, "halloween-hide thanksgiving-hide christmas-hide")} />
      <Image src="/halloween/infocus-hub-icon.png" alt="" width={size} height={size} className={cn(className, "halloween-show")} />
      <Image src="/thanksgiving/infocus-hub-icon.png" alt="" width={size} height={size} className={cn(className, "thanksgiving-show")} />
      <Image src="/christmas/infocus-hub-icon.png" alt="" width={size} height={size} className={cn(className, "christmas-show")} />
    </>
  );
}
