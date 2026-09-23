"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { updateProfile } from "@/lib/api/profile";
import { AU_STATES, countryName, countryOptions } from "@/lib/app/countries";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import { isGuestEmail } from "@/lib/auth/guest";
import AppButton, { appButtonClass } from "../AppButton";
import PageTour from "../tour/PageTour";
import type { SectionProps } from "./ProfileView";
import { ProfileSkyBanner } from "../sky/ProfileSky";
import {
  Avatar,
  ColourSwatches,
  DeveloperTag,
  Label,
  Select,
  Sheet,
  TextInput,
  fallbackColour,
  formatHoursMinutes,
} from "./ui";

const YEAR_LEVELS = ["Year 10", "Year 11", "Year 12", "First year uni", "Second year+"];

/**
 * The top of the profile: picture, name, the facts that frame the plan, and
 * the numbers. No bio, this isn't a social app.
 */
export default function ProfileHeader({ data, replace, replanned }: SectionProps) {
  const { profile, stats } = data;
  const { data: dashboard } = useDashboardData();
  const [editing, setEditing] = useState(false);

  const facts = [profile.grade, profile.school, profile.state, countryName(profile.country)].filter(Boolean);
  const joined = new Intl.DateTimeFormat("en-AU", { month: "long", year: "numeric" }).format(
    new Date(profile.joinedAt),
  );

  const numbers = [
    { label: "Current streak", value: String(stats.currentStreak), unit: stats.currentStreak === 1 ? "day" : "days" },
    { label: "Best streak", value: String(stats.longestStreak), unit: stats.longestStreak === 1 ? "day" : "days" },
    { label: "This week", value: formatHoursMinutes(stats.weekFocusMinutes), unit: "focused" },
    { label: "All time", value: formatHoursMinutes(stats.totalFocusMinutes), unit: "focused" },
    { label: "Sessions", value: String(stats.totalSessions), unit: "logged" },
  ];

  return (
    <section
      aria-label="Your profile"
      className="rounded-lg"
      style={{ background: "var(--app-surface)", boxShadow: "var(--elev-1)" }}
    >
      <ProfileSkyBanner />
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:p-6">
        <Avatar name={profile.name} colour={profile.avatarColour} size={80} developer={profile.developerAccess} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2.5">
            <h1
              className="truncate text-[26px] font-semibold leading-tight tracking-[-0.02em]"
              style={{ color: "var(--app-text)" }}
            >
              {profile.name}
            </h1>
            {profile.developerAccess ? <DeveloperTag /> : null}
          </div>
          <p className="mt-1 text-[14px]" style={{ color: "var(--app-text-soft)" }}>
            {facts.length ? facts.join(" · ") : "Add your year level and school"}
          </p>
          <p className="mt-1 text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>
            Joined {joined}
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-center">
          <PageTour id="profile" />
          {!isGuestEmail(dashboard.user.email) ? (
            <Link href="/app/invite" className={appButtonClass("secondary")}>
              Invite friends
            </Link>
          ) : null}
          <AppButton variant="secondary" onClick={() => setEditing(true)}>
            Edit profile
          </AppButton>
        </div>
      </div>

      {/* 1px gaps over a border-coloured ground draw the dividers at any column count. */}
      <dl
        className="grid grid-cols-2 gap-px overflow-hidden rounded-b-lg border-t sm:grid-cols-5"
        style={{ background: "var(--app-border)", borderColor: "var(--app-border)" }}
      >
        {numbers.map((item, index) => (
          <div
            key={item.label}
            className={index === numbers.length - 1 ? "col-span-2 px-5 py-4 sm:col-span-1 sm:px-6" : "px-5 py-4 sm:px-6"}
            style={{ background: "var(--app-surface)" }}
          >
            <dt className="text-[12px]" style={{ color: "var(--app-text-muted)" }}>
              {item.label}
            </dt>
            <dd className="mt-1 flex items-baseline gap-1.5">
              <span className="text-[20px] font-semibold tabular-nums" style={{ color: "var(--app-text)" }}>
                {item.value}
              </span>
              <span className="text-[12px]" style={{ color: "var(--app-text-muted)" }}>
                {item.unit}
              </span>
            </dd>
          </div>
        ))}
      </dl>

      <EditProfileSheet
        open={editing}
        onClose={() => setEditing(false)}
        data={data}
        onSaved={async (next, gradeChanged) => {
          replace(next);
          // Year level sets the suggested weekly targets, so the plan moves.
          if (gradeChanged) await replanned();
        }}
      />
    </section>
  );
}

