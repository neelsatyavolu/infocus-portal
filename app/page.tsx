import type { Metadata } from "next";
import { AboutSection, AppsCard, HomeHero, NewsroomSection, QuickLinksCard } from "@/components/public-marketing/home-sections";
import { MarketingPage } from "@/components/public-marketing/marketing-page";

export const metadata: Metadata = {
  description:
    "InFocus is Palo Alto High School's student-run broadcast publication. InFocus Portal is our newsroom's production workspace."
};

/**
 * Public home page. In order: the nameplate with "Open InFocus Portal" (class members) and
 * Equipment, Quick links (Master Calendar, announcements) and Get the apps beside it, then the
 * newsroom overview and About. On phones the same blocks stack in that order. From lg the hero and the
 * cards split the row in half: the two columns end within a few pixels of each other, and the
 * split lines up with the two-by-two pillar cards below.
 */
export default function HomePage() {
  return (
    <MarketingPage active="home">
      <div className="space-y-10 md:space-y-12">
        <div className="grid items-stretch gap-4 lg:grid-cols-2">
          <HomeHero />
          <div className="flex min-w-0 flex-col gap-4">
            <QuickLinksCard />
            <AppsCard className="flex-1" />
          </div>
        </div>
        <NewsroomSection />
        <AboutSection />
      </div>
    </MarketingPage>
  );
}
