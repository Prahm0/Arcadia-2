import Link from "next/link";
import LiveNow from "./LiveNow";
import Container from "./ui/Container";

const links = [
  { label: "Product", href: "#today" },
  { label: "How it works", href: "#how-it-works" },
  { label: "About", href: "#about" },
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
  { label: "Contact", href: "mailto:hello@arcadia.study" },
];

export default function Footer() {
  return (
    <footer className="section-seam bg-night-900 text-white">
      <Container className="flex flex-col gap-6 py-10 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-5">
          <Link href="#top" className="font-serif text-[22px] italic leading-none tracking-[-0.01em]">
            Arcadia
          </Link>
          <LiveNow className="text-white/45" dot={false} />
        </div>
        <nav aria-label="Footer">
          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            {links.map((l) => (
              <li key={l.label}>
                <a
                  href={l.href}
                  className="type-mono-label text-white/55 transition-colors duration-200 hover:text-white"
                >
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <p className="type-mono-label text-white/45">© {new Date().getFullYear()} Arcadia</p>
      </Container>
    </footer>
  );
}
