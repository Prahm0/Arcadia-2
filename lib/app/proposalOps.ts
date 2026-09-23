import type { DashboardResponse } from "@/lib/api/types";
import { formatDurationMinutes } from "@/lib/api/time";

export type ChangeKind = "add" | "edit" | "remove";

/** One line of an Arcad proposal, in words a student can check at a glance. */
export interface DescribedChange {
  kind: ChangeKind;
  /** What it is: "Task", "Weekly", "Every day"… */
  noun: string;
  title: string;
  subject: string | null;
  /** When and how long, already formatted. */
  details: string[];
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Turns propose_changes operations (create_task, update_task, delete_task,
 * create_commitment, delete_commitment) into plain rows. Unknown shapes are
 * skipped rather than shown half-parsed.
 */
export function describeOperations(operations: unknown[], data: DashboardResponse): DescribedChange[] {
  const timezone = data.profile?.timezone || data.user.timezone || "Australia/Sydney";
  const out: DescribedChange[] = [];

  for (const raw of operations || []) {
    if (!raw || typeof raw !== "object") continue;
    const op = raw as Record<string, unknown>;
    const str = (key: string) => (typeof op[key] === "string" && (op[key] as string).trim() ? (op[key] as string).trim() : null);
    const num = (key: string) => (Number.isFinite(Number(op[key])) && op[key] !== null && op[key] !== "" ? Number(op[key]) : null);

    switch (op.op) {
      case "create_task":
      case "update_task": {
        const existing = op.op === "update_task" ? data.tasks.find((task) => task.id === str("id")) : undefined;
        const title = str("title") ?? existing?.title;
        if (!title) continue;
        const details: string[] = [];
        const due = str("dueAt");
        if (due && !Number.isNaN(Date.parse(due))) details.push(`Due ${formatDay(due, timezone)}`);
        const minutes = num("estimatedMinutes");
        if (minutes) details.push(formatDurationMinutes(Math.round(minutes)));
        if (op.op === "update_task" && existing && str("title") && str("title") !== existing.title) {
          details.unshift(`was “${existing.title}”`);
        }
        out.push({
          kind: op.op === "create_task" ? "add" : "edit",
          noun: "Task",
          title,
          subject: str("subject") ?? existing?.subject ?? null,
          details,
        });
        break;
      }
      case "delete_task": {
        const existing = data.tasks.find((task) => task.id === str("id"));
        out.push({
          kind: "remove",
          noun: "Task",
          title: existing?.title ?? str("title") ?? "A task",
          subject: existing?.subject ?? null,
          details: existing ? [`Due ${formatDay(existing.dueAt, timezone)}`] : [],
        });
        break;
      }
      case "create_commitment": {
        const title = str("title");
        if (!title) continue;
        const recurrence = str("recurrence") ?? "weekly";
        const weekday = num("weekday");
        const when =
          recurrence === "daily"
            ? "Every day"
            : recurrence === "weekdays"
              ? "Weekdays"
              : recurrence === "none"
                ? "Once"
                : weekday !== null && WEEKDAYS[weekday]
                  ? `Every ${WEEKDAYS[weekday]}`
                  : "Weekly";
        const start = str("startTime");
        const end = str("endTime");
        out.push({
          kind: "add",
          noun: "Commitment",
          title,
          subject: null,
          details: [when, ...(start && end ? [`${clock(start)}–${clock(end)}`] : [])],
        });
        break;
      }
      case "delete_commitment": {
        const existing = data.commitments.find((commitment) => commitment.id === str("id"));
        const title = typeof existing?.title === "string" ? existing.title : str("title") ?? "A commitment";
        out.push({ kind: "remove", noun: "Commitment", title, subject: null, details: [] });
        break;
      }
      default:
        break;
    }
  }
  return out;
}

function formatDay(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: timezone,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(iso));
}

/** "17:30" → "5:30pm". */
function clock(value: string): string {
  const [h, m] = value.split(":").map(Number);
  if (!Number.isFinite(h)) return value;
  const suffix = h >= 12 ? "pm" : "am";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m ? `${hour}:${String(m).padStart(2, "0")}${suffix}` : `${hour}${suffix}`;
}
