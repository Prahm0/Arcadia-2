import RevealText from "./ui/RevealText";
import FadeIn from "./ui/FadeIn";
import SectionLabel from "./ui/SectionLabel";
import Container from "./ui/Container";

export default function ProblemSection() {
  return (
    <section
      id="problem"
      aria-labelledby="problem-heading"
      className="bg-white py-[120px] text-black lg:py-[180px]"
    >
      <Container>
        <div className="grid grid-cols-12 gap-x-6">
          <div className="col-span-12 lg:col-span-10">
            <FadeIn>
              <SectionLabel tone="light">The problem</SectionLabel>
            </FadeIn>
            <RevealText
              id="problem-heading"
              as="h2"
              lines={["School doesn’t happen", "in a vacuum."]}
              className="type-display mt-8 text-black"
              delay={0.1}
            />
          </div>

          <div className="col-span-12 mt-16 sm:col-span-10 sm:col-start-2 lg:col-span-6 lg:col-start-6 lg:mt-24">
            <FadeIn delay={0.1}>
              <p className="type-body-lg max-w-[620px] text-black/60">
                Your timetable changes. Assignments appear. Training runs late. Plans get
                cancelled. Traditional study planners expect you to reorganise everything
                yourself.
              </p>
            </FadeIn>
          </div>

          <div className="col-span-12 mt-28 lg:mt-44">
            <FadeIn delay={0.05} y={28} duration={0.9}>
              <div className="h-px w-16 bg-black/15" aria-hidden="true" />
            </FadeIn>
            <RevealText
              as="p"
              lines={["Arcadia reorganises", "with you."]}
              className="type-display mt-10 text-black"
              delay={0.15}
            />
          </div>
        </div>
      </Container>
    </section>
  );
}
