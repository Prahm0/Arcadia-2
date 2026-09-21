"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import { OPEN_TOUR_EVENT } from "@/lib/app/commands";
import { TOURS, TOUR_VERSION, setActiveTour, type Tour, type TourId } from "./tours";

/** Long enough for the page to paint first, so the tour reads as "about this". */
const AUTO_OPEN_DELAY_MS = 450;
/** One wheel gesture advances one step, however many events the trackpad fires. */
const WHEEL_COOLDOWN_MS = 450;

function storageKey(id: TourId, userId: string) {
  return `arcadia:tour:v${TOUR_VERSION}:${id}:${userId}`;
}

function hasSeen(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "done";
  } catch {
    // Storage blocked: don't nag on every visit.
    return true;
  }
}

/**
 * A page's "How it works" button plus its tour. The tour opens by itself the
 * first time someone visits the page, and again whenever they ask for it
 * (the button, or Help → How this page works).
 */
export default function PageTour({ id }: { id: TourId }) {
  const { data } = useDashboardData();
  const key = storageKey(id, data.user.id);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setActiveTour(id);
    return () => setActiveTour(null);
  }, [id]);

  useEffect(() => {
    if (hasSeen(key)) return;
    const timer = window.setTimeout(() => {
      // Never stack on top of a sheet or dialog someone already opened.
      if (!document.querySelector('[aria-modal="true"]')) setOpen(true);
    }, AUTO_OPEN_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [key]);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_TOUR_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_TOUR_EVENT, onOpen);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    try {
      window.localStorage.setItem(key, "done");
    } catch {
      /* ignore */
    }
  }, [key]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium ui-hover"
        style={{ color: "var(--app-text-soft)" }}
      >
        <svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.4">
          <circle cx="8" cy="8" r="6.25" />
          <path d="M6.3 6.2a1.8 1.8 0 113 1.3c-.6.5-1.3.8-1.3 1.7" strokeLinecap="round" />
          <circle cx="8" cy="11.4" r=".7" fill="currentColor" stroke="none" />
        </svg>
        How it works
      </button>
      {open ? createPortal(<TourDialog tour={TOURS[id]} tourId={id} onClose={close} />, document.body) : null}
    </>
  );
}

