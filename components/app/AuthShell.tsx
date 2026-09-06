import Link from "next/link";
import type { ReactNode } from "react";
import Starfield from "@/components/Starfield";

interface AuthShellProps {
  eyebrow: string;
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}

export default function AuthShell({ eyebrow, title, subtitle, children, footer }: AuthShellProps) {
  return (
    <main className="relative isolate flex min-h-svh flex-col overflow-hidden bg-black text-white">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <Starfield count={900} mobileCount={520} constellationCount={4} seed={42} />
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 -z-10 bg-gradient-to-b from-black/80 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 -z-10 bg-gradient-to-t from-black/80 to-transparent" />

      <header className="mx-auto flex w-full max-w-[1440px] items-center justify-between px-5 pt-6 sm:px-8 lg:px-12">
        <Link href="/" className="flex items-center gap-2 text-[15px] font-medium tracking-[-0.01em] text-white/90 hover:text-white">
          <span aria-hidden="true" className="grid h-7 w-7 place-items-center rounded-md bg-white/[0.06] text-white/80">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M12 3l8 18H4L12 3z" strokeLinejoin="round" />
            </svg>
          </span>
          Arcadia
        </Link>
        <span className="type-eyebrow text-white/50">{eyebrow}</span>
      </header>

      <div className="flex flex-1 items-center justify-center px-5 py-14 sm:px-8">
        <div className="w-full max-w-[440px]">
          <h1 className="text-[36px] leading-[1.05] tracking-[-0.03em] text-white sm:text-[44px]">
            {title}
          </h1>
          <p className="mt-3 text-[15px] leading-[1.55] text-white/60">{subtitle}</p>
          <div className="mt-9">{children}</div>
          <div className="mt-8 text-[14px] text-white/55">{footer}</div>
        </div>
      </div>
    </main>
  );
}
