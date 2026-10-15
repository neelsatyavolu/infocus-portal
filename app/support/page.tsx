import type { Metadata } from "next";
import Link from "next/link";
import type { Route } from "next";
import { LifeBuoy } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { InfoPage, type InfoGroup } from "@/components/public-marketing/info-page";
import { MarketingPage } from "@/components/public-marketing/marketing-page";
import { INLINE_LINK_CLASS } from "@/components/public-marketing/shared";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Support",
  description: "Help with InFocus Portal and the InFocus apps."
};

const CONTACT_URL = "https://infocusnews.tv/contact-us/";

type Question = { question: string; answer: string };

const newsApp: Question[] = [
  {
    question: "How do I turn alerts on or off?",
    answer: "Open More → Settings and switch New shows, New stories or Going live. Turning all three off deletes your alert choices from our server."
  },
  {
    question: "How do I get an announcement on the show?",
    answer: "Open More → Submit an announcement. InFocus reviews every request before it airs; announcements run for at most four consecutive show days."
  },
  {
    question: "A show or story won't load.",
    answer: "Pull down to refresh. Shows play from YouTube, so check that YouTube works on your network. If it still fails, contact us with the show or story title."
  }
];

const portalApp: Question[] = [
  {
    question: "Who can use InFocus Portal?",
    answer: "Members of InFocus, Palo Alto High School's broadcast class, and its staff. The class adds each account; there is no public sign-up."
  },
  {
    question: "I can't sign in.",
    answer: "Use your school Google account, or Sign in with an email code using the email the class added. If you still can't sign in, ask the InFocus adviser or an executive producer."
  },
  {
    question: "I'm not getting notifications.",
    answer: "Allow notifications for InFocus Portal in your iPhone's Settings, then open the app's Settings and send a test notification. Notifications follow your Portal email settings."
  },
  {
    question: "How do I delete my account or data?",
    answer: "Accounts are managed by the class. Ask the InFocus adviser, or contact us below, and we'll delete your account. The app's Settings → Delete account explains the same steps."
  }
];

function toGroup(id: string, title: string, questions: Question[]): InfoGroup {
  return {
    id,
    title,
    entries: questions.map((item) => ({ title: item.question, body: <p>{item.answer}</p> }))
  };
}

/** Public support page for InFocus Portal and the InFocus apps (App Store "Support URL"). */
export default function SupportPage() {
  return (
    <MarketingPage active="support">
      <InfoPage
        header={
          <PageHeader
            eyebrow="Support"
            title="How can we help?"
            description="Help with the InFocus app, InFocus Portal, and InFocus for Mac, made by InFocus at Palo Alto High School."
            actions={
              <a href={CONTACT_URL} className={buttonVariants()}>
                Contact InFocus
              </a>
            }
          />
        }
        groups={[toGroup("app", "The InFocus app", newsApp), toGroup("portal", "InFocus Portal", portalApp)]}
        contact={{
          id: "contact",
          title: "Still need help?",
          icon: LifeBuoy,
          body: (
            <p>
              Reach InFocus through{" "}
              <a className={INLINE_LINK_CLASS} href={CONTACT_URL}>
                infocusnews.tv/contact-us
              </a>
              . We usually reply within a few school days. Read how we handle your information in our{" "}
              <Link className={INLINE_LINK_CLASS} href={"/privacy" as Route}>
                privacy policy
              </Link>
              .
            </p>
          )
        }}
      />
    </MarketingPage>
  );
}
