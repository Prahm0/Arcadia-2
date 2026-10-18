"use client";

import Link from "next/link";
import { useState } from "react";
import { useStudySky } from "@/lib/app/StudySkyProvider";
import { constellationById, focusTime, type ConstellationDefinition, type ConstellationId, type SkyCard } from "@/shared/constellations";
import AppButton, { appButtonClass } from "../AppButton";
import ConstellationArtwork from "./ConstellationArtwork";
import ConstellationCard, { skyDate } from "./ConstellationCard";
import SkyDialog from "./SkyDialog";
import styles from "./sky.module.css";

export interface FocusTotals {
  sessions: number;
  minutes: number;
  subjects: Array<{ subject: string; minutes: number; sessions: number }>;
}

export default function YourSky() {
  const { sky, loading, error, refresh, update, acknowledge } = useStudySky();
  const [showAll, setShowAll] = useState(false);
  const [detailId, setDetailId] = useState<ConstellationId | null>(null);
  const [replay, setReplay] = useState(0);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function act(action: () => Promise<void>) {
    setBusy(true);
    setActionError(null);
    try {
      await action();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Couldn't save that change.");
    } finally {
      setBusy(false);
    }
  }
  function open(card: SkyCard) {
    setDetailId(card.id);
    setReplay(card.earnedAt && !card.seen ? 1 : 0);
    setActionError(null);
  }
  function browse() {
    setShowAll(true);
    document.getElementById("constellations")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const cards = sky?.cards ?? [];
  const followed = cards.find((card) => card.id === sky?.preferences.followed) ?? cards[0];
  const definition = followed ? constellationById(followed.id)! : null;
  const count = followed?.milestones.filter((star) => star.earnedAt !== null).length ?? 0;
  const next = followed?.milestones.find((star) => star.earnedAt === null);
  const nextStar = followed && definition && next ? nextStarProgress(definition, followed.value, next.index) : null;
  const detail = cards.find((card) => card.id === detailId);
  const detailDefinition = detail ? constellationById(detail.id)! : null;
  const listed = [...cards].sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0));

  return (
    <>
      <section id="sky" aria-labelledby="sky-heading" className="mt-10 scroll-mt-6">
        <Heading
          id="sky-heading"
          title="Your constellation"
        />

        {error || (actionError && !detail) ? (
          <div role="alert" className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border p-4 text-[13px]" style={{ borderColor: "var(--app-border)", color: "var(--app-text)" }}>
            <span>{actionError || error}{sky && error ? " Your last saved progress is shown below." : ""}</span>
            {error ? <AppButton onClick={() => void refresh()}>Try again</AppButton> : null}
          </div>
        ) : null}

        {!sky || !followed || !definition ? (
          <div role="status" className="grid min-h-[320px] place-items-center rounded-xl text-[13px]" style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)", color: "var(--app-text-muted)" }}>
            {loading ? "Loading your constellation…" : "Your constellation will appear when the connection returns."}
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border" style={{ background: "var(--app-surface)", borderColor: "var(--app-border)", boxShadow: "var(--elev-1)", color: "var(--app-text)" }}>
            <div className="grid @3xl/main:grid-cols-[minmax(0,1.3fr)_minmax(300px,.85fr)]">
              <div className="relative bg-[#0c1017]">
                <div className="flex justify-between gap-3 px-6 pt-6 text-[10px] uppercase tracking-[.16em] text-[#a8b4c4]">
                  <span>{definition.name}</span>
                  <span className="tabular-nums">{count} / {definition.points.length}</span>
                </div>
                <ConstellationArtwork
                  key={definition.id}
                  definition={definition}
                  card={followed}
                  ambient={sky.preferences.ambientMotion}
                />
              </div>

              <div className="flex flex-col justify-center p-6 sm:p-8">
                <p className="text-[11px] font-semibold uppercase tracking-[.13em]" style={{ color: "var(--app-accent-strong)" }}>Building now</p>
                <h3 className="mt-2 text-[30px] font-semibold tracking-[-.04em]">{definition.name}</h3>
                <p className="mt-2 text-[14px] leading-relaxed" style={{ color: "var(--app-text-muted)" }}>
                  {count} of {definition.points.length} stars{nextStar ? "" : " · complete, it's in your collection"}.
                </p>

                {nextStar ? (
                  <div className="my-6 flex items-center gap-4 rounded-xl px-4 py-3" style={{ background: "var(--app-surface-soft)" }}>
                    <TodayRing ratio={nextStar.ratio} />
                    <div>
                      <p className="text-[13px] font-semibold" style={{ color: "var(--app-text)" }}>Next star</p>
                      <p className="mt-0.5 text-[12px] tabular-nums" style={{ color: "var(--app-text-muted)" }}>{nextStar.left}</p>
                    </div>
                  </div>
                ) : <div className="my-3" />}

                <div className="flex flex-wrap gap-2">
                  {followed.earnedAt ? (
                    <AppButton variant="primary" onClick={() => open(followed)}>View constellation</AppButton>
                  ) : (
                    <Link href="/app/sessions" className={appButtonClass("primary")}>Start session</Link>
                  )}
                  <AppButton onClick={browse}>Your collection</AppButton>
                </div>
                {!followed.earnedAt ? (
                  <button type="button" className="mt-4 self-start text-[12px] underline underline-offset-4" onClick={() => open(followed)} style={{ color: "var(--app-text-muted)" }}>
                    Preview constellation
                  </button>
                ) : null}
              </div>
            </div>

          </div>
        )}
      </section>

      {sky ? (
        <section id="constellations" aria-labelledby="constellations-heading" className="mt-10 scroll-mt-6">
          <Heading
            id="constellations-heading"
            title="Your collection"
          />
          {listed.length ? (
            <>
              <div className="grid grid-cols-2 gap-3 sm:hidden">
                {(showAll ? listed : listed.slice(0, 2)).map((card) => (
                  <button
                    key={card.id}
                    type="button"
                    className={styles.cardButton}
                    aria-label={`View ${constellationById(card.id)!.name}${card.earnedAt ? ", collected" : ", locked"}`}
                    onClick={() => open(card)}
                  >
                    <ConstellationCard card={card} />
                  </button>
                ))}
              </div>
              <div className="hidden grid-cols-4 gap-4 sm:grid">
                {(showAll ? listed : listed.slice(0, 4)).map((card) => (
                  <button
                    key={card.id}
                    type="button"
                    className={styles.cardButton}
                    aria-label={`View ${constellationById(card.id)!.name}${card.earnedAt ? ", collected" : ", locked"}`}
                    onClick={() => open(card)}
                  >
                    <ConstellationCard card={card} />
                  </button>
                ))}
              </div>
              {listed.length > 2 ? (
                <div className="mt-4 sm:hidden">
                  <AppButton variant="ghost" onClick={() => setShowAll((value) => !value)}>
                    {showAll ? "Show less" : "See all"}
                  </AppButton>
                </div>
              ) : null}
              {listed.length > 4 ? (
                <div className="mt-4 hidden sm:block">
                  <AppButton variant="ghost" onClick={() => setShowAll((value) => !value)}>
                    {showAll ? "Show less" : "See all"}
                  </AppButton>
                </div>
              ) : null}
            </>
          ) : (
            <div className="rounded-xl border border-dashed p-8 text-center" style={{ borderColor: "var(--app-border)", color: "var(--app-text)" }}>
              <h3 className="text-[17px] font-medium">
                Your first constellation is taking shape
              </h3>
              <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed" style={{ color: "var(--app-text-muted)" }}>
                Focus minutes light stars. Complete a constellation and keep it here.
              </p>
            </div>
          )}
        </section>
      ) : null}

      {detail && detailDefinition && sky ? (
        <SkyDialog
          title={detail.earnedAt ? `${detailDefinition.name} is yours` : detailDefinition.name}
          onClose={() => { setDetailId(null); setActionError(null); }}
        >
          <div className="grid items-center gap-8 sm:grid-cols-[minmax(0,280px)_1fr]">
            <div key={`${detail.id}-${replay}`} className={replay && sky.preferences.ambientMotion ? styles.reveal : styles.enter}>
              <ConstellationCard card={detail} preview={!detail.earnedAt} showcase={sky.preferences.ambientMotion} />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-widest" style={{ color: "var(--app-text-muted)" }}>
                {detailDefinition.family} · {detail.earnedAt ? "Collected" : "Preview"}
              </p>
              <h3 className="mt-3 text-[26px] font-medium tracking-[-.03em]">{detailDefinition.name}</h3>
              <p className="mt-3 text-[14px] leading-relaxed" style={{ color: "var(--app-text-soft)" }}>{detailDefinition.description}</p>
              {detailDefinition.atlas ? <SkyFacts definition={detailDefinition} /> : null}
              <p className="mt-4 text-[13px] leading-relaxed" style={{ color: "var(--app-text-muted)" }}>{detailDefinition.requirement}</p>
              <div className="my-6 border-y py-4 text-[12px] leading-relaxed" style={{ borderColor: "var(--app-border)", color: "var(--app-text-muted)" }}>
                <p className="font-medium" style={{ color: "var(--app-text)" }}>Your constellation</p>
                <p className="mt-1">Keep it in your collection and show it on your profile.</p>
                {detail.earnedAt ? (
                  <p className="mt-2">
                    Formed {skyDate(detail.earnedAt)}
                    {detail.addedAt && detail.addedAt - detail.earnedAt > 86400000 ? ` · Added from your study history ${skyDate(detail.addedAt)}` : ""}.
                  </p>
                ) : null}
              </div>
              {actionError ? <p role="alert" className="mb-3 text-[13px]" style={{ color: "var(--app-danger)" }}>{actionError}</p> : null}
              <div className="flex flex-wrap gap-2">
                {detail.earnedAt ? (
                  <>
                    <AppButton variant="primary" disabled={busy} onClick={() => void act(() => update({ featured: detail.id }))}>
                      {sky.preferences.featured === detail.id ? "Shown on profile" : "Show on profile"}
                    </AppButton>
                    <AppButton
                      disabled={busy}
                      onClick={() => void act(() => update({
                        favourites: sky.preferences.favourites.includes(detail.id)
                          ? sky.preferences.favourites.filter((id) => id !== detail.id)
                          : [...sky.preferences.favourites, detail.id],
                      }))}
                    >
                      {sky.preferences.favourites.includes(detail.id) ? "Remove favourite" : "Favourite"}
                    </AppButton>
                    <Link href="/app/profile#sky" className={appButtonClass("secondary")}>Customise profile</Link>
                  </>
                ) : (
                  <AppButton
                    variant="primary"
                    disabled={busy}
                    onClick={() => void act(async () => {
                      await update({ followed: detail.id });
                      setDetailId(null);
                      document.getElementById("sky")?.scrollIntoView({ behavior: "smooth", block: "start" });
                    })}
                  >
                    {sky.preferences.followed === detail.id ? "Building this constellation" : "Build this constellation"}
                  </AppButton>
                )}
              </div>
              {detail.earnedAt ? (
                <div className="mt-4 flex flex-wrap gap-4">
                  <button type="button" className="text-[12px] underline underline-offset-4" onClick={() => setReplay((value) => value + 1)}>Replay reveal</button>
                  {!detail.seen ? (
                    <button type="button" disabled={busy} className="text-[12px] underline underline-offset-4" onClick={() => void act(() => acknowledge(detail.id))}>Mark as seen</button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </SkyDialog>
      ) : null}
    </>
  );
}

function Heading({ id, title, body }: { id: string; title: string; body?: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0 max-w-2xl">
        <h2 id={id} className="text-[20px] font-semibold tracking-[-0.02em]" style={{ color: "var(--app-text)" }}>{title}</h2>
        {body ? <p className="mt-1 text-[13.5px] leading-relaxed" style={{ color: "var(--app-text-muted)" }}>{body}</p> : null}
      </div>
    </div>
  );
}

function TodayRing({ ratio }: { ratio: number }) {
  const radius = 24;
  const circumference = 2 * Math.PI * radius;
  return (
    <svg aria-hidden="true" className="shrink-0 -rotate-90" height="58" viewBox="0 0 58 58" width="58">
      <circle cx="29" cy="29" fill="none" r={radius} stroke="var(--app-border)" strokeWidth="6" />
      <circle cx="29" cy="29" fill="none" r={radius} stroke="var(--app-gold)" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - Math.min(1, ratio))} strokeLinecap="round" strokeWidth="6" className="motion-safe:transition-[stroke-dashoffset] motion-safe:duration-700" />
    </svg>
  );
}

