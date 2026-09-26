import { sql } from "drizzle-orm";
import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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
    // Password reset tokens are stored as hashes, never as the raw value sent
    // in an email link. A reset clears these fields so each link is single use.
    passwordResetTokenHash: text("password_reset_token_hash"),
    passwordResetExpiresAt: integer("password_reset_expires_at"),
    passwordResetRequestedAt: integer("password_reset_requested_at"),
    createdAt: integer("created_at").notNull().default(now),
    lastSignInAt: integer("last_sign_in_at"),
    // Billing. `tier` is the source of truth the app reads. Stripe tracks web
    // subscriptions; RevenueCat tracks App Store subscriptions. `billingProvider`
    // prevents an event from one provider downgrading a live plan from the other.
    tier: text("tier").notNull().default("free"),
    // Privileged test access is independent of Stripe's subscription tier.
    developerAccess: integer("developer_access", { mode: "boolean" }).notNull().default(false),
    // Developer accounts can select any feature tier without changing billing.
    // Null preserves the original default: developer access grants Max.
    developerTier: text("developer_tier", { enum: ["free", "pro", "max"] }),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    subscriptionStatus: text("subscription_status"),
    subscriptionCurrentPeriodEnd: integer("subscription_current_period_end"),
    billingProvider: text("billing_provider"),
    revenuecatAppUserId: text("revenuecat_app_user_id"),
    revenuecatEntitlement: text("revenuecat_entitlement"),
    revenuecatProductId: text("revenuecat_product_id"),
    // Referrals are deliberately separate from billing. A qualified invite
    // earns temporary Pro access without changing a Stripe or App Store plan.
    referralCode: text("referral_code"),
    referredByUserId: text("referred_by_user_id"),
    proBonusUntil: integer("pro_bonus_until"),
    proBonusDaysEarned: integer("pro_bonus_days_earned").notNull().default(0),
  },
  (t) => [
    uniqueIndex("users_email_idx").on(t.email),
    index("users_stripe_customer_idx").on(t.stripeCustomerId),
    index("users_revenuecat_app_user_idx").on(t.revenuecatAppUserId),
    uniqueIndex("users_referral_code_idx").on(t.referralCode),
  ],
);

/** Product feedback is visible only to developers. The email is saved only by opt-in. */
export const feedback = sqliteTable(
  "feedback",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    type: text("type", { enum: ["bug", "idea", "other"] }).notNull(),
    message: text("message").notNull(),
    email: text("email"),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [
    index("feedback_user_created_idx").on(t.userId, t.createdAt),
    index("feedback_type_created_idx").on(t.type, t.createdAt),
    index("feedback_created_idx").on(t.createdAt),
  ],
);

/** A referral is created on a brand-new account and becomes real only after setup. */
export const referrals = sqliteTable(
  "referrals",
  {
    id: text("id").primaryKey(),
    referrerUserId: text("referrer_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    inviteeUserId: text("invitee_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: integer("created_at").notNull().default(now),
    qualifiedAt: integer("qualified_at"),
  },
  (t) => [
    uniqueIndex("referrals_invitee_idx").on(t.inviteeUserId),
    index("referrals_referrer_qualified_idx").on(t.referrerUserId, t.qualifiedAt),
  ],
);

// Per-user per-day Arcad message counter. `day` is a UTC YYYY-MM-DD
// string so tier caps line up on the same calendar day for every user
// regardless of local timezone, and we can prune old rows with a simple
// day comparison.
export const arcadUsage = sqliteTable(
  "arcad_usage",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    day: text("day").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day] })],
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

