"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api/client";
import AppButton from "../AppButton";

interface Suggestion {
  id: string; subject: string; authority: string; versionIdentifier: string;
  countryCode: string; stateCode: string | null; yearLevels: string[];
  sourceTitle: string; sourceUrl: string | null; sourceLicense: string | null;
  sourceAttribution: string | null; topics: number; assessments: number;
}

export default function CatalogSuggestions({ subjectId, hasSyllabus, onAdded }: { subjectId: string; hasSyllabus: boolean; onAdded: () => Promise<void> }) {
  const [syllabi, setSyllabi] = useState<Suggestion[]>([]);
  const [needsProfile, setNeedsProfile] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [upgrade, setUpgrade] = useState(false);
  useEffect(() => {
    let active = true;
    void api<{ syllabi: Suggestion[]; needsProfile: boolean }>(`/api/profile/subjects/${encodeURIComponent(subjectId)}/syllabi`)
      .then((data) => { if (active) { setSyllabi(data.syllabi); setNeedsProfile(data.needsProfile); } })
      .catch(() => { if (active) setMessage("Couldn't load suggested syllabi."); });
    return () => { active = false; };
  }, [subjectId]);

  async function add(item: Suggestion) {
    if (hasSyllabus && !confirm("Replace your current syllabus and its imported topics and assessments? Your manually added topics and deadlines will stay.")) return;
    setBusy(item.id); setMessage(null); setUpgrade(false);
    try {
      await api(`/api/profile/subjects/${encodeURIComponent(subjectId)}/syllabi/${encodeURIComponent(item.id)}`, { method: "POST" });
      await onAdded();
      setMessage(`Added ${item.subject}. You can edit its topics and assessments below.`);
    } catch (error) {
      setUpgrade(error instanceof ApiError && error.status === 402);
      setMessage(error instanceof Error ? error.message : "Couldn't add this syllabus.");
    } finally { setBusy(null); }
  }

  return (
    <div className="mb-5">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <p className="text-[13.5px] font-medium" style={{ color: "var(--app-text)" }}>Suggested for you</p>
        <span className="text-[12px]" style={{ color: "var(--app-text-muted)" }}>Based on your subject and profile</span>
      </div>
      {syllabi.length ? (
        <ul className="space-y-2">
          {syllabi.map((item) => (
            <li key={item.id} className="rounded-lg border p-3.5" style={{ borderColor: "var(--app-border)", background: "var(--app-surface-soft)" }}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-medium" style={{ color: "var(--app-text)" }}>{item.subject}</p>
                  <p className="mt-0.5 text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>
                    {item.authority} · {item.versionIdentifier} · {item.topics} topics · {item.assessments} assessments
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <AppButton size="sm" variant="ghost" aria-expanded={expanded === item.id} onClick={() => setExpanded(expanded === item.id ? null : item.id)}>Info</AppButton>
                  <AppButton size="sm" variant="secondary" loading={busy === item.id} onClick={() => void add(item)}>Add</AppButton>
                </div>
              </div>
              {expanded === item.id ? (
                <div className="mt-3 border-t pt-3 text-[12.5px] leading-relaxed" style={{ borderColor: "var(--app-border)", color: "var(--app-text-soft)" }}>
                  <p>{item.sourceTitle}</p>
                  <p>{item.countryCode}{item.stateCode ? ` · ${item.stateCode}` : ""} · Years {item.yearLevels.join(", ")}</p>
                  {item.sourceLicense ? <p>Licence: {item.sourceLicense}</p> : null}
                  {item.sourceAttribution ? <p>{item.sourceAttribution}</p> : null}
                  {item.sourceUrl ? <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block underline" style={{ color: "var(--app-accent-strong)" }}>View official syllabus ↗</a> : null}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : needsProfile ? (
        <p className="rounded-md px-3 py-2.5 text-[12.5px]" style={{ background: "var(--app-surface-soft)", color: "var(--app-text-muted)" }}>
          Add your country, state and year level in your profile to see matching syllabi.
        </p>
      ) : (
        <p className="text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>No matching syllabus yet. You can upload yours below.</p>
      )}
      {message ? <p role={upgrade ? "alert" : "status"} className="mt-2 text-[12.5px]" style={{ color: upgrade ? "var(--app-danger)" : "var(--app-text-soft)" }}>{message}{upgrade ? <> <Link href="/app/pricing" className="underline">View Pro and Max</Link></> : null}</p> : null}
    </div>
  );
}
