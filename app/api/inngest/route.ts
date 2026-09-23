import { serve } from "inngest/next";
import { inngest } from "@/src/lib/inngest";
import { inngestFunctions } from "@/src/server/inngest-functions";

export const maxDuration = 300;

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: inngestFunctions
});
