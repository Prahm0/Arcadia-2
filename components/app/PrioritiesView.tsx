"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { api } from "@/lib/api/client";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import {
  MAX_DEPTH,
  dueSoon,
  fromSaved,
  nextEstimate,
  indent,
  outdent,
  parsePasted,
  pasteAt,
  toSaved,
  type OutlineLine,
  type SavedPriority,
} from "@/lib/app/priorityOutline";
import { dateKey, formatMinutes } from "@/lib/api/time";
import { matchSubject } from "@/lib/app/quickAdd";
import PageHeader from "./PageHeader";
import EmptyArt from "./EmptyArt";

const SAVE_AFTER_MS = 700;
const INDENT_PX = 22;

const newId = () => `pri_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
const blank = (depth = 0): OutlineLine => ({ id: newId(), depth, text: "", done: false, dueOn: null });

/**
 * Priorities, as a nested bullet list: Area > Subject > Task, and every
 * deadline. Return makes a new line, Tab and Shift-Tab indent on a computer,
 * and the arrows beside the line you're on do it on a phone. Pasting a bullet
 * list keeps its shape. Any line can have a due date: it shows under Due soon
 * and the planner books prep for it, with a guessed estimate one tap changes.
 * Free study time in the plan and gaps on Today are filled from here.
 */
export default function PrioritiesView() {
  const { data, reload } = useDashboardData();
  const subjects = data.subjects.map((subject) => subject.name);
  const [lines, setLines] = useState<OutlineLine[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  // Lines just sent to Today, so their button reads "On today".
  const [sent, setSent] = useState<ReadonlySet<string>>(new Set());
  const inputs = useRef(new Map<string, HTMLTextAreaElement>());
  const focusNext = useRef<{ id: string; caret: number } | null>(null);
  const dirty = useRef(false);
  const latest = useRef<OutlineLine[] | null>(null);
  // Read when saving; kept current without re-creating the save callback.
  const subjectsRef = useRef(subjects);
  useEffect(() => {
    subjectsRef.current = subjects;
  });

  useEffect(() => {
    let active = true;
    api<{ items: SavedPriority[] }>("/api/priorities").then(
      (response) => {
        if (!active) return;
        const loaded = fromSaved(response.items);
        setLines(loaded.length ? loaded : [blank()]);
      },
      (caught) => {
        if (active) setError(caught instanceof Error ? caught.message : "Couldn't load your priorities.");
      },
    );
    return () => {
      active = false;
    };
  }, []);

  const save = useCallback(async () => {
    if (!dirty.current || !latest.current) return;
    dirty.current = false;
    const items = toSaved(latest.current.filter((line, index, all) => line.text.trim() || all.length === 1 || hasChildren(all, index)), subjectsRef.current);
    try {
      await api("/api/priorities", { method: "PUT", body: JSON.stringify({ items }) });
      setError(null);
      // Newly dated lines come back with the estimate the server guessed.
      if (latest.current.some((line) => line.dueOn && line.estimatedMinutes === undefined)) {
        const fresh = await api<{ items: SavedPriority[] }>("/api/priorities");
        const estimates = new Map(fresh.items.map((item) => [item.id, item.estimatedMinutes]));
        setLines((current) => current?.map((line) => (line.dueOn && line.estimatedMinutes === undefined && estimates.get(line.id) ? { ...line, estimatedMinutes: estimates.get(line.id) } : line)) ?? current);
      }
      // Free study blocks on Today and Schedule pick up the new top priorities.
      void reload();
    } catch (caught) {
      dirty.current = true;
      setError(caught instanceof Error ? caught.message : "Couldn't save. Your changes are still here.");
    }
  }, [reload]);

  // Save a moment after the last change, and straight away when leaving.
  useEffect(() => {
    if (!lines) return;
    latest.current = lines;
    const timer = window.setTimeout(() => void save(), SAVE_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [lines, save]);
  useEffect(() => {
    const flush = () => {
      if (document.visibilityState === "hidden") void save();
    };
    document.addEventListener("visibilitychange", flush);
    return () => {
      document.removeEventListener("visibilitychange", flush);
      void save();
    };
  }, [save]);

  useLayoutEffect(() => {
    const target = focusNext.current;
    if (!target) return;
    const element = inputs.current.get(target.id);
    if (!element) return;
    focusNext.current = null;
    element.focus();
    element.setSelectionRange(target.caret, target.caret);
  });

  // Each textarea grows with its text, like a line in Notes.
  useLayoutEffect(() => {
    for (const element of inputs.current.values()) {
      element.style.height = "auto";
      element.style.height = `${element.scrollHeight}px`;
    }
  });

  function change(next: OutlineLine[], focus?: { id: string; caret: number }) {
    dirty.current = true;
    if (focus) focusNext.current = focus;
    setLines(next);
  }

  function update(index: number, patch: Partial<OutlineLine>) {
    if (!lines) return;
    change(lines.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>, index: number) {
    if (!lines || event.nativeEvent.isComposing) return;
    const line = lines[index];
    const element = event.currentTarget;
    const caret = element.selectionStart;
    const atStart = caret === 0 && element.selectionEnd === 0;

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      // Return on an empty indented line steps it out, as in Notes.
      if (!line.text.trim() && line.depth > 0) return change(outdent(lines, index), { id: line.id, caret: 0 });
      const before = line.text.slice(0, caret);
      const after = line.text.slice(element.selectionEnd);
      // A line with children gets its new line as the first child.
      const depth = hasChildren(lines, index) && !after ? line.depth + 1 : line.depth;
      const created = { ...blank(depth), text: after };
      const next = [...lines];
      next[index] = { ...line, text: before };
      next.splice(index + 1, 0, created);
      return change(next, { id: created.id, caret: 0 });
    }
    if (event.key === "Tab") {
      event.preventDefault();
      return change(event.shiftKey ? outdent(lines, index) : indent(lines, index), { id: line.id, caret });
    }
    if (event.key === "Backspace" && atStart) {
      if (line.depth > 0) {
        event.preventDefault();
        return change(outdent(lines, index), { id: line.id, caret: 0 });
      }
      if (!line.text && lines.length > 1 && !hasChildren(lines, index) && index > 0) {
        event.preventDefault();
        const previous = lines[index - 1];
        return change(lines.filter((_, i) => i !== index), { id: previous.id, caret: previous.text.length });
      }
    }
    if (event.key === "ArrowUp" && atStart && index > 0) {
      event.preventDefault();
      focusNext.current = { id: lines[index - 1].id, caret: lines[index - 1].text.length };
      setLines([...lines]);
    }
    if (event.key === "ArrowDown" && caret === line.text.length && index < lines.length - 1) {
      event.preventDefault();
      focusNext.current = { id: lines[index + 1].id, caret: 0 };
      setLines([...lines]);
    }
  }

  function onPaste(event: React.ClipboardEvent<HTMLTextAreaElement>, index: number) {
    if (!lines) return;
    const text = event.clipboardData.getData("text/plain");
    if (!text.includes("\n")) return;
    event.preventDefault();
    const next = pasteAt(lines, index, parsePasted(text), newId);
    const lastPasted = next[Math.min(next.length - 1, index + parsePasted(text).length - (lines[index].text.trim() ? 0 : 1))];
    change(next, lastPasted ? { id: lastPasted.id, caret: lastPasted.text.length } : undefined);
  }

  const open = lines?.filter((line, index) => line.text.trim() && !line.done && !hasChildren(lines, index)).length ?? 0;
  const timezone = data.profile?.timezone || data.user.timezone || "Australia/Sydney";
  const today = dateKey(new Date().toISOString(), timezone);
  const soon = lines ? dueSoon(lines, today) : [];

  async function sendToToday(line: OutlineLine) {
    setSent((current) => new Set(current).add(line.id));
    try {
      await api("/api/today/lines", { method: "POST", body: JSON.stringify({ day: today, title: line.text.trim(), subject: matchSubject(line.text, subjects) }) });
      void reload();
    } catch (caught) {
      setSent((current) => {
        const next = new Set(current);
        next.delete(line.id);
        return next;
      });
      setError(caught instanceof Error ? caught.message : "Couldn't add it to today.");
    }
  }

  return (
    <>
      <PageHeader width={760} title="Priorities" meta={lines ? `${open} open` : undefined} />
      <div className="mx-auto w-full max-w-[760px] px-4 pb-16 pt-4 sm:px-8">
        {error ? (
          <p role="alert" className="mb-3 px-2 text-[13px]" style={{ color: "var(--app-danger)" }}>
            {error}
          </p>
        ) : null}
        {soon.length ? (
          <section aria-label="Due soon" className="mb-5 overflow-hidden rounded-2xl border" style={{ background: "var(--app-surface)", borderColor: "var(--app-border)" }}>
            <h2 className="px-4 pb-1 pt-3 text-[12px] font-semibold uppercase tracking-[0.1em]" style={{ color: "var(--app-text-muted)" }}>Due soon</h2>
            <ul>
              {soon.map((line) => (
                <li key={line.id} className="flex items-center gap-3 px-4 py-2.5" style={{ borderTop: "1px solid var(--app-border)" }}>
                  <span className="min-w-0 flex-1 truncate text-[15px]" style={{ color: "var(--app-text)" }}>{line.text}</span>
                  {line.estimatedMinutes ? (
                    <button
                      type="button"
                      onClick={() => lines && change(lines.map((item) => (item.id === line.id ? { ...item, estimatedMinutes: nextEstimate(line.estimatedMinutes!) } : item)))}
                      aria-label={`Prep ${formatMinutes(line.estimatedMinutes)}, tap to change`}
                      className="shrink-0 rounded-full px-2.5 py-1 text-[12px] tabular-nums"
                      style={{ background: "var(--app-surface-soft)", color: "var(--app-text-soft)" }}
                    >
                      {formatMinutes(line.estimatedMinutes)} prep
                    </button>
                  ) : null}
                  <DueChip dueOn={line.dueOn!} today={today} />
                  <TodayButton sent={sent.has(line.id)} onPress={() => void sendToToday(line)} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {lines && lines.length === 1 && !lines[0].text ? <EmptyArt className="mx-auto mb-3 mt-6" /> : null}
        {!lines ? null : (
          <ul aria-label="Priorities" className="arcadia-stagger flex flex-col">
            {lines.map((line, index) => {
              const focused = focusedId === line.id;
              const parent = hasChildren(lines, index);
              return (
                <li key={line.id} className="group flex items-start gap-1.5 rounded-md py-0.5 pr-1" style={{ paddingLeft: line.depth * INDENT_PX, ["--i" as string]: index }}>
                  <button
                    type="button"
                    onClick={() => update(index, { done: !line.done })}
                    aria-label={line.done ? `Mark ${line.text || "line"} as not done` : `Mark ${line.text || "line"} as done`}
                    aria-pressed={line.done}
                    className="mt-[5px] grid size-7 shrink-0 place-items-center rounded-md"
                  >
                    {parent ? (
                      <span aria-hidden="true" className="size-[6px] rounded-full" style={{ background: "var(--app-text-muted)" }} />
                    ) : (
                      <span
                        aria-hidden="true"
                        className="grid size-[17px] place-items-center rounded-full"
                        style={{
                          background: line.done ? "var(--app-accent)" : "transparent",
                          border: `1.5px solid ${line.done ? "var(--app-accent)" : "var(--app-border-strong)"}`,
                          color: line.done ? "var(--app-accent-on)" : "transparent",
                        }}
                      >
                        <svg width="9" height="7" viewBox="0 0 10 8" fill="none"><path d="M1 4l2.5 2.5L9 1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      </span>
                    )}
                  </button>
                  <textarea
                    ref={(element) => {
                      if (element) inputs.current.set(line.id, element);
                      else inputs.current.delete(line.id);
                    }}
                    value={line.text}
                    rows={1}
                    aria-label={`Priority, level ${line.depth + 1}`}
                    placeholder={lines.length === 1 ? "Type a priority, or paste your list" : undefined}
                    onFocus={() => setFocusedId(line.id)}
                    onBlur={() => setFocusedId((current) => (current === line.id ? null : current))}
                    onChange={(event) => update(index, { text: event.target.value.replace(/\n/g, " ") })}
                    onKeyDown={(event) => onKeyDown(event, index)}
                    onPaste={(event) => onPaste(event, index)}
                    className="min-w-0 flex-1 resize-none overflow-hidden bg-transparent py-1.5 leading-snug outline-none placeholder:text-[color:var(--app-text-faint)]"
                    style={{
                      color: line.done ? "var(--app-text-muted)" : "var(--app-text)",
                      textDecoration: line.done ? "line-through" : undefined,
                      fontSize: line.depth === 0 && parent ? 16 : 15,
                      fontWeight: line.depth === 0 && parent ? 600 : 400,
                    }}
                  />
                  {!parent && line.text.trim() && !line.done ? (
                    <span className={`mt-[5px] shrink-0 ${focused || sent.has(line.id) ? "" : "invisible group-hover:visible"}`}>
                      <TodayButton sent={sent.has(line.id)} onPress={() => void sendToToday(line)} />
                    </span>
                  ) : null}
                  <DueDate
                    value={line.dueOn}
                    visible={focused || Boolean(line.dueOn)}
                    onChange={(dueOn) => update(index, { dueOn })}
                  />
                  {/* Phones have no Tab key: the line you're on gets indent arrows. */}
                  {focused ? (
                    <span className="mt-1 hidden shrink-0 items-center [@media(pointer:coarse)]:flex">
                      <IndentButton label="Outdent" disabled={line.depth === 0} onPress={() => change(outdent(lines, index), { id: line.id, caret: line.text.length })} direction="left" />
                      <IndentButton label="Indent" disabled={index === 0 || line.depth > lines[index - 1].depth || line.depth >= MAX_DEPTH} onPress={() => change(indent(lines, index), { id: line.id, caret: line.text.length })} direction="right" />
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}

function hasChildren(lines: OutlineLine[], index: number): boolean {
  return index + 1 < lines.length && lines[index + 1].depth > lines[index].depth;
}

/** "Due Tue 21 Oct", or a quiet date button on the line being edited. Optional. */
function DueDate({ value, visible, onChange }: { value: string | null; visible: boolean; onChange: (value: string | null) => void }) {
  const label = value
    ? `Due ${new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`))}`
    : "Due date";
  return (
    <label
      className={`relative mt-[7px] shrink-0 cursor-pointer rounded-md px-2 py-1 text-[12px] ${visible ? "" : "invisible group-hover:visible"}`}
      style={{ color: value ? "var(--app-text-soft)" : "var(--app-text-faint)", background: value ? "var(--app-surface-soft)" : "transparent" }}
      // Keep the line's focus while picking a date.
      onMouseDown={(event) => event.preventDefault()}
    >
      {label}
      <input
        type="date"
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value || null)}
        aria-label="Due date"
        className="absolute inset-0 cursor-pointer opacity-0"
      />
    </label>
  );
}

