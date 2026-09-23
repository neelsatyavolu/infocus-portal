import { Megaphone } from "lucide-react";
import { AnnouncementSubmitForm } from "@/components/announcement-submit-form";

export default function SubmitAnnouncementPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 md:py-10">
        <section className="relative overflow-hidden rounded-3xl border border-border bg-card p-6 md:p-8">
          <div className="pointer-events-none absolute inset-0 brand-hero-gradient opacity-40" />
          <div className="relative">
            <div className="eyebrow flex items-center gap-2">
              <Megaphone className="h-3 w-3" />
              InFocus · Schoology
            </div>
            <h1 className="display-md mt-2 text-foreground">Submit an announcement</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Anyone can send a request for InFocus and the Friday Schoology update. InFocus members review every
              submission before it airs.
            </p>
          </div>
        </section>

        <section className="mt-5 rounded-3xl border border-border bg-card p-6 md:p-8">
          <AnnouncementSubmitForm />
        </section>
    </main>
  );
}
