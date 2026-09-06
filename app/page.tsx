import ArcadiaInput from "@/components/ArcadiaInput";
import ConnectionsSection from "@/components/ConnectionsSection";
import EarlyAccessProvider from "@/components/EarlyAccessProvider";
import FinalCTA from "@/components/FinalCTA";
import Footer from "@/components/Footer";
import Hero from "@/components/Hero";
import MentorSection from "@/components/MentorSection";
import Navbar from "@/components/Navbar";
import ProblemSection from "@/components/ProblemSection";
import ScheduleDemo from "@/components/ScheduleDemo";
import ThinkingSection from "@/components/ThinkingSection";
import TodayDemo from "@/components/TodayDemo";
import LazyMount from "@/components/ui/LazyMount";

/**
 * One week, top to bottom. The background follows the hours of the day:
 * night → dawn → noon → evening lamp light → dusk → night.
 */
export default function Home() {
  return (
    <EarlyAccessProvider>
      <Navbar />
      <main>
        <Hero />
        <ProblemSection />
        <ThinkingSection />
        <TodayDemo />
        <ArcadiaInput />
        <MentorSection />
        <LazyMount minHeight="100svh" className="bg-dusk">
          <ScheduleDemo />
        </LazyMount>
        <LazyMount minHeight="260vh" className="bg-dusk">
          <ConnectionsSection />
        </LazyMount>
        <FinalCTA />
      </main>
      <Footer />
    </EarlyAccessProvider>
  );
}
