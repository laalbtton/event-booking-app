-- ============================================================
-- People search: trigram indexes on profiles
-- Run this in the Supabase SQL editor
--
-- /api/profiles/search matches on `full_name` and `username` with
-- ILIKE '%term%'. A leading wildcard cannot use a btree index, so without
-- these the search sequentially scans profiles on every keystroke. The only
-- existing indexes are idx_profiles_username_ci (equality/prefix only),
-- idx_profiles_role and idx_profiles_referred_by.
--
-- Indexed on the raw columns rather than lower(...): pg_trgm already stores
-- trigrams lowercased, so gin_trgm_ops serves ILIKE directly, whereas an
-- expression index on lower(col) would only be matched by a query written
-- against lower(col).
--
-- Optional while the user table is small — the search works either way.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_profiles_full_name_trgm
  ON public.profiles USING gin (full_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_profiles_username_trgm
  ON public.profiles USING gin (username gin_trgm_ops);

COMMENT ON INDEX public.idx_profiles_full_name_trgm IS
  'Substring search for /api/profiles/search (find people to follow)';
COMMENT ON INDEX public.idx_profiles_username_trgm IS
  'Substring search for /api/profiles/search (find people to follow)';
