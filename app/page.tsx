import type { Metadata } from "next";
import { AppsRow, FeaturesStrip, HomeCloser, HomeHero } from "@/components/public-marketing/home-sections";
import { MarketingPage } from "@/components/public-marketing/marketing-page";

export const metadata: Metadata = {
  description:
    "InFocus is Palo Alto High School's student-run broadcast publication. InFocus Portal is our newsroom's production workspace."
};

/**
 * Public home page, one centered column: the hero (headline, one sentence, Open InFocus Portal and
 * Equipment, two text shortcuts), four one-line features, the apps, and a closing line.
 */
export default function HomePage() {
  return (
    <MarketingPage active="home">
      <div className="mx-auto flex max-w-[60rem] flex-col gap-16 pb-6 pt-10 md:gap-20 md:pt-20">
        <HomeHero />
        <FeaturesStrip />
        <AppsRow />
        <HomeCloser />
      </div>
    </MarketingPage>
  );
}
