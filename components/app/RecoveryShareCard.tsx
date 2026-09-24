"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api/client";
import { analytics } from "@/lib/analytics/events";
import type { RecoveryReason, RecoverySessionChange } from "@/lib/app/recovery";
import { subjectColour } from "@/lib/app/subjectColour";
import type { DashboardResponse } from "@/lib/api/types";

type CardFormat = "story" | "square";

interface ReferralSummary { inviteLink: string }

export default function RecoveryShareCard({
  reason,
  excuse,
  changes,
  lines,
  subjects,
  onClose,
}: {
  reason: RecoveryReason;
  excuse: string;
  changes: RecoverySessionChange[];
  lines: string[];
  subjects: DashboardResponse["subjects"];
  onClose: () => void;
}) {
  const [format, setFormat] = useState<CardFormat>("story");
  const [sharing, setSharing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState("https://arcadiahq.app/register");
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let active = true;
    api<ReferralSummary>("/api/referrals")
      .then((summary) => { if (active) setInviteLink(summary.inviteLink); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    void drawRecovery(canvas, { format, excuse, changes, lines, subjects, inviteLink });
  }, [format, excuse, changes, lines, subjects, inviteLink]);

  async function imageFile() {
    const canvas = canvasRef.current;
    if (!canvas) throw new Error("Your image is still getting ready.");
    const blob = await canvasToBlob(canvas);
    return new File([blob], `arcadia-rebuild-${format}.png`, { type: "image/png" });
  }

  async function share() {
    setSharing(true);
    setMessage(null);
    try {
      const file = await imageFile();
      if (!navigator.share || (navigator.canShare && !navigator.canShare({ files: [file] }))) {
        await download(file);
        analytics.recoveryShared(reason, format);
        setMessage("Your rebuild image was downloaded.");
        return;
      }
      await navigator.share({ title: "My Arcadia rebuild", text: "My study plan survives real life.", files: [file] });
      analytics.recoveryShared(reason, format);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMessage(error instanceof Error ? error.message : "Couldn’t share your rebuild. Try downloading it instead.");
    } finally {
      setSharing(false);
    }
  }

  async function downloadImage() {
    setSharing(true);
    setMessage(null);
    try {
      await download(await imageFile());
      analytics.recoveryShared(reason, format);
      setMessage("Your rebuild image was downloaded.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Couldn’t download your rebuild.");
    } finally {
      setSharing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/45 p-3 sm:items-center sm:p-6" role="presentation" onMouseDown={onClose}>
      <section className="max-h-[94svh] w-full max-w-[520px] overflow-y-auto rounded-xl border p-4 sm:p-5" role="dialog" aria-modal="true" aria-labelledby="share-rebuild-title" onMouseDown={(event) => event.stopPropagation()} style={{ background: "var(--app-surface)", borderColor: "var(--app-border)", boxShadow: "var(--elev-3)" }}>
        <div className="flex items-start justify-between gap-4">
          <div><p className="type-eyebrow" style={{ color: "var(--app-text-muted)" }}>Share your rebuild</p><h2 id="share-rebuild-title" className="mt-1 text-[19px] font-semibold tracking-[-0.02em]" style={{ color: "var(--app-text)" }}>Life happened. Your plan adapted.</h2></div>
          <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-md ui-hover" aria-label="Close share card" style={{ color: "var(--app-text-muted)" }}>×</button>
        </div>
        <div className="mt-4 flex rounded-md p-1" style={{ background: "var(--app-surface-soft)", boxShadow: "var(--elev-inset)" }}>
          {(["story", "square"] as CardFormat[]).map((option) => <button key={option} type="button" onClick={() => setFormat(option)} className="flex-1 rounded-sm px-3 py-1.5 text-[12.5px] font-medium capitalize" style={{ background: format === option ? "var(--app-surface)" : "transparent", color: format === option ? "var(--app-text)" : "var(--app-text-muted)", boxShadow: format === option ? "var(--elev-1)" : "none" }}>{option}</button>)}
        </div>
        <div className="mt-4 overflow-hidden rounded-lg" style={{ background: "#04040e" }}><canvas ref={canvasRef} aria-label={`${format === "story" ? "Story" : "Square"} preview of your Arcadia plan rebuild`} className={`block w-full ${format === "story" ? "aspect-[9/16]" : "aspect-square"}`} /></div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => void share()} disabled={sharing} className="inline-flex h-10 items-center justify-center gap-2 rounded-md px-3 text-[13px] font-semibold disabled:opacity-60" style={{ background: "var(--app-accent)", color: "var(--app-accent-on)" }}><ShareIcon />{sharing ? "Preparing" : "Share image"}</button>
          <button type="button" onClick={() => void downloadImage()} disabled={sharing} className="inline-flex h-10 items-center justify-center gap-2 rounded-md px-3 text-[13px] font-semibold ui-hover disabled:opacity-60" style={{ color: "var(--app-text-soft)", boxShadow: "inset 0 0 0 1px var(--app-border-strong)" }}><DownloadIcon />Download</button>
        </div>
        <p className="mt-3 text-center text-[11.5px] leading-4" style={{ color: "var(--app-text-muted)" }}>Only your rebuild and the Arcadia link are included.</p>
        {message ? <p role="status" className="mt-2 text-center text-[12px]" style={{ color: "var(--app-text-muted)" }}>{message}</p> : null}
      </section>
    </div>
  );
}

async function drawRecovery(canvas: HTMLCanvasElement, data: { format: CardFormat; excuse: string; changes: RecoverySessionChange[]; lines: string[]; subjects: DashboardResponse["subjects"]; inviteLink: string }) {
  const width = 1080;
  const height = data.format === "story" ? 1920 : 1080;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const compact = data.format === "square";
  const gridTop = compact ? 415 : 670;
  const gridHeight = compact ? 280 : 450;
  const footerY = height - (compact ? 88 : 118);
  const background = ctx.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, "#04040e"); background.addColorStop(0.55, "#100d25"); background.addColorStop(1, "#04040e");
  ctx.fillStyle = background; ctx.fillRect(0, 0, width, height);
  nebula(ctx, 190, 260, 440, "rgba(111, 79, 255, 0.22)"); nebula(ctx, 890, height * 0.64, 500, "rgba(54, 40, 128, 0.26)"); stars(ctx, width, height);
  const mark = await markImage();
  if (mark) ctx.drawImage(mark, 76, 70, 48, 48);
  ctx.fillStyle = "#f4f1ff"; ctx.font = "600 30px ui-sans-serif, system-ui, sans-serif"; ctx.fillText("ARCADIA", 140, 103);
  ctx.fillStyle = "rgba(224, 216, 255, 0.68)"; ctx.font = "600 21px ui-sans-serif, system-ui, sans-serif"; ctx.fillText("THE REBUILD", 76, compact ? 190 : 220);
  ctx.fillStyle = "#ffffff"; ctx.font = `${compact ? 62 : 78}px Georgia, serif`; ctx.fillText("Life happened:", 76, compact ? 270 : 315);
  wrap(ctx, quote(data.excuse), 76, compact ? 340 : 400, width - 152, compact ? 58 : 70, compact ? 56 : 68, "#c8b9ff", "600");
  drawWeek(ctx, data.changes, data.subjects, gridTop, gridHeight);
  const moved = data.changes.filter((change) => change.before && change.after).length;
  ctx.fillStyle = "#ffffff"; ctx.font = `700 ${compact ? 38 : 46}px ui-sans-serif, system-ui, sans-serif`; ctx.fillText(`Moved ${moved} ${moved === 1 ? "session" : "sessions"}.`, 76, compact ? 790 : 1300);
  const protectedLine = data.lines.find((line) => line.startsWith("Protected your "));
  if (protectedLine) { ctx.fillStyle = "rgba(235, 229, 255, 0.75)"; ctx.font = "500 25px ui-sans-serif, system-ui, sans-serif"; ctx.fillText(`${protectedLine.replace("Protected your ", "")}: still on track.`, 76, compact ? 842 : 1350); }
  ctx.fillStyle = "rgba(235, 229, 255, 0.8)"; ctx.font = "600 24px ui-sans-serif, system-ui, sans-serif"; ctx.fillText("arcadiahq.app", 76, footerY);
  ctx.fillStyle = "rgba(200, 185, 255, 0.72)"; ctx.font = "500 17px ui-sans-serif, system-ui, sans-serif"; ctx.fillText(shortLink(data.inviteLink), 76, footerY + 32);
}

