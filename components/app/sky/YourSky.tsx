"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useStudySky } from "@/lib/app/StudySkyProvider";
import { formatMinutes } from "@/lib/api/time";
import { SUBJECT_COLORS } from "@/lib/app/categoryColors";
import { constellationById, milestoneLabel, type ConstellationId, type SkyCard } from "@/shared/constellations";
import AppButton, { appButtonClass } from "../AppButton";
import { SubjectTag } from "../cards/shared";
import ConstellationArtwork from "./ConstellationArtwork";
import ConstellationCard, { skyDate } from "./ConstellationCard";
import SkyDialog from "./SkyDialog";
import styles from "./sky.module.css";

export interface FocusTotals {
  sessions: number;
  minutes: number;
  subjects: Array<{ subject: string; minutes: number; sessions: number }>;
}

type Filter = "all" | "collected" | "forming" | "favourites";
const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "All" },
  { id: "collected", label: "Collected" },
  { id: "forming", label: "Forming" },
  { id: "favourites", label: "Favourites" },
];

/**
 * The long game under the streak: every minute of focus lights stars in the
 * constellations, and a finished one becomes a card that's yours for good.
 * A streak can break; these never go out.
 */
export default function YourSky({
  totals,
  totalsLoading,
  subjectColours,
}: {
  totals: FocusTotals;
  totalsLoading: boolean;
  subjectColours: Map<string, string>;
}) {
  const { sky, loading, error, refresh, update, acknowledge } = useStudySky();
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState(0);
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
    setFilter("all");
    document.getElementById("constellations")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const cards = sky?.cards ?? [];
  const owned = cards.filter((card) => card.earnedAt !== null);
  const starsLit = cards.reduce((sum, card) => sum + card.milestones.filter((star) => star.earnedAt !== null).length, 0);
  const followed = cards.find((card) => card.id === sky?.preferences.followed) ?? cards[0];
  const definition = followed ? constellationById(followed.id)! : null;
  const count = followed?.milestones.filter((star) => star.earnedAt !== null).length ?? 0;
  const next = followed?.milestones.find((star) => star.earnedAt === null);
  const inspected = followed?.milestones[Math.min(selected, followed.milestones.length - 1)];
  const detail = cards.find((card) => card.id === detailId);
  const detailDefinition = detail ? constellationById(detail.id)! : null;
  const listed = cards
    .filter((card) =>
      filter === "collected" ? card.earnedAt !== null
        : filter === "forming" ? card.earnedAt === null
          : filter === "favourites" ? sky?.preferences.favourites.includes(card.id)
            : true)
    // Collected first, newest first; then what's still forming, in its usual order.
    .sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0));

  return (
    <>
      <section id="sky" aria-labelledby="sky-heading" className="mt-10 scroll-mt-6">
        <Heading
          id="sky-heading"
          title="Streak cards"
          body="Every minute of focus lights stars on your streak cards. Unlike a daily streak, they never go out."
          aside={sky ? (
            <label className="flex items-center gap-2 text-[12px]" style={{ color: "var(--app-text-muted)" }}>
              <input
                type="checkbox"
                checked={sky.preferences.ambientMotion}
                disabled={busy}
                onChange={(event) => void act(() => update({ ambientMotion: event.target.checked }))}
              />
              Ambient motion
            </label>
          ) : null}
        />

        {error || (actionError && !detail) ? (
          <div role="alert" className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border p-4 text-[13px]" style={{ borderColor: "var(--app-border)", color: "var(--app-text)" }}>
            <span>{actionError || error}{sky && error ? " Your last saved progress is shown below." : ""}</span>
            {error ? <AppButton onClick={() => void refresh()}>Try again</AppButton> : null}
          </div>
        ) : null}

        {!sky || !followed || !definition ? (
          <div role="status" className="grid min-h-[320px] place-items-center rounded-xl text-[13px]" style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)", color: "var(--app-text-muted)" }}>
            {loading ? "Loading your streaks…" : "Your streak cards will appear when the connection returns."}
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl" style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)", color: "var(--app-text)" }}>
            <div className="grid lg:grid-cols-[minmax(0,1.5fr)_minmax(300px,1fr)]">
              <div className="relative bg-[#0c1017]">
                <div className="flex justify-between gap-3 px-6 pt-6 text-[10px] uppercase tracking-[.16em] text-[#a8b4c4]">
                  <span>{definition.family}</span>
                  <span className="tabular-nums">{followed.earnedAt ? "Collected" : "Following"} · {String(count).padStart(2, "0")} / {String(definition.points.length).padStart(2, "0")}</span>
                </div>
                <ConstellationArtwork
                  key={definition.id}
                  definition={definition}
                  card={followed}
                  interactive
                  ambient={sky.preferences.ambientMotion}
                  selected={inspected?.index}
                  onSelect={setSelected}
                />
                <p className="px-6 pb-5 text-[11px] text-[#a8b4c4]">Select a star to see its story.</p>
              </div>

              <div className="flex flex-col justify-center p-6 sm:p-8">
                <p className="text-[11px] uppercase tracking-[.13em]" style={{ color: "var(--app-text-muted)" }}>
                  {followed.earnedAt ? "Yours to keep" : "Next streak card"}
                </p>
                <h3 className="mt-2 text-[26px] font-medium tracking-[-.035em]">{definition.name}</h3>
                <p className="mt-2 text-[14px] leading-relaxed" style={{ color: "var(--app-text-muted)" }}>{definition.story}</p>

                <div className="my-6">
                  <div className="mb-2 flex justify-between text-[12px] tabular-nums">
                    <span>{count} of {definition.points.length} stars lit</span>
                    <span>{Math.round((count / definition.points.length) * 100)}%</span>
                  </div>
                  <div className="h-1 rounded-full" style={{ background: "var(--app-surface-soft)" }}>
                    <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${(count / definition.points.length) * 100}%`, background: definition.colour }} />
                  </div>
                  <p className="mt-4 text-[13px] leading-relaxed" style={{ color: "var(--app-text-soft)" }}>
                    {next ? `Next star: ${milestoneLabel(definition, next.index)}.` : "Complete. It's saved to your collection."}
                  </p>
                  {next ? (
                    <p className="mt-1 text-[12px] tabular-nums" style={{ color: "var(--app-text-muted)" }}>
                      {followed.value} / {definition.thresholds[next.index]} {metricUnit(definition.metric)}. No deadline.
                    </p>
                  ) : null}
                </div>

                <div aria-live="polite" className="mb-6 rounded-lg px-4 py-3" style={{ background: "var(--app-surface-soft)", boxShadow: "var(--elev-inset)" }}>
                  <p className="text-[12.5px] font-medium">{inspected ? milestoneLabel(definition, inspected.index) : ""}</p>
                  <p className="mt-1 text-[12px] leading-relaxed" style={{ color: "var(--app-text-muted)" }}>
                    {inspected?.earnedAt ? `Lit ${skyDate(inspected.earnedAt)}. Yours to keep.` : definition.requirement}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {followed.earnedAt ? (
                    <AppButton variant="primary" onClick={() => open(followed)}>View your card</AppButton>
                  ) : (
                    <Link href="/app/focus" className={appButtonClass("primary")}>Start focus</Link>
                  )}
                  <AppButton onClick={browse}>Change card</AppButton>
                </div>
                {!followed.earnedAt ? (
                  <button type="button" className="mt-4 self-start text-[12px] underline underline-offset-4" onClick={() => open(followed)} style={{ color: "var(--app-text-muted)" }}>
                    Preview the card and rewards
                  </button>
                ) : null}
              </div>
            </div>

            <div className="border-t px-6 py-5 sm:px-8" style={{ borderColor: "var(--app-border)" }}>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
                <Stat label="Focus sessions" value={totalsLoading ? "–" : String(totals.sessions)} />
                <Stat label="Time focused" value={totalsLoading ? "–" : formatMinutes(totals.minutes)} />
                <Stat label="Stars lit" value={String(starsLit)} />
                <Stat label="Cards collected" value={`${owned.length} of ${cards.length}`} />
              </dl>
              {totals.subjects.length > 0 ? (
                <ul aria-label="Where your focus went" className="mt-4 flex flex-wrap gap-1.5">
                  {totals.subjects.map((subject, index) => (
                    <li key={subject.subject} className="max-w-full">
                      <SubjectTag
                        size="sm"
                        subject={{
                          name: `${subject.subject} · ${formatMinutes(subject.minutes)}`,
                          colour: subjectColours.get(subject.subject) ?? SUBJECT_COLORS[index % SUBJECT_COLORS.length],
                        }}
                      />
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        )}

        {owned.some((card) => !card.seen) ? (
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <p className="mr-1 text-[13px] font-medium" style={{ color: "var(--app-text)" }}>New in your collection</p>
            {owned.filter((card) => !card.seen).map((card) => (
              <AppButton key={card.id} onClick={() => open(card)}>✦ {constellationById(card.id)!.name}</AppButton>
            ))}
          </div>
        ) : null}
      </section>

      {sky ? (
        <section id="constellations" aria-labelledby="constellations-heading" className="mt-10 scroll-mt-6">
          <Heading
            id="constellations-heading"
            title="All streak cards"
            body="Different ways of studying, each with its own card. Everything you do advances all of them; following one just brings it into view."
            aside={
              <div role="group" aria-label="Show" className="flex flex-wrap gap-1">
                {FILTERS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={filter === item.id}
                    onClick={() => setFilter(item.id)}
                    className="h-8 rounded-md px-3 text-[12.5px] font-medium tabular-nums transition-colors"
                    style={filter === item.id
                      ? { background: "var(--app-surface)", color: "var(--app-text)", boxShadow: "var(--elev-1)" }
                      : { color: "var(--app-text-muted)" }}
                  >
                    {item.label}{item.id === "collected" ? ` · ${owned.length}` : ""}
                  </button>
                ))}
              </div>
            }
          />
          {listed.length ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {listed.map((card) => (
                <button
                  key={card.id}
                  type="button"
                  className={styles.cardButton}
                  aria-label={`View ${constellationById(card.id)!.name}${card.earnedAt ? ", collected" : ", forming"}`}
                  onClick={() => open(card)}
                >
                  <ConstellationCard card={card} featured={sky.preferences.featured === card.id} following={sky.preferences.followed === card.id} />
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed p-8 text-center" style={{ borderColor: "var(--app-border)", color: "var(--app-text)" }}>
              <h3 className="text-[17px] font-medium">
                {filter === "favourites" ? "Keep your favourites close" : filter === "forming" ? "Every card is collected for now" : "Your first card is taking shape"}
              </h3>
              <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed" style={{ color: "var(--app-text-muted)" }}>
                {filter === "favourites"
                  ? "Open a collected card to add it to your favourites."
                  : filter === "forming"
                    ? "Everything you've formed is yours to keep."
                    : "Every saved minute brings First Light closer. Your progress stays with you."}
              </p>
              <div className="mt-5">
                <AppButton onClick={() => setFilter("all")}>Show all</AppButton>
              </div>
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
            <div key={`${detail.id}-${replay}`} className={replay && sky.preferences.ambientMotion ? styles.reveal : ""}>
              <ConstellationCard card={detail} preview={!detail.earnedAt} />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-widest" style={{ color: "var(--app-text-muted)" }}>
                {detailDefinition.family} · {detail.earnedAt ? "Collected" : "Reward preview"}
              </p>
              <h3 className="mt-3 text-[26px] font-medium tracking-[-.03em]">{detailDefinition.name}</h3>
              <p className="mt-3 text-[14px] leading-relaxed" style={{ color: "var(--app-text-soft)" }}>{detailDefinition.description}</p>
              <p className="mt-4 text-[13px] leading-relaxed" style={{ color: "var(--app-text-muted)" }}>{detailDefinition.requirement}</p>
              <div className="my-6 border-y py-4 text-[12px] leading-relaxed" style={{ borderColor: "var(--app-border)", color: "var(--app-text-muted)" }}>
                <p className="font-medium" style={{ color: "var(--app-text)" }}>Your rewards</p>
                <p className="mt-1">A permanent card, profile emblem and backdrop.</p>
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
                      {sky.preferences.featured === detail.id ? "Featured on profile" : "Feature on profile"}
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
                      setSelected(0);
                      setDetailId(null);
                      document.getElementById("sky")?.scrollIntoView({ behavior: "smooth", block: "start" });
                    })}
                  >
                    {sky.preferences.followed === detail.id ? "Continue this card" : "Follow this card"}
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

function Heading({ id, title, body, aside }: { id: string; title: string; body: string; aside?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0 max-w-2xl">
        <h2 id={id} className="text-[20px] font-semibold tracking-[-0.02em]" style={{ color: "var(--app-text)" }}>{title}</h2>
        <p className="mt-1 text-[13.5px] leading-relaxed" style={{ color: "var(--app-text-muted)" }}>{body}</p>
      </div>
      {aside}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12px]" style={{ color: "var(--app-text-muted)" }}>{label}</dt>
      <dd className="mt-1 truncate text-[18px] font-semibold tabular-nums tracking-[-0.02em]" style={{ color: "var(--app-text)" }}>{value}</dd>
    </div>
  );
}

function metricUnit(metric: "minutes" | "days" | "subjects" | "sessions") {
  if (metric === "minutes") return "minutes";
  if (metric === "days") return "study days";
  if (metric === "subjects") return "subjects with 15 minutes";
  return "sessions";
}
