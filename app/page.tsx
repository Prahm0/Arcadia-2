import ArcadiaInput from "@/components/ArcadiaInput";
import BrandStatement from "@/components/BrandStatement";
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

export default function Home() {
  return (
    <EarlyAccessProvider>
      <Navbar />
      <main>
        <Hero />
        <ProblemSection />
        <ThinkingSection />
        <TodayDemo />
        <LazyMount minHeight="100svh" className="bg-black">
          <ScheduleDemo />
        </LazyMount>
        <ArcadiaInput />
        <LazyMount minHeight="340vh" className="bg-black">
          <ConnectionsSection />
        </LazyMount>
        <MentorSection />
        <BrandStatement />
        <FinalCTA />
      </main>
      <Footer />
    </EarlyAccessProvider>
  );
}