/** "Today", "Tomorrow", "Thu" within a week, else "21 Oct"; overdue in the danger colour. */
function DueChip({ dueOn, today }: { dueOn: string; today: string }) {
  const days = Math.round((Date.parse(`${dueOn}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
  const date = new Date(`${dueOn}T12:00:00Z`);
  const label = days < 0 ? "Overdue" : days === 0 ? "Today" : days === 1 ? "Tomorrow" : days < 7
    ? new Intl.DateTimeFormat("en-AU", { weekday: "short", timeZone: "UTC" }).format(date)
    : new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", timeZone: "UTC" }).format(date);
  return (
    <span className="shrink-0 rounded-full px-2.5 py-1 text-[12px] font-medium" style={{ background: days <= 1 ? "var(--app-arcad-soft)" : "var(--app-surface-soft)", color: days < 0 ? "var(--app-danger)" : days <= 1 ? "var(--app-arcad)" : "var(--app-text-soft)" }}>
      {label}
    </span>
  );
}

/** Sends a priority to today's list in one tap. */
function TodayButton({ sent, onPress }: { sent: boolean; onPress: () => void }) {
  return (
    <button
      type="button"
      disabled={sent}
      // Keep the line's focus (and the phone keyboard) while tapping.
      onPointerDown={(event) => event.preventDefault()}
      onClick={onPress}
      className="shrink-0 rounded-full px-2.5 py-1 text-[12px] font-medium"
      style={{ background: sent ? "var(--app-accent-soft)" : "var(--app-surface-soft)", color: sent ? "var(--app-accent)" : "var(--app-text-soft)" }}
    >
      {sent ? "On today" : "Today"}
    </button>
  );
}

function IndentButton({ label, disabled, onPress, direction }: { label: string; disabled: boolean; onPress: () => void; direction: "left" | "right" }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      // Pressing it mustn't blur the line (and close the keyboard).
      onPointerDown={(event) => event.preventDefault()}
      onClick={onPress}
      className="grid size-9 place-items-center rounded-md disabled:opacity-30"
      style={{ color: "var(--app-text-soft)" }}
    >
      <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {direction === "left" ? <path d="M8 6l-4 4 4 4M4 10h12" /> : <path d="M12 6l4 4-4 4M16 10H4" />}
      </svg>
    </button>
  );
}