function TourDialog({ tour, tourId, onClose }: { tour: Tour; tourId: TourId; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const scrollIdle = useRef<number | null>(null);
  const lastWheel = useRef(0);
  const steps = tour.steps;
  const last = steps.length - 1;
  const step = steps[index];
  const titleId = `tour-${tourId}-title`;

  // Open: lock page scroll, focus the primary action. Close: restore both.
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    primaryRef.current?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus?.({ preventScroll: true });
    };
  }, []);

  const goTo = useCallback(
    (target: number) => {
      const next = Math.max(0, Math.min(last, target));
      const track = trackRef.current;
      if (track) {
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        track.scrollTo({ left: next * track.clientWidth, behavior: reduce ? "auto" : "smooth" });
      }
      setIndex(next);
    },
    [last],
  );

  // Swipes and trackpad scrolls move the track directly; settle the index
  // once the scroll comes to rest so the dots don't flicker mid-swipe.
  function onScroll() {
    if (scrollIdle.current) window.clearTimeout(scrollIdle.current);
    scrollIdle.current = window.setTimeout(() => {
      const track = trackRef.current;
      if (!track) return;
      setIndex(Math.max(0, Math.min(last, Math.round(track.scrollLeft / track.clientWidth))));
    }, 80);
  }

  // A plain mouse wheel scrolls vertically; turn it into one step at a time.
  function onWheel(event: React.WheelEvent) {
    if (Math.abs(event.deltaX) >= Math.abs(event.deltaY) || Math.abs(event.deltaY) < 12) return;
    const now = Date.now();
    if (now - lastWheel.current < WHEEL_COOLDOWN_MS) return;
    lastWheel.current = now;
    goTo(index + (event.deltaY > 0 ? 1 : -1));
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    } else if ((event.key === "Enter" || event.key === " ") && event.target instanceof HTMLButtonElement) {
      // Activate explicitly rather than rely on the browser's default, which
      // some fire on keypress/keyup instead of keydown.
      event.preventDefault();
      event.target.click();
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      goTo(index + 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      goTo(index - 1);
    } else if (event.key === "Tab") {
      // Keep focus inside the dialog.
      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), [href]") ?? [],
      ).filter((el) => !el.closest("[inert]"));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const lastEl = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        lastEl.focus();
      } else if (!event.shiftKey && document.activeElement === lastEl) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center p-4" onKeyDown={onKeyDown}>
      <div
        aria-hidden="true"
        className="tour-backdrop absolute inset-0"
        style={{ background: "rgba(var(--shadow-rgb), 0.42)" }}
        onClick={onClose}
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="tour-panel relative w-full max-w-[440px] overflow-hidden rounded-xl"
        style={{ background: "var(--app-elev)", boxShadow: "var(--elev-3)" }}
      >
        <h2 id={titleId} className="sr-only">
          How {tour.title} works
        </h2>
        <p className="sr-only" aria-live="polite">
          Step {index + 1} of {steps.length}: {step.title}
        </p>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 z-10 grid h-7 w-7 place-items-center rounded-md"
          style={{
            background: "color-mix(in oklab, var(--app-surface) 85%, transparent)",
            boxShadow: "var(--elev-1)",
            color: "var(--app-text-muted)",
          }}
        >
          <svg aria-hidden="true" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>

        <div
          ref={trackRef}
          onScroll={onScroll}
          onWheel={onWheel}
          className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {steps.map((s, i) => (
            <section
              key={s.title}
              role="group"
              aria-roledescription="slide"
              aria-label={`Step ${i + 1} of ${steps.length}`}
              aria-hidden={i !== index}
              inert={i !== index}
              className="w-full shrink-0 snap-center snap-always"
            >
              <div
                aria-hidden="true"
                className="relative flex h-[216px] items-center justify-center overflow-hidden border-b"
                style={{
                  borderColor: "var(--app-border)",
                  background: "var(--app-surface-soft)",
                  backgroundImage:
                    "radial-gradient(color-mix(in oklab, var(--app-text) 9%, transparent) 1px, transparent 1px)",
                  backgroundSize: "14px 14px",
                }}
              >
                <div className="pointer-events-none select-none">{s.visual}</div>
              </div>
              <div className="min-h-[124px] px-6 pb-2 pt-5">
                <p className="text-[12px] font-medium" style={{ color: "var(--app-accent-strong)" }}>
                  {tour.title} · Step {i + 1} of {steps.length}
                </p>
                <h3 className="mt-1.5 text-[17px] font-semibold tracking-[-0.01em]" style={{ color: "var(--app-text)" }}>
                  {s.title}
                </h3>
                <p className="mt-1.5 text-[13.5px] leading-[1.55]" style={{ color: "var(--app-text-muted)" }}>
                  {s.body}
                </p>
              </div>
            </section>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 px-6 pb-5 pt-3">
          <div className="flex items-center gap-1.5" role="group" aria-label="Choose a step">
            {steps.map((s, i) => (
              <button
                key={s.title}
                type="button"
                onClick={() => goTo(i)}
                aria-label={`Go to step ${i + 1}: ${s.title}`}
                aria-current={i === index ? "step" : undefined}
                className="h-1.5 rounded-full transition-[width,background-color] duration-200"
                style={{
                  width: i === index ? 18 : 6,
                  background: i === index ? "var(--app-accent)" : "var(--app-border-strong)",
                }}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {index === 0 ? (
              <button
                type="button"
                onClick={onClose}
                className="h-8 rounded-md px-3 text-[13px] font-medium ui-hover"
                style={{ color: "var(--app-text-muted)" }}
              >
                Skip
              </button>
            ) : (
              <button
                type="button"
                onClick={() => goTo(index - 1)}
                className="h-8 rounded-md px-3 text-[13px] font-medium"
                style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)", color: "var(--app-text)" }}
              >
                Back
              </button>
            )}
            <button
              ref={primaryRef}
              type="button"
              onClick={() => (index === last ? onClose() : goTo(index + 1))}
              className="h-8 min-w-[88px] rounded-md bg-[var(--app-accent)] px-3 text-[13px] font-medium text-[var(--app-accent-on)] transition-colors hover:bg-[var(--app-accent-strong)]"
            >
              {index === last ? "Get started" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
