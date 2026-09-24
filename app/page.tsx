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

/**
 * One week, top to bottom. The background follows the hours of the day:
 * night → dusk → dawn → noon → night.
 */
export default function Home() {
  return (
    <>
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
