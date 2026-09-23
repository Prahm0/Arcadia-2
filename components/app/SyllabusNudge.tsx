import Link from "next/link";
import type { SessionPlan } from "@/lib/api/types";

/**
 * Shown under a plan Arcad had nothing to build from: points at the one
 * thing that would make it specific, the subject's syllabus.
 */
export default function SyllabusNudge({ plan }: { plan: SessionPlan }) {
  if (!plan.needsSyllabus) return null;
  const { subjectId, subject } = plan.needsSyllabus;
  const href = subjectId ? `/app/profile/subjects/${encodeURIComponent(subjectId)}` : "/app/profile#subjects";
  return (
    <Link
      href={href}
      className="group mt-4 flex items-center gap-3 rounded-md border px-3.5 py-3 transition-colors ui-hover"
      style={{ borderColor: "var(--app-border)" }}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-medium" style={{ color: "var(--app-text)" }}>
          Add your {subject} syllabus
        </span>
        <span className="mt-0.5 block text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>
          Arcad will plan each session around what you&apos;re actually covering.
        </span>
      </span>
      <svg
        viewBox="0 0 20 20"
        width="14"
        height="14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="shrink-0 transition-transform group-hover:translate-x-0.5"
        style={{ color: "var(--app-text-muted)" }}
      >
        <path d="M8 5l5 5-5 5" />
      </svg>
    </Link>
  );
}
