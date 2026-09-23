import Link from "next/link";
import { ArrowRight, Lock, ShieldCheck, UserCheck } from "lucide-react";
import { MarketingHeader } from "@/components/marketing-header";

const points = [
  {
    icon: Lock,
    title: "Private media access",
    description: "Media stays behind authenticated access or controlled guest links."
  },
  {
    icon: UserCheck,
    title: "Role-based controls",
    description: "Workspace roles restrict who can upload, manage, or review content."
  },
  {
    icon: ShieldCheck,
    title: "Traceable decisions",
    description: "Status changes and review events stay visible for auditability."
  }
];

export default function SecurityPage() {
  return (
    <>
      <MarketingHeader active="security" />
      <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 md:py-10">

      <section className="rounded-3xl border border-border bg-card p-7 md:p-10">
        <h1 className="text-4xl font-semibold text-foreground md:text-5xl">Security and control by design</h1>
        <p className="mt-3 max-w-3xl text-muted-foreground">
          InFocus Portal helps protect your content with scoped access, guest controls, and reliable review history.
        </p>
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-3">
        {points.map((point) => {
          const Icon = point.icon;

          return (
            <article key={point.title} className="rounded-2xl border border-border bg-card p-5">
              <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-muted text-foreground">
                <Icon className="h-4 w-4" />
              </div>
              <h2 className="text-lg font-semibold text-foreground">{point.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{point.description}</p>
            </article>
          );
        })}
      </section>

      <section className="mt-8 rounded-2xl border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">
          For production rollouts, make sure your Google OAuth redirect URLs and allowlisted user emails are configured
          for your active domain before opening guest links broadly.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/dashboard" className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 font-semibold text-primary-foreground">
            Go to Dashboard
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
      </main>
    </>
  );
}
