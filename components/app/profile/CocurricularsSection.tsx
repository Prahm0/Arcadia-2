"use client";

import { useState } from "react";
import type { ProfileCommitment } from "@/lib/api/profile";
import AppButton from "../AppButton";
import CommitmentSheet, {
  COMMITMENT_CATEGORIES,
  describeRecurrence,
  formatTimeRange,
} from "../CommitmentSheet";
import type { SectionProps } from "./ProfileView";
import { PlusIcon } from "./SubjectsSection";
import { Section } from "./ui";

const ACTIVITIES: ProfileCommitment["category"][] = ["sport", "extracurricular"];

/**
 * Sport, clubs, music, work, and school hours: everything that takes a fixed
 * slot every week. The planner studies around all of it.
 */
export default function CocurricularsSection({ data, replanned }: SectionProps) {
  const [sheet, setSheet] = useState<{
    editing: ProfileCommitment | null;
    category: ProfileCommitment["category"];
  } | null>(null);

  const activities = data.commitments.filter((item) => ACTIVITIES.includes(item.category));
  const fixed = data.commitments.filter((item) => !ACTIVITIES.includes(item.category));

  return (
    <Section
      id="cocurriculars"
      title="Co-curriculars"
      meta="Sport, clubs and anything else with a set time. Study gets planned around them."
      action={
        <AppButton
          variant="secondary"
          size="sm"
          icon={<PlusIcon />}
          onClick={() => setSheet({ editing: null, category: "sport" })}
        >
          Add
        </AppButton>
      }
    >
      {activities.length === 0 ? (
        <p className="text-[14px]" style={{ color: "var(--app-text-muted)" }}>
          Nothing yet. Add training, a club or lessons so Arcad never plans study on top of them.
        </p>
      ) : (
        <CommitmentList items={activities} onOpen={(editing) => setSheet({ editing, category: editing.category })} />
      )}

      <div className="mt-5 border-t pt-4" style={{ borderColor: "var(--app-border)" }}>
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-[13px] font-medium" style={{ color: "var(--app-text-soft)" }}>
            School and other fixed times
          </h3>
          <AppButton
            variant="ghost"
            size="sm"
            icon={<PlusIcon />}
            onClick={() => setSheet({ editing: null, category: fixed.some((item) => item.category === "school") ? "other" : "school" })}
          >
            {fixed.some((item) => item.category === "school") ? "Add" : "Add school hours"}
          </AppButton>
        </div>
        {fixed.length === 0 ? (
          <p className="mt-2 text-[13px]" style={{ color: "var(--app-text-muted)" }}>
            Add your school hours so study lands after the bell, not during class.
          </p>
        ) : (
          <div className="mt-2">
            <CommitmentList items={fixed} onOpen={(editing) => setSheet({ editing, category: editing.category })} />
          </div>
        )}
      </div>

      <CommitmentSheet
        open={sheet !== null}
        editing={sheet?.editing ?? null}
        defaultCategory={sheet?.category ?? "sport"}
        onClose={() => setSheet(null)}
        onSaved={replanned}
      />
    </Section>
  );
}

function CommitmentList({
  items,
  onOpen,
}: {
  items: ProfileCommitment[];
  onOpen: (item: ProfileCommitment) => void;
}) {
  const sorted = [...items].sort(
    (a, b) => (a.weekday ?? -1) - (b.weekday ?? -1) || a.startTime.localeCompare(b.startTime),
  );
  return (
    <ul className="flex flex-col">
      {sorted.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            onClick={() => onOpen(item)}
            className="flex w-full items-center gap-3 rounded-md px-2 py-2.5 text-left ui-hover"
          >
            <span
              aria-hidden="true"
              className="h-7 w-[3px] shrink-0 rounded-full"
              style={{ background: COMMITMENT_CATEGORIES[item.category]?.color ?? "var(--app-text-faint)" }}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-medium" style={{ color: "var(--app-text)" }}>
                {item.title}
              </span>
              <span className="block text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>
                {COMMITMENT_CATEGORIES[item.category]?.label ?? "Other"}
              </span>
            </span>
            <span className="shrink-0 text-right">
              <span className="block text-[13px]" style={{ color: "var(--app-text-soft)" }}>
                {describeRecurrence(item)}
              </span>
              <span className="block tabular-nums text-[12px]" style={{ color: "var(--app-text-muted)" }}>
                {formatTimeRange(item.startTime, item.endTime)}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
