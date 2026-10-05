"use client";

import { useEffect, useMemo, useState } from "react";
import { ApiError } from "@/lib/api/client";
import { checkIn, fetchMastery, fetchWorkItem, fixTranscript, type MasteryPoint, type WorkTag, type WorkUpload } from "@/lib/api/work";
import AppButton from "../AppButton";
import { Sheet } from "../profile/ui";
import { qualityLabel, shortPointId, ToneTag } from "./ui";

const CONFIDENCE_ENDS = ["Lost", "Nailed it"];

/**
 * The ten-second check after Arcad reads a piece of work: are these the
 * right dot points, any missing, and how sure do you feel. What the student
 * changes here is kept, so wrong tags can be counted and the prompt fixed.
 */
export default function CheckinSheet({
  upload,
  remaining,
  onDone,
}: {
  upload: WorkUpload;
  /** More check-ins waiting after this one. */
  remaining: number;
  onDone: () => void;
}) {
  const [tags, setTags] = useState<WorkTag[]>(upload.tags);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [added, setAdded] = useState<MasteryPoint[]>([]);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [transcript, setTranscript] = useState<{ text: string; saving: boolean } | null>(null);

  const toggle = (pointId: string) =>
    setRemoved((prev) => {
      const next = new Set(prev);
      if (next.has(pointId)) next.delete(pointId);
      else next.add(pointId);
      return next;
    });

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await checkIn(upload.item.id, { remove: [...removed], add: added.map((point) => point.id), confidence });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save that. Try again.");
      setSaving(false);
    }
  }

  async function openTranscript() {
    setTranscript({ text: "", saving: true });
    try {
      const detail = await fetchWorkItem(upload.item.id);
      setTranscript({ text: detail.transcript, saving: false });
    } catch {
      setTranscript(null);
      setError("Couldn't load what Arcad read.");
    }
  }

  async function remark() {
    if (!transcript) return;
    setTranscript({ ...transcript, saving: true });
    setError(null);
    try {
      const result = await fixTranscript(upload.item.id, transcript.text);
      setTags(result.tags.filter((tag) => tag.state !== "removed" && tag.state !== "added"));
      setRemoved(new Set());
      setTranscript(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't re-mark it. Try again.");
      setTranscript({ ...transcript, saving: false });
    }
  }

  const title = remaining > 0 ? `Check this one (${remaining} more after)` : "Did Arcad get this right?";

  return (
    <Sheet open eyebrow="Quick check-in" title={title} onClose={onDone}>
      <div className="space-y-5">
        <p className="text-[13px] leading-[1.5]" style={{ color: "var(--app-text-muted)" }}>
          <span className="font-medium" style={{ color: "var(--app-text)" }}>
            {upload.item.filename}
          </span>
          {upload.kind === "notes" ? " · Looks like notes, so it counts as exposure, not mastery." : null}
        </p>

        <div>
          <p className="mb-2 text-[12.5px] font-medium" style={{ color: "var(--app-text-muted)" }}>
            Dot points it covered. Untick any that are wrong.
          </p>
          <ul className="flex flex-col overflow-hidden rounded-md" style={{ background: "var(--app-surface-soft)", boxShadow: "var(--elev-inset)" }}>
            {tags.map((tag) => {
              const off = removed.has(tag.pointId);
              const quality = qualityLabel(tag.quality);
              return (
                <li key={tag.pointId} className="border-b last:border-b-0" style={{ borderColor: "var(--app-border)" }}>
                  <label className="flex cursor-pointer items-start gap-3 px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={!off}
                      onChange={() => toggle(tag.pointId)}
                      className="mt-[3px] h-4 w-4 shrink-0 accent-[var(--app-accent)]"
                    />
                    <span className="min-w-0 flex-1" style={{ opacity: off ? 0.5 : 1 }}>
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-[11.5px]" style={{ color: "var(--app-text-faint)" }}>
                          {shortPointId(tag.pointId)}
                        </span>
                        <span className="text-[12px]" style={{ color: "var(--app-text-muted)" }}>
                          {tag.subtopic}
                        </span>
                        <ToneTag tone={quality.tone} size="sm">
                          {quality.label}
                        </ToneTag>
                      </span>
                      <span
                        className="mt-0.5 block text-[13px] leading-snug"
                        style={{ color: "var(--app-text)", textDecoration: off ? "line-through" : undefined }}
                      >
                        {tag.text}
                      </span>
                      {tag.evidence ? (
                        <span className="mt-0.5 block text-[12px] leading-snug" style={{ color: "var(--app-text-muted)" }}>
                          {tag.evidence}
                        </span>
                      ) : null}
                    </span>
                  </label>
                </li>
              );
            })}
            {added.map((point) => (
              <li key={point.id} className="flex items-start gap-3 border-b px-3 py-2.5 last:border-b-0" style={{ borderColor: "var(--app-border)" }}>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-[11.5px]" style={{ color: "var(--app-text-faint)" }}>
                      {shortPointId(point.id)}
                    </span>
                    <ToneTag tone={null} size="sm">
                      Added by you
                    </ToneTag>
                  </span>
                  <span className="mt-0.5 block text-[13px] leading-snug" style={{ color: "var(--app-text)" }}>
                    {point.text}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setAdded((prev) => prev.filter((entry) => entry.id !== point.id))}
                  aria-label="Remove"
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-md ui-hover"
                  style={{ color: "var(--app-text-muted)" }}
                >
                  <svg viewBox="0 0 20 20" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                    <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex flex-wrap gap-2">
            <AppButton type="button" size="sm" variant="ghost" onClick={() => setAdding((open) => !open)}>
              {adding ? "Done adding" : "Add one Arcad missed"}
            </AppButton>
            {transcript ? null : (
              <AppButton type="button" size="sm" variant="ghost" onClick={openTranscript}>
                See what Arcad read
              </AppButton>
            )}
          </div>
          {adding ? (
            <PointSearch
              subjectId={upload.item.subjectId}
              exclude={new Set([...tags.map((tag) => tag.pointId), ...added.map((point) => point.id)])}
              onPick={(point) => setAdded((prev) => [...prev, point])}
            />
          ) : null}
          {transcript ? (
            <div className="mt-3 space-y-2">
              <p className="text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>
                Fix anything misread, then re-mark. Your ticks above are redone from the new text.
              </p>
              <textarea
                value={transcript.text}
                onChange={(event) => setTranscript({ text: event.target.value, saving: false })}
                rows={8}
                disabled={transcript.saving}
                className="w-full rounded-md px-3 py-2 font-mono text-[12.5px] leading-[1.5]"
                style={{ background: "var(--app-surface)", color: "var(--app-text)", border: "1px solid var(--app-border)" }}
              />
              <div className="flex justify-end gap-2">
                <AppButton type="button" size="sm" variant="ghost" onClick={() => setTranscript(null)}>
                  Cancel
                </AppButton>
                <AppButton type="button" size="sm" variant="secondary" disabled={transcript.saving || !transcript.text.trim()} onClick={remark}>
                  {transcript.saving ? "Working…" : "Re-mark"}
                </AppButton>
              </div>
            </div>
          ) : null}
        </div>

        <div>
          <p className="mb-2 text-[12.5px] font-medium" style={{ color: "var(--app-text-muted)" }}>
            How sure do you feel about this work?
          </p>
          <div className="flex gap-2" role="radiogroup" aria-label="How sure you feel, 1 to 5">
            {[1, 2, 3, 4, 5].map((value) => {
              const active = confidence === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setConfidence(active ? null : value)}
                  className="flex-1 rounded-md py-2 text-[14px] font-medium tabular-nums transition-colors"
                  style={{
                    background: active ? "var(--app-accent-soft)" : "var(--app-surface-soft)",
                    color: active ? "var(--app-accent-strong)" : "var(--app-text-soft)",
                    border: `1px solid ${active ? "var(--app-accent)" : "var(--app-border)"}`,
                  }}
                >
                  {value}
                </button>
              );
            })}
          </div>
          <div className="mt-1 flex justify-between text-[11.5px]" style={{ color: "var(--app-text-faint)" }}>
            <span>{CONFIDENCE_ENDS[0]}</span>
            <span>{CONFIDENCE_ENDS[1]}</span>
          </div>
        </div>

        {error ? (
          <p className="text-[12.5px]" style={{ color: "var(--app-danger)" }}>
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2 pt-1">
          <AppButton type="button" variant="ghost" onClick={onDone} disabled={saving}>
            Later
          </AppButton>
          <AppButton type="button" variant="primary" onClick={save} disabled={saving || Boolean(transcript)}>
            {saving ? "Saving…" : "Looks right"}
          </AppButton>
        </div>
      </div>
    </Sheet>
  );
}

function PointSearch({
  subjectId,
  exclude,
  onPick,
}: {
  subjectId: string;
  exclude: Set<string>;
  onPick: (point: MasteryPoint) => void;
}) {
  const [query, setQuery] = useState("");
  const [points, setPoints] = useState<MasteryPoint[] | null>(null);
  const loading = points === null;

  useEffect(() => {
    let live = true;
    fetchMastery(subjectId)
      .then((data) => live && setPoints(data.points))
      .catch(() => live && setPoints([]));
    return () => {
      live = false;
    };
  }, [subjectId]);

  const matches = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!points || words.length === 0) return [];
    return points
      .filter((point) => !exclude.has(point.id))
      .filter((point) => {
        const hay = `${point.topicTitle} ${point.subtopic} ${point.text}`.toLowerCase();
        return words.every((word) => hay.includes(word));
      })
      .slice(0, 8);
  }, [points, query, exclude]);

  return (
    <div className="mt-3 space-y-2">
      <input
        autoFocus
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={loading ? "Loading the syllabus…" : "Search dot points, e.g. chain rule"}
        className="w-full rounded-md px-3 py-2 text-[13.5px]"
        style={{ background: "var(--app-surface)", color: "var(--app-text)", border: "1px solid var(--app-border)" }}
      />
      {matches.length ? (
        <ul className="flex flex-col overflow-hidden rounded-md" style={{ boxShadow: "inset 0 0 0 1px var(--app-border)" }}>
          {matches.map((point) => (
            <li key={point.id} className="border-b last:border-b-0" style={{ borderColor: "var(--app-border)" }}>
              <button
                type="button"
                onClick={() => {
                  onPick(point);
                  setQuery("");
                }}
                className="block w-full px-3 py-2 text-left ui-hover"
              >
                <span className="block text-[11.5px]" style={{ color: "var(--app-text-faint)" }}>
                  <span className="font-mono">{shortPointId(point.id)}</span> · {point.subtopic}
                </span>
                <span className="block text-[13px] leading-snug" style={{ color: "var(--app-text)" }}>
                  {point.text}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : query.trim() && points ? (
        <p className="text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>
          Nothing matches that.
        </p>
      ) : null}
    </div>
  );
}
