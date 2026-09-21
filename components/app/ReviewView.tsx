"use client";

import { useState } from "react";
import PageHeader from "./PageHeader";
import WeeklyReviewCard from "./WeeklyReviewCard";

type Which = "previous" | "current";

export default function ReviewView() {
  const [which, setWhich] = useState<Which>("previous");

  return (
    <>
      <PageHeader
        eyebrow="Progress"
        title="Weekly review"
        meta={which === "previous" ? "Last week" : "This week"}
        tour="review"
        action={
          <div
            className="inline-flex rounded-md p-1"
            style={{ background: "var(--app-surface-soft)", boxShadow: "var(--elev-inset)" }}
          >
            {(["previous", "current"] as Which[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setWhich(option)}
                className="rounded-sm px-3.5 py-1.5 text-[13px] font-medium capitalize"
                style={{
                  background: which === option ? "var(--app-surface)" : "transparent",
                  color: which === option ? "var(--app-text)" : "var(--app-text-muted)",
                  boxShadow: which === option ? "var(--elev-1)" : "none",
                }}
              >
                {option === "previous" ? "Last week" : "This week"}
              </button>
            ))}
          </div>
        }
      />

      <div className="mx-auto w-full max-w-[900px] px-6 py-8 sm:px-10">
        <WeeklyReviewCard window={which} />
      </div>
    </>
  );
}
