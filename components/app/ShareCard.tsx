"use client";

import { useEffect, useRef, useState } from "react";

export interface WeeklyRecap {
  minutes: number;
  sessions: number;
  streak: number;
  recoveries: number;
  /** All-time stars lit, so the recap carries the user's real streak stars. */
  starsLit: number;
}

type CardFormat = "story" | "square";

const STAR_PATH = [
  [0.09, 0.67], [0.18, 0.57], [0.29, 0.63], [0.39, 0.44],
  [0.5, 0.53], [0.6, 0.31], [0.7, 0.42], [0.8, 0.22],
  [0.9, 0.38], [0.84, 0.65], [0.7, 0.72], [0.55, 0.66],
] as const;

export default function ShareCard({ recap, onClose }: { recap: WeeklyRecap; onClose: () => void }) {
  const [format, setFormat] = useState<CardFormat>("story");
  const [sharing, setSharing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawRecap(canvas, recap, format);
  }, [format, recap]);

  async function imageFile() {
    const canvas = canvasRef.current;
    if (!canvas) throw new Error("Your recap is still getting ready.");
    const blob = await canvasToBlob(canvas);
    return new File([blob], `my-arcadia-week-${format}.png`, { type: "image/png" });
  }

  async function share() {
    setSharing(true);
    setMessage(null);
    try {
      const file = await imageFile();
      const payload = { title: "My Arcadia week", text: "My study plan survives real life.", files: [file] };
      if (!navigator.share || (navigator.canShare && !navigator.canShare({ files: [file] }))) {
        await download(file);
        setMessage("Your recap image was downloaded.");
        return;
      }
      await navigator.share(payload);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMessage(error instanceof Error ? error.message : "Couldn't share your recap. Try downloading it instead.");
    } finally {
      setSharing(false);
    }
  }

  async function downloadImage() {
    setSharing(true);
    setMessage(null);
    try {
      await download(await imageFile());
      setMessage("Your recap image was downloaded.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Couldn't download your recap.");
    } finally {
      setSharing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/45 p-3 sm:items-center sm:p-6" role="presentation" onMouseDown={onClose}>
      <section
        className="max-h-[94svh] w-full max-w-[520px] overflow-y-auto rounded-xl border p-4 sm:p-5"
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-week-title"
        onMouseDown={(event) => event.stopPropagation()}
        style={{ background: "var(--app-surface)", borderColor: "var(--app-border)", boxShadow: "var(--elev-3)" }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="type-eyebrow" style={{ color: "var(--app-text-muted)" }}>Share your progress</p>
            <h2 id="share-week-title" className="mt-1 text-[19px] font-semibold tracking-[-0.02em]" style={{ color: "var(--app-text)" }}>
              Your Arcadia week
            </h2>
          </div>
          <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-md ui-hover" aria-label="Close share card" style={{ color: "var(--app-text-muted)" }}>
            <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" /></svg>
          </button>
        </div>

        <div className="mt-4 flex rounded-md p-1" style={{ background: "var(--app-surface-soft)", boxShadow: "var(--elev-inset)" }}>
          {(["story", "square"] as CardFormat[]).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setFormat(option)}
              className="flex-1 rounded-sm px-3 py-1.5 text-[12.5px] font-medium capitalize"
              style={{ background: format === option ? "var(--app-surface)" : "transparent", color: format === option ? "var(--app-text)" : "var(--app-text-muted)", boxShadow: format === option ? "var(--elev-1)" : "none" }}
            >
              {option}
            </button>
          ))}
        </div>

        <div className="mt-4 overflow-hidden rounded-lg" style={{ background: "#0c1017" }}>
          <canvas
            ref={canvasRef}
            aria-label={`${format === "story" ? "Story" : "Square"} preview of your Arcadia weekly recap`}
            className={`block w-full ${format === "story" ? "aspect-[9/16]" : "aspect-square"}`}
          />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => void share()} disabled={sharing} className="inline-flex h-10 items-center justify-center gap-2 rounded-md px-3 text-[13px] font-semibold disabled:opacity-60" style={{ background: "var(--app-accent)", color: "var(--app-accent-on)" }}>
            <ShareIcon />
            {sharing ? "Preparing" : "Share image"}
          </button>
          <button type="button" onClick={() => void downloadImage()} disabled={sharing} className="inline-flex h-10 items-center justify-center gap-2 rounded-md px-3 text-[13px] font-semibold ui-hover disabled:opacity-60" style={{ color: "var(--app-text-soft)", boxShadow: "inset 0 0 0 1px var(--app-border-strong)" }}>
            <DownloadIcon />
            Download
          </button>
        </div>
        <p className="mt-3 text-center text-[11.5px] leading-4" style={{ color: "var(--app-text-muted)" }}>
          Includes your real focus data and arcadiahq.app.
        </p>
        {message ? <p role="status" className="mt-2 text-center text-[12px]" style={{ color: "var(--app-text-muted)" }}>{message}</p> : null}
      </section>
    </div>
  );
}

