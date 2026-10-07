import type { Metadata } from "next";
import ArcadiaInput from "@/components/ArcadiaInput";
import FinalCTA from "@/components/FinalCTA";
import Footer from "@/components/Footer";
import Hero from "@/components/Hero";
import Navbar from "@/components/Navbar";
import PricingSection from "@/components/PricingSection";
import ProblemSection from "@/components/ProblemSection";
import ProductTour from "@/components/ProductTour";
import ScheduleDemo from "@/components/ScheduleDemo";
import ThinkingSection from "@/components/ThinkingSection";
import TesterNotesSection from "@/components/TesterNotesSection";
import TodayDemo from "@/components/TodayDemo";
import LazyMount from "@/components/ui/LazyMount";

const landingDescription =
  "Arcadia is a study planner for high school students that rebuilds your weekly plan when sport, work, classes or deadlines change.";

export const metadata: Metadata = {
  title: {
    absolute: "Study planner that adapts when life changes | Arcadia",
  },
  description: landingDescription,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Your study plan survives real life.",
    description: landingDescription,
    url: "/",
  },
  twitter: {
    title: "Your study plan survives real life.",
    description: landingDescription,
  },
};

const softwareApplicationSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Arcadia",
  applicationCategory: "EducationalApplication",
  operatingSystem: "Web",
  url: "https://arcadiahq.app/",
  description: landingDescription,
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "AUD",
    availability: "https://schema.org/InStock",
  },
};

/**
 * One week, top to bottom. The background follows the hours of the day:
 * night → dusk → dawn → noon → night.
 */
export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(softwareApplicationSchema),
        }}
      />
      <Navbar />
      <main>
        <Hero />
        <ProblemSection />
        <LazyMount minHeight="100svh" className="bg-dusk">
          <ScheduleDemo />
        </LazyMount>
        <ThinkingSection />
        <TodayDemo />
        <ArcadiaInput />
        <ProductTour />
        <TesterNotesSection />
        <PricingSection />
        <FinalCTA />
      </main>
      <Footer />
    </>
  );
}
