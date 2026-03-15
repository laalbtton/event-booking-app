-- ============================================================
-- Community Slugs Backfill
-- Run this after communities_migration.sql to populate slugs
-- for existing communities that have NULL slug values.
-- ============================================================

-- Generate slugs from community names for records with NULL slugs.
-- Pattern: lowercase, spaces → hyphens, strip non-alphanumeric.
UPDATE communities
SET slug = lower(
  regexp_replace(
    regexp_replace(name, '[^a-zA-Z0-9\s-]', '', 'g'),
    '\s+', '-', 'g'
  )
)
WHERE slug IS NULL;

-- If a slug collision exists (two communities with the same derived slug),
-- append the first 8 chars of the community id to disambiguate.
UPDATE communities c
SET slug = c.slug || '-' || substring(c.id::text, 1, 8)
WHERE EXISTS (
  SELECT 1
  FROM communities c2
  WHERE c2.slug = c.slug AND c2.id <> c.id
);
