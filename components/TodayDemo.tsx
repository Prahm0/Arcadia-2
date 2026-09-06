"use client";

import { useState } from "react";
import { today } from "@/lib/demo-data";
import { formatDuration } from "@/lib/schedule";
import { useCardGlow } from "@/lib/hooks";
import { cn } from "@/lib/cn";
import Container from "./ui/Container";
import FadeIn from "./ui/FadeIn";
import RevealText from "./ui/RevealText";
import SectionLabel from "./ui/SectionLabel";

export default function TodayDemo() {
  return (
    <section
      id="today"
      aria-labelledby="today-heading"
      className="section-seam-light bg-dawn py-[120px] text-day-text lg:py-[160px]"
    >
      <Container>
        <div className="grid grid-cols-12 items-center gap-y-16 lg:gap-x-6">
          <div className="col-span-12 lg:order-2 lg:col-span-5 lg:col-start-8">
            <FadeIn>
              <SectionLabel tone="light" time="Tue 8 Sep · 7:40 am">
                Today
              </SectionLabel>
            </FadeIn>
            <RevealText
              id="today-heading"
              as="h2"
              lines={["Three things.", "That’s it."]}
              accent="That’s it."
              className="type-display mt-8 text-day-text"
              delay={0.1}
            />
            <FadeIn delay={0.25}>
              <p className="type-body-lg mt-8 max-w-[460px] text-day-text/60">
                Arcadia picks what actually needs you today and how long it&rsquo;ll take. No
                rebuilding your day every morning.
              </p>
            </FadeIn>
          </div>

          <div className="col-span-12 lg:order-1 lg:col-span-6">
            <FadeIn delay={0.15} y={28} duration={0.9}>
              <TodayCard />
            </FadeIn>
          </div>
        </div>
      </Container>
    </section>
  );
}

function TodayCard() {
  const [selected, setSelected] = useState(today.focus[0].id);
  const [done, setDone] = useState<Set<string>>(() => new Set());
  const glow = useCardGlow();

  const remaining = today.focus.filter((f) => !done.has(f.id));
  const totalMinutes = remaining.reduce((sum, f) => sum + f.minutes, 0);

  return (
    <div
      {...glow}
      className="card-glow mx-auto w-full max-w-[560px] overflow-hidden rounded-[16px] border border-day-border bg-white shadow-[0_30px_80px_-30px_rgba(60,40,20,0.22)]"
    >
      <div className="relative flex items-center justify-between border-b border-ui-border px-5 py-4 sm:px-6">
        <p className="tabular text-[12px] font-medium text-ui-muted">{today.date}</p>
        <div className="flex items-center gap-3 text-[12px] text-ui-muted">
          <span className="tabular">Week {Math.round(today.weekProgress * 100)}%</span>
          <span className="relative h-1 w-16 overflow-hidden rounded-full bg-paper-200" aria-hidden="true">
            <span className="absolute inset-y-0 left-0 rounded-full bg-ui-text" style={{ width: `${today.weekProgress * 100}%` }} />
          </span>
        </div>
      </div>

      <div className="relative px-5 pt-6 sm:px-6">
        <span
          aria-hidden="true"
          className="tabular pointer-events-none absolute right-5 top-4 select-none text-[44px] leading-none text-ui-text/[0.05] sm:right-6 sm:text-[56px]"
        >
          07:40
        </span>
        <h3 className="text-[26px] font-medium leading-none tracking-[-0.02em] text-ui-text sm:text-[30px]">
          {today.greeting}
        </h3>
        <p className="mt-2 text-[15px] text-ui-muted">
          {remaining.length === 0
            ? "You’re done for today."
            : `${remaining.length} ${remaining.length === 1 ? "thing" : "things"} to focus on today.`}
          {remaining.length > 0 && (
            <span className="tabular text-[13px]"> · {formatDuration(totalMinutes)}</span>
          )}
        </p>
      </div>

      <ul className="mt-5 flex flex-col px-2 sm:px-3" aria-label="Focus for today">
        {today.focus.map((item) => {
          const isSelected = selected === item.id;
          const isDone = done.has(item.id);
          return (
            <li
              key={item.id}
              className={cn(
                "flex items-center gap-1 rounded-[10px] pr-2 transition-colors duration-200",
                isSelected ? "bg-ui-surface" : "hover:bg-ui-surface/70",
              )}
            >
              <button
                type="button"
                onClick={() => setSelected(item.id)}
                aria-pressed={isSelected}
                className="group flex min-w-0 flex-1 items-center gap-4 rounded-[10px] px-3 py-3.5 text-left"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "h-8 w-[3px] shrink-0 rounded-full transition-colors duration-200",
                    isSelected ? "bg-accent" : "bg-paper-200",
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] text-ui-muted">{item.subject}</span>
                  <span
                    className={cn(
                      "mt-0.5 block truncate text-[16px] font-medium text-ui-text transition-opacity",
                      isDone && "line-through opacity-40",
                    )}
                  >
                    {item.task}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span className="tabular text-[13px] text-ui-text">{formatDuration(item.minutes)}</span>
                  <span className={cn("tabular text-[11px]", item.due.startsWith("Test") ? "text-accent" : "text-ui-muted")}>
                    {item.due}
                  </span>
                </span>
              </button>
              <span className="flex shrink-0">
                <label className="flex size-9 cursor-pointer items-center justify-center">
                  <input
                    type="checkbox"
                    className="peer sr-only"
                    checked={isDone}
                    onChange={(e) => {
                      setDone((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(item.id);
                        else next.delete(item.id);
                        return next;
                      });
                    }}
                    aria-label={`Mark ${item.task} as done`}
                  />
                  <span
                    aria-hidden="true"
                    className={cn(
                      "flex size-[18px] items-center justify-center rounded-[5px] border transition-colors duration-200 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent-300",
                      isDone ? "border-ui-text bg-ui-text text-white" : "border-[#d0d0d0] bg-white",
                    )}
                  >
                    {isDone && (
                      <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                        <path d="M1 4l2.5 2.5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                </label>
              </span>
            </li>
          );
        })}
      </ul>

      <div className="mt-4 border-t border-ui-border px-5 py-4 sm:px-6">
        <p className="type-mono-label font-medium text-ui-muted">Later today</p>
        <ul className="mt-2 flex flex-col gap-1.5">
          {today.later.map((l) => (
            <li key={l.title} className="flex items-center gap-3 text-[13px]">
              <span className="tabular w-[64px] text-[12px] text-ui-muted">{l.time}</span>
              <span className="text-ui-text">{l.title}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
