"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ApiError } from "@/lib/api/client";
import type { ProfileSubject } from "@/lib/api/profile";
import {
  addResult,
  deleteResult,
  deleteWork,
  fetchMastery,
  fetchResults,
  fetchWork,
  linkSyllabus,
  snoozePoint,
  type MasteryPoint,
  type ResultEntry,
  type SubjectMastery,
  type WorkItem,
} from "@/lib/api/work";
import { REASON_TIPS, type Band } from "@/shared/mastery";
import { suggestSyllabus } from "@/shared/syllabusPoints";
import AppButton from "../AppButton";
import { useRefreshOnUpload, useUploads } from "../files/UploadProvider";
import { BAND_TONES, BandTag, ToneTag, shortPointId } from "../work/ui";
import { Label, Section, Sheet, TextInput } from "./ui";

type Load<T> = { status: "loading" } | { status: "ready"; data: T } | { status: "error" };

/**
 * The subject's syllabus, dot point by dot point: how strong each one is
 * from the student's own work and marks, and what Arcad will put in the next
 * session. Only for subjects with a shared syllabus (Methods, for now).
 */
export default function MasterySection({ subject }: { subject: ProfileSubject }) {
  const suggested = suggestSyllabus(subject.name);
  if (!subject.sharedSyllabus && !suggested) return null;
  return <Mastery subject={subject} />;
}

