import type { Metadata } from "next";
import { KeyValueList } from "@/components/kit/key-value";
import { PageHeader } from "@/components/page-header";
import { ENTRY_FOOTER_CONTROL, EntryPanel } from "@/components/public-entry/entry-panel";
import { PublicFrame } from "@/components/public-entry/public-frame";
import { getSessionUser } from "@/src/lib/auth";
import {
  HUB_MAINTENANCE_BODY,
  HUB_MAINTENANCE_ETA,
  HUB_MAINTENANCE_TITLE
} from "@/src/lib/maintenance";

export const metadata: Metadata = { title: "Maintenance" };

export default async function MaintenancePage() {
  const session = await getSessionUser();

  return (
    <PublicFrame width="narrow">
      {/* The title already says "under maintenance", so the eyebrow carries the kind of outage, not a tag. */}
      <PageHeader eyebrow="Temporary outage" title={HUB_MAINTENANCE_TITLE} description={HUB_MAINTENANCE_BODY} />
      <EntryPanel
        footer={
          session ? (
            <>
              <span>Signed in</span>
              <form action="/api/auth/sign-out?returnTo=/" method="post" className="ml-auto">
                <button type="submit" className={ENTRY_FOOTER_CONTROL}>
                  Sign out
                </button>
              </form>
            </>
          ) : undefined
        }
      >
        <KeyValueList
          layout="stacked"
          items={[
            { label: "Estimated return", value: <span className="font-semibold">{HUB_MAINTENANCE_ETA}</span> },
            { label: "What’s coming", value: "The same Portal, with everything where you left it." },
            { label: "Access", value: "Producers retain full access during the move." }
          ]}
        />
      </EntryPanel>
    </PublicFrame>
  );
}
