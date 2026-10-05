/** Shared shapes for the research harness. Plain data only. */

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export interface SubjectSpec {
  name: string;
  /** Weekly target in minutes. */
  weekly: number;
  priority: number;
}

export interface CommitmentSpec {
  id: string;
  title: string;
  category: "school" | "sport" | "work" | "other" | "rest";
  recurrence: "weekdays" | "weekly" | "none";
  /** 0 = Sunday, for weekly. */
  weekday: number | null;
  /** YYYY-MM-DD, for one-offs. */
  date: string | null;
  start: string; // HH:MM local
  end: string; // HH:MM local
}

export interface TaskSpec {
  id: string;
  title: string;
  subject: string;
  /** UTC ms. */
  dueAt: number;
  /** Required preparation, minutes. */
  minutes: number;
  /** 1 (low) to 3 (high). Used as the coverage weight. */
  priority: number;
  /** No work may be booked before this (UTC ms). */
  releaseAt: number;
}

export interface Instance {
  id: string;
  seed: number;
  tz: string;
  /** YYYY-MM-DD of the Monday the horizon starts on. */
  startDate: string;
  /** UTC ms of local midnight at the start of startDate. */
  start: number;
  /** UTC ms of the end of the 28-day horizon. */
  end: number;
  days: number;
  bedtime: string;
  wake: string;
  /** Daily study cap, minutes. */
  cap: number;
  session: number;
  breakMinutes: number;
  subjects: SubjectSpec[];
  commitments: CommitmentSpec[];
  tasks: TaskSpec[];
  /** Target utilisation band the generator aimed for. */
  utilisation: number;
  clustered: boolean;
  /** Whether a clock change falls inside the horizon. */
  crossesClockChange: boolean;
}

export interface Block {
  id: string;
  start: number;
  end: number;
  taskId: string | null;
  subject: string | null;
  /** Done, under way, pinned or placed by hand: may not move. */
  fixed: boolean;
}

export type DisruptionType = "D1" | "D2" | "D3" | "D4" | "D5";

export interface Disruption {
  type: DisruptionType;
  /** D1: the block that was missed. */
  missedBlockId?: string;
  /** D2, D3: a new one-off commitment. D4: the commitment's new shape. */
  commitment?: CommitmentSpec;
  /** D4: the id of the commitment that moved. */
  replacesCommitmentId?: string;
  /** D5: the new task. */
  task?: TaskSpec;
}

export interface Scenario {
  instance: Instance;
  /** Blocks the starting plan holds (built by current Arcadia at the horizon start). */
  startPlan: Block[];
  /** When the disruption happens (UTC ms). */
  at: number;
  disruptions: Disruption[];
  label: string; // D1..D6
  severity: "light" | "medium" | "heavy";
  severityMinutes: number;
}

/** What a repair method sees at the moment of the disruption. */
export interface RepairState {
  instance: Instance;
  now: number;
  /** Commitments after the disruption. */
  commitments: CommitmentSpec[];
  /** Tasks after the disruption, with work done so far. */
  tasks: TaskSpec[];
  done: Map<string, number>; // taskId -> minutes completed before now
  /** Blocks before now (done or missed) and the one under way: never touched. */
  fixed: Block[];
  /** The starting plan's blocks from now on, to repair. */
  current: Block[];
  missedBlockId: string | null;
}

export interface RepairMethod {
  code: string;
  name: string;
  /** Returns the full set of non-fixed blocks from now on. */
  repair(state: RepairState): Block[];
}
