import Starfield from "./Starfield";
import { PlatformChoice } from "./PlatformLinks";
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
            lines={["When the week moves,", "you still know what to do."]}
            accent="know"
            className="type-display"
            stagger={0.14}
          />
          <FadeIn delay={0.15}>
            <p className="type-body-lg mt-8 max-w-[560px] text-white/60">
              Start with your subjects, deadlines and commitments. Arcadia turns them into a
              study plan that can adjust when your week does.
            </p>
          </FadeIn>
          <FadeIn delay={0.25} className="mt-10 flex w-full max-w-[560px] flex-col items-center gap-4">
            <PlatformChoice />
            <a
              href="/login"
              className="text-[14.5px] font-medium text-white/70 transition-colors duration-200 hover:text-white"
            >
              Already have an account? Sign in
            </a>
          </FadeIn>
          <FadeIn delay={0.35}>
            <p className="type-mono-label mt-4 text-center text-white/40">
              Australia first · Pro from $0.95 AUD / week · Cancel any time
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
