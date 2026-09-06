import RealLifeMarquee from "./RealLifeMarquee";
import RevealText from "./ui/RevealText";
import FadeIn from "./ui/FadeIn";
import SectionLabel from "./ui/SectionLabel";
import Container from "./ui/Container";

export default function ProblemSection() {
  return (
    <section
      id="problem"
      aria-labelledby="problem-heading"
      className="section-seam relative overflow-hidden bg-night-800 py-[120px] text-white lg:py-[170px]"
    >
      <Container>
        <div className="grid grid-cols-12 gap-x-6">
          <div className="col-span-12 lg:col-span-9">
            <FadeIn>
              <SectionLabel>Real life</SectionLabel>
            </FadeIn>
            <RevealText
              id="problem-heading"
              as="h2"
              lines={["School doesn’t happen", "in a vacuum."]}
              accent="vacuum."
              className="type-display mt-8 text-white"
              delay={0.1}
            />
          </div>
          <div className="col-span-12 mt-10 sm:col-span-8 sm:col-start-5 lg:col-span-5 lg:col-start-8 lg:mt-0 lg:self-end">
            <FadeIn delay={0.15}>
              <p className="type-body-lg max-w-[480px] text-white/60">
                Your timetable is the only part of your week that stays put. Everything else
                moves. And somewhere under all of it, there’s a Methods test on Friday.
              </p>
            </FadeIn>
          </div>
        </div>
      </Container>

      <FadeIn delay={0.1} y={0} duration={1.2} className="mt-20 lg:mt-28">
        <RealLifeMarquee />
      </FadeIn>

      <Container>
        <div className="mt-24 grid grid-cols-12 gap-x-6 lg:mt-36">
          <div className="col-span-12 lg:col-span-6">
            <FadeIn delay={0.05} y={28} duration={0.9}>
              <p className="type-body-lg max-w-[520px] text-white/60">
                A normal planner expects you to fix all of this yourself. Every single night.
              </p>
            </FadeIn>
          </div>
          <div className="col-span-12 mt-10 lg:col-span-6 lg:mt-0">
            <RevealText
              as="p"
              lines={["Arcadia reorganises", "with you."]}
              accent="reorganises"
              className="type-display text-white"
              delay={0.15}
            />
          </div>
        </div>
      </Container>
    </section>
  );
}
