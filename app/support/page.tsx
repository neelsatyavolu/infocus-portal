import type { Metadata } from "next";
import Link from "next/link";
import { MarketingHeader } from "@/components/marketing-header";

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

function Questions({ items }: { items: Question[] }) {
  return (
    <div className="mt-4 grid gap-4">
      {items.map((item) => (
        <article key={item.question} className="rounded-md border border-border bg-card p-5">
          <h3 className="text-base font-semibold text-foreground">{item.question}</h3>
          <p className="mt-1.5 text-sm text-muted-foreground">{item.answer}</p>
        </article>
      ))}
    </div>
  );
}

/** Public support page for InFocus Portal and the InFocus apps (App Store "Support URL"). */
export default function SupportPage() {
  return (
    <>
      <MarketingHeader />
      <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 md:py-10">
        <section className="border-b-4 border-[var(--brand-green)] bg-card p-6 md:p-8">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--brand-green)]">Support</p>
          <h1 className="mt-2 text-3xl font-semibold text-foreground md:text-4xl">How can we help?</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Help with the InFocus app, InFocus Portal, and InFocus for Mac, made by InFocus at Palo Alto High School.
          </p>
          <a
            href={CONTACT_URL}
            className="mt-5 inline-flex min-h-10 items-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
          >
            Contact InFocus
          </a>
        </section>

        <section className="mt-8">
          <h2 className="text-2xl font-semibold text-foreground">The InFocus app</h2>
          <Questions items={newsApp} />
        </section>

        <section className="mt-10">
          <h2 className="text-2xl font-semibold text-foreground">InFocus Portal</h2>
          <Questions items={portalApp} />
        </section>

        <section className="mt-10 rounded-md border border-border bg-card p-5 text-sm text-muted-foreground">
          <h2 className="text-lg font-semibold text-foreground">Still need help?</h2>
          <p className="mt-2">
            Reach InFocus through{" "}
            <a className="font-medium text-[var(--brand-green)] underline-offset-2 hover:underline" href={CONTACT_URL}>
              infocusnews.tv/contact-us
            </a>
            . We usually reply within a few school days. Read how we handle your information in our{" "}
            <Link className="font-medium text-[var(--brand-green)] underline-offset-2 hover:underline" href={"/privacy" as never}>
              privacy policy
            </Link>
            .
          </p>
        </section>
      </main>
    </>
  );
}
