import type { Metadata } from "next";
import { Alert } from "@/components/kit/alert";
import { KeyValueList } from "@/components/kit/key-value";
import { StatusTag } from "@/components/kit/status-tag";
import { PageHeader } from "@/components/page-header";
import { ENTRY_CONTROL, EntryPanel } from "@/components/public-entry/entry-panel";
import { PublicFrame } from "@/components/public-entry/public-frame";
import { Button } from "@/components/ui/button";
import { getRealSessionUser, getSessionUser } from "@/src/lib/auth";
import { APP_STATE, PKCE_CHALLENGE } from "@/src/server/app-sign-in";

export const metadata: Metadata = { title: { absolute: "Sign in to the InFocus app" } };

type AppSignInPageProps = {
  searchParams: Promise<{ challenge?: string; state?: string }>;
};

/** Opened by the InFocus Mac or iPhone app in a browser sheet; signed-out visitors go through /sign-in first (middleware). */
export default async function AppSignInPage({ searchParams }: AppSignInPageProps) {
  const [{ challenge = "", state = "" }, real, session] = await Promise.all([
    searchParams,
    getRealSessionUser(),
    getSessionUser()
  ]);
  const validLink = PKCE_CHALLENGE.test(challenge) && APP_STATE.test(state);
  const viewingAs = Boolean(real && session && session.userId !== real.userId);
  const who = real?.name?.trim() || real?.email || "your account";

  return (
    <PublicFrame width="narrow">
      <PageHeader
        eyebrow="InFocus app"
        status={
          !validLink ? (
            <StatusTag tone="danger">Invalid link</StatusTag>
          ) : viewingAs ? (
            <StatusTag tone="warning">Viewing as</StatusTag>
          ) : undefined
        }
        title="Sign in to the InFocus app"
        description={validLink ? "Approve the sign-in you started in the Mac or iPhone app." : undefined}
      />

      {!validLink ? (
        <Alert tone="danger" className="md:px-6">
          This link is invalid or incomplete. Start sign-in again from the InFocus app.
        </Alert>
      ) : viewingAs ? (
        <Alert tone="warning" className="md:px-6">Stop viewing as someone else first, then try again from the InFocus app.</Alert>
      ) : (
        <EntryPanel>
          <KeyValueList
            layout="stacked"
            divided={false}
            items={[{ label: "Signs in as", value: <span className="font-semibold">{who}</span> }]}
          />
          <p className="text-[13px] leading-snug text-muted-foreground">
            The InFocus app on this device will be signed in as this account. Only continue if you started sign-in
            from the app.
          </p>
          <form action="/api/auth/app/authorize" method="post" className="grid grid-cols-2 gap-3">
            <input type="hidden" name="challenge" value={challenge} />
            <input type="hidden" name="state" value={state} />
            <Button type="submit" name="decision" value="cancel" variant="outline" className={ENTRY_CONTROL}>
              Cancel
            </Button>
            <Button type="submit" name="decision" value="allow" className={ENTRY_CONTROL}>
              Allow
            </Button>
          </form>
        </EntryPanel>
      )}
    </PublicFrame>
  );
}
