export interface AuthUser {
  id: string;
  email: string;
  name: string;
  grade?: string | null;
  /** Background of the initials avatar; null picks one from the name. */
  avatarColour?: string | null;
  timezone?: string;
  onboardingComplete?: boolean;
  tier?: "free" | "pro" | "max";
  developerAccess?: boolean;
  hasSubscription?: boolean;
  billingProvider?: "stripe" | "app_store" | null;
  subscriptionStatus?: string | null;
  subscriptionCurrentPeriodEnd?: string | null;
}

export interface PlannerTask {
  id: string;
  title: string;
  subject?: string | null;
  taskType?: string;
  priority?: number;
  dueAt: string;
  estimatedMinutes?: number;
  remainingMinutes: number;
  notes?: string | null;
  status: "pending" | "complete" | "cancelled";
}

export interface PlannerEvent {
  id: string;
  title: string;
  subject?: string | null;
  taskId?: string | null;
  category: "study" | "school" | "sport" | "extracurricular" | "sleep" | "other";
  kind?: string;
  startAt: string;
  endAt: string;
  status: "planned" | "cancelled" | "completed" | "missed";
  outcome: "planned" | "completed" | "missed";
  missReason?: MissReason | null;
  missNote?: string | null;
  source?: string;
  editable?: boolean;
  pinned?: boolean;
  /** Arcad's set-up for a study block, made when the session is opened. */
  plan?: SessionPlan | null;
  /** How the session went, once it's done. */
  checkout?: SessionCheckout | null;
  /** When the student actually started it. */
  startedAt?: string | null;
}

export type MissReason = "sick" | "tired" | "other_plans" | "forgot" | "didnt_feel_like_it" | "other";

export interface SessionPlan {
  /** What the session is on, e.g. "3.2 Limiting reagents". */
  topic: string;
  /** The syllabus topic it's on, when it is one, and that topic's name. */
  topicId?: string | null;
  topicTitle?: string | null;
  /** Why now, e.g. "Prac report due Mon 2 Nov". */
  why: string;
  steps: Array<{
    minutes: number;
    text: string;
    /** Set when a step is on another topic than the session (last time's leftovers). */
    topicId?: string | null;
    topic?: string | null;
    /** learn | practice | review | assignment | study */
    kind?: string;
  }>;
  /** "fallback" when built without Arcad (offline or unavailable). */
  by: "arcad" | "fallback";
  /** Planner version; older plans are redone. */
  v?: number;
  /** Set when there was nothing about the course to plan from. */
  needsSyllabus?: { subjectId: string | null; subject: string };
  createdAt: string;
}

export interface SessionCheckout {
  done: number[];
  leftover: string;
  feeling: "good" | "ok" | "rough" | null;
  minutes: number;
  at: string;
}

export interface PlannerProfile {
  displayName?: string;
  grade?: string;
  timezone?: string;
  onboardingComplete?: boolean;
  wakeTime?: string;
  bedtime?: string;
}

export type CompanionForm = "orb" | "comet" | "nebula";
export type CompanionPalette = "violet" | "aqua" | "coral" | "gold";
export type CompanionAccessory = "none" | "ring" | "star" | "book" | "headphones";

export interface CompanionProfile {
  name: string;
  form: CompanionForm;
  palette: CompanionPalette;
  accessory: CompanionAccessory;
}

export interface DashboardResponse {
  user: AuthUser;
  profile: PlannerProfile | null;
  preferences: Record<string, unknown>;
  subjects: Array<{
    id: string;
    name: string;
    colour?: string | null;
    /** Weekly study target the scheduler works to, in minutes. */
    weeklyMinutes?: number;
    /** True when weeklyMinutes is the year-level default, not the student's pick. */
    weeklyMinutesSuggested?: boolean;
    /** The grade the student is aiming for, as they wrote it. */
    targetGrade?: string | null;
    /** The student's note for Arcad about this subject. */
    notes?: string;
  }>;
  tasks: PlannerTask[];
  commitments: Array<Record<string, unknown>>;
  range: { start: string; end: string };
  /** The student's school terms (last, this and next year), empty when their state's dates aren't known. */
  terms?: SchoolTerm[];
  events: PlannerEvent[];
  focusTasks: PlannerTask[];
  /** Things worth interrupting for, each with one action. */
  notices: Notice[];
  analytics: {
    currentStreak?: number;
    longestStreak?: number;
    weekMinutes?: number;
    todayMinutes?: number;
    /** The last seven days, oldest first, ending today. */
    days?: Array<{ date: string; minutes: number }>;
    /** Local dates the student used Life happened, for protected streak days. */
    recoveryDays?: string[];
    [key: string]: unknown;
  };
  companion: {
    profile?: {
      name?: string;
      form?: CompanionForm;
      palette?: CompanionPalette;
      accessory?: CompanionAccessory;
    } | null;
    focusedMinutes?: number;
    level?: number;
    /** Focus minutes the next level starts at; null at the top level. */
    nextLevelMinutes?: number | null;
    currentStreak?: number;
    state?: "ready" | "recovering";
    [key: string]: unknown;
  } | null;
  csrfToken: string;
  assistant?: {
    configured?: boolean;
    providerConfigured?: boolean;
    messages?: Array<Record<string, unknown>>;
    proposals?: Array<Record<string, unknown>>;
    conversations?: Array<Record<string, unknown>>;
  };
  google?: { connected?: boolean; lastSyncAt?: string | null };
  calendarFeeds?: CalendarFeed[];
}

export interface CalendarFeed {
  id: string;
  url: string;
  name: string;
  color: string;
  lastSyncAt: string | null;
  lastSyncError: string | null;
}

export interface Notice {
  /** Changes when the notice's content does, so a snoozed one returns if it's different. */
  id: string;
  kind: "budget" | "syllabus";
  title: string;
  body: string;
  action: { label: string; href: string };
}

export interface SchoolTerm {
  year: number;
  /** 1 to 4. */
  term: number;
  /** First and last student day, YYYY-MM-DD. */
  start: string;
  end: string;
}
