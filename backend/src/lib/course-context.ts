import { courseFor } from "../../../shared/education";

type ProfileLike = {
  course?: string | null;
  country?: string | null;
  state?: string | null;
  grade?: string | null;
  atarTarget?: number | null;
  goalTarget?: string | null;
};

/** "HSC (New South Wales), Year 12": the student's course as Arcad reads it. */
export function courseLine(profile: ProfileLike | null | undefined): string {
  if (!profile) return "";
  const course = courseFor(profile);
  return `${course.label} (${course.detail})${profile.grade ? `, ${profile.grade}` : ""}`;
}

/**
 * What they're aiming for, in their course's terms: an ATAR for Australian
 * courses, otherwise what they typed ("A*AA", "38", "3.9 GPA"). Null when
 * they haven't said.
 */
export function goalLine(profile: ProfileLike | null | undefined): string | null {
  if (!profile) return null;
  const course = courseFor(profile);
  if (profile.atarTarget && course.goal?.label === "ATAR target") return `ATAR target ${profile.atarTarget.toFixed(2)}`;
  const target = profile.goalTarget?.trim();
  if (target) return `${course.goal?.label ?? "Aiming for"}: ${target}`;
  if (profile.atarTarget) return `ATAR target ${profile.atarTarget.toFixed(2)}`;
  return null;
}

/** How the course works, in a line, for the planning prompts. */
export function courseAbout(profile: ProfileLike | null | undefined): string {
  return profile ? courseFor(profile).about : "";
}