function Mastery({ subject }: { subject: ProfileSubject }) {
  const [state, setState] = useState<Load<SubjectMastery>>({ status: "loading" });
  const [work, setWork] = useState<Array<WorkItem & { points: string[] }>>([]);
  const [results, setResults] = useState<ResultEntry[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [addingMark, setAddingMark] = useState(false);
  const [linking, setLinking] = useState(false);
  const { openWith, scan } = useUploads();

  const load = useCallback(
    () => Promise.all([fetchMastery(subject.id), fetchWork(subject.id), fetchResults(subject.id)]),
    [subject.id],
  );
  const apply = useCallback(([mastery, workList, resultList]: Awaited<ReturnType<typeof load>>) => {
    setState({ status: "ready", data: mastery });
    setWork(workList.items);
    setResults(resultList.results);
  }, []);
  const reload = useCallback(
    () =>
      load()
        .then(apply)
        .catch(() => setState({ status: "error" })),
    [load, apply],
  );

  useEffect(() => {
    let live = true;
    load()
      .then((loaded) => live && apply(loaded))
      .catch(() => live && setState({ status: "error" }));
    return () => {
      live = false;
    };
  }, [load, apply]);
  useRefreshOnUpload(reload);

  const pickFiles = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = "application/pdf,image/png,image/jpeg,image/webp,text/plain,text/markdown,.md,.txt";
    input.onchange = () => {
      const files = Array.from(input.files ?? []);
      if (files.length) openWith(files, { subjectId: subject.id, kind: "work" });
    };
    input.click();
  };

  const data = state.status === "ready" ? state.data : null;
  const byId = useMemo(() => new Map((data?.points ?? []).map((point) => [point.id, point])), [data]);

  if (state.status === "loading") {
    return (
      <Section id="mastery" title="Syllabus map">
        <p className="text-[13px]" style={{ color: "var(--app-text-muted)" }}>
          Loading…
        </p>
      </Section>
    );
  }
  if (state.status === "error" || !data) {
    return (
      <Section id="mastery" title="Syllabus map">
        <p className="text-[13px]" style={{ color: "var(--app-text-muted)" }}>
          Couldn&apos;t load the syllabus map.{" "}
          <button type="button" className="underline" onClick={() => void reload()}>
            Try again
          </button>
        </p>
      </Section>
    );
  }

  if (!data.syllabus) {
    const offer = data.suggested;
    return (
      <Section id="mastery" title="Syllabus map" meta="Track your own work against the official dot points.">
        <p className="text-[13.5px] leading-[1.55]" style={{ color: "var(--app-text-soft)" }}>
          Upload or photograph tests, homework and practice. Arcad maps each piece to the {offer?.name ?? "syllabus"} dot points,
          shows which are strong, weak or neglected, and plans your {subject.name} sessions around the weakest.
        </p>
        {offer ? (
          <div className="mt-4">
            <AppButton
              variant="primary"
              disabled={linking}
              onClick={async () => {
                setLinking(true);
                try {
                  await linkSyllabus(subject.id, offer.id);
                  await reload();
                } finally {
                  setLinking(false);
                }
              }}
            >
              {linking ? "Linking…" : `Use ${offer.name}`}
            </AppButton>
          </div>
        ) : null}
      </Section>
    );
  }

  const worked = data.points.filter((point) => point.works > 0).length;
  const counts = data.points.reduce<Record<Band, number>>(
    (acc, point) => ({ ...acc, [point.band]: acc[point.band] + 1 }),
    { strong: 0, weak: 0, neglected: 0, none: 0 },
  );
  const selectedPoint = selected ? byId.get(selected) ?? null : null;

  return (
    <Section
      id="mastery"
      title="Syllabus map"
      meta={
        worked
          ? `${data.syllabus.name}. ${counts.strong} strong, ${counts.weak} weak, ${counts.neglected} neglected of ${data.points.length} dot points.`
          : `${data.syllabus.name}. Add some work to see where you stand.`
      }
      action={
        <>
          <AppButton size="sm" variant="secondary" onClick={() => setAddingMark(true)} disabled={worked === 0 && results.length === 0}>
            Add a mark
          </AppButton>
          <AppButton size="sm" variant="secondary" onClick={() => scan(subject.id)} className="sm:hidden">
            Photo
          </AppButton>
          <AppButton size="sm" variant="primary" onClick={pickFiles}>
            Add work
          </AppButton>
        </>
      }
    >
      {data.priorities.length ? <NextUp data={data} byId={byId} onSelect={setSelected} /> : null}

      <Heatmap
        points={data.points}
        selected={selectedPoint}
        onSelect={(id) => setSelected((prev) => (prev === id ? null : id))}
        detail={selectedPoint ? <PointDetail point={selectedPoint} onChange={() => void reload()} onClose={() => setSelected(null)} /> : null}
      />

      <WorkList
        items={work}
        onDelete={async (id) => {
          await deleteWork(id);
          await reload();
        }}
      />
      <ResultList
        results={results}
        byId={byId}
        onDelete={async (id) => {
          await deleteResult(id);
          await reload();
        }}
      />

      {addingMark ? (
        <MarkSheet
          subjectId={subject.id}
          points={data.points}
          onClose={() => setAddingMark(false)}
          onSaved={async () => {
            setAddingMark(false);
            await reload();
          }}
        />
      ) : null}
    </Section>
  );
}

