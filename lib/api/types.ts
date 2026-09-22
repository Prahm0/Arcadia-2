export interface AuthUser {
  id: string;
  email: string;
  name: string;
  grade?: string | null;
  timezone?: string;
  onboardingComplete?: boolean;
  tier?: "free" | "pro" | "max";
  hasSubscription?: boolean;
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
  source?: string;
  editable?: boolean;
  pinned?: boolean;
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

export interface SubjectFile {
  id: string;
  subjectId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  textExcerpt?: string;
  createdAt: string;
}

export interface SubjectContext {
  subjectId: string;
  subjectName: string;
  color?: string | null;
  notes: string;
  includeInArcad: boolean;
  updatedAt?: string | null;
  files: SubjectFile[];
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
  }>;
  subjectContexts?: SubjectContext[];
  tasks: PlannerTask[];
  commitments: Array<Record<string, unknown>>;
  range: { start: string; end: string };
  events: PlannerEvent[];
  focusTasks: PlannerTask[];
  briefing: string | null;
  analytics: {
    currentStreak?: number;
    longestStreak?: number;
    weekMinutes?: number;
    todayMinutes?: number;
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
