"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api/client";
import type { DayItem, PlannerEvent } from "@/lib/api/types";
import { ADD_TO_TODAY_EVENT } from "@/lib/app/addToToday";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import { noteLine, parseDayPaste, parseLoggedLine } from "@/lib/app/dayLine";
import { parseQuickAdd } from "@/lib/app/quickAdd";
import { startOfDayMs } from "../schedule/calendar";

export type NoteTarget = { kind: "event" | "item"; id: string; note: string };

/**
 * The always-ready line at the top of Today, like a new line in Notes. Type,
 * press return, it's added and the cursor stays for the next one.
 *
 * "SLC 10:50" becomes a block in the timeline, "Call with Pari" a to-do for
 * today, "- bring the form" a note on the line above, "chem SAC next
 * thursday" a deadline, and "did chem till 4:25" a block logged as done.
 * Pasting a whole day from Notes adds every line at once.
 */
const HINT_DONE_KEY = "arcadia:today-hint-done";

export default function AddLine({ today, timezone, lastLine, empty }: { today: string; timezone: string; lastLine: NoteTarget | null; empty?: boolean }) {
  const { data, patch, reload } = useDashboardData();
  const input = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [hint, setHint] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  // One small hint, the first time Today is empty; gone after the first line.
  const [firstUse, setFirstUse] = useState(false);
  useEffect(() => {
    let seen = true;
    try { seen = window.localStorage.getItem(HINT_DONE_KEY) === "1"; } catch { /* private mode: no hint */ }
    if (!seen) {
      const frame = requestAnimationFrame(() => setFirstUse(true));
      return () => cancelAnimationFrame(frame);
    }
  }, []);
  const showHint = firstUse && empty;
  function used() {
    setFirstUse(false);
    try { window.localStorage.setItem(HINT_DONE_KEY, "1"); } catch { /* fine */ }
  }
  // The line a "- note" attaches to: the last one added here, else the list's last line.
  const lastAdded = useRef<NoteTarget | null>(null);

  // The + button and ?add=1 both land here.
  useEffect(() => {
    const focus = () => {
      input.current?.focus();
      input.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    };
    window.addEventListener(ADD_TO_TODAY_EVENT, focus);
    const url = new URL(window.location.href);
    if (url.searchParams.get("add") === "1" || url.searchParams.get("new") === "1") {
      url.searchParams.delete("add");
      url.searchParams.delete("new");
      window.history.replaceState({}, "", url.toString());
      window.requestAnimationFrame(focus);
    }
    return () => window.removeEventListener(ADD_TO_TODAY_EVENT, focus);
  }, []);

  useEffect(() => {
    if (!hint) return;
    const timer = window.setTimeout(() => setHint(null), 3500);
    return () => window.clearTimeout(timer);
  }, [hint]);

  async function addNote(target: NoteTarget, text: string) {
    const note = target.note ? `${target.note}\n${text}` : text;
    target.note = note;
    if (target.kind === "item") {
      patch((prev) => ({ ...prev, dayItems: (prev.dayItems ?? []).map((item) => (item.id === target.id ? { ...item, note } : item)) }));
      await api(`/api/today/items/${encodeURIComponent(target.id)}`, { method: "PATCH", body: JSON.stringify({ note }) });
    } else {
      patch((prev) => ({ ...prev, events: prev.events.map((event) => (event.id === target.id ? { ...event, note } : event)) }));
      await api(`/api/today/events/${encodeURIComponent(target.id)}/note`, { method: "PATCH", body: JSON.stringify({ note }) });
    }
  }

  async function addDeadline(text: string): Promise<boolean> {
    const subjects = data.subjects.map((subject) => subject.name);
    const quick = parseQuickAdd(text, subjects, today);
    if (!quick.taskType || !quick.dueDate || quick.dueDate <= today || !quick.title) return false;
    const [hours, minutes] = (quick.dueTime ?? "23:59").split(":").map(Number);
    await api("/api/tasks", {
      method: "POST",
      body: JSON.stringify({
        title: quick.title,
        subject: quick.subject,
        taskType: quick.taskType,
        dueAt: new Date(startOfDayMs(quick.dueDate, timezone) + (hours * 60 + minutes) * 60_000).toISOString(),
        estimatedMinutes: quick.minutes ?? 60,
        priority: 2,
      }),
    });
    const due = new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${quick.dueDate}T12:00:00Z`));
    setHint({ tone: "info", text: `Added to deadlines, due ${due}.` });
    void reload();
    return true;
  }

  async function addLine(text: string) {
    const parsed = parseLoggedLine(text, data.subjects.map((subject) => subject.name));
    const body = { day: today, title: parsed.title, subject: parsed.subject, start: parsed.start, end: parsed.end, evening: parsed.evening, done: parsed.done };
    if (parsed.done) {
      // Logged as done: saved straight away, then the list reloads with it ticked.
      const result = await api<{ rewards?: Array<{ xp: number }> }>("/api/today/lines", { method: "POST", body: JSON.stringify(body) });
      const xp = result.rewards?.reduce((sum, reward) => sum + reward.xp, 0) ?? 0;
      setHint({ tone: "info", text: `Logged as done${xp ? `, +${xp} XP` : ""}.` });
      void reload();
      return;
    }
    const tempId = `tmp-${Math.random().toString(36).slice(2)}`;
    const createdAt = new Date().toISOString();

    if (parsed.start !== null) {
      const startAt = new Date(startOfDayMs(today, timezone) + parsed.start * 60_000).toISOString();
      const endAt = new Date(startOfDayMs(today, timezone) + (parsed.end ?? parsed.start + 30) * 60_000).toISOString();
      const temp: PlannerEvent = {
        id: tempId, title: parsed.title, subject: parsed.subject, category: parsed.subject ? "study" : "other",
        kind: parsed.end !== null ? "note-range" : "note", source: "note", startAt, endAt, status: "planned", outcome: "planned", editable: true, pinned: true, note: "", createdAt,
      };
      patch((prev) => ({ ...prev, events: [...prev.events, temp] }));
      try {
        const result = await api<{ event: PlannerEvent }>("/api/today/lines", { method: "POST", body: JSON.stringify(body) });
        patch((prev) => ({ ...prev, events: prev.events.map((event) => (event.id === tempId ? result.event : event)) }));
        lastAdded.current = { kind: "event", id: result.event.id, note: "" };
        // Arcadia's own blocks moved out of the way; they slide to their new places.
        void reload();
      } catch (error) {
        patch((prev) => ({ ...prev, events: prev.events.filter((event) => event.id !== tempId) }));
        throw error;
      }
      return;
    }

    const temp: DayItem = { id: tempId, day: today, text: parsed.title, subject: parsed.subject, note: "", evening: parsed.evening, done: false, position: 999, createdAt };
    patch((prev) => ({ ...prev, dayItems: [...(prev.dayItems ?? []), temp] }));
    try {
      const result = await api<{ item: DayItem }>("/api/today/lines", { method: "POST", body: JSON.stringify(body) });
      patch((prev) => ({ ...prev, dayItems: (prev.dayItems ?? []).map((item) => (item.id === tempId ? result.item : item)) }));
      lastAdded.current = { kind: "item", id: result.item.id, note: "" };
    } catch (error) {
      patch((prev) => ({ ...prev, dayItems: (prev.dayItems ?? []).filter((item) => item.id !== tempId) }));
      throw error;
    }
  }

  /** A whole day from Notes: one line each, ✅ done, "- " notes under the line above. */
  async function addPasted(text: string) {
    const lines = parseDayPaste(text, data.subjects.map((subject) => subject.name));
    if (!lines.length) return;
    used();
    setHint({ tone: "info", text: `Adding ${lines.length} lines...` });
    try {
      await api("/api/today/lines/batch", {
        method: "POST",
        body: JSON.stringify({
          lines: lines.map((line) => ({ day: today, title: line.title, subject: line.subject, start: line.start, end: line.end, evening: line.evening, done: line.done, note: line.notes.join("\n") })),
        }),
      });
      const done = lines.filter((line) => line.done).length;
      setHint({ tone: "info", text: `Added ${lines.length} ${lines.length === 1 ? "line" : "lines"}${done ? `, ${done} already done` : ""}.` });
      void reload();
    } catch (error) {
      setHint({ tone: "error", text: error instanceof Error && error.message ? error.message : "Couldn't add those. Try again." });
    }
  }

  async function submit() {
    const text = value.trim();
    if (!text) return;
    used();
    setValue("");
    setHint(null);
    try {
      const note = noteLine(text);
      const target = lastAdded.current ?? lastLine;
      if (note && target) await addNote(target, note);
      else if (!(await addDeadline(text))) await addLine(note ?? text);
    } catch (error) {
      setValue(text);
      setHint({ tone: "error", text: error instanceof Error && error.message ? error.message : "Couldn't add that. Try again." });
    }
  }

  return (
    <div className="px-2 sm:px-3">
      <label className="flex items-center gap-3 rounded-md px-3 py-2.5">
        <span
          aria-hidden="true"
          className="grid size-[22px] shrink-0 place-items-center rounded-full sm:size-[20px]"
          style={{ border: "1.5px dashed var(--app-border-strong)", color: "var(--app-text-faint)" }}
        >
          <svg viewBox="0 0 12 12" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M6 2v8M2 6h8" /></svg>
        </span>
        <span className="sr-only">Add to today</span>
        <input
          ref={input}
          id="add-to-today"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onPaste={(event) => {
            const pasted = event.clipboardData.getData("text/plain");
            if (!pasted.includes("\n")) return;
            event.preventDefault();
            void addPasted(pasted);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void submit();
            } else if (event.key === "Escape") {
              input.current?.blur();
            }
          }}
          placeholder={showHint ? "Paste your plan from Notes, or type your first line" : "Add to today..."}
          autoComplete="off"
          autoCapitalize="sentences"
          enterKeyHint="enter"
          className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-[color:var(--app-text-faint)]"
          style={{ color: "var(--app-text)" }}
        />
      </label>
      {hint ? (
        <p role="status" className="px-3 pb-1 pl-[46px] text-[12.5px]" style={{ color: hint.tone === "error" ? "var(--app-danger)" : "var(--app-text-muted)" }}>
          {hint.text}
        </p>
      ) : null}
    </div>
  );
}