function drawWeek(ctx: CanvasRenderingContext2D, changes: RecoverySessionChange[], subjects: DashboardResponse["subjects"], top: number, height: number) {
  const x = 76; const width = 928; const header = 55; const bodyTop = top + header;
  roundRect(ctx, x, top, width, height, 28); ctx.fillStyle = "rgba(255,255,255,0.07)"; ctx.fill(); ctx.strokeStyle = "rgba(212,196,255,0.26)"; ctx.stroke();
  ctx.font = "600 17px ui-sans-serif, system-ui, sans-serif"; ctx.fillStyle = "rgba(234,229,255,0.76)";
  const now = new Date();
  for (let day = 0; day < 7; day += 1) { const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + day); const colX = x + day * (width / 7); ctx.fillText(d.toLocaleDateString("en-AU", { weekday: "narrow" }), colX + 18, top + 28); ctx.fillStyle = "rgba(212,196,255,0.35)"; ctx.fillRect(colX, top + header, 1, height - header - 20); ctx.fillStyle = "rgba(234,229,255,0.76)"; }
  const min = 7 * 60; const range = 15 * 60;
  const position = (slot: { startAt: string; endAt: string }) => { const d = new Date(slot.startAt); const minutes = d.getHours() * 60 + d.getMinutes(); const day = Math.max(0, Math.min(6, Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86400000))); return { x: x + day * (width / 7) + 8, y: bodyTop + Math.max(0, Math.min(height - header - 35, ((minutes - min) / range) * (height - header - 24))), w: width / 7 - 16, h: Math.max(12, Math.min(34, ((Date.parse(slot.endAt) - Date.parse(slot.startAt)) / 60000 / range) * (height - header - 24))) }; };
  for (const change of changes) { if (change.before) { const p = position(change.before); roundRect(ctx, p.x, p.y, p.w, p.h, 6); ctx.fillStyle = "rgba(230,225,250,0.22)"; ctx.fill(); } }
  for (const change of changes) { if (change.after) { const p = position(change.after); roundRect(ctx, p.x, p.y, p.w, p.h, 6); ctx.fillStyle = subjectColour(subjects, change.subject) ?? "#7457f5"; ctx.fill(); } }
  ctx.fillStyle = "rgba(234,229,255,0.62)"; ctx.font = "500 15px ui-sans-serif, system-ui, sans-serif"; ctx.fillText("before", x + 20, top + height - 12); ctx.fillStyle = "#c8b9ff"; ctx.fillText("updated plan", x + 95, top + height - 12);
}

