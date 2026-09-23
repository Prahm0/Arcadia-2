"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import type {
  CompanionAccessory,
  CompanionForm,
  CompanionPalette,
  CompanionProfile,
  DashboardResponse,
} from "@/lib/api/types";
import Companion from "./Companion";
import AppButton from "./AppButton";

const FORMS: { key: CompanionForm; label: string; helper: string }[] = [
  { key: "orb", label: "Ring", helper: "A ring of stars that closes as it grows." },
  { key: "comet", label: "Comet", helper: "A bright head, the tail growing behind." },
  { key: "nebula", label: "Cluster", helper: "Stars branching out from the middle." },
];

const PALETTES: { key: CompanionPalette; label: string; swatch: string }[] = [
  { key: "violet", label: "Violet", swatch: "#7c5cff" },
  { key: "aqua",   label: "Aqua",   swatch: "#38bdf8" },
  { key: "coral",  label: "Coral",  swatch: "#f97316" },
  { key: "gold",   label: "Gold",   swatch: "#eab308" },
];

const ACCESSORIES: { key: CompanionAccessory; label: string }[] = [
  { key: "none",       label: "Bare" },
  { key: "ring",       label: "Ring" },
  { key: "star",       label: "Star" },
  { key: "book",       label: "Book" },
  { key: "headphones", label: "Headphones" },
];

interface CompanionSheetProps {
  open: boolean;
  onClose: () => void;
  initial: CompanionProfile;
}

/**
 * Modal for customising the student's companion, name, form, palette,
 * accessory, with a live preview so every change is visible before Save.
 * Optimistic: the dashboard cache updates immediately, rolls back on error.
 */
export default function CompanionSheet({ open, onClose, initial }: CompanionSheetProps) {
  const { patch, reload } = useDashboardData();
  const [profile, setProfile] = useState<CompanionProfile>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setProfile(initial);
      setError(null);
    }
  }, [open, initial]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function save() {
    const trimmed = profile.name.trim();
    if (!trimmed) {
      setError("Give your companion a name.");
      return;
    }
    setSaving(true);
    setError(null);
    const previousProfile = initial;
    // Optimistic
    patch((prev: DashboardResponse) => ({
      ...prev,
      companion: {
        ...(prev.companion ?? {}),
        profile: { ...profile, name: trimmed },
      },
    }));
    try {
      await api("/api/companion", {
        method: "PATCH",
        body: JSON.stringify({
          name: trimmed,
          form: profile.form,
          palette: profile.palette,
          accessory: profile.accessory,
        }),
      });
      await reload();
      onClose();
    } catch (err) {
      patch((prev: DashboardResponse) => ({
        ...prev,
        companion: {
          ...(prev.companion ?? {}),
          profile: previousProfile,
        },
      }));
      setError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0"
        style={{ background: "color-mix(in oklab, black 45%, transparent)" }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="companion-sheet-title"
        className="relative w-full max-w-[520px] rounded-t-xl p-6 sm:rounded-lg"
        style={{
          background: "var(--app-elev)", boxShadow: "var(--elev-3)",
          color: "var(--app-text)",
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="type-eyebrow" style={{ color: "var(--app-text-muted)" }}>Companion</p>
            <h2 id="companion-sheet-title" className="mt-1 text-[22px] font-medium tracking-[-0.015em]">
              Make it yours.
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 place-items-center rounded-md transition-colors ui-hover"
            style={{ color: "var(--app-text-muted)" }}
          >
            <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Live preview */}
        <div
          className="mt-5 flex items-center gap-4 rounded-md p-4"
          style={{ background: "var(--app-surface-soft)", boxShadow: "var(--elev-inset)" }}
        >
          <Companion
            form={profile.form}
            palette={profile.palette}
            accessory={profile.accessory}
            level={4}
            size={108}
          />
          <div className="min-w-0 flex-1">
            <p className="text-[13px]" style={{ color: "var(--app-text-muted)" }}>Preview</p>
            <p className="mt-0.5 text-[17px] font-medium tracking-[-0.005em]" style={{ color: "var(--app-text)" }}>
              {profile.name || "Star"}
            </p>
            <p className="mt-0.5 type-mono-label" style={{ color: "var(--app-text-muted)" }}>
              {FORMS.find((f) => f.key === profile.form)?.helper}
            </p>
          </div>
        </div>

        {/* Name */}
        <div className="mt-5">
          <label className="block">
            <span className="mb-2 block text-[12.5px] font-medium" style={{ color: "var(--app-text-muted)" }}>
              Name
            </span>
            <input
              type="text"
              value={profile.name}
              maxLength={40}
              onChange={(e) => setProfile((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="Star"
              className="w-full rounded-md px-3 py-2.5 text-[15px] outline-none"
              style={{
                background: "var(--app-surface-soft)", boxShadow: "var(--elev-inset)",
                color: "var(--app-text)",
              }}
            />
          </label>
        </div>

        {/* Form */}
        <div className="mt-5">
          <p className="type-eyebrow" style={{ color: "var(--app-text-muted)" }}>Form</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {FORMS.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setProfile((prev) => ({ ...prev, form: option.key }))}
                className="rounded-md px-3 py-2.5 text-[13.5px] font-medium capitalize transition-colors"
                style={{
                  background: profile.form === option.key ? "var(--app-arcad-soft)" : "transparent",
                  color: profile.form === option.key ? "var(--app-arcad-strong)" : "var(--app-text-soft)",
                  border: "1px solid var(--app-border)",
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Palette */}
        <div className="mt-5">
          <p className="type-eyebrow" style={{ color: "var(--app-text-muted)" }}>Palette</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {PALETTES.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setProfile((prev) => ({ ...prev, palette: option.key }))}
                className="flex items-center gap-2 rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-colors"
                style={{
                  background: profile.palette === option.key ? "var(--app-arcad-soft)" : "transparent",
                  color: profile.palette === option.key ? "var(--app-arcad-strong)" : "var(--app-text-soft)",
                  border: "1px solid var(--app-border)",
                }}
                aria-pressed={profile.palette === option.key}
              >
                <span
                  aria-hidden="true"
                  className="size-3 rounded-full"
                  style={{ background: option.swatch }}
                />
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Accessory */}
        <div className="mt-5">
          <p className="type-eyebrow" style={{ color: "var(--app-text-muted)" }}>Accessory</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {ACCESSORIES.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setProfile((prev) => ({ ...prev, accessory: option.key }))}
                className="rounded-md px-3 py-1.5 text-[12.5px] font-medium transition-colors"
                style={{
                  background: profile.accessory === option.key ? "var(--app-arcad-soft)" : "transparent",
                  color: profile.accessory === option.key ? "var(--app-arcad-strong)" : "var(--app-text-soft)",
                  border: "1px solid var(--app-border)",
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {error ? (
          <p className="mt-4 text-[13px]" style={{ color: "var(--app-danger)" }}>{error}</p>
        ) : null}

        <div className="mt-6 flex items-center justify-end gap-2">
          <AppButton type="button" variant="ghost" onClick={onClose}>Cancel</AppButton>
          <AppButton type="button" variant="primary" onClick={save} loading={saving}>
            Save
          </AppButton>
        </div>
      </div>
    </div>
  );
}
