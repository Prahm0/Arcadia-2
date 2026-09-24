/** Client-safe shape returned by POST /api/plan/recover. */
export type RecoveryReason = "missed" | "less_time" | "tired" | "busy" | "new_deadline";

export interface RecoverySessionChange {
  subject: string | null;
  title: string;
  before: { startAt: string; endAt: string } | null;
  after: { startAt: string; endAt: string } | null;
}

export interface RecoveryDeadline {
  title: string;
  subject: string | null;
  dueAt: string;
  prepSessions: number;
}

export interface RecoveryResult {
  lines: string[];
  moved: number;
  added: number;
  removed: number;
  nextBlock: { subject: string | null; title: string; startAt: string; minutes: number } | null;
  changes: RecoverySessionChange[];
  /** Present only when the recovery added a new deadline. */
  deadline: RecoveryDeadline | null;
  /** The local date that was affected by a time or energy change. */
  affectedDay: string | null;
}
