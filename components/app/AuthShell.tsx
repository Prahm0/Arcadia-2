import Link from "next/link";
import type { ReactNode } from "react";
import Logo from "@/components/ui/Logo";

interface AuthShellProps {
  eyebrow: string;
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}

/**
 * The auth frame used to be its own world — black, white and a 900-star
 * Starfield borrowed from the marketing page, with none of the --app-* tokens.
 * It now uses the same flat surfaces as the rest of the product, so signing in
 * looks like the thing you are signing in to.
 */
export default function AuthShell({ eyebrow, title, subtitle, children, footer }: AuthShellProps) {
  return (
    <main
      className="relative isolate flex min-h-svh flex-col"
      style={{ background: "var(--app-bg)", color: "var(--app-text)" }}
    >
      <header className="mx-auto flex w-full max-w-[1440px] items-center justify-between px-5 pt-6 sm:px-8 lg:px-12">
        <Link
          href="/"
          className="flex items-center gap-2 text-[15px] font-medium tracking-[-0.01em]"
          style={{ color: "var(--app-text)" }}
        >
          <span
            aria-hidden="true"
            className="surface-card grid h-7 w-7 place-items-center rounded-sm"
            style={{ color: "var(--app-accent)" }}
          >
            <Logo size={14} />
          </span>
          Arcadia
        </Link>
        <span className="type-eyebrow" style={{ color: "var(--app-text-muted)" }}>
          {eyebrow}
        </span>
      </header>

      <div className="flex flex-1 items-center justify-center px-5 py-14 sm:px-8">
        <div className="surface-card w-full max-w-[440px] rounded-lg p-7 sm:p-9">
          <h1 className="text-[32px] leading-[1.1] tracking-[-0.02em] sm:text-[38px]">{title}</h1>
          <p className="mt-3 text-[15px] leading-[1.55]" style={{ color: "var(--app-text-muted)" }}>
            {subtitle}
          </p>
          <div className="mt-8">{children}</div>
          <div className="mt-8 text-[14px]" style={{ color: "var(--app-text-muted)" }}>
            {footer}
          </div>
        </div>
      </div>
    </main>
  );
}
