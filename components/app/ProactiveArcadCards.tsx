"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import { useStreak } from "@/lib/app/useStreak";
import { buildProactiveCards, type ProactiveCard, type ProactiveTone } from "@/lib/app/proactiveCards";

const STORAGE_PREFIX = "arcadia:proactive:dismissed:";

interface ProactiveArcadCardsProps {
  /** Cap for the number of cards to render at once. Default 2 so we never spam. */
  limit?: number;
  /** Compact variant tucks the orb tighter, used inside chat panels. */
  compact?: boolean;
}

/**
 * Proactive Arcad notifications, deadline-in-24h, streak milestone, quiet
 * week. Each card is stable-id'd; a dismissed card stays dismissed forever
 * for its event (task-id, milestone value, or week key), so once you've seen
 * "3-day streak" celebrated, hitting 3 again after a reset shows it again but
 * the same active streak never nags twice.
 */
export default function ProactiveArcadCards({ limit = 2, compact = false }: ProactiveArcadCardsProps) {
  const router = useRouter();
  const { data } = useDashboardData();
  const streak = useStreak();
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());

  const cards = useMemo(() => buildProactiveCards(data, streak), [data, streak]);
  const visible = cards.filter((card) => !dismissed.has(card.id)).slice(0, limit);

  useEffect(() => {
    const next = new Set<string>();
    for (const card of cards) {
      try {
        if (window.localStorage.getItem(`${STORAGE_PREFIX}${card.id}`) === "1") {
          next.add(card.id);
        }
      } catch {
        /* ignore */
      }
    }
    setDismissed(next);
  }, [cards]);

  function dismiss(cardId: string) {
    setDismissed((prev) => new Set(prev).add(cardId));
    try {
      window.localStorage.setItem(`${STORAGE_PREFIX}${cardId}`, "1");
    } catch {
      /* ignore */
    }
  }

  function onAction(card: ProactiveCard, action: NonNullable<ProactiveCard["actions"]>[number]) {
    dismiss(card.id);
    if (action.lifeReason) {
      // Today listens for this and opens the recovery sheet, pre-run.
      window.dispatchEvent(new CustomEvent("arcadia:life", { detail: { reason: action.lifeReason, deadline: action.lifeDeadline } }));
    } else if (action.href) {
      router.push(action.href);
    } else if (action.arcadPrompt) {
      router.push(`/app/arcad?prompt=${encodeURIComponent(action.arcadPrompt)}`);
    }
  }

  if (visible.length === 0) return null;

  return (
    <div className="mb-4 flex flex-col gap-2.5">
      {visible.map((card) => (
        <div
          key={card.id}
          className="rounded-lg p-4"
          style={{
            background: cardBg(card.tone),
            border: `1px solid ${cardBorder(card.tone)}`,
          }}
        >
          <div className="flex items-start gap-3">
            <span className={compact ? "mt-0" : "mt-0.5"}>
              <ArcadNoticeMark size={compact ? 24 : 30} tone={card.tone} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="type-eyebrow" style={{ color: eyebrowColor(card.tone) }}>
                {card.eyebrow}
              </p>
              <p className="mt-1.5 text-[14.5px] leading-snug" style={{ color: "var(--app-text)" }}>
                {card.title}
              </p>
              {card.actions && card.actions.length > 0 ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {card.actions.map((action) =>
                    action.href ? (
                      <Link
                        key={action.label}
                        href={action.href}
                        onClick={() => dismiss(card.id)}
                        className="rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-colors"
                        style={actionStyle(action.variant)}
                      >
                        {action.label}
                      </Link>
                    ) : (
                      <button
                        key={action.label}
                        type="button"
                        onClick={() => onAction(card, action)}
                        className="rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-colors"
                        style={actionStyle(action.variant)}
                      >
                        {action.label}
                      </button>
                    ),
                  )}
                  <button
                    type="button"
                    onClick={() => dismiss(card.id)}
                    className="ml-1 text-[12.5px] font-medium"
                    style={{ color: "var(--app-text-muted)" }}
                  >
                    Dismiss
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => dismiss(card.id)}
                  className="mt-2 text-[12.5px] font-medium"
                  style={{ color: "var(--app-text-muted)" }}
                >
                  Dismiss
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Product notices use a quiet spark. Arcad's expressive companion belongs in chat. */
function ArcadNoticeMark({ size, tone }: { size: number; tone: ProactiveTone }) {
  const colour = tone === "warn" ? "var(--app-warning)" : tone === "celebrate" ? "var(--app-success)" : "var(--app-arcad)";
  return (
    <span
      aria-hidden="true"
      className="grid place-items-center rounded-full"
      style={{ width: size, height: size, background: `color-mix(in oklab, ${colour} 12%, var(--app-surface))` }}
    >
      <svg viewBox="0 0 20 20" width={size * 0.52} height={size * 0.52} fill="none">
        <path d="M10 2.5l1.15 4.15L15.5 8l-4.35 1.35L10 13.5 8.85 9.35 4.5 8l4.35-1.35L10 2.5z" fill={colour} />
      </svg>
    </span>
  );
}

function cardBg(tone: ProactiveTone): string {
  switch (tone) {
    case "celebrate":
      return "color-mix(in oklab, var(--app-success) 12%, var(--app-surface))";
    case "warn":
      return "color-mix(in oklab, var(--app-arcad) 12%, var(--app-surface))";
    case "info":
    default:
      return "var(--app-surface)";
  }
}

function cardBorder(tone: ProactiveTone): string {
  switch (tone) {
    case "celebrate":
      return "color-mix(in oklab, var(--app-success) 40%, var(--app-border))";
    case "warn":
      return "color-mix(in oklab, var(--app-arcad) 35%, var(--app-border))";
    case "info":
    default:
      return "var(--app-border)";
  }
}

function eyebrowColor(tone: ProactiveTone): string {
  switch (tone) {
    case "celebrate":
      return "var(--app-success)";
    case "warn":
      return "var(--app-arcad-strong)";
    case "info":
    default:
      return "var(--app-text-muted)";
  }
}

function actionStyle(variant: "primary" | "ghost" | undefined): React.CSSProperties {
  if (variant === "primary") {
    return { background: "var(--app-arcad)", color: "var(--app-arcad-on)", border: "1px solid var(--app-arcad)" };
  }
  return {
    background: "transparent",
    color: "var(--app-text-soft)",
    border: "1px solid var(--app-border-strong)",
  };
}
