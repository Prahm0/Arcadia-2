"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import { describeOperations, type ChangeKind } from "@/lib/app/proposalOps";
import { subjectColour } from "@/lib/app/subjectColour";
import { SubjectTag } from "../cards/shared";
import AppButton from "../AppButton";
import ProposalPreview from "../ProposalPreview";
import type { Proposal } from "./types";

const KIND_LABEL: Record<ChangeKind, string> = { add: "Add", edit: "Change", remove: "Remove" };
const KIND_COLOUR: Record<ChangeKind, string> = {
  add: "var(--app-success)",
  edit: "var(--app-text-soft)",
  remove: "var(--app-danger)",
};

/**
 * A change Arcad wants to make to the plan, shown under the reply that
 * suggested it: each task or commitment it would add, change or remove,
 * then Apply or Decline. Once decided it stays in the thread as a record.
 */
export default function ChangeCard({
  proposal,
  onRespond,
}: {
  proposal: Proposal;
  onRespond: (id: string, action: "apply" | "decline") => Promise<void>;
}) {
  const { data } = useDashboardData();
  const [busy, setBusy] = useState<"apply" | "decline" | null>(null);
  const changes = useMemo(() => describeOperations(proposal.operations, data), [proposal.operations, data]);

  const [openedAt] = useState(() => Date.now());
  const expired =
    proposal.status === "expired" || (proposal.status === "pending" && Date.parse(proposal.expiresAt) < openedAt);
  const pending = proposal.status === "pending" && !expired;

  async function respond(action: "apply" | "decline") {
    setBusy(action);
    try {
      await onRespond(proposal.id, action);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      className="mt-3 overflow-hidden rounded-lg"
      style={{
        background: "var(--app-surface)",
        border: `1px solid ${pending ? "color-mix(in oklab, var(--app-arcad) 40%, var(--app-border))" : "var(--app-border)"}`,
      }}
    >
      <div className="flex items-start justify-between gap-3 px-4 pt-3.5">
        <div className="min-w-0">
          <p className="text-[12px] font-medium" style={{ color: pending ? "var(--app-arcad-strong)" : "var(--app-text-muted)" }}>
            {pending ? "Change to your plan" : "Plan change"}
          </p>
          <p className="mt-1 text-[14px] leading-snug" style={{ color: "var(--app-text)" }}>
            {proposal.summary}
          </p>
        </div>
        {!pending ? <Outcome status={expired ? "expired" : proposal.status} /> : null}
      </div>

      {changes.length > 0 ? (
        <ul className="mt-3 flex flex-col border-t" style={{ borderColor: "var(--app-border)" }}>
          {changes.map((change, index) => (
            <li
              key={index}
              className="flex gap-3 px-4 py-2.5"
              style={{ borderTop: index ? "1px solid var(--app-border)" : undefined }}
            >
              <span className="w-[52px] shrink-0 pt-px text-[12px] font-medium" style={{ color: KIND_COLOUR[change.kind] }}>
                {KIND_LABEL[change.kind]}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span
                    className="min-w-0 text-[13.5px] font-medium"
                    style={{
                      color: "var(--app-text)",
                      textDecoration: change.kind === "remove" ? "line-through" : undefined,
                      textDecorationColor: "var(--app-text-faint)",
                    }}
                  >
                    {change.title}
                  </span>
                  {change.subject ? (
                    <SubjectTag
                      size="sm"
                      subject={{ name: change.subject, colour: subjectColour(data.subjects, change.subject) ?? "" }}
                    />
                  ) : null}
                </div>
                {change.noun !== "Task" || change.details.length ? (
                  <p className="mt-0.5 text-[12.5px] tabular-nums" style={{ color: "var(--app-text-muted)" }}>
                    {[change.noun === "Task" ? null : change.noun, ...change.details].filter(Boolean).join(" · ")}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {/* Older proposals moved calendar blocks directly; keep their before/after view. */}
      <div className="px-4">
        <ProposalPreview operations={proposal.operations} />
      </div>

      {pending ? (
        <div
          className="mt-3 flex flex-wrap items-center gap-2 border-t px-4 py-3"
          style={{ borderColor: "var(--app-border)", background: "var(--app-surface-soft)" }}
        >
          <AppButton variant="primary" loading={busy === "apply"} disabled={busy !== null} onClick={() => void respond("apply")}>
            Apply
          </AppButton>
          <AppButton variant="ghost" loading={busy === "decline"} disabled={busy !== null} onClick={() => void respond("decline")}>
            Decline
          </AppButton>
          <span className="ml-auto text-[12px]" style={{ color: "var(--app-text-muted)" }}>
            Nothing changes until you apply.
          </span>
        </div>
      ) : proposal.status === "applied" ? (
        <div className="mt-3 flex items-center gap-3 border-t px-4 py-2.5" style={{ borderColor: "var(--app-border)" }}>
          <Link href="/app/schedule" className="text-[12.5px] font-medium underline-offset-2 hover:underline" style={{ color: "var(--app-text-soft)" }}>
            See it in Schedule
          </Link>
          <Link href="/app/deadlines" className="text-[12.5px] font-medium underline-offset-2 hover:underline" style={{ color: "var(--app-text-soft)" }}>
            Deadlines
          </Link>
        </div>
      ) : (
        <div className="h-3.5" />
      )}
    </div>
  );
}

function Outcome({ status }: { status: string }) {
  const label = status === "applied" ? "Applied" : status === "declined" ? "Declined" : "Expired";
  const colour = status === "applied" ? "var(--app-success)" : "var(--app-text-muted)";
  return (
    <span
      className="shrink-0 rounded-[4px] px-1.5 py-0.5 text-[12px] font-medium"
      style={{ color: colour, boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${colour} 45%, transparent)` }}
    >
      {label}
    </span>
  );
}
