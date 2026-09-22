-- Flashcards: decks of cards the student makes, pastes in, or (later) has
-- Arcad draft from their own files. Studying them needs no AI at all.

CREATE TABLE decks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Removing a subject keeps its decks (they move to "No subject") rather
  -- than throwing away cards someone typed out by hand.
  subject_id TEXT REFERENCES subjects(id) ON DELETE SET NULL,
  -- Optional syllabus topic. Topics are replaced when a new syllabus is read,
  -- so the link just drops then.
  topic_id TEXT REFERENCES subject_topics(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  -- 'manual' | 'import' | 'arcad'
  source TEXT NOT NULL DEFAULT 'manual',
  studied_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX decks_user_idx ON decks (user_id);

-- One row per card, carrying its own review schedule (Leitner boxes).
--   box       0 = learning (or never seen), 1-5 = known, each box a longer gap
--   due_at    when it's next due; NULL until first studied (a "new" card)
--   reviews   times answered; 0 = never studied
CREATE TABLE cards (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deck_id TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  front TEXT NOT NULL,
  back TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  box INTEGER NOT NULL DEFAULT 0,
  due_at INTEGER,
  reviewed_at INTEGER,
  reviews INTEGER NOT NULL DEFAULT 0,
  lapses INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX cards_deck_idx ON cards (deck_id, position);
CREATE INDEX cards_user_due_idx ON cards (user_id, due_at);
