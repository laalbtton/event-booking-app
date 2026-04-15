-- ============================================================
-- Jokes feature: one-liner jokes + per-user reactions
-- Run this in the Supabase SQL editor (or via supabase db push)
-- ============================================================

-- ── jokes ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS jokes (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content     TEXT        NOT NULL CHECK (char_length(content) >= 1 AND char_length(content) <= 280),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS jokes_created_at_idx ON jokes (created_at DESC);
CREATE INDEX IF NOT EXISTS jokes_user_id_idx    ON jokes (user_id);

ALTER TABLE jokes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "jokes: anyone can read"
  ON jokes FOR SELECT USING (true);

CREATE POLICY "jokes: auth users insert own"
  ON jokes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "jokes: users delete own"
  ON jokes FOR DELETE
  USING (auth.uid() = user_id);

-- ── joke_reactions ───────────────────────────────────────────────────────────
-- One row per (joke, user) pair. reaction_type can be updated but never
-- duplicated — enforced by the UNIQUE constraint and upsert on conflict.

CREATE TABLE IF NOT EXISTS joke_reactions (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  joke_id        UUID        NOT NULL REFERENCES jokes(id) ON DELETE CASCADE,
  user_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reaction_type  TEXT        NOT NULL CHECK (reaction_type IN ('like', 'bomb', 'kill')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (joke_id, user_id)   -- one reaction per user per joke; use UPSERT to change type
);

CREATE INDEX IF NOT EXISTS joke_reactions_joke_id_idx ON joke_reactions (joke_id);
CREATE INDEX IF NOT EXISTS joke_reactions_user_id_idx ON joke_reactions (user_id);

ALTER TABLE joke_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "joke_reactions: anyone can read"
  ON joke_reactions FOR SELECT USING (true);

CREATE POLICY "joke_reactions: auth users manage own"
  ON joke_reactions FOR ALL
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Enable Supabase Realtime for live reaction count updates on the My Jokes tab.
-- Run this in the SQL editor (supabase_realtime publication must exist first).
ALTER PUBLICATION supabase_realtime ADD TABLE joke_reactions;
