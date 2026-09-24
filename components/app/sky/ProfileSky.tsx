"use client";
import Link from "next/link";
import { useState } from "react";
import { useStudySky } from "@/lib/app/StudySkyProvider";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import { constellationById, type ConstellationId, type SkyPreferences, type SkyCard } from "@/shared/constellations";
import AppButton, { appButtonClass } from "../AppButton";
import { Avatar, Section } from "../profile/ui";
import ConstellationArtwork from "./ConstellationArtwork";
import ConstellationCard from "./ConstellationCard";
import SkyDialog from "./SkyDialog";
import styles from "./sky.module.css";

export function SkyBanner({ preferences, cards }: { preferences: SkyPreferences; cards: SkyCard[] }) {
  const backdrop = cards.find((card) => card.id === preferences.backdrop && card.earnedAt !== null);
  const featured = cards.find((card) => card.id === preferences.featured && card.earnedAt !== null);
  if (!backdrop && !featured) return null;
  const definition = constellationById((featured || backdrop)!.id)!;
  return <div className={styles.banner}>
    {backdrop && <div className={styles.bannerArt}><ConstellationArtwork definition={constellationById(backdrop.id)!} card={backdrop} /></div>}
    <div className={styles.bannerText}><p className="text-[10px] uppercase tracking-[.16em] text-[#a8b4c4]">{featured ? "Featured streak card" : "Your streaks"}</p><p className="mt-3 text-[22px] font-medium tracking-[-.03em]">✦ {definition.name}</p><p className="mt-2 text-[11px] text-[#b6bfcb]">{definition.story}</p></div>
  </div>;
}
export function ProfileSkyBanner() {
  const { sky } = useStudySky();
  return sky ? <SkyBanner preferences={sky.preferences} cards={sky.cards} /> : null;
}

