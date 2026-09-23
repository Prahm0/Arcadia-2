"use client";
import Link from "next/link";
import { useStudySky } from "@/lib/app/StudySkyProvider";
import { constellationById } from "@/shared/constellations";
import { appButtonClass } from "../AppButton";
import ConstellationArtwork from "./ConstellationArtwork";

export default function StudySkySummary() {
  const { sky, error, refresh } = useStudySky();
  const card = sky?.cards.find((item) => item.id === sky.preferences.followed);
  const definition = card && constellationById(card.id);
  return <div className="mx-auto w-full max-w-[1140px] px-6 pt-6 sm:px-10"><section className="grid overflow-hidden rounded-xl sm:grid-cols-[220px_1fr]" style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}>
    {card && definition && <div className="hidden bg-[#0c1017] sm:grid sm:place-items-center"><ConstellationArtwork definition={definition} card={card} /></div>}
    <div className="flex flex-wrap items-center justify-between gap-4 p-6"><div><p className="text-[11px] uppercase tracking-widest" style={{ color: "var(--app-text-muted)" }}>Your study sky</p><h2 className="mt-2 text-[20px] font-medium" style={{ color: "var(--app-text)" }}>{definition?.name || "A sky of your own"}</h2><p className="mt-2 text-[13px]" style={{ color: "var(--app-text-muted)" }}>{card ? `${card.milestones.filter((star) => star.earnedAt !== null).length} of ${card.milestones.length} stars lit · ${sky!.cards.filter((item) => item.earnedAt !== null).length} cards collected` : error ? "Couldn't read your sky." : "Reading your sky…"}</p>{error && <button className="mt-2 text-[12px] underline" onClick={() => void refresh()}>Try again</button>}</div><Link href="/app/sky" className={appButtonClass("secondary")}>Open Study Sky →</Link></div>
  </section></div>;
}