interface EditProfileProps {
  onClose: () => void;
  data: SectionProps["data"];
  onSaved: (next: SectionProps["data"], gradeChanged: boolean) => Promise<void>;
}

function EditProfileSheet({ open, ...props }: EditProfileProps & { open: boolean }) {
  return (
    <Sheet open={open} eyebrow="Profile" title="Edit profile" onClose={props.onClose}>
      {/* Mounted only while open, so each open starts from the saved profile. */}
      <EditProfileForm {...props} />
    </Sheet>
  );
}

function EditProfileForm({ onClose, data, onSaved }: EditProfileProps) {
  const { profile } = data;
  const [name, setName] = useState(profile.name);
  const [grade, setGrade] = useState(profile.grade ?? "");
  const [school, setSchool] = useState(profile.school ?? "");
  // Accounts from before countries existed were all Australian.
  const [country, setCountry] = useState(profile.country ?? (profile.state ? "AU" : ""));
  const [state, setState] = useState(profile.state ?? "");
  const countries = useMemo(() => countryOptions(), []);
  const [colour, setColour] = useState(profile.avatarColour ?? fallbackColour(profile.name));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const yearOptions = grade && !YEAR_LEVELS.includes(grade) ? [...YEAR_LEVELS, grade] : YEAR_LEVELS;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const next = await updateProfile({
        name,
        grade: grade || null,
        school: school || null,
        country: country || null,
        state: country === "AU" ? state || null : null,
        avatarColour: colour,
      });
      await onSaved(next, (profile.grade ?? "") !== grade);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex items-center gap-4">
        <Avatar name={name || profile.name} colour={colour} size={56} developer={profile.developerAccess} />
        <div className="min-w-0">
          <p className="mb-2 text-[12.5px] font-medium" style={{ color: "var(--app-text-muted)" }}>
            Colour
          </p>
          <ColourSwatches value={colour} onChange={setColour} label="Avatar colour" />
        </div>
      </div>
      <Label text="Name">
        <TextInput required value={name} onChange={setName} maxLength={120} />
      </Label>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Label text="Year level" hint="Sets the suggested study time per subject.">
          <Select value={grade} onChange={setGrade}>
            <option value="">Not set</option>
            {yearOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
        </Label>
        <Label text="Country">
          <Select value={country} onChange={setCountry}>
            <option value="">Not set</option>
            {countries.map((option) => (
              <option key={option.code} value={option.code}>
                {option.name}
              </option>
            ))}
          </Select>
        </Label>
      </div>
      {country === "AU" ? (
        <Label text="State or territory" hint="Your plan follows its school terms and holidays.">
          <Select value={state} onChange={setState}>
            <option value="">Not set</option>
            {AU_STATES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
        </Label>
      ) : null}
      <Label text="School">
        <TextInput value={school} onChange={setSchool} maxLength={120} placeholder="Your school's name" />
      </Label>

      {error ? (
        <p role="alert" className="text-[13.5px]" style={{ color: "var(--app-danger)" }}>
          {error}
        </p>
      ) : null}

      <div className="flex justify-end gap-2 pt-2">
        <AppButton type="button" variant="ghost" onClick={onClose}>
          Cancel
        </AppButton>
        <AppButton type="submit" variant="primary" loading={saving}>
          Save
        </AppButton>
      </div>
    </form>
  );
}
