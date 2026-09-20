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
      {/* These pages live under the (app) route group, so they follow the
          product's palette and typewriter type rather than the landing's. */}
      <header
        className="fixed inset-x-0 top-0 z-50"
        style={{
          background: "var(--app-bg)",
          borderBottom: "1px solid var(--app-border)",
        }}
      >
        <Container className="flex h-[72px] items-center justify-between lg:h-20">
          <Link
            href="/"
            className="text-[17px] font-medium tracking-[-0.02em]"
            style={{ color: "var(--app-text)" }}
          >
            Arcadia
          </Link>
          <Link
            href="/"
            className="text-[14px] transition-colors"
            style={{ color: "var(--app-text-muted)" }}
          >
            Back to site
          </Link>
        </Container>
      </header>
      <main
        className="min-h-[100svh] pb-32 pt-[160px]"
        style={{ background: "var(--app-bg)", color: "var(--app-text)" }}
      >
        <Container>
          <p className="type-eyebrow" style={{ color: "var(--app-text-muted)" }}>
            Last updated {updated}
          </p>
          <h1 className="mt-6 text-[34px] leading-[1.1] tracking-[-0.02em] sm:text-[42px]">
            {title}
          </h1>
          <div
            className="type-body-lg mt-12 flex max-w-[680px] flex-col gap-6 [&_a]:underline [&_a]:underline-offset-4"
            style={{ color: "var(--app-text-soft)" }}
          >
            {children}
          </div>
        </Container>
      </main>
    </>
  );
}
