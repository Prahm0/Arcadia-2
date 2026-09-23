"use client";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { useStudySky } from "@/lib/app/StudySkyProvider";
import { constellationById, milestoneLabel, type ConstellationId, type SkyCard } from "@/shared/constellations";
import PageHeader from "../PageHeader";
import AppButton, { appButtonClass } from "../AppButton";
import ConstellationArtwork from "./ConstellationArtwork";
import ConstellationCard, { skyDate } from "./ConstellationCard";
import SkyDialog from "./SkyDialog";
import styles from "./sky.module.css";

type Tab = "sky" | "collection" | "discover";
function readTab(): Tab { const hash = location.hash.slice(1); return hash === "collection" || hash === "discover" ? hash : "sky"; }
function subscribeTab(callback: () => void) { window.addEventListener("hashchange", callback); return () => window.removeEventListener("hashchange", callback); }
export default function SkyView() {
  const { sky, loading, error, refresh, update, acknowledge } = useStudySky();
  const tab = useSyncExternalStore(subscribeTab, readTab, () => "sky" as Tab);
  const [filter, setFilter] = useState("collected");
  const [selected, setSelected] = useState(0);
  const [detailId, setDetailId] = useState<ConstellationId | null>(null);
  const [replay, setReplay] = useState(0);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  function navigate(next: Tab) { history.replaceState(null, "", `#${next}`); window.dispatchEvent(new HashChangeEvent("hashchange")); }
  async function act(action: () => Promise<void>) {
    setBusy(true); setActionError(null);
    try { await action(); } catch (err) { setActionError(err instanceof Error ? err.message : "Couldn't save that change."); } finally { setBusy(false); }
  }
  function open(card: SkyCard) { setDetailId(card.id); setReplay(card.earnedAt && !card.seen ? 1 : 0); setActionError(null); }
  const owned = sky?.cards.filter((card) => card.earnedAt !== null) || [];
  const followed = sky?.cards.find((card) => card.id === sky.preferences.followed) || sky?.cards[0];
  const definition = followed ? constellationById(followed.id)! : null;
  const detail = sky?.cards.find((card) => card.id === detailId);
  const detailDefinition = detail ? constellationById(detail.id)! : null;
  const count = followed?.milestones.filter((star) => star.earnedAt !== null).length || 0;
  const next = followed?.milestones.find((star) => star.earnedAt === null);
  const inspected = followed?.milestones[Math.min(selected, followed.milestones.length - 1)];
  const listed = (sky?.cards || []).filter((card) => tab === "discover" || (filter === "forming" ? !card.earnedAt : filter === "favourites" ? sky?.preferences.favourites.includes(card.id) : !!card.earnedAt)).sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
  return <>
    <PageHeader width={1140} eyebrow="Your journey" title="Study Sky" meta="A sky you build. A history you keep." action={<Link href="/app/profile#sky" className={appButtonClass("secondary")}>Customise profile</Link>} />
    <div className="mx-auto max-w-[1140px] px-6 pb-12 pt-6 sm:px-10" style={{ color: "var(--app-text)" }}>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b" style={{ borderColor: "var(--app-border)" }}>
        <nav aria-label="Study Sky sections" className="flex gap-6">{(["sky", "collection", "discover"] as Tab[]).map((item) => <button key={item} type="button" onClick={() => navigate(item)} aria-current={tab === item ? "page" : undefined} className="border-b-2 pb-3 text-[13px] capitalize transition-colors" style={{ borderColor: tab === item ? "var(--app-text)" : "transparent", color: tab === item ? "var(--app-text)" : "var(--app-text-muted)" }}>{item}{item === "collection" && sky ? ` · ${owned.length}` : ""}</button>)}</nav>
        {sky && <label className="mb-3 flex items-center gap-2 text-[12px]" style={{ color: "var(--app-text-muted)" }}><input type="checkbox" checked={sky.preferences.ambientMotion} disabled={busy} onChange={(event) => void act(() => update({ ambientMotion: event.target.checked }))} />Ambient motion</label>}
      </div>
      {(error || actionError) && <div role="alert" className="mb-5 flex flex-wrap items-center gap-3 rounded-lg border p-4 text-[13px]" style={{ borderColor: "var(--app-border)" }}><span>{actionError || error}{sky && error ? " Your last confirmed sky is shown below." : ""}</span>{error && <AppButton onClick={() => void refresh()}>Try again</AppButton>}</div>}
      {!sky ? <div role="status" className="grid min-h-[360px] place-items-center text-sm" style={{ color: "var(--app-text-muted)" }}>{loading ? "Reading your sky…" : "Your sky will appear when the connection returns."}</div> : <>
        {tab === "sky" && followed && definition && <>
          <section className="overflow-hidden rounded-xl" style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }} aria-label="Followed constellation">
            <div className="grid lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)]">
              <div className="relative bg-[#0c1017]">
                <div className="flex justify-between px-6 pt-6 text-[10px] uppercase tracking-[.16em] text-[#a8b4c4]"><span>{definition.family}</span><span>Following · {String(count).padStart(2, "0")} / {String(definition.points.length).padStart(2, "0")}</span></div>
                <ConstellationArtwork key={definition.id} definition={definition} card={followed} interactive ambient={sky.preferences.ambientMotion} selected={inspected?.index} onSelect={setSelected} />
                <p className="px-6 pb-6 text-[11px] text-[#a8b4c4]">Select a star to see its story.</p>
              </div>
              <div className="flex flex-col justify-center p-6 sm:p-8">
                <p className="text-[11px] uppercase tracking-[.13em]" style={{ color: "var(--app-text-muted)" }}>{followed.earnedAt ? "Yours to keep" : "Your next constellation"}</p>
                <h2 className="mt-3 text-[28px] font-medium tracking-[-.04em]">{definition.name}</h2>
                <p className="mt-2 text-[14px] leading-relaxed" style={{ color: "var(--app-text-muted)" }}>{definition.story}</p>
                <div className="my-7">
                  <div className="mb-2 flex justify-between text-[12px]"><span>{count} of {definition.points.length} stars lit</span><span>{Math.round(count / definition.points.length * 100)}%</span></div>
                  <div className="h-1 rounded-full" style={{ background: "var(--app-surface-soft)" }}><div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${count / definition.points.length * 100}%`, background: "var(--app-accent)" }} /></div>
                  <p className="mt-4 text-[13px] leading-relaxed" style={{ color: "var(--app-text-soft)" }}>{next ? `Next: ${milestoneLabel(definition, next.index)}.` : "Your constellation is complete. It has been saved to your collection."}</p>
                  {next && <p className="mt-1 text-[12px]" style={{ color: "var(--app-text-muted)" }}>{followed.value} / {definition.thresholds[next.index]} {definition.metric === "minutes" ? "minutes" : definition.metric === "days" ? "study days" : definition.metric === "subjects" ? "subjects with 15 minutes" : "sessions"}. No deadline.</p>}
                </div>
                <div className="flex flex-wrap gap-2">{followed.earnedAt ? <AppButton variant="primary" onClick={() => open(followed)}>View your card</AppButton> : <Link href="/app/focus" className={appButtonClass("primary")}>Start focus</Link>}<AppButton onClick={() => navigate("discover")}>Change constellation</AppButton></div>
                {!followed.earnedAt && <button type="button" className="mt-4 self-start text-[12px] underline underline-offset-4" onClick={() => open(followed)} style={{ color: "var(--app-text-muted)" }}>Preview card and rewards</button>}
              </div>
            </div>
          </section>
          <div className="mt-5 grid gap-5 md:grid-cols-[1fr_1.2fr]">
            <section className="rounded-lg border p-5" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }} aria-live="polite">
              <p className="text-[11px] uppercase tracking-widest" style={{ color: "var(--app-text-muted)" }}>A point in your sky</p>
              <h3 className="mt-3 text-[16px] font-medium">{inspected && milestoneLabel(definition, inspected.index)}</h3>
              <p className="mt-2 text-[13px] leading-relaxed" style={{ color: "var(--app-text-muted)" }}>{inspected?.earnedAt ? `Lit ${skyDate(inspected.earnedAt)}. This star is yours to keep.` : definition.requirement}</p>
              <p className="mt-5 text-[12px]" style={{ color: "var(--app-text-muted)" }}>Every eligible activity advances all your constellations. Following one simply brings it into view.</p>
            </section>
            <details className="rounded-lg border p-5" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }} open>
              <summary className="cursor-pointer text-[13px] font-medium">Milestones · {count} formed</summary>
              <ol className="mt-3 grid gap-1 sm:grid-cols-2">{followed.milestones.map((star) => <li key={star.index}><button type="button" onClick={() => setSelected(star.index)} className="flex min-h-11 w-full items-center gap-3 rounded-md px-2 py-2 text-left text-[12px] hover:bg-[var(--app-surface-soft)]" aria-pressed={inspected?.index === star.index}><span aria-hidden="true">{star.earnedAt ? "✦" : "○"}</span><span>{milestoneLabel(definition, star.index)}<span className="mt-0.5 block text-[10px]" style={{ color: "var(--app-text-muted)" }}>{star.earnedAt ? skyDate(star.earnedAt) : "Still forming"}</span></span></button></li>)}</ol>
            </details>
          </div>
          {owned.some((card) => !card.seen) && <section className="mt-7"><p className="mb-3 text-[13px] font-medium">New in your collection</p><div className="flex flex-wrap gap-2">{owned.filter((card) => !card.seen).map((card) => <AppButton key={card.id} onClick={() => open(card)}>✦ {constellationById(card.id)!.name}</AppButton>)}</div></section>}
        </>}
        {tab !== "sky" && <>
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><h2 className="text-[22px] font-medium tracking-[-.025em]">{tab === "collection" ? "The light you’ve gathered" : "Find your next constellation"}</h2><p className="mt-2 max-w-xl text-[13px] leading-relaxed" style={{ color: "var(--app-text-muted)" }}>{tab === "collection" ? "Permanent pieces of your study journey. Choose the ones that feel like you." : "Different ways of learning, each with a place in your sky. Progress at your own pace."}</p></div>{tab === "collection" && <label className="text-[12px]">Show <select className="ml-2 rounded-md border px-3 py-2" style={{ background: "var(--app-surface)", borderColor: "var(--app-border)" }} value={filter} onChange={(event) => setFilter(event.target.value)}><option value="collected">Collected · newest first</option><option value="forming">Forming</option><option value="favourites">Favourites</option></select></label>}</div>
          {listed.length ? <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">{listed.map((card) => <button key={card.id} type="button" className={styles.cardButton} aria-label={`View ${constellationById(card.id)!.name}${card.earnedAt ? ", collected" : ", forming"}`} onClick={() => open(card)}><ConstellationCard card={card} featured={sky.preferences.featured === card.id} /></button>)}</div> : <div className="rounded-xl border border-dashed p-8 text-center" style={{ borderColor: "var(--app-border)" }}><h3 className="text-[18px] font-medium">{filter === "favourites" ? "Keep your favourites close" : filter === "forming" ? "Your sky is complete for now" : "Your first card is taking shape"}</h3><p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed" style={{ color: "var(--app-text-muted)" }}>{filter === "favourites" ? "Open a collected card to add it to your favourites." : filter === "forming" ? "Everything you’ve formed is yours to keep." : "Every saved minute brings First Light closer. Your progress stays with you."}</p><div className="mt-5"><AppButton onClick={() => { if (filter === "favourites") setFilter("collected"); else navigate("sky"); }}>View {filter === "favourites" ? "collection" : "sky"}</AppButton></div></div>}
        </>}
      </>}
    </div>
    {detail && detailDefinition && sky && <SkyDialog title={detail.earnedAt ? `${detailDefinition.name} is yours` : detailDefinition.name} onClose={() => { setDetailId(null); setActionError(null); }}>
      <div className="grid items-center gap-8 sm:grid-cols-[minmax(0,280px)_1fr]">
        <div key={`${detail.id}-${replay}`} className={replay && sky.preferences.ambientMotion ? styles.reveal : ""}><ConstellationCard card={detail} preview={!detail.earnedAt} /></div>
        <div><p className="text-[11px] uppercase tracking-widest" style={{ color: "var(--app-text-muted)" }}>{detailDefinition.family} · {detail.earnedAt ? "Collected" : "Reward preview"}</p><h3 className="mt-3 text-[26px] font-medium tracking-[-.03em]">{detailDefinition.name}</h3><p className="mt-3 text-[14px] leading-relaxed" style={{ color: "var(--app-text-soft)" }}>{detailDefinition.description}</p><p className="mt-4 text-[13px] leading-relaxed" style={{ color: "var(--app-text-muted)" }}>{detailDefinition.requirement}</p>
          <div className="my-6 border-y py-4 text-[12px] leading-relaxed" style={{ borderColor: "var(--app-border)", color: "var(--app-text-muted)" }}><p className="font-medium" style={{ color: "var(--app-text)" }}>Your rewards</p><p className="mt-1">A permanent card, profile emblem and constellation backdrop.</p>{detail.earnedAt && <p className="mt-2">Formed {skyDate(detail.earnedAt)}{detail.addedAt && detail.addedAt - detail.earnedAt > 86400000 ? ` · Added from your study history ${skyDate(detail.addedAt)}` : ""}.</p>}</div>
          {actionError && <p role="alert" className="mb-3 text-[13px]" style={{ color: "var(--app-danger)" }}>{actionError}</p>}
          <div className="flex flex-wrap gap-2">{detail.earnedAt ? <><AppButton variant="primary" disabled={busy} onClick={() => void act(() => update({ featured: detail.id }))}>{sky.preferences.featured === detail.id ? "Featured on profile" : "Feature on profile"}</AppButton><AppButton disabled={busy} onClick={() => void act(() => update({ favourites: sky.preferences.favourites.includes(detail.id) ? sky.preferences.favourites.filter((id) => id !== detail.id) : [...sky.preferences.favourites, detail.id] }))}>{sky.preferences.favourites.includes(detail.id) ? "Remove favourite" : "Favourite"}</AppButton><Link href="/app/profile#sky" className={appButtonClass("secondary")}>Customise profile</Link></> : <AppButton variant="primary" disabled={busy} onClick={() => void act(async () => { await update({ followed: detail.id }); setSelected(0); setDetailId(null); navigate("sky"); })}>{sky.preferences.followed === detail.id ? "Continue this constellation" : "Follow this constellation"}</AppButton>}</div>
          {detail.earnedAt && <div className="mt-4 flex flex-wrap gap-4"><button type="button" className="text-[12px] underline underline-offset-4" onClick={() => setReplay((value) => value + 1)}>Replay reveal</button>{!detail.seen && <button type="button" disabled={busy} className="text-[12px] underline underline-offset-4" onClick={() => void act(() => acknowledge(detail.id))}>Mark as seen</button>}</div>}
        </div>
      </div>
    </SkyDialog>}
  </>;
}