export const oauthAccounts = sqliteTable(
  "oauth_accounts",
  {
    provider: text("provider").notNull(),
    providerUserId: text("provider_user_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: integer("created_at").notNull().default(now),
    refreshTokenEncrypted: text("refresh_token_encrypted"),
    clientId: text("client_id"),
  },
  (t) => [
    primaryKey({ columns: [t.provider, t.providerUserId] }),
    uniqueIndex("oauth_accounts_provider_user_idx").on(t.provider, t.userId),
    index("oauth_accounts_user_idx").on(t.userId),
  ],
);

/** One row per browser/device push subscription. The endpoint is a secret capability URL. */
export const pushSubscriptions = sqliteTable(
  "push_subscriptions",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").primaryKey(),
    keysP256dh: text("keys_p256dh").notNull(),
    keysAuth: text("keys_auth").notNull(),
    checkinsEnabled: integer("checkins_enabled", { mode: "boolean" }).notNull().default(true),
    sessionStartEnabled: integer("session_start_enabled", { mode: "boolean" }).notNull().default(true),
    sessionFollowupEnabled: integer("session_followup_enabled", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at").notNull().default(now),
    updatedAt: integer("updated_at").notNull().default(now),
  },
  (t) => [index("push_subscriptions_user_idx").on(t.userId)],
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
  // Profile header. The avatar is initials on this colour for now.
  // ISO 3166 alpha-2 country. `state` is only used for Australia, where it
  // picks the school term dates.
  country: text("country"),
  state: text("state"),
  school: text("school"),
  avatarColour: text("avatar_colour"),
  atarTarget: real("atar_target"),
  // Arcad personalisation: "what should Arcad know about you" and "how
  // should Arcad respond", plus whether it may save memories from chats.
  arcadAbout: text("arcad_about").notNull().default(""),
  arcadStyle: text("arcad_style").notNull().default(""),
  memoryEnabled: integer("memory_enabled", { mode: "boolean" }).notNull().default(true),
});

export const goals = sqliteTable(
  "goals",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    done: integer("done", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [index("goals_user_idx").on(t.userId)],
);

/** Facts Arcad saved from chats (source "chat") or the student added ("manual"). */
export const memories = sqliteTable(
  "memories",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    source: text("source").notNull().default("chat"),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [index("memories_user_idx").on(t.userId, t.createdAt)],
);

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
    // Weekly study target in minutes. NULL = the year-level default the
    // scheduler suggests; 0 = no maintenance blocks for this subject.
    weeklyMinutes: integer("weekly_minutes"),
    // The grade the student is aiming for, free text ("A", "B+", "85%").
    targetGrade: text("target_grade"),
    // What Arcad should keep in mind for this subject.
    notes: text("notes").notNull().default(""),
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
    notes: text("notes").notNull().default(""),
    taskType: text("task_type").notNull().default("study"),
    priority: integer("priority").notNull().default(2),
    dueAt: integer("due_at").notNull(),
    estimatedMinutes: integer("estimated_minutes").notNull().default(60),
    completedMinutes: integer("completed_minutes").notNull().default(0),
    status: text("status").notNull().default("pending"),
    /** When the task was last marked complete; null while pending. */
    completedAt: integer("completed_at"),
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
    // Set when the event came from an .ics feed subscription. `externalUid`
    // is the VEVENT UID from the source calendar — stable across syncs so
    // re-syncing updates the existing row rather than creating duplicates.
    feedId: text("feed_id"),
    externalUid: text("external_uid"),
    title: text("title").notNull(),
    subject: text("subject"),
    category: text("category").notNull().default("study"),
    kind: text("kind"),
    startAt: integer("start_at").notNull(),
    endAt: integer("end_at").notNull(),
    status: text("status").notNull().default("planned"),
    outcome: text("outcome").notNull().default("planned"),
    // Why a study block was missed, if the student chooses to share it.
    missReason: text("miss_reason"),
    missNote: text("miss_note"),
    source: text("source").notNull().default("auto"),
    editable: integer("editable", { mode: "boolean" }).notNull().default(true),
    pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
    // Session plan and check-out, both JSON (see migration 0008).
    plan: text("plan"),
    checkout: text("checkout"),
    startedAt: integer("started_at"),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [
    index("events_user_start_idx").on(t.userId, t.startAt),
    index("events_feed_idx").on(t.feedId),
    index("events_feed_uid_idx").on(t.feedId, t.externalUid),
  ],
);

export const calendarFeeds = sqliteTable(
  "calendar_feeds",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    name: text("name").notNull().default("Calendar"),
    color: text("color").notNull().default("#7c5cff"),
    // HTTP conditional-fetch hints so we don't re-download unchanged feeds.
    etag: text("etag"),
    lastModified: text("last_modified"),
    lastSyncAt: integer("last_sync_at"),
    lastSyncError: text("last_sync_error"),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [index("calendar_feeds_user_idx").on(t.userId)],
);

// One private subscription link per student, so Google Calendar and Apple
// Calendar can show Arcadia's study blocks and deadlines. The token is the
// whole credential for the read-only feed; rotating it cuts off old copies.
export const calendarExports = sqliteTable(
  "calendar_exports",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    createdAt: integer("created_at").notNull().default(now),
    lastFetchedAt: integer("last_fetched_at"),
  },
  (t) => [uniqueIndex("calendar_exports_token_idx").on(t.token)],
);

