import Link from "next/link";
import Container from "./ui/Container";

const links = [
  { label: "Product", href: "#today" },
  { label: "About", href: "#about" },
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
  { label: "Contact", href: "mailto:hello@arcadia.study" },
];

export default function Footer() {
  return (
    <footer className="border-t border-white/[0.08] bg-black text-white">
      <Container className="flex flex-col gap-6 py-10 sm:flex-row sm:items-center sm:justify-between">
        <Link href="#top" className="text-[15px] font-medium tracking-[-0.01em]">
          Arcadia
        </Link>
        <nav aria-label="Footer">
          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            {links.map((l) => (
              <li key={l.label}>
                <a href={l.href} className="text-[13px] text-white/55 transition-colors duration-200 hover:text-white">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <p className="text-[13px] text-white/50">© {new Date().getFullYear()} Arcadia</p>
      </Container>
    </footer>
  );
}
