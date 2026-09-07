"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api/client";

interface HeatmapDay {
  date: string;
  minutes: number;
  sessions: number;
}

interface HeatmapResponse {
  timezone: string;
  start: string;
  end: string;
  days: HeatmapDay[];
  max: { minutes: number; sessions: number };
  thresholds: { minutes: number[]; sessions: number[] };
  streaks: { current: number; longest: number; activeDays: number; totalDays: number };
}

const WINDOW_DAYS = 90;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * 90-day study heatmap in GitHub-contrib style. Reads the backend
 * `/api/analytics/heatmap` which already computes intensity thresholds, so
 * the shading adapts to how much this student typically studies.
 */
export default function ConsistencyHeatmap() {
  const [data, setData] = useState<HeatmapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hovered, setHovered] = useState<HeatmapDay | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api<HeatmapResponse>(`/api/analytics/heatmap?days=${WINDOW_DAYS}`);
      setData(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load heatmap.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const weeks = useMemo(() => (data ? groupIntoWeeks(data.days) : []), [data]);
  const monthLabels = useMemo(() => (data ? computeMonthLabels(weeks) : []), [weeks, data]);
  const totalMinutes = useMemo(
    () => (data?.days ?? []).reduce((sum, day) => sum + day.minutes, 0),
    [data],
  );
  const activeDays = useMemo(
    () => (data?.days ?? []).filter((day) => day.minutes > 0).length,
    [data],
  );

  return (
    <div
      className="rounded-[16px] p-6"
      style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="type-eyebrow" style={{ color: "var(--app-text-muted)" }}>
            Consistency · last 90 days
          </p>
          <p className="mt-1 text-[13px]" style={{ color: "var(--app-text-muted)" }}>
            Shaded by focused study minutes each day. Empty cells are days without any tracked study.
          </p>
        </div>
        {data ? (
          <p className="type-mono-label" style={{ color: "var(--app-text-muted)" }}>
            {activeDays} active {activeDays === 1 ? "day" : "days"} · {formatMinutes(totalMinutes)}
          </p>
        ) : null}
      </div>

      {loading ? (
        <p className="mt-6 text-[13px]" style={{ color: "var(--app-text-muted)" }}>
          Loading…
        </p>
      ) : error ? (
        <p className="mt-6 text-[13px]" style={{ color: "var(--app-danger)" }}>
          {error}
        </p>
      ) : data && data.days.length > 0 ? (
        <div className="mt-6">
          <div className="overflow-x-auto pb-2">
            <div className="inline-flex flex-col">
              {/* Month labels */}
              <div className="flex pl-8">
                {weeks.map((week, index) => {
                  const label = monthLabels[index];
                  return (
                    <div
                      key={`month-${index}`}
                      className="w-[15px] shrink-0 text-[10px] font-mono"
                      style={{ color: "var(--app-text-muted)" }}
                    >
                      {label ?? ""}
                    </div>
                  );
                })}
              </div>

              <div className="mt-1 flex">
                {/* Weekday rail */}
                <div className="mr-1.5 flex w-[22px] shrink-0 flex-col justify-between py-0.5 text-[9.5px] font-mono" style={{ color: "var(--app-text-muted)" }}>
                  {WEEKDAYS.map((day, i) => (
                    <span key={day} className={i % 2 === 0 ? "" : "opacity-0"}>{day}</span>
                  ))}
                </div>

                {/* Cell grid */}
                <div className="flex gap-[3px]">
                  {weeks.map((week, weekIndex) => (
                    <div key={`w-${weekIndex}`} className="flex flex-col gap-[3px]">
                      {WEEKDAYS.map((_, dayIndex) => {
                        const cell = week[dayIndex] ?? null;
                        if (!cell) {
                          return (
                            <span
                              key={dayIndex}
                              className="block h-[12px] w-[12px] rounded-[2.5px]"
                              style={{ background: "transparent" }}
                              aria-hidden="true"
                            />
                          );
                        }
                        const level = intensityLevel(cell.minutes, data.thresholds.minutes);
                        return (
                          <button
                            type="button"
                            key={dayIndex}
                            onMouseEnter={() => setHovered(cell)}
                            onMouseLeave={() => setHovered(null)}
                            onFocus={() => setHovered(cell)}
                            onBlur={() => setHovered(null)}
                            aria-label={`${cell.date} — ${cell.minutes} min, ${cell.sessions} sessions`}
                            className="block h-[12px] w-[12px] rounded-[2.5px] transition-transform hover:scale-[1.35] focus:scale-[1.35]"
                            style={{ background: colorForLevel(level) }}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-[11.5px]" style={{ color: "var(--app-text-muted)" }}>
              Less
              {[0, 1, 2, 3, 4, 5].map((level) => (
                <span
                  key={level}
                  className="h-[10px] w-[10px] rounded-[2px]"
                  style={{ background: colorForLevel(level) }}
                  aria-hidden="true"
                />
              ))}
              More
            </div>
            <p className="text-[12px] font-mono" style={{ color: "var(--app-text-muted)" }} aria-live="polite">
              {hovered ? `${formatDayLabel(hovered.date)} · ${formatMinutes(hovered.minutes)} · ${hovered.sessions} session${hovered.sessions === 1 ? "" : "s"}` : "Hover a cell for detail"}
            </p>
          </div>
        </div>
      ) : (
        <p className="mt-6 text-[13px]" style={{ color: "var(--app-text-muted)" }}>
          Nothing tracked yet. Use the Focus timer or mark a study block done to start filling this in.
        </p>
      )}
    </div>
  );
}

function groupIntoWeeks(days: HeatmapDay[]): (HeatmapDay | null)[][] {
  if (days.length === 0) return [];
  // Pad the first week so day 0 lands under its correct weekday (Mon=0 rail).
  const firstDate = new Date(`${days[0].date}T12:00:00Z`);
  const firstJsDay = firstDate.getUTCDay();
  const leadingBlanks = (firstJsDay + 6) % 7; // days before this week's Monday
  const cells: (HeatmapDay | null)[] = [...Array(leadingBlanks).fill(null), ...days];
  const weeks: (HeatmapDay | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return weeks;
}

function computeMonthLabels(weeks: (HeatmapDay | null)[][]): (string | null)[] {
  const monthFmt = new Intl.DateTimeFormat("en-AU", { month: "short" });
  let lastMonth: number | null = null;
  return weeks.map((week) => {
    const firstDay = week.find((day) => day !== null);
    if (!firstDay) return null;
    const date = new Date(`${firstDay.date}T12:00:00Z`);
    const month = date.getUTCMonth();
    if (month === lastMonth) return null;
    lastMonth = month;
    return monthFmt.format(date);
  });
}

function intensityLevel(value: number, thresholds: number[]): number {
  if (value <= 0) return 0;
  const bands = thresholds && thresholds.length ? thresholds : [1, 2, 3, 4];
  for (let i = 0; i < bands.length; i += 1) {
    if (value <= bands[i]) return i + 1;
  }
  return bands.length + 1;
}

const LEVEL_COLORS = [
  "var(--app-surface-soft)",
  "color-mix(in oklab, var(--app-accent) 18%, var(--app-surface-soft))",
  "color-mix(in oklab, var(--app-accent) 34%, var(--app-surface-soft))",
  "color-mix(in oklab, var(--app-accent) 55%, var(--app-surface-soft))",
  "color-mix(in oklab, var(--app-accent) 78%, var(--app-surface-soft))",
  "var(--app-accent)",
] as const;

function colorForLevel(level: number): string {
  return LEVEL_COLORS[Math.min(level, LEVEL_COLORS.length - 1)];
}

function formatMinutes(m: number): string {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r === 0 ? `${h} hr` : `${h}h ${r}m`;
}

function formatDayLabel(iso: string): string {
  const date = new Date(`${iso}T12:00:00Z`);
  return new Intl.DateTimeFormat("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(date);
}