function quote(value: string) { return `“${value.slice(0, 60)}”`; }
function shortLink(link: string) { return link.replace(/^https?:\/\//, ""); }
function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, max: number, line: number, fontSize: number, color: string, weight: string) { ctx.fillStyle = color; ctx.font = `${weight} ${fontSize}px Georgia, serif`; let row = ""; let offset = 0; for (const word of text.split(" ")) { const next = `${row}${row ? " " : ""}${word}`; if (ctx.measureText(next).width > max && row) { ctx.fillText(row, x, y + offset); offset += line; row = word; } else row = next; } if (row) ctx.fillText(row, x, y + offset); }
function nebula(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) { const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, color); g.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = g; ctx.fillRect(0, 0, 1080, 1920); }
function stars(ctx: CanvasRenderingContext2D, width: number, height: number) { let seed = 128; for (let i = 0; i < 80; i += 1) { seed = (seed * 1103515245 + 12345) >>> 0; const x = (seed / 4294967296) * width; seed = (seed * 1103515245 + 12345) >>> 0; const y = (seed / 4294967296) * height; ctx.fillStyle = "rgba(235,229,255,0.46)"; ctx.fillRect(x, y, 2, 2); } }
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
async function markImage(): Promise<HTMLImageElement | null> { try { const image = new Image(); image.src = "/brand/arcadia-mark.png"; await image.decode(); return image; } catch { return null; } }
function canvasToBlob(canvas: HTMLCanvasElement) { return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Couldn’t create your rebuild image.")), "image/png")); }
async function download(file: File) { const url = URL.createObjectURL(file); const anchor = document.createElement("a"); anchor.href = url; anchor.download = file.name; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); }
function ShareIcon() { return <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="15" cy="5" r="2" /><circle cx="5" cy="10" r="2" /><circle cx="15" cy="15" r="2" /><path d="M6.8 9l6.2-3M6.8 11l6.2 3" strokeLinecap="round" /></svg>; }
function DownloadIcon() { return <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M10 3v9M6.5 9.5L10 13l3.5-3.5M4 16h12" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
