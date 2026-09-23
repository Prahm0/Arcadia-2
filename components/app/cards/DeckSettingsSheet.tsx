"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { deleteDeck, updateDeck, type Deck } from "@/lib/api/cards";
import { useProfile } from "@/lib/api/profile";
import AppButton from "../AppButton";
import { Label, Select, Sheet, TextInput } from "../profile/ui";
import { useSubjects } from "./shared";

/** Rename, move to another subject, tie to a syllabus topic, or delete. */
export default function DeckSettingsSheet({
  open,
  deck,
  onClose,
  onSaved,
  onDeleted,
}: {
  open: boolean;
  deck: Deck;
  onClose: () => void;
  onSaved: (deck: Deck) => void;
  /** Opened from the shelf rather than the deck's page: stay on the shelf. */
  onDeleted?: () => void;
}) {
  if (!open) return null;
  return <SettingsForm deck={deck} onClose={onClose} onSaved={onSaved} onDeleted={onDeleted} />;
}

function SettingsForm({
  deck,
  onClose,
  onSaved,
  onDeleted,
}: {
  deck: Deck;
  onClose: () => void;
  onSaved: (deck: Deck) => void;
  onDeleted?: () => void;
}) {
  const router = useRouter();
  const { subjects } = useSubjects();
  // Topics live on the profile; only fetched while this is open.
  const { state: profile } = useProfile();
  const [title, setTitle] = useState(deck.title);
  const [subjectId, setSubjectId] = useState(deck.subjectId ?? "");
  const [topicId, setTopicId] = useState(deck.topic?.id ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const topics =
    profile.status === "ready" ? profile.data.subjects.find((subject) => subject.id === subjectId)?.topics ?? [] : [];

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const { deck: next } = await updateDeck(deck.id, {
        title: title.trim(),
        subjectId: subjectId || null,
        topicId: topicId || null,
      });
      onSaved(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm(`Delete ${deck.title} and its ${deck.cardCount} cards? This can't be undone.`)) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteDeck(deck.id);
      if (onDeleted) onDeleted();
      else router.push("/app/cards");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete it.");
      setDeleting(false);
    }
  }

  return (
    <Sheet open eyebrow="Deck" title="Settings" onClose={onClose}>
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <Label text="Name">
          <TextInput value={title} onChange={setTitle} maxLength={80} required />
        </Label>
        <Label text="Subject">
          <Select
            value={subjectId}
            onChange={(value) => {
              setSubjectId(value);
              setTopicId("");
            }}
          >
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
            <option value="">No subject</option>
          </Select>
        </Label>
        {subjectId ? (
          <Label
            text="Syllabus topic"
            hint={
              profile.status === "ready" && topics.length === 0
                ? "Upload this subject's syllabus on its page to pick a topic."
                : "Optional. Ties the deck to what you're learning when."
            }
          >
            <Select value={topicId} onChange={setTopicId}>
              <option value="">None</option>
              {topics.map((topic) => (
                <option key={topic.id} value={topic.id}>
                  {topic.title}
                </option>
              ))}
            </Select>
          </Label>
        ) : null}

        {error ? (
          <p role="alert" className="text-[12.5px]" style={{ color: "var(--app-danger)" }}>
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <AppButton type="button" variant="danger" onClick={() => void remove()} loading={deleting} disabled={saving}>
            Delete deck
          </AppButton>
          <div className="flex gap-2">
            <AppButton type="button" variant="ghost" onClick={onClose}>
              Cancel
            </AppButton>
            <AppButton type="submit" variant="primary" loading={saving} disabled={deleting || !title.trim()}>
              Save
            </AppButton>
          </div>
        </div>
      </form>
    </Sheet>
  );
}