export default function ProfileSky() {
  const { sky, error, refresh } = useStudySky();
  const [editing, setEditing] = useState(false);
  const showcase = sky?.preferences.showcase.map((id) => sky.cards.find((card) => card.id === id)).filter((card): card is SkyCard => !!card && card.earnedAt !== null) || [];
  return <Section id="sky" title="Streak cards" meta="Choose the parts of your journey that feel like you. Only visible to you." action={<AppButton disabled={!sky} onClick={() => setEditing(true)}>Customise appearance</AppButton>}>
    {error && <p role="alert" className="mb-3 text-[13px]">{error} <button className="underline" onClick={() => void refresh()}>Try again</button></p>}
    {showcase.length ? <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">{showcase.map((card) => <Link key={card.id} href="/app/streaks#constellations" className={styles.cardButton}><ConstellationCard card={card} featured={sky?.preferences.featured === card.id} /></Link>)}</div> : <p className="text-[13px] leading-relaxed" style={{ color: "var(--app-text-muted)" }}>{sky ? "Your collected streak cards can become a personal showcase. Add up to three, in your own order." : "Reading your collection…"}</p>}
    <Link href="/app/streaks#constellations" className={`${appButtonClass("ghost")} mt-4`}>Open collection →</Link>
    {editing && sky && <AppearanceEditor initial={sky.preferences} cards={sky.cards} onClose={() => setEditing(false)} />}
  </Section>;
}

function AppearanceEditor({ initial, cards, onClose }: { initial: SkyPreferences; cards: SkyCard[]; onClose: () => void }) {
  const { update } = useStudySky();
  const { data } = useDashboardData();
  const [draft, setDraft] = useState(initial);
  const [previewId, setPreviewId] = useState<ConstellationId | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const owned = cards.filter((card) => card.earnedAt !== null);
  const previewCard = previewId ? cards.find((card) => card.id === previewId) : null;
  // A preview only needs the lit state; it never invents an acquisition date.
  const previewCards = previewCard ? cards.map((card) => card.id === previewId ? { ...card, earnedAt: card.earnedAt ?? 1, milestones: card.milestones.map((star) => ({ ...star, earnedAt: star.earnedAt ?? 1 })) } : card) : cards;
  const previewPreferences = previewId ? { ...draft, featured: previewId, backdrop: previewId } : draft;
  async function save() {
    setBusy(true); setError(null);
    try { await update({ featured: draft.featured, backdrop: draft.backdrop, showcase: draft.showcase }); onClose(); }
    catch (err) { setError(err instanceof Error ? err.message : "Couldn't save your appearance."); setBusy(false); }
  }
  function reorder(index: number, direction: number) {
    const ids = [...draft.showcase];
    [ids[index], ids[index + direction]] = [ids[index + direction], ids[index]];
    setDraft({ ...draft, showcase: ids });
  }
  return <SkyDialog title="Customise your streak cards" onClose={onClose}>
    <div className="grid gap-8 md:grid-cols-2">
      <div><p className="mb-3 text-[11px] uppercase tracking-widest" style={{ color: "var(--app-text-muted)" }}>{previewId ? "Reward preview · not equipped" : "Profile preview · only you"}</p>
        <div className="overflow-hidden rounded-lg border" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}><SkyBanner preferences={previewPreferences} cards={previewCards} /><div className="flex items-center gap-3 p-5"><Avatar name={data.user.name} colour={data.user.avatarColour} size={44} /><div><p className="text-[16px] font-medium">{data.user.name}</p><p className="mt-1 text-[12px]" style={{ color: "var(--app-text-muted)" }}>Your study journey</p></div></div></div>
        {draft.showcase.length > 0 && <div className="mt-4"><p className="mb-2 text-[12px]" style={{ color: "var(--app-text-muted)" }}>Showcase order</p>{draft.showcase.map((id, index) => <div key={id} className="flex items-center justify-between gap-2 border-b py-2 text-[12px]" style={{ borderColor: "var(--app-border)" }}><span>{index + 1}. {constellationById(id)!.name}</span><div className="flex"><AppButton disabled={index === 0} onClick={() => reorder(index, -1)} aria-label={`Move ${constellationById(id)!.name} earlier`}>↑</AppButton><AppButton disabled={index === draft.showcase.length - 1} onClick={() => reorder(index, 1)} aria-label={`Move ${constellationById(id)!.name} later`}>↓</AppButton></div></div>)}</div>}
        <label className="mt-5 block text-[12px]">Preview a reward<select value={previewId || ""} onChange={(event) => setPreviewId(event.target.value as ConstellationId || null)} className="mt-2 w-full rounded-md border p-2" style={{ background: "var(--app-surface)", borderColor: "var(--app-border)" }}><option value="">Show my appearance</option>{cards.map((card) => <option key={card.id} value={card.id}>{constellationById(card.id)!.name}{card.earnedAt ? "" : " · still forming"}</option>)}</select></label>
      </div>
      <div className="space-y-5">
        {(["featured", "backdrop"] as const).map((slot) => <label key={slot} className="block text-[13px]">{slot === "featured" ? "Featured streak card" : "Profile backdrop"}<select value={draft[slot] || ""} onChange={(event) => { setPreviewId(null); setDraft({ ...draft, [slot]: event.target.value || null }); }} className="mt-2 w-full rounded-md border p-2" style={{ background: "var(--app-surface)", borderColor: "var(--app-border)" }}><option value="">None</option>{owned.map((card) => <option key={card.id} value={card.id}>{constellationById(card.id)!.name}</option>)}</select></label>)}
        <fieldset><legend className="text-[13px]">Showcase · {draft.showcase.length} of 3</legend>{owned.length ? owned.map((card) => <label key={card.id} className="mt-2 flex min-h-10 items-center gap-3 text-[12px]"><input type="checkbox" checked={draft.showcase.includes(card.id)} disabled={!draft.showcase.includes(card.id) && draft.showcase.length >= 3} onChange={(event) => setDraft({ ...draft, showcase: event.target.checked ? [...draft.showcase, card.id] : draft.showcase.filter((id) => id !== card.id) })} />{constellationById(card.id)!.name}</label>) : <p className="mt-2 text-[12px] leading-relaxed" style={{ color: "var(--app-text-muted)" }}>Your first collected card will unlock a profile emblem and backdrop. You can preview them now.</p>}</fieldset>
        {error && <p role="alert" className="text-[13px]" style={{ color: "var(--app-danger)" }}>{error}</p>}
        <div className="flex flex-wrap gap-2"><AppButton variant="primary" loading={busy} onClick={() => void save()}>Save changes</AppButton><AppButton disabled={busy} onClick={onClose}>Cancel</AppButton><AppButton variant="ghost" disabled={busy} onClick={() => { setPreviewId(null); setDraft({ ...draft, featured: null, backdrop: null, showcase: [] }); }}>Reset appearance</AppButton></div>
      </div>
    </div>
  </SkyDialog>;
}
