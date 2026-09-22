"use client";

import { useState } from "react";
import { api } from "@/lib/api/client";
import { updateProfile } from "@/lib/api/profile";
import AppButton from "../AppButton";
import type { SectionProps } from "./ProfileView";
import { Label, Section, TextArea, TextInput } from "./ui";

const LIMIT = 1500;

/**
 * Personalising Arcad, the way ChatGPT does it: two things the student
 * writes themselves, and a memory Arcad fills in from chats that the student
 * can read, add to and clear.
 */
export default function ArcadSection({ data, refresh, replace }: SectionProps) {
  const { arcad } = data;
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  return (
    <Section id="arcad" title="Arcad" meta="What Arcad knows about you and how it talks to you.">
      {/* Keyed on the saved text, so the drafts reset only when the server copy changes. */}
      <Instructions
        key={JSON.stringify([arcad.about, arcad.style])}
        savedAbout={arcad.about}
        savedStyle={arcad.style}
        notice={notice}
        onSave={async (about, style) => {
          setNotice(null);
          try {
            replace(await updateProfile({ arcadAbout: about, arcadStyle: style }));
            setNotice({ tone: "ok", text: "Saved. Arcad will use this from your next message." });
          } catch (err) {
            setNotice({ tone: "error", text: err instanceof Error ? err.message : "Couldn't save." });
          }
        }}
      />

      <Memory data={data} refresh={refresh} replace={replace} />
    </Section>
  );
}

function Instructions({
  savedAbout,
  savedStyle,
  notice,
  onSave,
}: {
  savedAbout: string;
  savedStyle: string;
  notice: { tone: "ok" | "error"; text: string } | null;
  onSave: (about: string, style: string) => Promise<void>;
}) {
  const [about, setAbout] = useState(savedAbout);
  const [style, setStyle] = useState(savedStyle);
  const [saving, setSaving] = useState(false);
  const dirty = about !== savedAbout || style !== savedStyle;

  async function save() {
    setSaving(true);
    try {
      await onSave(about, style);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <Label text="What should Arcad know about you?" hint={`${about.length}/${LIMIT}`}>
        <TextArea
          value={about}
          onChange={setAbout}
          maxLength={LIMIT}
          rows={4}
          placeholder="e.g. I'm aiming for Engineering at UQ. I work Saturday mornings. Chemistry calculations are my weak spot and I lose focus after about 40 minutes."
        />
      </Label>
      <Label text="How should Arcad respond?" hint={`${style.length}/${LIMIT}`}>
        <TextArea
          value={style}
          onChange={setStyle}
          maxLength={LIMIT}
          rows={3}
          placeholder="e.g. Keep it short and direct. No pep talks. Give me one plan, not a list of options."
        />
      </Label>
      <div className="flex flex-wrap items-center justify-end gap-3">
        {notice ? (
          <p
            role={notice.tone === "error" ? "alert" : "status"}
            className="mr-auto text-[13px]"
            style={{ color: notice.tone === "error" ? "var(--app-danger)" : "var(--app-success)" }}
          >
            {notice.text}
          </p>
        ) : null}
        <AppButton variant="primary" onClick={() => void save()} loading={saving} disabled={!dirty}>
          Save
        </AppButton>
      </div>
    </div>
  );
}

function Memory({ data, refresh, replace }: Pick<SectionProps, "data" | "refresh" | "replace">) {
  const { memoryEnabled, memories } = data.arcad;
  const [busy, setBusy] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function run(key: string, action: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await action();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  async function toggle() {
    setBusy("toggle");
    setError(null);
    try {
      replace(await updateProfile({ memoryEnabled: !memoryEnabled }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't change that.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-6 border-t pt-5" style={{ borderColor: "var(--app-border)" }}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-[14px] font-medium" style={{ color: "var(--app-text)" }}>
            Memory
          </h3>
          <p className="mt-0.5 text-[13px]" style={{ color: "var(--app-text-muted)" }}>
            {memoryEnabled
              ? "Arcad saves things you tell it that will matter later, like how you study best. You can remove any of them."
              : "Off. Arcad won't save anything new or use what it saved."}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={memoryEnabled}
          aria-label="Let Arcad remember things from your chats"
          disabled={busy === "toggle"}
          onClick={() => void toggle()}
          className="relative mt-0.5 h-6 w-10 shrink-0 rounded-full transition-colors disabled:opacity-60"
          style={{ background: memoryEnabled ? "var(--app-accent)" : "var(--app-border-strong)" }}
        >
          <span
            aria-hidden="true"
            className="absolute top-0.5 h-5 w-5 rounded-full transition-[left]"
            style={{ left: memoryEnabled ? 18 : 2, background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}
          />
        </button>
      </div>

      <div style={{ opacity: memoryEnabled ? 1 : 0.55 }}>
        {memories.length === 0 ? (
          <p className="mt-3 text-[13px]" style={{ color: "var(--app-text-muted)" }}>
            Nothing saved yet. Tell Arcad something like &ldquo;I study best after dinner&rdquo; and it&apos;ll show up here.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col">
            {memories.map((memory) => (
              <li
                key={memory.id}
                className="group flex items-start gap-3 border-b py-2.5 last:border-b-0"
                style={{ borderColor: "var(--app-border)" }}
              >
                <span className="min-w-0 flex-1 text-[14px] leading-snug" style={{ color: "var(--app-text)" }}>
                  {memory.content}{" "}
                  <span className="ml-1 text-[11.5px]" style={{ color: "var(--app-text-faint)" }}>
                    {memory.source === "manual" ? "added by you" : "from a chat"}
                  </span>
                </span>
                <button
                  type="button"
                  disabled={busy === memory.id}
                  onClick={() =>
                    void run(memory.id, () =>
                      api(`/api/memories/${encodeURIComponent(memory.id)}`, { method: "DELETE" }),
                    )
                  }
                  aria-label={`Forget "${memory.content}"`}
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-md opacity-60 ui-hover group-hover:opacity-100"
                  style={{ color: "var(--app-text-muted)" }}
                >
                  <svg viewBox="0 0 20 20" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.7">
                    <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        )}

        <form
          className="mt-3 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const content = draft.trim();
            if (!content) return;
            void run("add", async () => {
              await api("/api/memories", { method: "POST", body: JSON.stringify({ content }) });
              setDraft("");
            });
          }}
        >
          <div className="flex-1">
            <TextInput value={draft} onChange={setDraft} maxLength={300} placeholder="Tell Arcad to remember something…" />
          </div>
          <AppButton type="submit" variant="secondary" loading={busy === "add"} disabled={!draft.trim()}>
            Add
          </AppButton>
        </form>

        {memories.length > 0 ? (
          <div className="mt-3 flex justify-end">
            <AppButton
              variant="ghost"
              size="sm"
              loading={busy === "clear"}
              onClick={() => {
                if (!confirm("Forget everything Arcad has remembered about you?")) return;
                void run("clear", () => api("/api/memories", { method: "DELETE" }));
              }}
            >
              Forget everything
            </AppButton>
          </div>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="mt-2 text-[12.5px]" style={{ color: "var(--app-danger)" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