export const studySessions = sqliteTable(
  "study_sessions",
  {
    id: text("id").primaryKey(),
    activityId: text("activity_id"),
    localDay: text("local_day"),
    subjectKey: text("subject_key"),
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
  (t) => [index("study_sessions_user_ended_idx").on(t.userId, t.endedAt), uniqueIndex("study_sessions_activity_idx").on(t.userId, t.activityId)],
);

export const xpEvents = sqliteTable("xp_events", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  source: text("source").notNull(),
  sourceId: text("source_id").notNull(),
  xp: integer("xp").notNull(),
  createdAt: integer("created_at").notNull().default(now),
}, (t) => [uniqueIndex("xp_events_user_source_unique").on(t.userId, t.source, t.sourceId), index("xp_events_user_created_idx").on(t.userId, t.createdAt)]);

export const userAchievements = sqliteTable("user_achievements", {
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  achievementId: text("achievement_id").notNull(),
  unlockedAt: integer("unlocked_at").notNull().default(now),
}, (t) => [primaryKey({ columns: [t.userId, t.achievementId] })]);

export const constellationPreferences = sqliteTable("constellation_preferences", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  followed: text("followed").notNull().default("first-light"),
  featured: text("featured"),
  backdrop: text("backdrop"),
  showcase: text("showcase").notNull().default("[]"),
  favourites: text("favourites").notNull().default("[]"),
  ambientMotion: integer("ambient_motion", { mode: "boolean" }).notNull().default(true),
  legacyEligible: integer("legacy_eligible", { mode: "boolean" }).notNull().default(false),
});
export const constellationMilestones = sqliteTable("constellation_milestones", {
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  constellationId: text("constellation_id").notNull(),
  starIndex: integer("star_index").notNull(),
  earnedAt: integer("earned_at").notNull(),
}, (t) => [primaryKey({ columns: [t.userId, t.constellationId, t.starIndex] })]);
export const constellationCards = sqliteTable("constellation_cards", {
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  constellationId: text("constellation_id").notNull(),
  definitionVersion: integer("definition_version").notNull().default(1),
  earnedAt: integer("earned_at").notNull(),
  addedAt: integer("added_at").notNull(),
  seenAt: integer("seen_at"),
}, (t) => [primaryKey({ columns: [t.userId, t.constellationId] })]);

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
  name: text("name").notNull().default("Star"),
  form: text("form").notNull().default("orb"),
  // Frontend picker is {violet, aqua, coral, gold}. The historical default
  // "aurora" predates this UI and is treated by the client as violet.
  palette: text("palette").notNull().default("violet"),
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

