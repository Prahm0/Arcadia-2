"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { ApiError, api } from "@/lib/api/client";
import type { AssessmentKind, ProfileSubject, SubjectAssessment, SubjectTopic } from "@/lib/api/profile";
import { MATERIAL_ACCEPT, formatDateSpan, uploadMaterial } from "@/lib/api/subjectMaterials";
import AppButton from "../AppButton";
import { PlusIcon } from "./SubjectsSection";
import { Label, Section, Select, Sheet, TextInput } from "./ui";

const KIND_LABEL: Record<AssessmentKind, string> = {
  exam: "Exam",
  assignment: "Assignment",
  test: "Test",
  prac: "Prac",
  other: "Other",
};

/**
 * The course map for one subject: upload the unit outline or assessment
 * schedule and Arcad pulls out what's taught when and what's assessed when.
 * Everything it reads can be fixed or added to by hand.
 */
export default function SyllabusSection({
  subject,
  refresh,
  replanned,
}: {
  subject: ProfileSubject;
  refresh: () => Promise<void>;
  /** After adding a deadline, which changes the plan. */
  replanned: () => Promise<void>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string; upgrade?: boolean } | null>(null);
  const [topicSheet, setTopicSheet] = useState<SubjectTopic | "new" | null>(null);
  const [assessmentSheet, setAssessmentSheet] = useState<SubjectAssessment | "new" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function upload(file: File) {
    setUploading(true);
    setNotice(null);
    try {
      const result = await uploadMaterial(subject.id, file, "syllabus");
      await refresh();
      setNotice(
        result.read
          ? { tone: "ok", text: `Got it: ${result.topics} topics and ${result.assessments} assessments. Check they look right.` }
          : { tone: "error", text: result.message ?? "Arcad couldn't read that one." },
      );
    } catch (err) {
      setNotice({
        tone: "error",
        text: err instanceof Error ? err.message : "Upload failed.",
        upgrade: err instanceof ApiError && err.status === 402,
      });
    } finally {
      setUploading(false);
      if (input.current) input.current.value = "";
    }
  }

  async function removeSyllabus() {
    if (!subject.syllabus) return;
    if (!confirm("Remove the syllabus and the topics Arcad read from it? Deadlines you added stay.")) return;
    setBusy("syllabus");
    try {
      await api(`/api/subject-files/${encodeURIComponent(subject.syllabus.id)}`, { method: "DELETE" });
      await refresh();
      setNotice(null);
    } finally {
      setBusy(null);
    }
  }

  async function addDeadline(item: SubjectAssessment) {
    setBusy(item.id);
    setNotice(null);
    try {
      await api(`/api/assessments/${encodeURIComponent(item.id)}/deadline`, { method: "POST" });
      await replanned();
    } catch (err) {
      setNotice({ tone: "error", text: err instanceof Error ? err.message : "Couldn't add it." });
    } finally {
      setBusy(null);
    }
  }

  // Local calendar date; en-CA formats as YYYY-MM-DD.
  const today = new Date().toLocaleDateString("en-CA");

  return (
    <Section
      id="syllabus"
      title="Syllabus"
      meta="Your unit outline or assessment schedule. Arcad pulls out what's taught when and what's assessed."
    >
      <input
        ref={input}
        type="file"
        accept={MATERIAL_ACCEPT}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />

      {uploading ? (
        <div className="flex items-center gap-3 rounded-md p-4" style={{ background: "var(--app-surface-soft)" }} role="status">
          <span
            aria-hidden="true"
            className="h-4 w-4 animate-spin rounded-full border-2"
            style={{ borderColor: "var(--app-border)", borderTopColor: "var(--app-arcad)" }}
          />
          <span className="text-[13.5px]" style={{ color: "var(--app-text-soft)" }}>
            Arcad&apos;s reading it. Give it a few seconds.
          </span>
        </div>
      ) : subject.syllabus ? (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-md px-4 py-3"
          style={{ background: "var(--app-surface-soft)" }}
        >
          <div className="min-w-0">
            <p className="truncate text-[14px] font-medium" style={{ color: "var(--app-text)" }}>
              {subject.syllabus.filename}
            </p>
            <p className="text-[12.5px]" style={{ color: subject.syllabus.read ? "var(--app-text-muted)" : "var(--app-danger)" }}>
              {subject.syllabus.read ? `Read by Arcad: ${subject.syllabus.summary}` : "Arcad couldn't read this one. Add topics yourself below."}
            </p>
          </div>
          <div className="flex gap-2">
            {subject.syllabus.stored ? (
              <a
                href={`/api/subject-files/${encodeURIComponent(subject.syllabus.id)}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-7 items-center rounded-md px-2.5 text-[12.5px] ui-hover"
                style={{ color: "var(--app-text-soft)" }}
              >
                Open
              </a>
            ) : null}
            <AppButton size="sm" variant="secondary" onClick={() => input.current?.click()}>
              Replace
            </AppButton>
            <AppButton size="sm" variant="ghost" loading={busy === "syllabus"} onClick={() => void removeSyllabus()}>
              Remove
            </AppButton>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const file = event.dataTransfer.files?.[0];
            if (file) void upload(file);
          }}
          className="flex w-full flex-col items-center gap-1 rounded-md px-4 py-6 text-center transition-colors ui-hover"
          style={{ border: "1.5px dashed var(--app-border-strong)" }}
        >
          <span className="text-[14px] font-medium" style={{ color: "var(--app-text)" }}>
            Upload your syllabus
          </span>
          <span className="text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>
            PDF or a photo, up to 8 MB. Drop it here or tap to choose.
          </span>
        </button>
      )}

      {notice ? (
        <p
          role={notice.tone === "error" ? "alert" : "status"}
          className="mt-3 text-[13px]"
          style={{ color: notice.tone === "error" ? "var(--app-danger)" : "var(--app-success)" }}
        >
          {notice.text}
          {notice.upgrade ? (
            <>
              {" "}
              <Link href="/app/pricing" className="underline" style={{ color: "var(--app-accent-strong)" }}>
                See plans
              </Link>
            </>
          ) : null}
        </p>
      ) : null}

      <div className="mt-5">
        <SubHeader title="Topics" onAdd={() => setTopicSheet("new")} />
        {subject.topics.length === 0 ? (
          <Empty>No topics yet. They show up here once Arcad reads your syllabus, or add them yourself.</Empty>
        ) : (
          <ul className="flex flex-col">
            {subject.topics.map((topic) => {
              const now = subject.currentTopic?.id === topic.id && !subject.currentTopic.upcoming;
              const past = Boolean(topic.endsOn && topic.endsOn < today);
              return (
                <li key={topic.id}>
                  <button
                    type="button"
                    onClick={() => setTopicSheet(topic)}
                    className="flex w-full items-start gap-3 rounded-md px-2 py-2.5 text-left ui-hover"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span
                          className="truncate text-[14px]"
                          style={{ color: past ? "var(--app-text-muted)" : "var(--app-text)", fontWeight: now ? 600 : 400 }}
                        >
                          {topic.title}
                        </span>
                        {now ? (
                          <span
                            className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium"
                            style={{ background: "var(--app-arcad-soft)", color: "var(--app-arcad-strong)" }}
                          >
                            Now
                          </span>
                        ) : null}
                      </span>
                      {topic.detail ? (
                        <span className="mt-0.5 block truncate text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>
                          {topic.detail}
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 font-mono text-[12px]" style={{ color: "var(--app-text-muted)" }}>
                      {formatDateSpan(topic.startsOn, topic.endsOn)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="mt-5 border-t pt-4" style={{ borderColor: "var(--app-border)" }}>
        <SubHeader title="Assessments" onAdd={() => setAssessmentSheet("new")} />
        {subject.assessments.length === 0 ? (
          <Empty>No assessments yet.</Empty>
        ) : (
          <ul className="flex flex-col">
            {subject.assessments.map((item) => {
              const past = Boolean(item.dueOn && item.dueOn < today);
              return (
                <li key={item.id} className="flex items-center gap-3 rounded-md px-2 py-2">
                  <button type="button" onClick={() => setAssessmentSheet(item)} className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-[14px]" style={{ color: past ? "var(--app-text-muted)" : "var(--app-text)" }}>
                      {item.title}
                    </span>
                    <span className="block text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>
                      {[KIND_LABEL[item.kind], item.weight, item.dueLabel || null].filter(Boolean).join(" · ")}
                    </span>
                  </button>
                  <span className="shrink-0 font-mono text-[12px]" style={{ color: "var(--app-text-muted)" }}>
                    {formatDateSpan(item.dueOn, null)}
                  </span>
                  {item.taskId ? (
                    <span
                      className="shrink-0 rounded px-1.5 py-0.5 text-[11.5px]"
                      style={{ background: "var(--app-surface-soft)", color: "var(--app-text-soft)" }}
                    >
                      In deadlines
                    </span>
                  ) : item.dueOn && !past ? (
                    <AppButton size="sm" variant="secondary" loading={busy === item.id} onClick={() => void addDeadline(item)}>
                      Add to deadlines
                    </AppButton>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <TopicSheet
        subjectId={subject.id}
        editing={topicSheet === "new" ? null : topicSheet}
        open={topicSheet !== null}
        onClose={() => setTopicSheet(null)}
        onSaved={refresh}
      />
      <AssessmentSheet
        subjectId={subject.id}
        editing={assessmentSheet === "new" ? null : assessmentSheet}
        open={assessmentSheet !== null}
        onClose={() => setAssessmentSheet(null)}
        onSaved={refresh}
      />
    </Section>
  );
}

function SubHeader({ title, onAdd }: { title: string; onAdd: () => void }) {
  return (
    <div className="mb-1 flex items-center justify-between gap-3">
      <h3 className="text-[13px] font-medium" style={{ color: "var(--app-text-soft)" }}>
        {title}
      </h3>
      <AppButton size="sm" variant="ghost" icon={<PlusIcon />} onClick={onAdd}>
        Add
      </AppButton>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-2 py-1.5 text-[13px]" style={{ color: "var(--app-text-muted)" }}>
      {children}
    </p>
  );
}

function SheetActions({
  editing,
  saving,
  removing,
  onRemove,
  onClose,
}: {
  editing: boolean;
  saving: boolean;
  removing: boolean;
  onRemove: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 pt-2">
      {editing ? (
        <AppButton type="button" variant="danger" loading={removing} onClick={onRemove}>
          Remove
        </AppButton>
      ) : (
        <span />
      )}
      <div className="flex gap-2">
        <AppButton type="button" variant="ghost" onClick={onClose}>
          Cancel
        </AppButton>
        <AppButton type="submit" variant="primary" loading={saving}>
          {editing ? "Save" : "Add"}
        </AppButton>
      </div>
    </div>
  );
}

function useSheetForm(onSaved: () => Promise<void>, onClose: () => void) {
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(action: () => Promise<unknown>, kind: "save" | "remove") {
    const set = kind === "save" ? setSaving : setRemoving;
    set(true);
    setError(null);
    try {
      await action();
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      set(false);
    }
  }
  return { saving, removing, error, run };
}

interface TopicSheetProps {
  subjectId: string;
  editing: SubjectTopic | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}

function TopicSheet({ open, ...props }: TopicSheetProps & { open: boolean }) {
  return (
    <Sheet open={open} eyebrow={props.editing ? "Edit" : "Add"} title={props.editing ? "Topic" : "New topic"} onClose={props.onClose}>
      <TopicForm {...props} />
    </Sheet>
  );
}

function TopicForm({ subjectId, editing, onClose, onSaved }: TopicSheetProps) {
  const [title, setTitle] = useState(editing?.title ?? "");
  const [detail, setDetail] = useState(editing?.detail ?? "");
  const [startsOn, setStartsOn] = useState(editing?.startsOn ?? "");
  const [endsOn, setEndsOn] = useState(editing?.endsOn ?? "");
  const { saving, removing, error, run } = useSheetForm(onSaved, onClose);
  const body = { title, detail, startsOn: startsOn || null, endsOn: endsOn || startsOn || null };

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        void run(
          () =>
            editing
              ? api(`/api/topics/${encodeURIComponent(editing.id)}`, { method: "PATCH", body: JSON.stringify(body) })
              : api(`/api/subjects/${encodeURIComponent(subjectId)}/topics`, { method: "POST", body: JSON.stringify(body) }),
          "save",
        );
      }}
    >
      <Label text="Topic">
        <TextInput required value={title} onChange={setTitle} maxLength={80} placeholder="e.g. 3.2 Limiting reagents" />
      </Label>
      <Label text="Detail (optional)">
        <TextInput value={detail} onChange={setDetail} maxLength={200} placeholder="What it covers" />
      </Label>
      <div className="grid grid-cols-2 gap-4">
        <Label text="Starts">
          <TextInput type="date" value={startsOn} onChange={setStartsOn} />
        </Label>
        <Label text="Ends">
          <TextInput type="date" value={endsOn} onChange={setEndsOn} />
        </Label>
      </div>
      {error ? (
        <p role="alert" className="text-[13.5px]" style={{ color: "var(--app-danger)" }}>
          {error}
        </p>
      ) : null}
      <SheetActions
        editing={Boolean(editing)}
        saving={saving}
        removing={removing}
        onClose={onClose}
        onRemove={() =>
          editing && void run(() => api(`/api/topics/${encodeURIComponent(editing.id)}`, { method: "DELETE" }), "remove")
        }
      />
    </form>
  );
}

interface AssessmentSheetProps {
  subjectId: string;
  editing: SubjectAssessment | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}

function AssessmentSheet({ open, ...props }: AssessmentSheetProps & { open: boolean }) {
  return (
    <Sheet
      open={open}
      eyebrow={props.editing ? "Edit" : "Add"}
      title={props.editing ? "Assessment" : "New assessment"}
      onClose={props.onClose}
    >
      <AssessmentForm {...props} />
    </Sheet>
  );
}

function AssessmentForm({ subjectId, editing, onClose, onSaved }: AssessmentSheetProps) {
  const [title, setTitle] = useState(editing?.title ?? "");
  const [kind, setKind] = useState<AssessmentKind>(editing?.kind ?? "assignment");
  const [dueOn, setDueOn] = useState(editing?.dueOn ?? "");
  const [weight, setWeight] = useState(editing?.weight ?? "");
  const { saving, removing, error, run } = useSheetForm(onSaved, onClose);
  const body = { title, kind, dueOn: dueOn || null, weight };

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        void run(
          () =>
            editing
              ? api(`/api/assessments/${encodeURIComponent(editing.id)}`, { method: "PATCH", body: JSON.stringify(body) })
              : api(`/api/subjects/${encodeURIComponent(subjectId)}/assessments`, { method: "POST", body: JSON.stringify(body) }),
          "save",
        );
      }}
    >
      <Label text="Assessment">
        <TextInput required value={title} onChange={setTitle} maxLength={120} placeholder="e.g. IA2 Research investigation" />
      </Label>
      <div className="grid grid-cols-2 gap-4">
        <Label text="Type">
          <Select value={kind} onChange={(value) => setKind(value as AssessmentKind)}>
            {Object.entries(KIND_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Label>
        <Label text="Due">
          <TextInput type="date" value={dueOn} onChange={setDueOn} />
        </Label>
      </div>
      <Label text="Weighting (optional)">
        <TextInput value={weight} onChange={setWeight} maxLength={40} placeholder="e.g. 25%" />
      </Label>
      {editing?.dueLabel ? (
        <p className="text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>
          The syllabus says {editing.dueLabel}.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-[13.5px]" style={{ color: "var(--app-danger)" }}>
          {error}
        </p>
      ) : null}
      <SheetActions
        editing={Boolean(editing)}
        saving={saving}
        removing={removing}
        onClose={onClose}
        onRemove={() =>
          editing && void run(() => api(`/api/assessments/${encodeURIComponent(editing.id)}`, { method: "DELETE" }), "remove")
        }
      />
    </form>
  );
}
