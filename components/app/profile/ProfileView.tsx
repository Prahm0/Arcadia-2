"use client";

import { useCallback, useEffect } from "react";
import { useProfile, type ProfileResponse } from "@/lib/api/profile";
import { useDashboardData } from "@/lib/app/DashboardProvider";
import AppButton from "../AppButton";
import ArcadSection from "./ArcadSection";
import CocurricularsSection from "./CocurricularsSection";
import GoalsSection from "./GoalsSection";
import ProfileHeader from "./ProfileHeader";
import RoutineSection from "./RoutineSection";
import SubjectsSection from "./SubjectsSection";
import ProfileSky from "../sky/ProfileSky";

export interface SectionProps {
  data: ProfileResponse;
  /** Re-read the profile after a write. */
  refresh: () => Promise<void>;
  /** For writes that answer with the whole profile. */
  replace: (data: ProfileResponse) => void;
  /** After a write that changes the plan: profile, then Today/Schedule. */
  replanned: () => Promise<void>;
}

/**
 * Who the student is and everything Arcad plans around, in one place:
 * subjects, co-curriculars, goals, what Arcad knows, and the study routine.
 * App behaviour (theme, sounds, calendars, password) stays in Settings.
 */
export default function ProfileView() {
  const { state, refresh, replace } = useProfile();
  const { reload } = useDashboardData();

  const replanned = useCallback(async () => {
    await Promise.all([refresh(), reload()]);
  }, [refresh, reload]);

  // Deep links like /app/profile#arcad land once the sections exist.
  const ready = state.status === "ready";
  useEffect(() => {
    if (!ready || !window.location.hash) return;
    document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ block: "start" });
  }, [ready]);

  if (state.status === "loading") {
    return (
      <div className="grid min-h-[50svh] place-items-center">
        <div
          aria-label="Loading your profile"
          className="h-6 w-6 animate-spin rounded-full border-2"
          style={{ borderColor: "var(--app-border)", borderTopColor: "var(--app-accent)" }}
        />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="mx-auto flex max-w-[420px] flex-col items-center gap-4 px-6 py-20 text-center">
        <p className="text-[15px]" style={{ color: "var(--app-text)" }}>
          Couldn&apos;t load your profile.
        </p>
        <p className="text-[13.5px]" style={{ color: "var(--app-text-muted)" }}>
          {state.error}
        </p>
        <AppButton variant="primary" onClick={() => void refresh()}>
          Try again
        </AppButton>
      </div>
    );
  }

  const props: SectionProps = { data: state.data, refresh, replace, replanned };

  return (
    <div className="mx-auto flex w-full max-w-[960px] flex-col gap-5 px-4 py-6 sm:px-8 sm:py-8">
      <ProfileHeader {...props} />
      <ProfileSky />
      <SubjectsSection {...props} />
      <CocurricularsSection {...props} />
      <GoalsSection {...props} />
      <ArcadSection {...props} />
      <RoutineSection {...props} />
    </div>
  );
}
