"use client";
import Link from "next/link";
import { useStudySky } from "@/lib/app/StudySkyProvider";

/**
 * One plain row on Profile for the constellations earned by studying. The collection
 * itself, and how to earn more, live on Progress.
 */
export default function YourCardsRow() {
  const { sky } = useStudySky();
  const collected = sky?.cards.filter((card) => card.earnedAt !== null).length ?? 0;
  return (
    <Link
      href="/app/progress#constellations"
      className="ui-hover flex items-center gap-4 rounded-lg px-5 py-4"
      style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}
    >
      <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full text-[18px]" style={{ background: "var(--app-arcad-soft)", color: "var(--app-arcad)" }}>✦</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold" style={{ color: "var(--app-text)" }}>Your constellations</span>
        <span className="block text-[13px]" style={{ color: "var(--app-text-muted)" }}>
          {collected ? `${collected} collected. Focus minutes light more stars.` : "Focus for a couple of minutes to earn your first."}
        </span>
      </span>
      <span aria-hidden="true" className="text-lg" style={{ color: "var(--app-text-faint)" }}>›</span>
    </Link>
  );
}
