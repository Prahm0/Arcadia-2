import Starfield from "./Starfield";
import WaitlistForm from "./WaitlistForm";
import Container from "./ui/Container";
import FadeIn from "./ui/FadeIn";
import RevealText from "./ui/RevealText";

export default function FinalCTA() {
  return (
    <section
      id="early-access"
      aria-labelledby="cta-heading"
      className="section-seam relative overflow-hidden bg-night-900 pb-20 pt-[140px] text-white lg:pb-28 lg:pt-[200px]"
    >
      <div className="absolute inset-0">
        <Starfield count={520} mobileCount={180} seed={41} concentrate />
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 55%, rgba(124,92,255,0.12) 0%, rgba(124,92,255,0.03) 45%, rgba(0,0,0,0) 70%)",
        }}
      />

      <Container className="relative">
        <span id="about" className="absolute -top-24" aria-hidden="true" />
        <div className="mx-auto flex max-w-[860px] flex-col items-center text-center">
          <RevealText
            id="cta-heading"
            as="h2"
            lines={["Stop planning your study.", "Start following the plan."]}
            accent="following"
            className="type-display"
            stagger={0.14}
          />
          <FadeIn delay={0.15}>
            <p className="type-body-lg mt-8 max-w-[560px] text-white/60">
              Arcadia is opening to a first group of students. Put your name down and we’ll
              email you when your invite is ready.
            </p>
          </FadeIn>
          <FadeIn delay={0.25} className="mt-10 w-full max-w-[520px]">
            <WaitlistForm tone="dark" />
            <p className="type-mono-label mt-2 text-center text-white/40">
              Early access · opening soon · Australia first
            </p>
          </FadeIn>
        </div>

        <FadeIn delay={0.2} duration={1.2} y={0} className="mt-24 lg:mt-32">
          <p
            aria-hidden="true"
            className="select-none text-center font-medium leading-none tracking-[-0.05em] text-white/[0.06]"
            style={{ fontSize: "clamp(96px, 20vw, 300px)" }}
          >
            Arcadia
          </p>
        </FadeIn>
      </Container>
    </section>
  );
}
