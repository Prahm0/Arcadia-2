import Link from "next/link";
import Container from "./ui/Container";

interface LegalPageProps {
  title: string;
  updated: string;
  children: React.ReactNode;
}

export default function LegalPage({ title, updated, children }: LegalPageProps) {
  return (
    <>
      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/[0.08] bg-black/65 backdrop-blur-xl">
        <Container className="flex h-[72px] items-center justify-between lg:h-20">
          <Link href="/" className="text-[17px] font-medium tracking-[-0.02em] text-white">
            Arcadia
          </Link>
          <Link href="/" className="text-[14px] text-white/65 transition-colors hover:text-white">
            Back to site
          </Link>
        </Container>
      </header>
      <main className="min-h-[100svh] bg-black pb-32 pt-[160px] text-white">
        <Container>
          <p className="type-eyebrow text-white/50">Last updated {updated}</p>
          <h1 className="type-display mt-6">{title}</h1>
          <div className="type-body-lg mt-12 flex max-w-[680px] flex-col gap-6 text-white/70 [&_a]:text-white [&_a]:underline [&_a]:underline-offset-4">
            {children}
          </div>
        </Container>
      </main>
    </>
  );
}
