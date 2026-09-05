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
      className="relative overflow-hidden bg-black pb-24 pt-[140px] text-white lg:pb-32 lg:pt-[200px]"
    >
      <div className="absolute inset-0">
        <Starfield count={520} mobileCount={180} seed={41} concentrate />
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 55%, rgba(124,92,255,0.11) 0%, rgba(124,92,255,0.03) 45%, rgba(0,0,0,0) 70%)",
        }}
      />

      <Container className="relative">
        <div className="mx-auto flex max-w-[760px] flex-col items-center text-center">
          <RevealText
            id="cta-heading"
            as="h2"
            lines={["Make time work for you."]}
            className="type-display"
          />
          <FadeIn delay={0.15}>
            <p className="type-body-lg mt-8 max-w-[560px] text-white/60">
              Join the next generation of students using Arcadia to organise school around
              their life.
            </p>
          </FadeIn>
          <FadeIn delay={0.25} className="mt-10 w-full max-w-[520px]">
            <WaitlistForm tone="dark" />
            <div className="mt-1 flex justify-center">
              <a
                href="#how-it-works"
                className="inline-flex h-11 items-center px-3 text-[15px] text-white/70 transition-colors duration-200 hover:text-white"
              >
                Learn more
              </a>
            </div>
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
