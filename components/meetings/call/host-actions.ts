import { toast } from "sonner";
import { errorMessage, meetingsApi } from "@/src/lib/meetings/client/api";

export const ignore = () => undefined;

/**
 * A host request to the Portal with its toast. It rethrows, so a confirm dialog can stay open on
 * failure; one-click actions add `.catch(ignore)`. Shared by the People panel and the waiting banner.
 */
export async function hostAct(promise: Promise<unknown>, done: string) {
  try {
    await promise;
    toast.success(done);
  } catch (err) {
    toast.error(errorMessage(err));
    throw err;
  }
}

export const admitAll = (meetingId: string) => hostAct(meetingsApi.admitAll(meetingId), "Let everyone in.").catch(ignore);

export const admitOne = (meetingId: string, uid: string, name: string) =>
  hostAct(meetingsApi.participant(meetingId, uid, "admit"), `Let ${name} in.`).catch(ignore);

export const denyOne = (meetingId: string, uid: string, name: string) =>
  hostAct(meetingsApi.participant(meetingId, uid, "deny"), `Didn't let ${name} in.`).catch(ignore);
