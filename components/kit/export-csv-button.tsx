import { Download } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/src/lib/utils";

/**
 * "Export CSV": a plain download link to a GET export route (the route checks access and sets
 * Content-Disposition, so the browser saves the file without leaving the page).
 */
export function ExportCsvButton({
  href,
  label = "Export CSV",
  title,
  className
}: {
  href: string;
  label?: string;
  title?: string;
  className?: string;
}) {
  return (
    <a href={href} download title={title} className={cn(buttonVariants({ variant: "outline" }), className)}>
      <Download aria-hidden />
      {label}
    </a>
  );
}
