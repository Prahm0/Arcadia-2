/** Things that happen to a student's week that no timetable planned for. */

export type LifeKind = "sport" | "school" | "family" | "life";

export interface LifeEvent {
  label: string;
  kind: LifeKind;
}

export const realLife: LifeEvent[] = [
  { label: "Training ran late", kind: "sport" },
  { label: "SAC moved to Thursday", kind: "school" },
  { label: "Nan’s birthday", kind: "family" },
  { label: "Footy finals", kind: "sport" },
  { label: "Shift swapped", kind: "life" },
  { label: "Group project ghosted", kind: "school" },
  { label: "Formal", kind: "life" },
  { label: "Sick day", kind: "life" },
  { label: "Bus was late", kind: "life" },
  { label: "Coach added a session", kind: "sport" },
  { label: "Teacher extended the essay", kind: "school" },
  { label: "Little brother’s concert", kind: "family" },
  { label: "Driving lesson", kind: "life" },
  { label: "Netflix happened", kind: "life" },
  { label: "Practice exam Saturday", kind: "school" },
  { label: "Dinner at Nan’s", kind: "family" },
  { label: "Movies with Sam", kind: "life" },
  { label: "Excursion all day", kind: "school" },
  { label: "Game got rescheduled", kind: "sport" },
  { label: "Phone died at 4%", kind: "life" },
];

/** Two rows, interleaved so neither reads as a single category. */
export const marqueeRows: LifeEvent[][] = [
  realLife.filter((_, i) => i % 2 === 0),
  realLife.filter((_, i) => i % 2 === 1),
];
