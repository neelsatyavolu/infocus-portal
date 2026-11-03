import type { Metadata } from "next";
import { AppsRow, FeaturesStrip, HomeCloser, HomeHero } from "@/components/public-marketing/home-sections";
import { MarketingPage } from "@/components/public-marketing/marketing-page";

export const metadata: Metadata = {
  description:
    "InFocus is Palo Alto High School's student-run broadcast publication. InFocus Portal is our newsroom's production workspace."
};

/**
 * Public home page, left-aligned on the page column: the hero (headline, what the Portal does,
 * Open InFocus Portal and Submit an announcement, a line of facts, a still of the review screen),
 * then three numbered sections: what's inside, the apps, and the open-source code.
 */
export default function HomePage() {
  return (
    <MarketingPage active="home">
      <HomeHero />
      <FeaturesStrip />
      <AppsRow />
      <HomeCloser />
    </MarketingPage>
  );
}
