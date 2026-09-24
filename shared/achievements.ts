export type AchievementCategory = "Consistency" | "Focus" | "Resilience" | "Deadlines" | "Explorer" | "Weekend";

export interface AchievementDefinition {
  id: string;
  title: string;
  description: string;
  category: AchievementCategory;
  target: number;
  icon: string;
}

export const ACHIEVEMENTS: AchievementDefinition[] = [
  { id: "streak_3", title: "First orbit", description: "Reach a 3-day streak", category: "Consistency", target: 3, icon: "✦" },
  { id: "streak_7", title: "Week in motion", description: "Reach a 7-day streak", category: "Consistency", target: 7, icon: "☄" },
  { id: "streak_14", title: "Steady sky", description: "Reach a 14-day streak", category: "Consistency", target: 14, icon: "◌" },
  { id: "streak_30", title: "Moonshot", description: "Reach a 30-day streak", category: "Consistency", target: 30, icon: "☾" },
  { id: "streak_50", title: "Starbound", description: "Reach a 50-day streak", category: "Consistency", target: 50, icon: "✧" },
  { id: "streak_100", title: "Centurion", description: "Reach a 100-day streak", category: "Consistency", target: 100, icon: "✹" },
  { id: "focus_first", title: "Ignition", description: "Finish your first focus session", category: "Focus", target: 1, icon: "●" },
  { id: "focus_60", title: "Deep orbit", description: "Finish a 60-minute session", category: "Focus", target: 60, icon: "◐" },
  { id: "focus_600", title: "Ten hours", description: "Focus for 10 hours in total", category: "Focus", target: 600, icon: "✦" },
  { id: "focus_3000", title: "Long haul", description: "Focus for 50 hours in total", category: "Focus", target: 3000, icon: "✧" },
  { id: "sessions_25", title: "In the rhythm", description: "Finish 25 focus sessions", category: "Focus", target: 25, icon: "≋" },
  { id: "recovery_first", title: "Plan B", description: "Use Life happened once", category: "Resilience", target: 1, icon: "↻" },
  { id: "recovery_10", title: "Unbreakable", description: "Recover your week 10 times", category: "Resilience", target: 10, icon: "⟲" },
  { id: "tasks_5", title: "Deadline keeper", description: "Finish 5 tasks", category: "Deadlines", target: 5, icon: "✓" },
  { id: "tasks_early_3", title: "Ahead of schedule", description: "Finish 3 tasks at least two days early", category: "Deadlines", target: 3, icon: "↑" },
  { id: "subject_first", title: "First course", description: "Add your first subject", category: "Explorer", target: 1, icon: "◇" },
  { id: "syllabus_first", title: "Mapped out", description: "Add a syllabus to a subject", category: "Explorer", target: 1, icon: "▤" },
  { id: "sheet_first", title: "On one page", description: "Make your first summary sheet", category: "Explorer", target: 1, icon: "▭" },
  { id: "arcad_first", title: "First words", description: "Start a chat with Arcad", category: "Explorer", target: 1, icon: "✧" },
  { id: "invite_first", title: "Better together", description: "Invite a friend who joins", category: "Explorer", target: 1, icon: "⚭" },
  { id: "weekend", title: "Weekend window", description: "Focus on a weekend", category: "Weekend", target: 1, icon: "◒" },
];

export const STREAK_MILESTONES = [3, 7, 14, 30, 50, 100] as const;