function drawRecap(canvas: HTMLCanvasElement, recap: WeeklyRecap, format: CardFormat) {
  const width = 1080;
  const height = format === "story" ? 1920 : 1080;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const compact = format === "square";
  const constellationTop = compact ? 230 : 380;
  const constellationHeight = compact ? 330 : 510;
  const statsTop = compact ? 680 : 1130;
  const stars = Math.min(STAR_PATH.length, recap.starsLit);

  const background = ctx.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, "#0c1017");
  background.addColorStop(0.5, "#131a24");
  background.addColorStop(1, "#0c1017");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);
  drawNebula(ctx, width, height, 180, 300, 440, "rgba(230, 199, 143, 0.14)");
  drawNebula(ctx, width, height, 900, compact ? 260 : 600, 390, "rgba(38, 51, 71, 0.45)");
  drawField(ctx, width, height);

  ctx.fillStyle = "#f1f3f6";
  ctx.font = "600 32px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText("✦  ARCADIA", 76, 100);
  ctx.fillStyle = "rgba(214, 220, 229, 0.7)";
  ctx.font = "500 24px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText("MY STUDY WEEK", 76, 154);

  ctx.fillStyle = "#ffffff";
  ctx.font = `${compact ? 700 : 700} ${compact ? 62 : 74}px ui-sans-serif, system-ui, sans-serif`;
  ctx.fillText("My streak", 76, compact ? 218 : 255);
  ctx.fillStyle = "rgba(214, 220, 229, 0.72)";
  ctx.font = "500 27px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText("Every focused session lights another star.", 78, compact ? 266 : 305);

  drawConstellation(ctx, width, constellationTop, constellationHeight, stars);

  const cards = recap.recoveries > 0 ? 4 : 3;
  const columns = cards === 3 ? 3 : 2;
  const cardWidth = (width - 152 - (columns - 1) * 18) / columns;
  const cardHeight = compact && cards === 4 ? 120 : cards === 3 ? 178 : 155;
  const entries = [
    { label: "FOCUSED", value: displayMinutes(recap.minutes) },
    { label: "SESSIONS", value: String(recap.sessions) },
    { label: "STREAK", value: `${recap.streak} days` },
    ...(recap.recoveries > 0 ? [{ label: "RECOVERED MY WEEK", value: `${recap.recoveries} time${recap.recoveries === 1 ? "" : "s"}` }] : []),
  ];
  entries.forEach((entry, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const x = 76 + col * (cardWidth + 18);
    const y = statsTop + row * (cardHeight + 18);
    drawMetric(ctx, x, y, cardWidth, cardHeight, entry.label, entry.value);
  });

  const footerY = height - 90;
  ctx.fillStyle = "rgba(214, 220, 229, 0.84)";
  ctx.font = "600 24px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText("Your study plan survives real life.", 76, footerY);
  ctx.textAlign = "right";
  ctx.fillStyle = "#e6c78f";
  ctx.font = "600 22px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText("arcadiahq.app", width - 76, footerY);
  ctx.textAlign = "left";
}

function drawConstellation(ctx: CanvasRenderingContext2D, width: number, top: number, height: number, lit: number) {
  const points = STAR_PATH.map(([x, y]) => ({ x: x * width, y: top + y * height }));
  ctx.lineWidth = 3;
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.strokeStyle = index < lit ? "rgba(230, 199, 143, 0.82)" : "rgba(220, 229, 244, 0.18)";
    ctx.setLineDash(index < lit ? [] : [7, 14]);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  points.forEach((point, index) => {
    const on = index < lit;
    if (on) {
      const glow = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, 45);
      glow.addColorStop(0, "rgba(230, 199, 143, 0.8)");
      glow.addColorStop(1, "rgba(230, 199, 143, 0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(point.x, point.y, 45, 0, Math.PI * 2);
      ctx.fill();
    }
    drawStar(ctx, point.x, point.y, on ? (index % 5 === 0 ? 18 : 12) : 7, on ? "#fff8ea" : "rgba(220, 229, 244, 0.34)");
  });
}

function drawMetric(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, label: string, value: string) {
  roundedRect(ctx, x, y, width, height, 24);
  ctx.fillStyle = "rgba(255, 255, 255, 0.09)";
  ctx.fill();
  ctx.strokeStyle = "rgba(220, 229, 244, 0.22)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = "rgba(214, 220, 229, 0.68)";
  ctx.font = "600 20px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText(label, x + 26, y + 48);
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 38px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText(value, x + 26, y + 102);
}

function drawNebula(ctx: CanvasRenderingContext2D, width: number, height: number, x: number, y: number, radius: number, color: string) {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

function drawField(ctx: CanvasRenderingContext2D, width: number, height: number) {
  let seed = 4112026;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let index = 0; index < 100; index += 1) {
    const x = random() * width;
    const y = random() * height;
    const size = random() < 0.12 ? 3.5 : random() < 0.48 ? 2 : 1;
    ctx.fillStyle = `rgba(220, 229, 244, ${0.18 + random() * 0.55})`;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  for (let index = 0; index < 8; index += 1) {
    const r = index % 2 === 0 ? radius : radius * 0.27;
    const angle = -Math.PI / 2 + index * Math.PI / 4;
    const px = Math.cos(angle) * r;
    const py = Math.sin(angle) * r;
    if (index === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function displayMinutes(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours} hr`;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Couldn't create your recap image.")), "image/png");
  });
}

async function download(file: File) {
  const url = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function ShareIcon() {
  return <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="15" cy="5" r="2" /><circle cx="5" cy="10" r="2" /><circle cx="15" cy="15" r="2" /><path d="M6.8 9l6.2-3M6.8 11l6.2 3" strokeLinecap="round" /></svg>;
}

function DownloadIcon() {
  return <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M10 3v9M6.5 9.5L10 13l3.5-3.5M4 16h12" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
