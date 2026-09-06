export interface AuthUser {
  id: string;
  email: string;
  name: string;
  grade?: string | null;
  timezone?: string;
  onboardingComplete?: boolean;
}

export interface PlannerTask {
  id: string;
  title: string;
  subject?: string | null;
  taskType?: string;
  priority?: number;
  dueAt: string;
  remainingMinutes: number;
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

export interface DashboardResponse {
  user: AuthUser;
  profile: PlannerProfile | null;
  preferences: Record<string, unknown>;
  subjects: Array<{ id: string; name: string; colour?: string | null }>;
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
    form?: string;
    palette?: string;
    accessory?: string;
    mood?: string;
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
}
