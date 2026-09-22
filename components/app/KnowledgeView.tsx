"use client";

import PageHeader from "./PageHeader";

/**
 * Knowledge uploads depend on the storage-backed API. Keep the route visible
 * while that service is unavailable, but do not expose controls that would
 * send students to unfinished endpoints.
 */
export default function KnowledgeView() {
  return (
    <>
      <PageHeader eyebrow="Arcad" title="Knowledge" />

      <div className="mx-auto flex w-full max-w-[860px] flex-col px-6 py-8 sm:px-10">
        <section
          className="rounded-lg px-6 py-8 sm:px-8"
          style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}
        >
          <span
            aria-hidden="true"
            className="grid size-10 place-items-center rounded-md"
            style={{ background: "var(--app-accent-soft)", color: "var(--app-accent-strong)" }}
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M5 3h7l3 3v11H5z" strokeLinejoin="round" />
              <path d="M12 3v3h3" strokeLinejoin="round" />
              <path d="M8 10h5M8 13h5" strokeLinecap="round" />
            </svg>
          </span>
          <p className="mt-5 text-[18px] font-medium tracking-[-0.015em]" style={{ color: "var(--app-text)" }}>
            Knowledge is coming soon.
          </p>
          <p className="mt-2 max-w-[540px] text-[14px] leading-6" style={{ color: "var(--app-text-muted)" }}>
            We are setting up secure file storage before turning on uploads. Until then, Arcad can still help
            with your tasks, subjects, schedule, and calendar.
          </p>
          <p className="mt-5 type-mono-label" style={{ color: "var(--app-text-muted)" }}>
            Nothing to set up yet. Your existing plan is unaffected.
          </p>
        </section>
      </div>
    </>
  );
}
