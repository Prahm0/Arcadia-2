"use client";

import { useEffect, useState } from "react";
import { fetchSubjectTopics, type LoggedTopic, type SubjectTopics } from "@/lib/api/studyLog";
import type { TopicChoice } from "./FocusSession";

/** What the picker says about a topic after its name. */
function status(topic: LoggedTopic, currentTopicId: string | null): string {
  if (topic.confidence === "lost") return "lost last time";
  if (topic.confidence === "shaky") return "shaky";
  if (topic.id === currentTopicId) return "this week";
  if (topic.taught && topic.minutes === 0) return "not studied yet";
  return "";
}

/**
 * The syllabus topic a free session is on, so it goes in the study log.
 * Optional, and hidden for subjects without topics.
 */
export default function TopicSelect({
  subject,
  value,
  onChange,
}: {
  subject: string;
  value: TopicChoice | null;
  onChange: (topic: TopicChoice | null) => void;
}) {
  // Keyed by subject, so a stale answer for the last subject never shows.
  const [loaded, setLoaded] = useState<{ subject: string; data: SubjectTopics } | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchSubjectTopics(subject)
      .then((data) => {
        if (!cancelled) setLoaded({ subject, data });
      })
      .catch(() => {
        if (!cancelled) setLoaded({ subject, data: { subjectId: null, currentTopicId: null, topics: [] } });
      });
    return () => {
      cancelled = true;
    };
  }, [subject]);

  const data = loaded?.subject === subject ? loaded.data : null;
  if (!data || data.topics.length === 0) return null;
  return (
    <label className="block">
      <span className="mb-1 block text-[12px]" style={{ color: "var(--app-text-muted)" }}>
        Topic (optional)
      </span>
      <select
        value={value?.id ?? ""}
        onChange={(event) => {
          const topic = data.topics.find((item) => item.id === event.target.value);
          onChange(topic ? { id: topic.id, title: topic.title } : null);
        }}
        className="w-full rounded-md px-3 py-2 text-[14px] outline-none"
        style={{ background: "var(--app-surface-soft)", boxShadow: "var(--elev-inset)", color: "var(--app-text)" }}
      >
        <option value="">No particular topic</option>
        {data.topics.map((topic) => {
          const note = status(topic, data.currentTopicId);
          return (
            <option key={topic.id} value={topic.id}>
              {note ? `${topic.title} · ${note}` : topic.title}
            </option>
          );
        })}
      </select>
    </label>
  );
}