/** A syllabus or resource Arcad has read for a subject (see migration 0007). */
export const subjectFiles = sqliteTable(
  "subject_files",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    subjectId: text("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    bytes: integer("bytes").notNull(),
    storageKey: text("storage_key"),
    summary: text("summary").notNull().default(""),
    status: text("status").notNull().default("read"),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [index("subject_files_subject_idx").on(t.subjectId)],
);

/** What's taught when, from the syllabus or added by hand. Dates are YYYY-MM-DD. */
export const subjectTopics = sqliteTable(
  "subject_topics",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    subjectId: text("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    detail: text("detail").notNull().default(""),
    startsOn: text("starts_on"),
    endsOn: text("ends_on"),
    position: integer("position").notNull().default(0),
    source: text("source").notNull().default("manual"),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [index("subject_topics_subject_idx").on(t.subjectId, t.position)],
);

/**
 * What was studied, on which topic, for how long and how it left them: one
 * row per topic touched in a session (see migration 0030 and lib/study-log).
 */
export const studyLog = sqliteTable(
  "study_log",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    subjectId: text("subject_id").references(() => subjects.id, { onDelete: "set null" }),
    subject: text("subject"),
    topicId: text("topic_id").references(() => subjectTopics.id, { onDelete: "set null" }),
    topic: text("topic").notNull().default(""),
    eventId: text("event_id"),
    activityId: text("activity_id"),
    kind: text("kind").notNull().default("study"),
    minutes: integer("minutes").notNull(),
    confidence: text("confidence"),
    note: text("note").notNull().default(""),
    source: text("source").notNull().default("checkout"),
    studiedAt: integer("studied_at").notNull(),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [
    index("study_log_user_subject_idx").on(t.userId, t.subjectId, t.studiedAt),
    index("study_log_event_idx").on(t.eventId),
    index("study_log_activity_idx").on(t.userId, t.activityId),
    index("study_log_topic_idx").on(t.topicId),
  ],
);

export const subjectAssessments = sqliteTable(
  "subject_assessments",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    subjectId: text("subject_id")
      .notNull()
      .references(() => subjects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    kind: text("kind").notNull().default("assignment"),
    dueOn: text("due_on"),
    dueLabel: text("due_label").notNull().default(""),
    weight: text("weight").notNull().default(""),
    taskId: text("task_id"),
    source: text("source").notNull().default("manual"),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [index("subject_assessments_subject_idx").on(t.subjectId)],
);

/** A deck of flashcards (see migration 0009). */
export const decks = sqliteTable(
  "decks",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    subjectId: text("subject_id").references(() => subjects.id, { onDelete: "set null" }),
    topicId: text("topic_id").references(() => subjectTopics.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    source: text("source").notNull().default("manual"),
    studiedAt: integer("studied_at"),
    createdAt: integer("created_at").notNull().default(now),
    updatedAt: integer("updated_at").notNull().default(now),
  },
  (t) => [index("decks_user_idx").on(t.userId)],
);

/** One flashcard and its review schedule. `box` 0 is learning, 1-5 known. */
export const cards = sqliteTable(
  "cards",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    deckId: text("deck_id")
      .notNull()
      .references(() => decks.id, { onDelete: "cascade" }),
    front: text("front").notNull(),
    back: text("back").notNull(),
    position: integer("position").notNull().default(0),
    box: integer("box").notNull().default(0),
    dueAt: integer("due_at"),
    reviewedAt: integer("reviewed_at"),
    reviews: integer("reviews").notNull().default(0),
    lapses: integer("lapses").notNull().default(0),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [index("cards_deck_idx").on(t.deckId, t.position), index("cards_user_due_idx").on(t.userId, t.dueAt)],
);

/** A one-page summary sheet. `sections` is JSON: [{ heading, body }]. */
export const sheets = sqliteTable(
  "sheets",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    subjectId: text("subject_id").references(() => subjects.id, { onDelete: "set null" }),
    topicId: text("topic_id").references(() => subjectTopics.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    sections: text("sections").notNull().default("[]"),
    source: text("source").notNull().default("manual"),
    createdAt: integer("created_at").notNull().default(now),
    updatedAt: integer("updated_at").notNull().default(now),
  },
  (t) => [index("sheets_user_subject_idx").on(t.userId, t.subjectId)],
);

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

export const studyRooms = sqliteTable(
  "study_rooms",
  {
    id: text("id").primaryKey(),
    // 6 characters from an alphabet without look-alikes; stored uppercase.
    code: text("code").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    colour: text("colour").notNull().default("slate"),
    icon: text("icon").notNull().default(""),
    weeklyGoalMinutes: integer("weekly_goal_minutes"),
    dailyGoalMinutes: integer("daily_goal_minutes"),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [
    uniqueIndex("study_rooms_code_idx").on(t.code),
    index("study_rooms_owner_idx").on(t.ownerUserId),
  ],
);

export const studyRoomMembers = sqliteTable(
  "study_room_members",
  {
    roomId: text("room_id")
      .notNull()
      .references(() => studyRooms.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    joinedAt: integer("joined_at").notNull().default(now),
  },
  (t) => [
    primaryKey({ columns: [t.roomId, t.userId] }),
    index("study_room_members_user_idx").on(t.userId),
  ],
);

export const studyRoomMessages = sqliteTable(
  "study_room_messages",
  {
    id: text("id").primaryKey(),
    roomId: text("room_id").notNull().references(() => studyRooms.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    body: text("body").notNull(),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [index("study_room_messages_room_time_idx").on(t.roomId, t.createdAt)],
);

/** Evidence snapshot for a room message report. It outlives message removal. */
export const roomReports = sqliteTable(
  "room_reports",
  {
    id: text("id").primaryKey(),
    roomId: text("room_id").notNull().references(() => studyRooms.id, { onDelete: "cascade" }),
    messageId: text("message_id").notNull(),
    reporterUserId: text("reporter_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    reportedUserId: text("reported_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    note: text("note").notNull().default(""),
    messageBody: text("message_body").notNull(),
    createdAt: integer("created_at").notNull().default(now),
    status: text("status").notNull().default("open"),
  },
  (t) => [
    uniqueIndex("room_reports_reporter_message_idx").on(t.reporterUserId, t.messageId),
    index("room_reports_reporter_created_idx").on(t.reporterUserId, t.createdAt),
    index("room_reports_status_created_idx").on(t.status, t.createdAt),
  ],
);

/** A block applies everywhere a student encounters that person's room chat. */
export const userBlocks = sqliteTable(
  "user_blocks",
  {
    blockerUserId: text("blocker_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    blockedUserId: text("blocked_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [primaryKey({ columns: [t.blockerUserId, t.blockedUserId] }), index("user_blocks_blocked_idx").on(t.blockedUserId)],
);

/** An owner removal stops the same invite code being used to rejoin. */
export const studyRoomRemovedMembers = sqliteTable(
  "study_room_removed_members",
  {
    roomId: text("room_id").notNull().references(() => studyRooms.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    removedAt: integer("removed_at").notNull().default(now),
  },
  (t) => [primaryKey({ columns: [t.roomId, t.userId] }), index("study_room_removed_members_user_idx").on(t.userId)],
);

/** A quick "keep going" from one room member to another while they study. */
export const studyRoomCheers = sqliteTable(
  "study_room_cheers",
  {
    id: text("id").primaryKey(),
    roomId: text("room_id").notNull().references(() => studyRooms.id, { onDelete: "cascade" }),
    fromUserId: text("from_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    toUserId: text("to_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [
    index("study_room_cheers_room_time_idx").on(t.roomId, t.createdAt),
    index("study_room_cheers_pair_idx").on(t.fromUserId, t.toUserId, t.createdAt),
  ],
);

// One row per user, written by the focus timer and read by every room the
// user is in. A focus/break row older than PRESENCE_STALE_MS reads as idle.
export const userPresence = sqliteTable("user_presence", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  activity: text("activity").notNull().default("idle"),
  subject: text("subject"),
  startedAt: integer("started_at"),
  durationSeconds: integer("duration_seconds"),
  // Set when this timer joined another member's session (see study rooms).
  groupHostId: text("group_host_id"),
  updatedAt: integer("updated_at").notNull().default(now),
});

// Arcad's plan for the next four weeks, JSON (see lib/month-plan.ts). Only
// the newest row per user is kept.
export const monthPlans = sqliteTable(
  "month_plans",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    startsOn: text("starts_on").notNull(),
    endsOn: text("ends_on").notNull(),
    plan: text("plan").notNull(),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [index("month_plans_user_idx").on(t.userId, t.createdAt)],
);

/**
 * Arcad's day-by-day layout of the next week's study blocks, one row per
 * student. The scheduler places these blocks first and fills any gaps itself.
 * `inputsKey` is what the layout was made from; when the schedule's inputs
 * change the scheduler sets `wantedKey`, and the cron makes a fresh layout.
 */
export const dayLayouts = sqliteTable(
  "day_layouts",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    layout: text("layout"),
    inputsKey: text("inputs_key"),
    wantedKey: text("wanted_key"),
    // When wantedKey last changed, so the cron waits for edits to settle.
    wantedAt: integer("wanted_at"),
    // When a refresh started, so the cron doesn't run two at once.
    workingAt: integer("working_at"),
    updatedAt: integer("updated_at").notNull().default(now),
  },
  (t) => [index("day_layouts_wanted_idx").on(t.wantedKey)],
);

/**
 * Tokens and estimated cost of each call to the AI provider, so spend can be
 * broken down by feature, model and tier. `costMicros` is millionths of a
 * US dollar, null for a model lib/openai.ts has no price for.
 */
export const aiUsage = sqliteTable(
  "ai_usage",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    feature: text("feature").notNull(),
    model: text("model").notNull(),
    serviceTier: text("service_tier"),
    inputTokens: integer("input_tokens").notNull().default(0),
    cachedTokens: integer("cached_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    reasoningTokens: integer("reasoning_tokens").notNull().default(0),
    costMicros: integer("cost_micros"),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [
    index("ai_usage_created_idx").on(t.createdAt),
    index("ai_usage_feature_created_idx").on(t.feature, t.createdAt),
    index("ai_usage_user_created_idx").on(t.userId, t.createdAt),
  ],
);
