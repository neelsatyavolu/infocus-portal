import type { Metadata } from "next";
import { MarketingHeader } from "@/components/marketing-header";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "How InFocus Portal and the InFocus apps handle your information."
};

const UPDATED = "October 2, 2026";

type Section = { title: string; points: string[] };

const portal: Section[] = [
  {
    title: "Who can use it",
    points: [
      "InFocus Portal (on the web, InFocus for Mac and the InFocus Portal iPhone app) is for members of InFocus, Palo Alto High School's student broadcast class, and the staff who run it.",
      "Only accounts the class adds can sign in. You sign in with your school Google account or a one-time email code."
    ]
  },
  {
    title: "What we keep",
    points: [
      "Your name, school email, profile photo from Google, an optional nickname, and your class roles.",
      "Class work you add: package topics, uploads (videos, images, documents), comments, approvals, check-ins, grades, extension requests, livestream and equipment records, messages and announcements.",
      "Notification settings, and an Apple push token for each Mac or iPhone where you allow notifications. Signing out of an app removes its token."
    ]
  },
  {
    title: "How it's used",
    points: [
      "To run the class: review and grade work, schedule shows, send the notifications and emails you'd expect from Portal.",
      "Never for advertising, and never sold or shared with data brokers."
    ]
  },
  {
    title: "Services that process it",
    points: [
      "Hosting and database: Vercel and Supabase. Uploaded media: the InFocus Drive server run by the class. Backups: Cloudflare R2.",
      "Email: Resend. Notifications: Apple Push Notification service and your browser's push service.",
      "AI features (the Portal assistant and script formatting) send the text you ask about to Google Gemini or Groq to produce a reply.",
      "Finished packages and shows are published to the InFocus YouTube channel by the class.",
      "Each of these services processes the data only to provide its service to InFocus, under privacy and security terms that protect it at least as well as this policy does."
    ]
  },
  {
    title: "How long we keep it",
    points: [
      "Your account and class work stay while you're in the class and for the school year's records. When the adviser deletes an account, its profile, devices and personal settings are deleted. Work shared with a group, such as comments on a package, stays with the group without the account attached.",
      "Backups are kept for 7 days, so deleted information is gone from backups within a week.",
      "Push tokens are deleted when you sign out of an app, or when Apple reports that the device no longer accepts notifications."
    ]
  },
  {
    title: "Your choices",
    points: [
      "Turn app notifications off at any time in your device's Settings, or turn off email categories in Portal Settings.",
      "Sign out of an app to stop its notifications and remove its token.",
      "Ask the InFocus adviser to correct your information or delete your account (see \"Questions or deletion\" below). The iPhone app's Settings also has Delete account, which explains how."
    ]
  }
];

const publicApp: Section[] = [
  {
    title: "No account",
    points: [
      "The InFocus app (App Store name \"InFocus News\") shows public InFocus shows, stories and livestreams. It has no sign-in and no ads, and it doesn't track you."
    ]
  },
  {
    title: "What it sends",
    points: [
      "If you turn on alerts, the app sends its Apple push token and which alerts you chose (new shows, new stories, going live). Turning every alert off deletes them.",
      "If you submit an announcement, we receive the name, email, announcement and dates you enter, so the class can review it and contact you.",
      "Saved stories and settings stay on your iPhone."
    ]
  },
  {
    title: "Other services",
    points: [
      "Videos play from YouTube, and stories load from infocusnews.tv. Those services handle your visit under their own privacy policies."
    ]
  },
  {
    title: "How long we keep it, and your choices",
    points: [
      "Alert choices and the push token are kept until you turn every alert off (which deletes them right away), or until Apple reports the device no longer accepts notifications.",
      "Announcement submissions are kept while InFocus plans the shows they run on. To withdraw one or have it deleted, contact InFocus (below).",
      "Hosting and email for these features are the same services listed for Portal above, with the same protections. Backups are kept for 7 days."
    ]
  }
];

function Sections({ sections }: { sections: Section[] }) {
  return (
    <div className="mt-4 grid gap-4">
      {sections.map((section) => (
        <article key={section.title} className="rounded-md border border-border bg-card p-5">
          <h3 className="text-lg font-semibold text-foreground">{section.title}</h3>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
            {section.points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </article>
      ))}
    </div>
  );
}

/** Public privacy policy for InFocus Portal and the InFocus iPhone apps (App Store listing link). */
export default function PrivacyPage() {
  return (
    <>
      <MarketingHeader />
      <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 md:py-10">
        <section className="border-b-4 border-[var(--brand-green)] bg-card p-6 md:p-8">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--brand-green)]">Privacy</p>
          <h1 className="mt-2 text-3xl font-semibold text-foreground md:text-4xl">Privacy policy</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            InFocus Portal and the InFocus apps, made by InFocus at Palo Alto High School. Updated {UPDATED}.
          </p>
        </section>

        <section className="mt-8">
          <h2 className="text-2xl font-semibold text-foreground">InFocus Portal</h2>
          <Sections sections={portal} />
        </section>

        <section className="mt-10">
          <h2 className="text-2xl font-semibold text-foreground">The InFocus app</h2>
          <Sections sections={publicApp} />
        </section>

        <section className="mt-10 rounded-md border border-border bg-card p-5 text-sm text-muted-foreground">
          <h2 className="text-lg font-semibold text-foreground">Questions or deletion</h2>
          <p className="mt-2">
            Class members can ask the InFocus adviser to correct or delete their information. Anyone can reach InFocus
            through{" "}
            <a className="font-medium text-[var(--brand-green)] underline-offset-2 hover:underline" href="https://infocusnews.tv/contact-us/">
              infocusnews.tv/contact-us
            </a>
            . Website analytics are cookieless page counts with no names or IP addresses.
          </p>
        </section>
      </main>
    </>
  );
}
