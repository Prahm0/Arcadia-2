import Container from "./ui/Container";
import FadeIn from "./ui/FadeIn";
import RevealText from "./ui/RevealText";
import SectionLabel from "./ui/SectionLabel";
import ArcadiaMark from "./ui/ArcadiaMark";
import styles from "./TesterNotesSection.module.css";

const TESTER_NOTES = [
  {
    quote: "I finally know what I am meant to study when I open it.",
    context: "Finding direction",
  },
  {
    quote: "It makes a packed week feel much less overwhelming.",
    context: "Making room to think",
  },
  {
    quote: "The focus timer actually gets me to start instead of putting it off.",
    context: "Getting started",
  },
];

/**
 * Early feedback stays anonymous until testers have given permission for
 * individual names or exact attributions. No ratings or identities are implied.
 */
export default function TesterNotesSection() {
  return (
    <section
      id="early-feedback"
      aria-labelledby="early-feedback-heading"
      className="section-seam relative overflow-hidden bg-night-800 py-[120px] text-white lg:py-[160px]"
    >
      <div aria-hidden="true" className={styles.ambient} />

      <Container className="relative">
        <div className="grid grid-cols-12 gap-x-6 gap-y-10">
          <div className="col-span-12 lg:col-span-7">
            <FadeIn>
              <SectionLabel tone="dark" dot>Early feedback</SectionLabel>
            </FadeIn>
            <RevealText
              id="early-feedback-heading"
              as="h2"
              lines={["The difference is", "how a week feels."]}
              accent="feels."
              className="type-display mt-8"
              delay={0.1}
            />
          </div>
          <div className="col-span-12 lg:col-span-4 lg:col-start-9 lg:self-end">
            <FadeIn delay={0.2}>
              <p className="type-body-lg max-w-[420px] text-white/60">
                A few honest reactions from students using Arcadia through real study weeks.
              </p>
            </FadeIn>
          </div>
        </div>

        <FadeIn delay={0.16} className="mt-14 lg:mt-20">
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/15 pt-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent-200">In their words</p>
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-white/40">Three notes from early testing</p>
          </div>
        </FadeIn>

        <div className="mt-5 grid gap-4 lg:grid-cols-12 lg:gap-5">
          <FadeIn className="lg:col-span-7" delay={0.2} y={34} amount={0.12}>
            <ReviewCard index={0} featured />
          </FadeIn>
          <div className="grid gap-4 sm:grid-cols-2 lg:col-span-5 lg:grid-cols-1 lg:gap-5">
            <FadeIn delay={0.28} y={34} amount={0.12} className="h-full">
              <ReviewCard index={1} />
            </FadeIn>
            <FadeIn delay={0.36} y={34} amount={0.12} className="h-full">
              <ReviewCard index={2} />
            </FadeIn>
          </div>
        </div>

        <FadeIn delay={0.3} className="mt-7 flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="h-px w-7 bg-accent-200/60" aria-hidden="true" />
          <p className="text-[13px] leading-5 text-white/45">
            Shared anonymously by early testers.
          </p>
        </FadeIn>
      </Container>
    </section>
  );
}

function ReviewCard({ index, featured = false }: { index: number; featured?: boolean }) {
  const note = TESTER_NOTES[index];

  return (
    <article className={`${styles.reviewCard} ${featured ? styles.featured : styles.supporting}`}>
      {featured ? <div aria-hidden="true" className={styles.orbit} /> : null}
      <div className="relative z-10 flex items-center justify-between gap-3">
        <p className="text-[13px] font-medium tracking-[0.01em] text-accent-200/90">
          <span className="mr-3 font-mono text-[11px] tracking-[0.04em] text-white/40">0{index + 1}</span>
          {note.context}
        </p>
        <QuoteMark />
      </div>

      <blockquote
        className={`relative z-10 max-w-[660px] font-serif tracking-[-0.025em] text-white ${
          featured
            ? "mt-12 text-[clamp(32px,4.4vw,58px)] leading-[1.11] lg:mt-auto"
            : "mt-8 text-[clamp(25px,2.6vw,34px)] leading-[1.17]"
        }`}
      >
        &ldquo;{note.quote}&rdquo;
      </blockquote>

      <div className="relative z-10 mt-10 flex items-center gap-3 border-t border-white/15 pt-4">
        <span className={styles.avatar} aria-hidden="true"><ArcadiaMark size={15} /></span>
        <div>
          <p className="text-[13px] font-medium leading-none text-white/90">Early tester</p>
          <p className="mt-1 text-[12px] leading-4 text-white/45">Arcadia early access</p>
        </div>
      </div>
    </article>
  );
}

function QuoteMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" className="h-7 w-7 shrink-0 fill-accent-200/55">
      <path d="M5 16.7C5 10.8 8.6 6.5 14.3 5l1 2.5c-3.2 1.3-5 3.2-5.5 6.6h5.8v12H5v-9.4Zm14 0c0-5.9 3.6-10.2 9.3-11.7l1 2.5c-3.2 1.3-5 3.2-5.5 6.6h5.8v12H19v-9.4Z" />
    </svg>
  );
}
