import { createHmac } from "node:crypto";
import { harvestHourFromSeed, type HarvestHour } from "@/src/lib/thanksgiving-harvest-hour";

/**
 * This year's harvest hour (src/lib/thanksgiving-harvest-hour.ts), derived from the app's auth
 * secret so it stays the same on every Worker and can't be read from the open-source code.
 */
export function harvestHour(): HarvestHour {
  const secret = process.env.APP_AUTH_SECRET || "local-development";
  const digest = createHmac("sha256", secret).update("thanksgiving-harvest-hour-2026").digest();
  return harvestHourFromSeed(digest.readUInt32BE(0));
}
