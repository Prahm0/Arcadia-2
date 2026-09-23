import Container from "./ui/Container";
import FadeIn from "./ui/FadeIn";
import RevealText from "./ui/RevealText";
import SectionLabel from "./ui/SectionLabel";

const TESTER_NOTES = [
  "I finally know what I am meant to study when I open it.",
  "It makes a packed week feel much less overwhelming.",
  "The focus timer actually gets me to start instead of putting it off.",
];

/**
 * Early feedback is intentionally anonymous until we have permission to use
 * individual tester names or exact attributions.
 */
export default function TesterNotesSection() {
  return (
    <section
      id="early-feedback"
      aria-labelledby="early-feedback-heading"
      className="section-seam relative overflow-hidden bg-night-800 py-[120px] text-white lg:py-[160px]"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(45% 48% at 12% 50%, rgba(124,92,255,0.16) 0%, rgba(124,92,255,0.03) 46%, transparent 74%), radial-gradient(38% 46% at 88% 30%, rgba(198,184,255,0.08) 0%, transparent 72%)",
        }}
      />

      <Container className="relative">
        <div className="grid grid-cols-12 gap-x-6 gap-y-10">
          <div className="col-span-12 lg:col-span-6">
            <FadeIn>
              <SectionLabel tone="dark">Early tester notes</SectionLabel>
            </FadeIn>
            <RevealText
              id="early-feedback-heading"
              as="h2"
              lines={["A plan students", "want to come back to."]}
              accent="come back"
              className="type-display mt-8"
              delay={0.1}
            />
          </div>
          <div className="col-span-12 lg:col-span-5 lg:col-start-8 lg:self-end">
            <FadeIn delay={0.2}>
              <p className="type-body-lg max-w-[440px] text-white/60">
                A few reactions from students testing Arcadia through real study weeks.
              </p>
            </FadeIn>
          </div>
        </div>

        <div className="mt-12 grid gap-4 md:grid-cols-3 lg:mt-16 lg:gap-5">
          {TESTER_NOTES.map((note, index) => (
            <FadeIn key={note} delay={0.12 + index * 0.08} className="h-full">
              <article className="flex h-full flex-col rounded-2xl border border-white/10 bg-white/[0.035] p-6 sm:p-7">
                <div className="flex gap-1 text-accent-200" aria-label="5 out of 5 stars">
                  {Array.from({ length: 5 }, (_, star) => (
                    <Star key={star} />
                  ))}
                </div>
                <blockquote className="mt-8 flex-1 font-serif text-[26px] leading-[1.16] tracking-[-0.025em] text-white sm:text-[30px]">
                  &ldquo;{note}&rdquo;
                </blockquote>
                <footer className="mt-10 border-t border-white/10 pt-4">
                  <p className="type-mono-label text-white/45">Early tester</p>
                </footer>
              </article>
            </FadeIn>
          ))}
        </div>
      </Container>
    </section>
  );
}

function Star() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 fill-current">
      <path d="m10 1.8 2.3 4.67 5.16.75-3.73 3.64.88 5.14L10 13.58 5.39 16l.88-5.14-3.73-3.64 5.16-.75L10 1.8Z" />
    </svg>
  );
}
