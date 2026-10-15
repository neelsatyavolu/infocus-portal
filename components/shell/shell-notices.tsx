"use client";

import { useState } from "react";
import { UserCog } from "lucide-react";
import { toast } from "sonner";
import { Alert } from "@/components/kit/alert";
import { Spinner } from "@/components/kit/spinner";
import { Button } from "@/components/ui/button";
import { stopViewingAs } from "@/components/shell/view-as-actions";

/** 40px touch targets on phones (DESIGN §10); the Alert's action row holds them to 32px from md. */
const PHONE_TOUCH = "max-md:h-10!";

/**
 * The "Viewing as" notice at the top of the content column (it scrolls with the page instead of
 * pinning the top bar): who you are viewing as, Switch user (the View as dialog) and Stop viewing.
 */
export function ViewAsNotice({
  name,
  canSwitch,
  onSwitch,
  className
}: {
  name: string;
  canSwitch: boolean;
  onSwitch: () => void;
  className?: string;
}) {
  const [stopping, setStopping] = useState(false);

  async function stop() {
    setStopping(true);
    try {
      await stopViewingAs();
    } catch (error) {
      setStopping(false);
      toast.error(error instanceof Error ? error.message : "Could not switch user.");
    }
  }

  return (
    <Alert
      tone="warning"
      icon={UserCog}
      compact
      className={className}
      action={
        <>
          {canSwitch ? (
            <Button type="button" variant="outline" size="sm" className={PHONE_TOUCH} onClick={onSwitch} disabled={stopping}>
              Switch user
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={PHONE_TOUCH}
            onClick={() => void stop()}
            disabled={stopping}
          >
            {stopping ? <Spinner /> : null}
            Stop viewing
          </Button>
        </>
      }
    >
      Viewing as <span className="font-semibold">{name}</span>. What you do counts as them.
    </Alert>
  );
}