const HEMISPHERE = { Northern: "Northern sky", Southern: "Southern sky", Equator: "Along the equator" } as const;

/** The real sky behind a constellation card. */
function SkyFacts({ definition }: { definition: ConstellationDefinition }) {
  const atlas = definition.atlas!;
  const facts = [
    ["Brightest star", atlas.brightest],
    ["First charted", atlas.charted],
    ["Share of the sky", `${atlas.areaPercent.toFixed(1)}%`],
    ["Hemisphere", HEMISPHERE[atlas.hemisphere]],
    ["Best seen", `${atlas.bestMonth} evenings`],
    ["Atlas", `${atlas.order + 1} of 88`],
  ];
  return (
    <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
      {facts.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-[11px]" style={{ color: "var(--app-text-muted)" }}>{label}</dt>
          <dd className="mt-0.5 truncate text-[13px] font-medium" style={{ color: "var(--app-text)" }}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** How close the next star is, and what's left to light it, in the constellation's own unit. */
function nextStarProgress(definition: ConstellationDefinition, value: number, index: number) {
  const target = definition.thresholds[index];
  const from = index > 0 ? definition.thresholds[index - 1] : 0;
  const ratio = Math.max(0, Math.min(1, (value - from) / Math.max(1, target - from)));
  const left = Math.max(1, target - value);
  const text = definition.metric === "minutes" ? `${focusTime(left)} more focus`
    : definition.metric === "days" ? `${left} more study ${left === 1 ? "day" : "days"}`
      : definition.metric === "subjects" ? `${left} more ${left === 1 ? "subject" : "subjects"}`
        : `${left} more ${left === 1 ? "session" : "sessions"}`;
  return { ratio, left: text };
}