function NextUp({
  data,
  byId,
  onSelect,
}: {
  data: SubjectMastery;
  byId: Map<string, MasteryPoint>;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="mb-5">
      <p className="mb-2 text-[12.5px] font-medium" style={{ color: "var(--app-text-muted)" }}>
        Arcad puts these in your next sessions
      </p>
      <ol className="flex flex-col gap-2">
        {data.priorities.slice(0, 3).map((priority) => {
          const point = byId.get(priority.pointId);
          if (!point) return null;
          return (
            <li key={priority.pointId}>
              <button
                type="button"
                onClick={() => onSelect(point.id)}
                className="w-full rounded-md px-3 py-2.5 text-left ui-hover"
                style={{ background: "var(--app-surface-soft)", boxShadow: "var(--elev-inset)" }}
              >
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="font-mono text-[11.5px]" style={{ color: "var(--app-text-faint)" }}>
                    {shortPointId(point.id)}
                  </span>
                  <span className="text-[12px]" style={{ color: "var(--app-text-muted)" }}>
                    {point.subtopic}
                  </span>
                  <ToneTag tone={BAND_TONES[point.band]} size="sm">
                    {point.score}
                  </ToneTag>
                  <ToneTag tone={null} size="sm">
                    {priority.label}
                  </ToneTag>
                </span>
                <span className="mt-1 block text-[13px] leading-snug" style={{ color: "var(--app-text)" }}>
                  {point.text}
                </span>
                <span className="mt-0.5 block text-[12px]" style={{ color: "var(--app-text-muted)" }}>
                  {priority.tip}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Units → topics → a grid of dot points, each one coloured by its band. The open point's detail sits under its unit. */
function Heatmap({
  points,
  selected,
  onSelect,
  detail,
}: {
  points: MasteryPoint[];
  selected: MasteryPoint | null;
  onSelect: (id: string) => void;
  detail: ReactNode;
}) {
  const units = useMemo(() => {
    const out: Array<{ unit: number; title: string; topics: Array<{ key: string; title: string; points: MasteryPoint[] }> }> = [];
    for (const point of points) {
      let unit = out.find((entry) => entry.unit === point.unit);
      if (!unit) {
        unit = { unit: point.unit, title: point.unitTitle, topics: [] };
        out.push(unit);
      }
      const key = `${point.unit}.${point.topic}`;
      let topic = unit.topics.find((entry) => entry.key === key);
      if (!topic) {
        topic = { key, title: point.topicTitle, points: [] };
        unit.topics.push(topic);
      }
      topic.points.push(point);
    }
    return out;
  }, [points]);
  const firstWorked = units.find((unit) => unit.topics.some((topic) => topic.points.some((point) => point.works > 0)))?.unit;
  const [open, setOpen] = useState<Set<number>>(() => new Set([firstWorked ?? 1]));

  return (
    <div className="flex flex-col gap-2">
      {units.map((unit) => {
        const holdsSelected = selected?.unit === unit.unit;
        const isOpen = open.has(unit.unit) || holdsSelected;
        const unitPoints = unit.topics.flatMap((topic) => topic.points);
        const worked = unitPoints.filter((point) => point.works > 0).length;
        return (
          <div key={unit.unit} className="rounded-md" style={{ boxShadow: "inset 0 0 0 1px var(--app-border)" }}>
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() =>
                setOpen((prev) => {
                  const next = new Set(prev);
                  if (next.has(unit.unit)) next.delete(unit.unit);
                  else next.add(unit.unit);
                  return next;
                })
              }
              className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left ui-hover"
            >
              <span className="min-w-0">
                <span className="block text-[13.5px] font-medium" style={{ color: "var(--app-text)" }}>
                  Unit {unit.unit}: {unit.title}
                </span>
                <span className="block text-[12px]" style={{ color: "var(--app-text-muted)" }}>
                  {worked ? `${worked} of ${unitPoints.length} dot points with work` : `${unitPoints.length} dot points`}
                </span>
              </span>
              <svg
                viewBox="0 0 20 20"
                width="14"
                height="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                aria-hidden="true"
                style={{ color: "var(--app-text-muted)", transform: isOpen ? "rotate(180deg)" : undefined }}
              >
                <path d="M5 8l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {isOpen ? (
              <div className="flex flex-col gap-3 border-t px-3 pb-3 pt-2.5" style={{ borderColor: "var(--app-border)" }}>
                {unit.topics.map((topic) => (
                  <div key={topic.key}>
                    <p className="mb-1.5 text-[12.5px]" style={{ color: "var(--app-text-soft)" }}>
                      {topic.title}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {topic.points.map((point) => (
                        <Cell key={point.id} point={point} active={selected?.id === point.id} onClick={() => onSelect(point.id)} />
                      ))}
                    </div>
                  </div>
                ))}
                {holdsSelected ? detail : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/** No work and no marks: there's no score to show, only the band. */
const unscored = (point: MasteryPoint) => point.works === 0 && point.r === null;

function Cell({ point, active, onClick }: { point: MasteryPoint; active: boolean; onClick: () => void }) {
  const tone = BAND_TONES[point.band];
  const snoozed = Boolean(point.snoozedUntil);
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${shortPointId(point.id)} ${point.text}`}
      aria-label={`${shortPointId(point.id)}: ${unscored(point) ? (point.band === "none" ? "not started" : "neglected") : `${point.score}, ${point.band}`}. ${point.text}`}
      aria-pressed={active}
      className="flex h-10 w-[54px] flex-col items-center justify-center rounded-[5px] leading-none transition-shadow"
      style={{
        background: tone ? `color-mix(in oklab, ${tone} ${point.band === "none" ? 0 : 16}%, transparent)` : "var(--app-surface-soft)",
        color: tone ? `color-mix(in oklab, ${tone} 75%, var(--app-text))` : "var(--app-text-faint)",
        boxShadow: active
          ? "inset 0 0 0 2px var(--app-accent)"
          : `inset 0 0 0 1px ${tone ? `color-mix(in oklab, ${tone} 32%, transparent)` : "var(--app-border)"}`,
        opacity: snoozed || point.coveredElsewhere ? 0.55 : 1,
      }}
    >
      <span className="text-[13px] font-semibold tabular-nums">{unscored(point) ? "–" : point.score}</span>
      <span className="mt-1 font-mono text-[9.5px] opacity-80">{shortPointId(point.id)}</span>
    </button>
  );
}

function PointDetail({ point, onChange, onClose }: { point: MasteryPoint; onChange: () => void; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const tip = point.reason ? REASON_TIPS[point.reason] : null;
  const act = async (body: { days?: number; covered?: boolean; clear?: boolean }) => {
    setBusy(true);
    try {
      await snoozePoint(point.id, body);
      onChange();
    } finally {
      setBusy(false);
    }
  };
  const parts: Array<[string, number | null]> = [
    ["Quality", point.q],
    ["Coverage", point.c],
    ["Results", point.r],
    ["Effort", point.e],
  ];
  const hidden = Boolean(point.snoozedUntil) || point.coveredElsewhere;

  return (
    <div className="rounded-md p-4" style={{ background: "var(--app-surface-soft)", boxShadow: "var(--elev-inset)" }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-1.5 text-[12px]" style={{ color: "var(--app-text-muted)" }}>
            <span className="font-mono">{shortPointId(point.id)}</span>
            <span>
              {point.topicTitle} · {point.subtopic}
            </span>
          </p>
          <p className="mt-1 text-[13.5px] leading-snug" style={{ color: "var(--app-text)" }}>
            {point.text}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md ui-hover"
          style={{ color: "var(--app-text-muted)" }}
        >
          <svg viewBox="0 0 20 20" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
            <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-[22px] font-semibold tabular-nums" style={{ color: "var(--app-text)" }}>
          {unscored(point) ? "–" : point.score}
        </span>
        <BandTag band={point.band} />
        {point.works ? (
          <span className="text-[12px]" style={{ color: "var(--app-text-muted)" }}>
            {point.works === 1 ? "1 piece of work" : `${point.works} pieces of work`}
            {point.lastAt ? `, last ${new Date(point.lastAt).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}` : ""}
          </span>
        ) : null}
      </div>

      {point.works || point.r !== null ? (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-5">
          {parts.map(([label, value]) => (
            <div key={label}>
              <dt className="text-[11.5px]" style={{ color: "var(--app-text-faint)" }}>
                {label}
              </dt>
              <dd className="text-[13px] tabular-nums" style={{ color: "var(--app-text)" }}>
                {value === null ? "–" : Math.round(value)}
              </dd>
            </div>
          ))}
          <div>
            <dt className="text-[11.5px]" style={{ color: "var(--app-text-faint)" }}>
              Fading
            </dt>
            <dd className="text-[13px] tabular-nums" style={{ color: "var(--app-text)" }}>
              {point.decay < 1 ? `−${Math.round((1 - point.decay) * 100)}%` : "–"}
            </dd>
          </div>
        </dl>
      ) : (
        <p className="mt-2 text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>
          No work on this yet.
        </p>
      )}

      {tip && point.band !== "strong" ? (
        <p className="mt-3 text-[12.5px] leading-[1.5]" style={{ color: "var(--app-text-soft)" }}>
          <span className="font-medium" style={{ color: "var(--app-text)" }}>
            {tip.label}.
          </span>{" "}
          Next session: {tip.tip.charAt(0).toLowerCase() + tip.tip.slice(1)}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {hidden ? (
          <>
            <span className="self-center text-[12px]" style={{ color: "var(--app-text-muted)" }}>
              {point.coveredElsewhere ? "Covered elsewhere" : "Snoozed"} until{" "}
              {point.snoozedUntil ? new Date(point.snoozedUntil).toLocaleDateString("en-AU", { day: "numeric", month: "short" }) : "later"}.
            </span>
            <AppButton size="sm" variant="ghost" disabled={busy} onClick={() => void act({ clear: true })}>
              Bring it back
            </AppButton>
          </>
        ) : point.works ? (
          <>
            <AppButton size="sm" variant="ghost" disabled={busy} onClick={() => void act({ days: 7 })}>
              Snooze a week
            </AppButton>
            <AppButton size="sm" variant="ghost" disabled={busy} onClick={() => void act({ covered: true })}>
              Covering it elsewhere
            </AppButton>
          </>
        ) : null}
      </div>
    </div>
  );
}

function WorkList({ items, onDelete }: { items: Array<WorkItem & { points: string[] }>; onDelete: (id: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  if (items.length === 0) return null;
  return (
    <div className="mt-5">
      <button type="button" onClick={() => setOpen((prev) => !prev)} className="text-[12.5px] font-medium underline-offset-2 hover:underline" style={{ color: "var(--app-text-muted)" }}>
        {open ? "Hide" : "Show"} work pulled in ({items.length})
      </button>
      {open ? (
        <ul className="mt-2 flex flex-col overflow-hidden rounded-md" style={{ boxShadow: "inset 0 0 0 1px var(--app-border)" }}>
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 border-b px-3 py-2 last:border-b-0" style={{ borderColor: "var(--app-border)" }}>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px]" style={{ color: "var(--app-text)" }}>
                  {item.filename}
                </span>
                <span className="block text-[12px]" style={{ color: "var(--app-text-muted)" }}>
                  {new Date(item.createdAt).toLocaleDateString("en-AU", { day: "numeric", month: "short" })} ·{" "}
                  {item.status === "unread"
                    ? "Couldn't be read"
                    : `${item.points.length === 1 ? "1 dot point" : `${item.points.length} dot points`}${item.status === "checked" ? "" : " · not checked yet"}`}
                </span>
              </span>
              <AppButton
                size="sm"
                variant="ghost"
                disabled={busy === item.id}
                onClick={async () => {
                  setBusy(item.id);
                  try {
                    await onDelete(item.id);
                  } finally {
                    setBusy(null);
                  }
                }}
              >
                Remove
              </AppButton>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ResultList({
  results,
  byId,
  onDelete,
}: {
  results: ResultEntry[];
  byId: Map<string, MasteryPoint>;
  onDelete: (id: string) => Promise<void>;
}) {
  if (results.length === 0) return null;
  return (
    <div className="mt-4">
      <p className="mb-2 text-[12.5px] font-medium" style={{ color: "var(--app-text-muted)" }}>
        Marks
      </p>
      <ul className="flex flex-col overflow-hidden rounded-md" style={{ boxShadow: "inset 0 0 0 1px var(--app-border)" }}>
        {results.map((result) => {
          const topics = [...new Set(result.pointIds.map((id) => byId.get(id)?.subtopic).filter(Boolean))];
          return (
            <li key={result.id} className="flex items-center gap-3 border-b px-3 py-2 last:border-b-0" style={{ borderColor: "var(--app-border)" }}>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px]" style={{ color: "var(--app-text)" }}>
                  {result.title}{" "}
                  <span className="tabular-nums" style={{ color: "var(--app-text-muted)" }}>
                    {result.mark}/{result.maxMark}
                  </span>
                </span>
                <span className="block truncate text-[12px]" style={{ color: "var(--app-text-muted)" }}>
                  {topics.slice(0, 3).join(", ")}
                  {topics.length > 3 ? ` +${topics.length - 3} more` : ""}
                </span>
              </span>
              <AppButton size="sm" variant="ghost" onClick={() => void onDelete(result.id)}>
                Remove
              </AppButton>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** A real mark: what it was out of, and which sub-topics it covered. */
function MarkSheet({
  subjectId,
  points,
  onClose,
  onSaved,
}: {
  subjectId: string;
  points: MasteryPoint[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [mark, setMark] = useState("");
  const [max, setMax] = useState("");
  const [takenOn, setTakenOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subtopics = useMemo(() => {
    const out: Array<{ key: string; unit: number; label: string; ids: string[]; worked: boolean }> = [];
    for (const point of points) {
      const key = `${point.unit}|${point.topicTitle}|${point.subtopic}`;
      let entry = out.find((item) => item.key === key);
      if (!entry) {
        entry = { key, unit: point.unit, label: point.subtopic, ids: [], worked: false };
        out.push(entry);
      }
      entry.ids.push(point.id);
      if (point.works > 0) entry.worked = true;
    }
    return out;
  }, [points]);
  const units = [...new Set(subtopics.map((entry) => entry.unit))];

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await addResult({
        subjectId,
        assessmentId: null,
        title,
        mark: Number(mark),
        maxMark: Number(max),
        takenOn,
        pointIds: subtopics.filter((entry) => picked.has(entry.key)).flatMap((entry) => entry.ids),
      });
      await onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save that. Try again.");
      setSaving(false);
    }
  }

  return (
    <Sheet open eyebrow="Marks" title="Add a mark" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <Label text="What was it?">
          <TextInput value={title} onChange={setTitle} placeholder="e.g. Unit 3 topic test" />
        </Label>
        <div className="grid grid-cols-3 gap-3">
          <Label text="Mark">
            <TextInput value={mark} onChange={setMark} inputMode="decimal" placeholder="34" />
          </Label>
          <Label text="Out of">
            <TextInput value={max} onChange={setMax} inputMode="decimal" placeholder="40" />
          </Label>
          <Label text="Date">
            <TextInput value={takenOn} onChange={setTakenOn} type="date" />
          </Label>
        </div>
        <div>
          <p className="mb-2 text-[12.5px] font-medium" style={{ color: "var(--app-text-muted)" }}>
            What did it cover?
          </p>
          <div className="max-h-[38svh] space-y-3 overflow-y-auto pr-1">
            {units.map((unit) => (
              <div key={unit}>
                <p className="mb-1.5 text-[12px]" style={{ color: "var(--app-text-faint)" }}>
                  Unit {unit}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {subtopics
                    .filter((entry) => entry.unit === unit)
                    .map((entry) => {
                      const on = picked.has(entry.key);
                      return (
                        <button
                          key={entry.key}
                          type="button"
                          aria-pressed={on}
                          onClick={() =>
                            setPicked((prev) => {
                              const next = new Set(prev);
                              if (next.has(entry.key)) next.delete(entry.key);
                              else next.add(entry.key);
                              return next;
                            })
                          }
                          className="rounded-md px-2 py-1 text-[12.5px] transition-colors"
                          style={{
                            background: on ? "var(--app-accent-soft)" : "var(--app-surface-soft)",
                            color: on ? "var(--app-accent-strong)" : entry.worked ? "var(--app-text)" : "var(--app-text-muted)",
                            border: `1px solid ${on ? "var(--app-accent)" : "var(--app-border)"}`,
                          }}
                        >
                          {entry.label}
                        </button>
                      );
                    })}
                </div>
              </div>
            ))}
          </div>
        </div>
        {error ? (
          <p className="text-[12.5px]" style={{ color: "var(--app-danger)" }}>
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2 pt-1">
          <AppButton type="button" variant="ghost" onClick={onClose}>
            Cancel
          </AppButton>
          <AppButton type="submit" variant="primary" disabled={saving || !title.trim() || !mark || !max || picked.size === 0}>
            {saving ? "Saving…" : "Save mark"}
          </AppButton>
        </div>
      </form>
    </Sheet>
  );
}
