/** Client-safe shape returned by POST /api/plan/recover. */
export type RecoveryReason = "missed" | "less_time" | "tired" | "busy" | "new_deadline";

export interface RecoverySessionChange {
  subject: string | null;
  title: string;
  before: { startAt: string; endAt: string } | null;
  after: { startAt: string; endAt: string } | null;
}

export interface RecoveryResult {
  lines: string[];
  moved: number;
  nextBlock: { subject: string | null; title: string; startAt: string; minutes: number } | null;
  changes: RecoverySessionChange[];
}

/** Human words used only in a share card when a student leaves the note blank. */
export const RECOVERY_SHARE_DEFAULT: Record<RecoveryReason, string> = {
  missed: "A study block slipped",
  less_time: "Something came up tonight",
  tired: "I needed an easier night",
  busy: "My plans changed",
  new_deadline: "A new deadline landed",
};
