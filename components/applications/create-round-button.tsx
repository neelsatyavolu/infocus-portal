"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { errorMessage, send } from "@/components/applications/api";
import { Button } from "@/components/ui/button";

/** Creates a hidden draft round from this year's template and opens its settings. */
export function CreateRoundButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function create() {
    setBusy(true);
    try {
      const { id } = await send<{ id: string }>("/api/applications/rounds", "POST", { title: "2027–28 Producer Application" });
      router.push(`/applications/manage/${id}/settings` as never);
    } catch (error) {
      toast.error(errorMessage(error));
      setBusy(false);
    }
  }
  return (
    <Button onClick={create} disabled={busy}>
      <Plus aria-hidden />
      New round
    </Button>
  );
}
