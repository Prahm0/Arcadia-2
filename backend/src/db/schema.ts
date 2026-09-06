import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const now = sql`(unixepoch() * 1000)`;

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    passwordSalt: text("password_salt").notNull(),
    name: text("name").notNull().default(""),
    theme: text("theme").notNull().default("system"),
    emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
    verificationToken: text("verification_token"),
    verificationExpiresAt: integer("verification_expires_at"),
    createdAt: integer("created_at").notNull().default(now),
    lastSignInAt: integer("last_sign_in_at"),
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email)],
);

export const sessions = sqliteTable(
  "sessions",
  {
    // sha-256 of the cookie value, never the raw token
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    csrfToken: text("csrf_token").notNull(),
    createdAt: integer("created_at").notNull().default(now),
    expiresAt: integer("expires_at").notNull(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const profiles = sqliteTable("profiles", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  displayName: text("display_name"),
  grade: text("grade"),
  timezone: text("timezone").notNull().default("Australia/Brisbane"),
  onboardingComplete: integer("onboarding_complete", { mode: "boolean" }).notNull().default(false),
  wakeTime: text("wake_time").notNull().default("07:00"),
  bedtime: text("bedtime").notNull().default("22:30"),
  minimumSleepMinutes: integer("minimum_sleep_minutes").notNull().default(480),
  maxDailyStudyMinutes: integer("max_daily_study_minutes").notNull().default(180),
  preferredSessionMinutes: integer("preferred_session_minutes").notNull().default(50),
  breakMinutes: integer("break_minutes").notNull().default(15),
});

export const subjects = sqliteTable(
  "subjects",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    colour: text("colour"),
    priority: integer("priority").notNull().default(2),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [index("subjects_user_idx").on(t.userId)],
);

export const tasks = sqliteTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    subject: text("subject"),
    taskType: text("task_type").notNull().default("study"),
    priority: integer("priority").notNull().default(2),
    dueAt: integer("due_at").notNull(),
    estimatedMinutes: integer("estimated_minutes").notNull().default(60),
    completedMinutes: integer("completed_minutes").notNull().default(0),
    status: text("status").notNull().default("pending"),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [index("tasks_user_due_idx").on(t.userId, t.dueAt)],
);

export const commitments = sqliteTable(
  "commitments",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    category: text("category").notNull().default("other"),
    recurrence: text("recurrence").notNull().default("weekly"),
    weekday: integer("weekday"),
    startDate: text("start_date"),
    startTime: text("start_time").notNull(),
    endTime: text("end_time").notNull(),
    notes: text("notes").notNull().default(""),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [index("commitments_user_idx").on(t.userId)],
);

export const events = sqliteTable(
  "events",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    taskId: text("task_id"),
    commitmentId: text("commitment_id"),
    title: text("title").notNull(),
    subject: text("subject"),
    category: text("category").notNull().default("study"),
    kind: text("kind"),
    startAt: integer("start_at").notNull(),
    endAt: integer("end_at").notNull(),
    status: text("status").notNull().default("planned"),
    outcome: text("outcome").notNull().default("planned"),
    source: text("source").notNull().default("auto"),
    editable: integer("editable", { mode: "boolean" }).notNull().default(true),
    pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [index("events_user_start_idx").on(t.userId, t.startAt)],
);

export const studySessions = sqliteTable(
  "study_sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull().default("focus"),
    seconds: integer("seconds").notNull().default(0),
    subject: text("subject"),
    goal: text("goal"),
    distractions: integer("distractions").notNull().default(0),
    endedAt: integer("ended_at").notNull(),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [index("study_sessions_user_ended_idx").on(t.userId, t.endedAt)],
);

export const conversations = sqliteTable(
  "conversations",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title"),
    createdAt: integer("created_at").notNull().default(now),
    updatedAt: integer("updated_at").notNull().default(now),
  },
  (t) => [index("conversations_user_updated_idx").on(t.userId, t.updatedAt)],
);

export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    role: text("role").notNull(),
    content: text("content").notNull(),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [index("messages_conversation_idx").on(t.conversationId, t.createdAt)],
);

export const proposals = sqliteTable(
  "proposals",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id"),
    summary: text("summary").notNull(),
    status: text("status").notNull().default("pending"),
    operations: text("operations").notNull().default("[]"),
    createdAt: integer("created_at").notNull().default(now),
    expiresAt: integer("expires_at").notNull(),
  },
  (t) => [index("proposals_user_status_idx").on(t.userId, t.status)],
);

export const companions = sqliteTable("companions", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  form: text("form").notNull().default("orb"),
  palette: text("palette").notNull().default("aurora"),
  accessory: text("accessory"),
  mood: text("mood").notNull().default("calm"),
});

export const googleAccounts = sqliteTable("google_accounts", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  // AES-GCM ciphertext, keyed by TOKEN_ENCRYPTION_KEY. Never plaintext.
  accessTokenEnc: text("access_token_enc"),
  refreshTokenEnc: text("refresh_token_enc"),
  expiresAt: integer("expires_at"),
  lastSyncAt: integer("last_sync_at"),
});

export const uploads = sqliteTable(
  "uploads",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    bytes: integer("bytes").notNull(),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [index("uploads_user_idx").on(t.userId)],
);

export const waitlist = sqliteTable(
  "waitlist",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    source: text("source").notNull().default("arcadia-landing"),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [uniqueIndex("waitlist_email_idx").on(t.email)],
);
