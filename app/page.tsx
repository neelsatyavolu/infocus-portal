import type { Metadata } from "next";
import { AboutSection, GetAroundSection, HomeHero, NewsroomSection } from "@/components/public-marketing/home-sections";
import { MarketingPage } from "@/components/public-marketing/marketing-page";

export const metadata: Metadata = {
  description:
    "InFocus is Palo Alto High School's student-run broadcast publication. InFocus Portal is our newsroom's production workspace."
};

/**
 * Public home page, one column: the nameplate with "Open InFocus Portal" and Equipment, then three
 * plain sections split by hairlines: Get around (Master Calendar, announcements, the apps), What
 * Portal does, and About. No cards or icon tiles.
 */
export default function HomePage() {
  return (
    <MarketingPage active="home">
      <div className="space-y-10 md:space-y-12">
        <HomeHero />
        <GetAroundSection />
        <NewsroomSection />
        <AboutSection />
      </div>
    </MarketingPage>
  );
}
