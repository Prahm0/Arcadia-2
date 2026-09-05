import Starfield from "./Starfield";
import RevealText from "./ui/RevealText";
import Container from "./ui/Container";

export default function BrandStatement() {
  return (
    <section
      id="about"
      aria-label="Arcadia's promise"
      className="relative flex min-h-[80vh] items-center overflow-hidden bg-black py-32 text-white"
    >
      <div className="absolute inset-0">
        <Starfield count={220} mobileCount={80} seed={23} intensity={0.85} />
      </div>
      <Container className="relative">
        <RevealText
          as="p"
          lines={["Stop planning your study.", "Start following the plan."]}
          className="type-display mx-auto max-w-[1000px] text-center"
          stagger={0.14}
        />
      </Container>
    </section>
  );
}
