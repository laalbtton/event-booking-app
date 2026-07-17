-- ============================================================
-- Jokes: laughter reaction, tags (max 5), unread tracking
-- Run in Supabase SQL editor after jokes-tables.sql
-- ============================================================

-- ── laughter reaction ────────────────────────────────────────────────────────

ALTER TABLE joke_reactions
  DROP CONSTRAINT IF EXISTS joke_reactions_reaction_type_check;

ALTER TABLE joke_reactions
  ADD CONSTRAINT joke_reactions_reaction_type_check
  CHECK (reaction_type IN ('like', 'bomb', 'kill', 'laughter'));

-- ── joke_tags (called "tags" in UI; max 5 per joke) ───────────────────────────

CREATE TABLE IF NOT EXISTS joke_tags (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  joke_id     UUID        NOT NULL REFERENCES jokes(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content     TEXT        NOT NULL CHECK (char_length(content) >= 1 AND char_length(content) <= 140),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS joke_tags_joke_id_idx ON joke_tags (joke_id);
CREATE INDEX IF NOT EXISTS joke_tags_user_id_idx ON joke_tags (user_id);
CREATE INDEX IF NOT EXISTS joke_tags_created_at_idx ON joke_tags (created_at DESC);

ALTER TABLE joke_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "joke_tags: anyone can read" ON joke_tags;
CREATE POLICY "joke_tags: anyone can read"
  ON joke_tags FOR SELECT USING (true);

DROP POLICY IF EXISTS "joke_tags: auth users insert" ON joke_tags;
CREATE POLICY "joke_tags: auth users insert"
  ON joke_tags FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "joke_tags: users delete own" ON joke_tags;
CREATE POLICY "joke_tags: users delete own"
  ON joke_tags FOR DELETE
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION enforce_max_joke_tags()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF (SELECT COUNT(*) FROM joke_tags WHERE joke_id = NEW.joke_id) >= 5 THEN
    RAISE EXCEPTION 'Maximum of 5 tags per joke';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS joke_tags_max_five ON joke_tags;
CREATE TRIGGER joke_tags_max_five
  BEFORE INSERT ON joke_tags
  FOR EACH ROW
  EXECUTE FUNCTION enforce_max_joke_tags();

-- ── per-user last viewed (unread badge on Jokes tab) ─────────────────────────

CREATE TABLE IF NOT EXISTS user_joke_tab_state (
  user_id         UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_viewed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE user_joke_tab_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_joke_tab_state: own select" ON user_joke_tab_state;
CREATE POLICY "user_joke_tab_state: own select"
  ON user_joke_tab_state FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_joke_tab_state: own upsert" ON user_joke_tab_state;
CREATE POLICY "user_joke_tab_state: own upsert"
  ON user_joke_tab_state FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
