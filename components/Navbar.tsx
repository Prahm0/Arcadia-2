"use client";

import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "framer-motion";
import Link from "next/link";
import { useEffect, useState } from "react";
import { EASE_OUT } from "@/lib/animation";
import { cn } from "@/lib/cn";
import { useEarlyAccess } from "./EarlyAccessProvider";
import Button from "./ui/Button";

const links = [
  { label: "Product", href: "#today" },
  { label: "How it works", href: "#how-it-works" },
  { label: "Students", href: "#students" },
  { label: "About", href: "#about" },
];

export default function Navbar() {
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { open } = useEarlyAccess();

  useMotionValueEvent(scrollY, "change", (v) => {
    const next = v > 80;
    setScrolled((prev) => (prev === next ? prev : next));
  });

  useEffect(() => {
    if (!menuOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <nav
        aria-label="Primary"
        className={cn(
          "transition-[background-color,border-color,backdrop-filter] duration-500 ease-[var(--ease-out-expo)]",
          scrolled || menuOpen
            ? "border-b border-white/[0.08] bg-black/65 backdrop-blur-xl"
            : "border-b border-transparent bg-transparent",
        )}
      >
        <div className="mx-auto flex h-[72px] w-full max-w-[1440px] items-center justify-between px-5 sm:px-8 lg:h-20 lg:px-12 2xl:px-16">
          <Link
            href="#top"
            className="text-[17px] font-medium tracking-[-0.02em] text-white"
            aria-label="Arcadia — back to top"
            onClick={() => setMenuOpen(false)}
          >
            Arcadia
          </Link>

          <div className="hidden items-center gap-8 lg:flex">
            <ul className="flex items-center gap-7">
              {links.map((l) => (
                <li key={l.href}>
                  <a
                    href={l.href}
                    className="text-[14px] text-white/65 transition-colors duration-200 hover:text-white"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
            <div className="flex items-center gap-2">
              <Link
                href="/login"
                className="rounded-[8px] px-3 py-2 text-[14px] text-white/80 transition-colors duration-200 hover:text-white"
              >
                Sign in
              </Link>
              <Button size="sm" tone="dark" href="/register">
                Get started
              </Button>
            </div>
          </div>

          <button
            type="button"
            className="flex size-11 items-center justify-center rounded-[8px] text-white lg:hidden"
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <span className="relative block h-3 w-5" aria-hidden="true">
              <span
                className={cn(
                  "absolute left-0 top-0 h-px w-5 bg-current transition-transform duration-300 ease-[var(--ease-out-expo)]",
                  menuOpen && "translate-y-[5.5px] rotate-45",
                )}
              />
              <span
                className={cn(
                  "absolute bottom-0 left-0 h-px w-5 bg-current transition-transform duration-300 ease-[var(--ease-out-expo)]",
                  menuOpen && "-translate-y-[5.5px] -rotate-45",
                )}
              />
            </span>
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            id="mobile-menu"
            key="mobile-menu"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: EASE_OUT }}
            className="fixed inset-x-0 bottom-0 top-[72px] z-40 flex flex-col bg-black/95 backdrop-blur-xl lg:hidden"
          >
            <ul className="flex flex-col px-5 pt-6 sm:px-8">
              {links.map((l, i) => (
                <motion.li
                  key={l.href}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.05 + i * 0.05, ease: EASE_OUT }}
                >
                  <a
                    href={l.href}
                    onClick={() => setMenuOpen(false)}
                    className="block border-b border-white/[0.08] py-5 text-[28px] font-medium tracking-[-0.02em] text-white"
                  >
                    {l.label}
                  </a>
                </motion.li>
              ))}
            </ul>
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3, ease: EASE_OUT }}
              className="mt-auto flex flex-col gap-3 px-5 pb-10 sm:px-8"
            >
              <Button tone="dark" href="/register" onClick={() => setMenuOpen(false)}>
                Get started
              </Button>
              <Button
                tone="dark"
                variant="secondary"
                href="/login"
                onClick={() => setMenuOpen(false)}
              >
                Sign in
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
