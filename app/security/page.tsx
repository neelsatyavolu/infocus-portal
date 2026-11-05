import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Lock, ShieldCheck, UserCheck } from "lucide-react";
import { InlineNote } from "@/components/kit/alert";
import { IconTile } from "@/components/kit/avatar";
import { Panel } from "@/components/kit/panel";
import { PageHeader } from "@/components/page-header";
import { MarketingPage } from "@/components/public-marketing/marketing-page";
import { buttonVariants } from "@/components/ui/button";

const points = [
  {
    icon: Lock,
    title: "Private media access",
    description: "Media needs a Portal sign-in or a guest link you control."
  },
  {
    icon: UserCheck,
    title: "Role-based controls",
    description: "Workspace roles decide who can upload, manage, or review media."
  },
  {
    icon: ShieldCheck,
    title: "Traceable decisions",
    description: "Status changes and review decisions stay on record."
  }
];

export const metadata: Metadata = { title: "Security" };

export default function SecurityPage() {
  return (
    <MarketingPage active="security">
      <div className="space-y-6">
        <PageHeader
          eyebrow="Security"
          title="Security and access"
          description="InFocus Portal limits who can see your media, lets you control guest links, and keeps a record of reviews."
          actions={
            <Link href="/dashboard" className={buttonVariants()}>
              Go to Dashboard
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          }
        />

        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            {points.map((point) => (
              <Panel key={point.title} as="article">
                <IconTile icon={point.icon} tone="brand" size={36} />
                <h2 className="mt-3 text-lg font-semibold leading-snug text-foreground">{point.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{point.description}</p>
              </Panel>
            ))}
          </div>

          {/* A setup reminder rather than a feature, so a quiet note under the cards. */}
          <InlineNote>
            Before you share guest links widely, set the Google OAuth redirect URLs and allowed user emails for your
            live domain.
          </InlineNote>
        </div>
      </div>
    </MarketingPage>
  );
}
